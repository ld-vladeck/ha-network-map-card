import { LitElement, html, css, PropertyValues } from 'lit';
import { Network, DataSet } from 'vis-network/standalone';
import { HomeAssistant, NetworkMapCardConfig, IntegrationConfig, NetworkNode } from './types';
import { TopologyEngine, normalizeMac } from './topology-engine';
import { HaHelper, RegistryFetchResult } from './ha-helper';
import './network-map-card-editor';

export class NetworkMapCard extends LitElement {
  private _hass?: HomeAssistant;
  private _config?: NetworkMapCardConfig;
  private _network?: Network;
  private _nodesDataSet: DataSet<any> = new DataSet([]);
  private _edgesDataSet: DataSet<any> = new DataSet([]);
  private _currentNodes: NetworkNode[] = [];
  private _selectedNode?: NetworkNode;
  private _initialized = false;
  private _isBuilding = false;
  private _lastUpdateTime = 0;
  private _lastDataSignature = '';
  private _diagnostics?: RegistryFetchResult['diagnostics'];
  private _showIntegrationsList = true;
  private _copyNotification = '';
  private _showOffline = true;

  static styles = css`
    :host {
      display: block;
    }
    ha-card {
      height: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: var(--ha-card-background, var(--card-background-color, white));
      color: var(--primary-text-color, #212121);
      border-radius: var(--ha-card-border-radius, 12px);
      box-shadow: var(--ha-card-box-shadow, none);
      border-width: var(--ha-card-border-width, 1px);
      border-style: solid;
      border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));
    }
    .card-header {
      padding: 14px 16px;
      font-size: 1.25rem;
      font-weight: 500;
      color: var(--primary-text-color);
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .header-action-btn {
      background: none;
      border: 1px solid var(--divider-color, #d0d0d0);
      color: var(--primary-text-color, #212121);
      border-radius: 6px;
      padding: 4px 10px;
      font-size: 0.78rem;
      font-weight: 500;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      transition: background 0.15s, border-color 0.15s;
    }
    .header-action-btn:hover {
      background: rgba(0, 0, 0, 0.05);
      border-color: var(--primary-color, #0288d1);
    }
    .debug-box {
      padding: 10px 16px;
      background: rgba(0, 0, 0, 0.04);
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
      font-size: 0.82rem;
      line-height: 1.5;
      font-family: monospace;
      color: var(--primary-text-color);
    }
    .debug-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 3px 8px;
      background: var(--primary-color, #0288d1);
      color: white;
      border-radius: 4px;
      font-size: 0.75rem;
      margin: 3px 6px 3px 0;
      cursor: pointer;
      user-select: all;
      transition: background 0.15s;
    }
    .debug-badge:hover {
      filter: brightness(1.15);
    }
    .debug-badge.active {
      background: #4caf50;
    }
    .toggle-list-btn {
      background: none;
      border: 1px solid var(--divider-color, #ccc);
      color: var(--primary-color, #0288d1);
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.75rem;
      cursor: pointer;
      margin-left: 8px;
    }
    .copy-toast {
      color: #2e7d32;
      font-weight: bold;
      margin-left: 8px;
      font-size: 0.78rem;
    }
    .card-content-area {
      position: relative;
      width: 100%;
      height: var(--network-map-height, min(70vh, 650px));
      min-height: 380px;
    }
    .network-container {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
    }
    .status-overlay {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      color: var(--secondary-text-color, #757575);
      font-size: 0.95rem;
      text-align: center;
      pointer-events: none;
      z-index: 2;
    }
    /* Floating detail box on node click */
    .detail-drawer {
      position: absolute;
      top: 14px;
      right: 14px;
      width: 290px;
      background: var(--ha-card-background, var(--card-background-color, #ffffff));
      color: var(--primary-text-color, #212121);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
      padding: 14px;
      z-index: 10;
      font-size: 0.88rem;
      backdrop-filter: blur(8px);
      animation: fadeIn 0.15s ease-out;
    }
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-6px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .detail-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 10px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .detail-title {
      font-weight: 600;
      font-size: 0.98rem;
      line-height: 1.25;
      word-break: break-word;
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.2rem;
      line-height: 1;
      color: var(--secondary-text-color, #888);
      padding: 0 4px;
    }
    .close-btn:hover {
      color: var(--primary-text-color, #111);
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .detail-label {
      color: var(--secondary-text-color, #757575);
      font-size: 0.82rem;
    }
    .detail-value {
      font-weight: 500;
      font-family: monospace;
      font-size: 0.82rem;
      text-align: right;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 0.78rem;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 12px;
    }
    .status-badge.online {
      background: rgba(76, 175, 80, 0.15);
      color: #2e7d32;
    }
    .status-badge.offline {
      background: rgba(158, 158, 158, 0.15);
      color: #757575;
    }
    .conn-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.76rem;
      font-weight: 600;
      padding: 2px 7px;
      border-radius: 6px;
    }
    .conn-tag.lan {
      background: rgba(21, 101, 192, 0.12);
      color: #1565c0;
    }
    .conn-tag.wifi {
      background: rgba(0, 137, 123, 0.12);
      color: #00897b;
    }
    .role-tag {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      font-size: 0.76rem;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      margin-bottom: 8px;
    }
    .role-tag.master {
      background: rgba(13, 71, 161, 0.15);
      color: #0d47a1;
      border: 1px solid rgba(13, 71, 161, 0.3);
    }
    .role-tag.ap {
      background: rgba(2, 136, 209, 0.15);
      color: #0288d1;
      border: 1px solid rgba(2, 136, 209, 0.3);
    }
    .action-btn {
      width: 100%;
      margin-top: 12px;
      padding: 7px 12px;
      background: var(--primary-color, #0288d1);
      color: white;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      font-size: 0.82rem;
      transition: opacity 0.15s;
    }
    .action-btn:hover {
      opacity: 0.9;
    }
    /* Floating zoom toolbar */
    .zoom-controls {
      position: absolute;
      bottom: 16px;
      left: 16px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      z-index: 5;
    }
    .zoom-btn {
      width: 32px;
      height: 32px;
      background: var(--ha-card-background, var(--card-background-color, #ffffff));
      color: var(--primary-text-color, #212121);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.12);
      cursor: pointer;
      font-size: 1.15rem;
      font-weight: bold;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.15s, transform 0.1s;
      user-select: none;
      line-height: 1;
    }
    .zoom-btn:hover {
      background: rgba(0, 0, 0, 0.06);
      transform: scale(1.05);
    }
    .zoom-btn:active {
      transform: scale(0.95);
    }
  `;

  public setConfig(config: NetworkMapCardConfig): void {
    if (!config) {
      throw new Error('Configurazione non valida.');
    }

    const anyConfig = config as any;
    const masterRootMac = config.master_root_mac || config.root_mac || anyConfig.mac || '';

    let integrations: IntegrationConfig[] = [];
    const rawIntegrations = config.integrations || anyConfig.integration;

    if (rawIntegrations) {
      if (Array.isArray(rawIntegrations)) {
        integrations = rawIntegrations;
      } else if (typeof rawIntegrations === 'object') {
        integrations = [rawIntegrations];
      }
    } else if (config.config_entry_id || anyConfig.config_entry) {
      const entryId = String(config.config_entry_id || anyConfig.config_entry);
      integrations = [
        {
          config_entry_id: entryId,
          root_mac: config.root_mac || anyConfig.mac || masterRootMac,
          mac_attribute: config.mac_attribute,
          link_attribute: config.link_attribute,
          lan_values: config.lan_values,
          wifi_values: config.wifi_values,
        },
      ];
    }

    // Inherit global lan_values / wifi_values if not set on specific integration
    integrations = integrations.map((i) => ({
      ...i,
      lan_values: i.lan_values || config.lan_values,
      wifi_values: i.wifi_values || config.wifi_values,
    }));

    this._config = {
      title: 'Mappa di Rete',
      debug: false,
      ...config,
      master_root_mac: masterRootMac,
      integrations,
    };

    if (this._config.height && this._config.height.trim()) {
      this.style.setProperty('--network-map-height', this._config.height);
    } else {
      this.style.removeProperty('--network-map-height');
    }

    this._updateTopology();
  }

  public set hass(hass: HomeAssistant) {
    const oldHass = this._hass;
    this._hass = hass;

    const now = Date.now();
    if (!oldHass || now - this._lastUpdateTime > 5000) {
      this._updateTopology();
    }
  }

  protected firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    this._initNetwork();

    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver(() => {
        if (this._network) {
          this._network.redraw();
        }
      });
      const container = this.shadowRoot?.querySelector('.network-container');
      if (container) {
        this._resizeObserver.observe(container);
      }
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }
    if (this._network) {
      try {
        this._network.destroy();
      } catch (_) {}
      this._network = undefined;
    }
    this._initialized = false;
  }

  private _currentLayoutMode = '';

  private _buildNetworkOptions(isDark: boolean, layoutMode: string) {
    const isTree = layoutMode === 'tree' || !layoutMode;
    const isHorizontal = layoutMode === 'horizontal';

    let layoutConfig: any = { hierarchical: { enabled: false } };
    let physicsConfig: any = {};

    if (isTree) {
      layoutConfig = {
        hierarchical: {
          enabled: true,
          direction: 'UD',
          sortMethod: 'directed',
          levelSeparation: 115,
          nodeSpacing: 110,
          treeSpacing: 135,
          parentCentralization: true,
          blockShifting: true,
          edgeMinimization: true,
        },
      };
      physicsConfig = {
        hierarchicalRepulsion: {
          centralGravity: 0.0,
          springLength: 85,
          nodeDistance: 110,
          damping: 0.12,
        },
        stabilization: {
          enabled: true,
          iterations: 120,
          updateInterval: 25,
          fit: true,
        },
      };
    } else if (isHorizontal) {
      layoutConfig = {
        hierarchical: {
          enabled: true,
          direction: 'LR',
          sortMethod: 'directed',
          levelSeparation: 150,
          nodeSpacing: 65,
          treeSpacing: 100,
          parentCentralization: true,
        },
      };
      physicsConfig = {
        hierarchicalRepulsion: {
          centralGravity: 0.0,
          springLength: 95,
          nodeDistance: 65,
          damping: 0.12,
        },
        stabilization: {
          enabled: true,
          iterations: 120,
          updateInterval: 25,
          fit: true,
        },
      };
    } else {
      // Radial / Costellazione
      layoutConfig = { hierarchical: { enabled: false } };
      physicsConfig = {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -110,
          centralGravity: 0.015,
          springLength: 140,
          springConstant: 0.08,
          damping: 0.85,
          avoidOverlap: 0.85,
        },
        minVelocity: 0.75,
        stabilization: {
          enabled: true,
          iterations: 120,
          updateInterval: 25,
          fit: true,
        },
      };
    }

    return {
      layout: layoutConfig,
      physics: physicsConfig,
      interaction: {
        hover: true,
        dragNodes: true,
        zoomView: true,
        zoomSpeed: 0.05,
      },
      nodes: {
        shape: 'dot',
        size: 11,
        font: {
          multi: 'html',
          color: isDark ? '#e0e0e0' : '#212121',
          size: 12,
          face: 'Roboto, sans-serif',
          vadjust: 3,
          ital: {
            color: isDark ? '#90caf9' : '#1565c0',
            size: 10,
            mod: 'normal',
          },
          bold: {
            color: isDark ? '#ffffff' : '#111111',
            size: 12,
          },
        },
        borderWidth: 2,
        shadow: true,
      },
      edges: {
        arrows: {
          to: { enabled: false },
          from: { enabled: false },
        },
        font: {
          color: isDark ? '#aaaaaa' : '#666666',
          size: 10,
          align: 'middle',
          background: isDark ? '#1c1c1c' : '#ffffff',
        },
      },
    };
  }

  private _initNetwork(): void {
    const container = this.shadowRoot?.querySelector('.network-container') as HTMLDivElement | null;
    if (!container || this._network) return;

    const isDark =
      this._hass?.themes?.darkMode ??
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    const data = {
      nodes: this._nodesDataSet,
      edges: this._edgesDataSet,
    };

    const layoutMode = this._config?.layout_mode || 'tree';
    this._currentLayoutMode = layoutMode;
    const options = this._buildNetworkOptions(isDark, layoutMode);

    try {
      this._network = new Network(container, data, options);

      this._network.on('click', (params) => {
        if (params.nodes.length > 0) {
          const nodeId = params.nodes[0];
          this._selectedNode = this._currentNodes.find((n) => n.id === nodeId);
        } else {
          this._selectedNode = undefined;
        }
        this.requestUpdate();
      });

      this._initialized = true;
      this._updateTopology();
    } catch (err) {
      console.error('[NetworkMapCard] Error initializing network canvas:', err);
    }
  }

  private async _updateTopology(): Promise<void> {
    if (!this._hass || !this._config || this._isBuilding) return;

    this._isBuilding = true;
    this._lastUpdateTime = Date.now();

    try {
      let rawIntegrations = this._config.integrations || [];

      // Auto-detect root_mac for integrations if not provided
      const resolvedIntegrations = rawIntegrations.map((int) => {
        let mac = int.root_mac;
        if (!mac && this._hass) {
          mac = HaHelper.autoDetectRootMac(this._hass, int.config_entry_id) || '';
        }
        return { ...int, root_mac: mac || '' };
      });

      // Determine master_root_mac: use explicit config, or is_master, or first integration
      let masterMac = this._config.master_root_mac;
      if (!masterMac && resolvedIntegrations.length > 0) {
        const masterInt = resolvedIntegrations.find((i) => i.is_master) || resolvedIntegrations[0];
        masterMac = masterInt?.root_mac || '';
      }

      const fetchResult = await HaHelper.fetchClients(this._hass, resolvedIntegrations);
      this._diagnostics = fetchResult.diagnostics;

      const graphData = TopologyEngine.buildGraph({
        masterRootMac: masterMac || '',
        integrations: resolvedIntegrations,
        clientsByConfigEntry: fetchResult.clientsByConfigEntry,
        rootNames: fetchResult.rootNames,
      });

      this._currentNodes = graphData.nodes;

      const newSignature = JSON.stringify({
        n: graphData.nodes.map((n) => `${n.id}:${n.label}:${n.isConnected}:${n.ip}`),
        e: graphData.edges.map((e) => `${e.from}->${e.to}:${e.label}:${e.connectionType}`),
        offline: this._showOffline,
      });

      if (newSignature === this._lastDataSignature) {
        return;
      }
      this._lastDataSignature = newSignature;

      const isDark =
        this._hass?.themes?.darkMode ??
        window.matchMedia('(prefers-color-scheme: dark)').matches;

      const layoutMode = this._config.layout_mode || 'tree';
      const isHierarchical = layoutMode === 'tree' || layoutMode === 'horizontal';

      if (this._network && this._currentLayoutMode !== layoutMode) {
        this._currentLayoutMode = layoutMode;
        this._network.setOptions(this._buildNetworkOptions(isDark, layoutMode));
      }

      // Filter offline devices if toggle is off
      let nodesToDisplay = graphData.nodes;
      let edgesToDisplay = graphData.edges;

      if (!this._showOffline) {
        const activeIds = new Set(
          nodesToDisplay
            .filter((n) => n.isRoot || n.isInterface || n.isConnected !== false)
            .map((n) => n.id)
        );

        edgesToDisplay = edgesToDisplay.filter(
          (e) => activeIds.has(e.from) && activeIds.has(e.to)
        );

        const ifChildCounts = new Map<string, number>();
        for (const e of edgesToDisplay) {
          ifChildCounts.set(e.from, (ifChildCounts.get(e.from) || 0) + 1);
        }

        nodesToDisplay = nodesToDisplay.filter((n) => {
          if (n.isRoot) return true;
          if (n.isInterface) return (ifChildCounts.get(n.id) || 0) > 0;
          return n.isConnected !== false;
        });

        const finalVisibleIds = new Set(nodesToDisplay.map((n) => n.id));
        edgesToDisplay = edgesToDisplay.filter(
          (e) => finalVisibleIds.has(e.from) && finalVisibleIds.has(e.to)
        );
      }

      // Radial positions calculation for 'radial' mode
      const childrenMap = new Map<string, string[]>();
      for (const edge of edgesToDisplay) {
        if (!childrenMap.has(edge.from)) {
          childrenMap.set(edge.from, []);
        }
        childrenMap.get(edge.from)!.push(edge.to);
      }

      const masterNode =
        nodesToDisplay.find((n) => n.isMasterRoot) ||
        nodesToDisplay.find((n) => n.isRoot) ||
        nodesToDisplay[0];
      const masterId = masterNode?.id;

      const initialPositions = new Map<string, { x: number; y: number }>();
      if (!isHierarchical && masterId) {
        initialPositions.set(masterId, { x: 0, y: 0 });

        const directChildren = childrenMap.get(masterId) || [];
        const dirCount = Math.max(1, directChildren.length);

        directChildren.forEach((childId, i) => {
          const angle = (i / dirCount) * 2 * Math.PI - Math.PI / 2;
          const cx = Math.cos(angle) * 150;
          const cy = Math.sin(angle) * 150;
          initialPositions.set(childId, { x: cx, y: cy });

          const grandChildren = childrenMap.get(childId) || [];
          const gcCount = grandChildren.length;
          grandChildren.forEach((gcId, j) => {
            const fanAngle =
              gcCount > 2
                ? (j / gcCount) * 2 * Math.PI
                : angle - Math.PI / 4 + (j / gcCount) * (Math.PI / 2);
            const gcx = cx + Math.cos(fanAngle) * 165;
            const gcy = cy + Math.sin(fanAngle) * 165;
            initialPositions.set(gcId, { x: gcx, y: gcy });
          });
        });
      }

      // Transform nodes
      const visNodes = nodesToDisplay.map((node) => {
        const isMaster = node.isMasterRoot || node.id === masterId;
        const pos = initialPositions.get(node.id);
        const fixedConstraint: any = !isHierarchical && isMaster ? { x: true, y: true } : false;
        const initialX = pos ? pos.x : undefined;
        const initialY = pos ? pos.y : undefined;

        // Special styling for Interface Sub-branch nodes (Clean text, no emoji)
        if (node.isInterface) {
          const isLan = node.connectionType === 'lan';
          const isWifi = node.connectionType === 'wifi';
          return {
            id: node.id,
            label: `<b>${node.label}</b>`,
            title: `Interfaccia: ${node.interfaceName || node.label}`,
            shape: 'box',
            margin: 6,
            borderRadius: 6,
            borderWidth: 1.5,
            level: isHierarchical ? node.depth ?? 1 : undefined,
            x: isHierarchical ? undefined : initialX,
            y: isHierarchical ? undefined : initialY,
            fixed: isHierarchical ? false : fixedConstraint,
            color: {
              background: isDark
                ? isLan
                  ? '#162836'
                  : '#122927'
                : isLan
                ? '#e3f2fd'
                : '#e0f2f1',
              border: isLan ? '#1976d2' : isWifi ? '#00897b' : '#757575',
              highlight: {
                background: isLan ? '#bbdefb' : '#b2dfdb',
                border: '#0288d1',
              },
            },
            font: {
              multi: 'html',
              size: 11,
              color: isDark ? '#e0e0e0' : '#212121',
              face: 'Roboto, sans-serif',
            },
          };
        }

        let nodeColor = {
          background: '#4caf50',
          border: '#388e3c',
          highlight: { background: '#66bb6a', border: '#2e7d32' },
        };
        let size = 11;
        let borderWidth = 2;

        if (node.isMasterRoot) {
          nodeColor = {
            background: '#0d47a1',
            border: isDark ? '#90caf9' : '#1565c0',
            highlight: { background: '#1565c0', border: '#ffb300' },
          };
          size = 21;
          borderWidth = 3.5;
        } else if (node.isRoot) {
          nodeColor = {
            background: '#0288d1',
            border: '#01579b',
            highlight: { background: '#03a9f4', border: '#0277bd' },
          };
          size = 15;
          borderWidth = 2.5;
        } else if (node.isConnected === false) {
          nodeColor = {
            background: isDark ? '#616161' : '#9e9e9e',
            border: isDark ? '#424242' : '#757575',
            highlight: { background: '#bdbdbd', border: '#616161' },
          };
          size = 9;
        }

        let label = `<b>${node.label}</b>`;

        if (node.ip) {
          label += `\n<i>${node.ip}</i>`;
        }

        const tooltip = `<b>${node.label}</b><br/>MAC: ${node.mac}${node.ip ? `<br/>IP: ${node.ip}` : ''}${
          node.connectionType ? `<br/>Tipo: ${node.connectionType.toUpperCase()}` : ''
        }${node.state ? `<br/>Stato: ${node.state}` : ''}`;

        return {
          id: node.id,
          label: label,
          title: tooltip,
          shape: 'dot',
          size: size,
          borderWidth: borderWidth,
          color: nodeColor,
          level: isHierarchical ? node.depth ?? 0 : undefined,
          x: isHierarchical ? undefined : initialX,
          y: isHierarchical ? undefined : initialY,
          fixed: isHierarchical ? false : fixedConstraint,
          font: {
            multi: 'html',
            color: isDark ? '#e0e0e0' : '#212121',
            ital: {
              color: isDark ? '#90caf9' : '#1565c0',
              size: 10,
              mod: 'normal',
            },
            bold: {
              color: isDark ? '#ffffff' : '#111111',
              size: node.isMasterRoot ? 13 : 12,
            },
          },
        };
      });

      // Transform edges: no arrows
      const visEdges = edgesToDisplay.map((edge) => {
        const isLan = edge.connectionType === 'lan';
        const isWifi = edge.connectionType === 'wifi';

        let edgeColor = isDark ? '#555555' : '#bbbbbb';
        let dashes: boolean | number[] = false;
        let width = 1.6;
        let length = 95;

        if (isLan) {
          dashes = false;
          width = 2.2;
          edgeColor = isDark ? '#64b5f6' : '#1976d2';
          length = 90;
        } else if (isWifi) {
          dashes = [5, 5];
          width = 1.4;
          edgeColor = isDark ? '#4db6ac' : '#00897b';
          length = 105;
        }

        let smoothConfig: any = {
          enabled: true,
          type: 'cubicBezier',
          forceDirection: layoutMode === 'horizontal' ? 'horizontal' : 'vertical',
          roundness: isLan ? 0.08 : 0.22,
        };

        if (layoutMode === 'radial') {
          smoothConfig = {
            enabled: true,
            type: 'continuous',
            roundness: 0.25,
          };
        }

        return {
          id: `${edge.from}->${edge.to}`,
          from: edge.from,
          to: edge.to,
          label: edge.label || '',
          dashes: dashes,
          width: width,
          length: length,
          arrows: {
            to: { enabled: false },
            from: { enabled: false },
          },
          color: {
            color: edgeColor,
            highlight: 'var(--primary-color, #03a9f4)',
          },
          smooth: smoothConfig,
        };
      });

      this._nodesDataSet.clear();
      this._nodesDataSet.add(visNodes);

      this._edgesDataSet.clear();
      this._edgesDataSet.add(visEdges);

      if (this._network && visNodes.length > 0) {
        try {
          this._network.fit({ animation: false });
        } catch (_) {}
      }
    } catch (err) {
      console.error('[NetworkMapCard] Error generating network topology:', err);
    } finally {
      this._isBuilding = false;
      this.requestUpdate();
    }
  }

  private _zoomIn(): void {
    if (!this._network) return;
    const scale = this._network.getScale();
    this._network.moveTo({
      scale: scale * 1.3,
      animation: { duration: 250, easingFunction: 'easeInOutQuad' },
    });
  }

  private _zoomOut(): void {
    if (!this._network) return;
    const scale = this._network.getScale();
    this._network.moveTo({
      scale: Math.max(0.1, scale / 1.3),
      animation: { duration: 250, easingFunction: 'easeInOutQuad' },
    });
  }

  private _resetZoom(): void {
    if (!this._network) return;
    this._network.fit({
      animation: { duration: 300, easingFunction: 'easeInOutQuad' },
    });
  }

  private _toggleOffline(): void {
    this._showOffline = !this._showOffline;
    this._lastDataSignature = ''; // invalidate cache signature so it re-renders immediately
    this._updateTopology();
  }

  private _closeDetailDrawer(): void {
    this._selectedNode = undefined;
    this.requestUpdate();
  }

  private _openMoreInfo(entityId?: string): void {
    if (!entityId) return;
    const event = new CustomEvent('hass-more-info', {
      bubbles: true,
      composed: true,
      detail: { entityId },
    });
    this.dispatchEvent(event);
  }

  public getCardSize(): number {
    return 6;
  }

  public static async getConfigElement(): Promise<HTMLElement> {
    return document.createElement('network-map-card-editor');
  }

  public static getStubConfig(): Record<string, any> {
    return {
      type: 'custom:network-map-card',
      title: 'Mappa di Rete',
      show_offline: true,
      integrations: [],
    };
  }

  private _copyIntegrationSnippet(id: string, suggestedMac?: string, name?: string): void {
    const rootMac = suggestedMac || 'INSERISCI_MAC_RADICE';
    const snippet = `  - config_entry_id: "${id}"\n    root_mac: "${rootMac}"`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(snippet).then(() => {
        this._copyNotification = `Snippet YAML copiato per: ${name || id}!`;
        this.requestUpdate();
        setTimeout(() => {
          this._copyNotification = '';
          this.requestUpdate();
        }, 3500);
      });
    } else {
      prompt('Copia questo snippet per la tua configurazione YAML:', snippet);
    }
  }

  protected render() {
    const hasNodes = this._nodesDataSet.length > 0;
    const showDebug = this._config?.debug;
    const configuredEntryIds = new Set((this._config?.integrations || []).map((i) => i.config_entry_id));

    return html`
      <ha-card>
        ${this._config?.title
          ? html`
              <div class="card-header">
                <span>${this._config.title}</span>
                <button
                  class="header-action-btn"
                  @click=${this._toggleOffline}
                  title="${this._showOffline ? 'Nascondi dispositivi offline' : 'Mostra dispositivi offline'}"
                >
                  <span>${this._showOffline ? '●' : '○'}</span>
                  ${this._showOffline ? 'Nascondi offline' : 'Mostra offline'}
                </button>
              </div>
            `
          : ''}
        ${showDebug && this._diagnostics
          ? html`
              <div class="debug-box">
                <div>
                  <b>Diagnostica HA:</b> Device totali: <b>${this._diagnostics.totalDevices}</b> |
                  Device trovati: <b>${this._diagnostics.matchedDevices}</b> | Client visualizzati:
                  <b>${this._diagnostics.matchedEntities}</b>
                  <button
                    class="toggle-list-btn"
                    @click=${() => {
                      this._showIntegrationsList = !this._showIntegrationsList;
                      this.requestUpdate();
                    }}
                  >
                    ${this._showIntegrationsList ? '▲ Nascondi' : '▼ Mostra'} Integrazioni con Device Tracker (${this._diagnostics.availableIntegrations.length})
                  </button>
                  ${this._copyNotification ? html`<span class="copy-toast">✓ ${this._copyNotification}</span>` : ''}
                </div>
                ${this._showIntegrationsList && this._diagnostics.availableIntegrations.length > 0
                  ? html`
                      <div style="margin-top: 8px;">
                        <i>Integrazioni che tracciano dispositivi di rete (clicca per copiare lo snippet YAML):</i><br />
                        ${this._diagnostics.availableIntegrations.map((i) => {
                          const isActive = configuredEntryIds.has(i.id);
                          return html`
                            <span
                              class="debug-badge ${isActive ? 'active' : ''}"
                              @click=${() => this._copyIntegrationSnippet(i.id, i.suggestedRootMac, i.sampleName || i.domain)}
                              title="Clicca per copiare lo snippet YAML"
                            >
                              ${isActive ? '✓ ' : '+ '}${i.sampleName || i.domain || 'Integrazione'} (${i.trackerCount} tracker)
                              ${i.suggestedRootMac ? `[MAC: ${i.suggestedRootMac}]` : ''}
                            </span>
                          `;
                        })}
                      </div>
                    `
                  : ''}
              </div>
            `
          : ''}
        <div class="card-content-area">
          <div class="network-container"></div>
          <div class="zoom-controls">
            <button class="zoom-btn" @click=${this._zoomIn} title="Ingrandisci">+</button>
            <button class="zoom-btn" @click=${this._zoomOut} title="Rimpicciolisci">−</button>
            <button class="zoom-btn" @click=${this._resetZoom} title="Adatta mappa">⛶</button>
          </div>
          ${!hasNodes ? html`<div class="status-overlay">Caricamento mappa o nessun client trovato...</div>` : ''}
          ${this._selectedNode ? this._renderDetailDrawer(this._selectedNode) : ''}
        </div>
      </ha-card>
    `;
  }

  private _renderDetailDrawer(node: NetworkNode) {
    const isOnline = node.isRoot || node.isConnected !== false;
    const isLan = node.connectionType === 'lan';
    const isWifi = node.connectionType === 'wifi';

    if (node.isInterface) {
      return html`
        <div class="detail-drawer">
          <div class="detail-header">
            <div class="detail-title">${node.label}</div>
            <button class="close-btn" @click=${this._closeDetailDrawer} title="Chiudi">×</button>
          </div>

          <div class="role-tag ${isLan ? 'master' : 'ap'}">
            ${isLan ? 'Interfaccia LAN' : 'Interfaccia Wi-Fi'}
          </div>

          <div class="detail-row">
            <span class="detail-label">Interfaccia:</span>
            <span class="detail-value">${node.interfaceName || 'Non specificata'}</span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Tipo:</span>
            <span class="conn-tag ${isLan ? 'lan' : isWifi ? 'wifi' : ''}">
              ${isLan ? 'LAN' : isWifi ? 'Wi-Fi' : 'Standard'}
            </span>
          </div>
        </div>
      `;
    }

    return html`
      <div class="detail-drawer">
        <div class="detail-header">
          <div class="detail-title">${node.label}</div>
          <button class="close-btn" @click=${this._closeDetailDrawer} title="Chiudi">×</button>
        </div>

        ${node.isMasterRoot
          ? html`<div class="role-tag master">Principale</div>`
          : node.isRoot
          ? html`<div class="role-tag ap">Secondaria</div>`
          : ''}

        <div class="detail-row">
          <span class="detail-label">Stato:</span>
          <span class="status-badge ${isOnline ? 'online' : 'offline'}">
            <span>●</span> ${isOnline ? 'Connesso' : 'Disconnesso'}
          </span>
        </div>

        ${node.connectionType && node.connectionType !== 'unknown'
          ? html`
              <div class="detail-row">
                <span class="detail-label">Connessione:</span>
                <span class="conn-tag ${isLan ? 'lan' : isWifi ? 'wifi' : ''}">
                  ${isLan ? '🔌 LAN Cablata' : isWifi ? '📶 Wi-Fi Wireless' : node.connectionType.toUpperCase()}
                </span>
              </div>
            `
          : ''}

        <div class="detail-row">
          <span class="detail-label">IP:</span>
          <span class="detail-value" style="color: var(--primary-color, #0288d1); font-weight: bold;">
            ${node.ip || 'Non rilevato'}
          </span>
        </div>

        <div class="detail-row">
          <span class="detail-label">MAC:</span>
          <span class="detail-value">${node.mac}</span>
        </div>

        ${node.rawAttributes?.port || node.rawAttributes?.lan_port || node.rawAttributes?.channel
          ? html`
              <div class="detail-row">
                <span class="detail-label">Porta/Canale:</span>
                <span class="detail-value">
                  ${node.rawAttributes?.port || node.rawAttributes?.lan_port || node.rawAttributes?.channel}
                </span>
              </div>
            `
          : ''}

        ${node.entityId
          ? html`
              <div class="detail-row">
                <span class="detail-label">Entità HA:</span>
                <span class="detail-value" style="font-size: 0.76rem;">${node.entityId}</span>
              </div>
            `
          : ''}

        ${node.entityId
          ? html`
              <button class="action-btn" @click=${() => this._openMoreInfo(node.entityId)}>
                Dettagli Entità HA
              </button>
            `
          : ''}
      </div>
    `;
  }
}

if (!customElements.get('network-map-card')) {
  customElements.define('network-map-card', NetworkMapCard);
}

(window as any).customCards = (window as any).customCards || [];
(window as any).customCards.push({
  type: 'network-map-card',
  name: 'Network Map Card',
  description: 'Mappa topologica dinamica della rete locale basata su integrazioni e MAC address.',
  preview: true,
});
