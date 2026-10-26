import { LitElement, html, css, PropertyValues } from 'lit';
import { Network, DataSet } from 'vis-network/standalone';
import { HomeAssistant, NetworkMapCardConfig, IntegrationConfig, NetworkNode } from './types';
import { TopologyEngine, normalizeMac } from './topology-engine';
import { HaHelper, RegistryFetchResult } from './ha-helper';
import './network-map-card-editor';

const HA_OFFICIAL_ICON = '/static/icons/favicon-192x192.png';
const HA_FALLBACK_ICON = 'https://brands.home-assistant.io/homeassistant/icon.png';

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
  private _interfaceChildrenMap: Map<string, string[]> = new Map();
  private _nodeParentMap: Map<string, string> = new Map();
  private _lastAspectOrientation: 'landscape' | 'portrait' | 'square' = 'landscape';

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }
    ha-card {
      flex: 1;
      height: 100%;
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow: hidden;
      background: var(--ha-card-background, var(--card-background-color, white));
      color: var(--primary-text-color, #212121);
      border-radius: var(--ha-card-border-radius, 12px);
      box-shadow: var(--ha-card-box-shadow, none);
      border-width: var(--ha-card-border-width, 1px);
      border-style: solid;
      border-color: var(--ha-card-border-color, var(--divider-color, #e0e0e0));
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
      flex: 1;
      height: 100%;
      min-height: min(70vh, 500px);
    }
    .network-container {
      width: 100%;
      height: 100%;
      position: absolute;
      top: 0;
      left: 0;
      bottom: 0;
      right: 0;
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
      width: 320px;
      max-height: calc(100% - 28px);
      overflow-y: auto;
      overflow-x: hidden;
      background: var(--ha-card-background, var(--card-background-color, #ffffff));
      color: var(--primary-text-color, #212121);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.22);
      padding: 14px;
      z-index: 10;
      font-size: 0.86rem;
      backdrop-filter: blur(8px);
      animation: fadeIn 0.15s ease-out;
      scrollbar-width: thin;
      box-sizing: border-box;
    }
    .detail-drawer::-webkit-scrollbar {
      width: 5px;
    }
    .detail-drawer::-webkit-scrollbar-thumb {
      background: var(--divider-color, #ccc);
      border-radius: 4px;
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
      margin-bottom: 8px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--divider-color, #e0e0e0);
    }
    .detail-title {
      font-weight: 600;
      font-size: 1rem;
      line-height: 1.25;
      word-break: break-word;
    }
    .close-btn {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.3rem;
      line-height: 1;
      color: var(--secondary-text-color, #888);
      padding: 0 4px;
    }
    .close-btn:hover {
      color: var(--primary-text-color, #111);
    }
    .detail-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 10px;
    }
    .detail-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      margin-bottom: 6px;
      min-width: 0;
    }
    .detail-label {
      color: var(--secondary-text-color, #757575);
      font-size: 0.82rem;
      flex-shrink: 0;
    }
    .detail-value {
      font-weight: 500;
      font-family: monospace;
      font-size: 0.82rem;
      text-align: right;
      display: inline-flex;
      align-items: center;
      justify-content: flex-end;
      flex: 1;
      min-width: 0;
      word-break: break-word;
      overflow-wrap: anywhere;
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
      padding: 2px 8px;
      border-radius: 6px;
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
    .drawer-section {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid var(--divider-color, #e0e0e0);
    }
    .drawer-section-title {
      font-size: 0.74rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--secondary-text-color, #757575);
      margin-bottom: 8px;
    }
    .trace-breadcrumb {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 6px;
      line-height: 1.4;
      font-size: 0.8rem;
    }
    .trace-pill {
      cursor: pointer;
      padding: 2px 6px;
      border-radius: 4px;
      background: rgba(0, 0, 0, 0.04);
      color: var(--primary-text-color, #212121);
      transition: background 0.12s, color 0.12s;
      word-break: break-word;
    }
    .trace-pill:hover {
      background: rgba(2, 136, 209, 0.12);
      color: var(--primary-color, #0288d1);
    }
    .trace-pill.active {
      font-weight: 600;
      color: var(--primary-color, #0288d1);
      background: rgba(2, 136, 209, 0.15);
    }
    .trace-separator {
      color: var(--secondary-text-color, #9e9e9e);
      font-size: 0.72rem;
      user-select: none;
    }
    .copy-chip {
      background: none;
      border: 1px solid var(--divider-color, #ccc);
      color: var(--primary-text-color, #212121);
      border-radius: 4px;
      padding: 1px 6px;
      font-size: 0.72rem;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      margin-left: 6px;
      transition: background 0.12s;
    }
    .copy-chip:hover {
      background: rgba(0, 0, 0, 0.06);
      border-color: var(--primary-color, #0288d1);
    }
    .copy-alert {
      background: rgba(76, 175, 80, 0.15);
      color: #2e7d32;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.76rem;
      font-weight: 600;
      text-align: center;
      margin-top: 6px;
    }
    .source-card {
      background: rgba(0, 0, 0, 0.03);
      border: 1px solid var(--divider-color, #e0e0e0);
      border-radius: 8px;
      padding: 8px 10px;
      margin-bottom: 8px;
    }
    .source-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .source-name {
      font-weight: 600;
      font-size: 0.82rem;
      color: var(--primary-text-color, #212121);
    }
    .source-row {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      font-size: 0.78rem;
      margin-bottom: 4px;
      min-width: 0;
    }
    .source-label {
      color: var(--secondary-text-color, #757575);
      flex-shrink: 0;
    }
    .source-val {
      font-weight: 500;
      text-align: right;
      flex: 1;
      min-width: 0;
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    .source-val.mono {
      font-family: monospace;
      font-size: 0.74rem;
      word-break: break-all;
      overflow-wrap: anywhere;
    }
    .open-entity-btn {
      width: 100%;
      margin-top: 6px;
      padding: 5px 8px;
      background: none;
      border: 1px solid var(--primary-color, #0288d1);
      color: var(--primary-color, #0288d1);
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.76rem;
      font-weight: 600;
      text-align: center;
      transition: background 0.15s, color 0.15s;
    }
    .open-entity-btn:hover {
      background: var(--primary-color, #0288d1);
      color: white;
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

    // Initialize runtime _showOffline from configured default without mutating config
    this._showOffline = config.show_offline !== undefined ? Boolean(config.show_offline) : true;

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

  public connectedCallback(): void {
    super.connectedCallback();
    this._lastDataSignature = ''; // Invalidate cache signature so network re-populates on tab switch

    this.updateComplete.then(() => {
      if (!this._network) {
        this._initNetwork();
      }
      this._setupResizeObserver();
      this._updateTopology();
    });
  }

  protected firstUpdated(_changedProperties: PropertyValues): void {
    super.firstUpdated(_changedProperties);
    this._initNetwork();
    this._setupResizeObserver();
  }

  private _setupResizeObserver(): void {
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }

    if (window.ResizeObserver) {
      this._resizeObserver = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0 && entry.contentRect.height > 0) {
            const w = entry.contentRect.width;
            const h = entry.contentRect.height;
            const currentOrientation = w >= h * 1.05 ? 'landscape' : h > w * 1.05 ? 'portrait' : 'square';

            const isMolecular = (this._currentLayoutMode || this._config?.layout_mode) === 'molecular';
            if (isMolecular && this._lastAspectOrientation && this._lastAspectOrientation !== currentOrientation) {
              this._lastAspectOrientation = currentOrientation;
              this._lastDataSignature = '';
              this._updateTopology();
              return;
            }
            this._lastAspectOrientation = currentOrientation;

            if (!this._network) {
              this._initNetwork();
            } else {
              this._network.setSize('100%', '100%');
              this._network.redraw();
            }
          }
        }
      });
      const container = this.shadowRoot?.querySelector('.card-content-area');
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
    } else if (layoutMode === 'molecular') {
      // Modello Molecolare: scheletro portante rigido (nucleo + interfacce fisse), elettroni liberi
      layoutConfig = { hierarchical: { enabled: false } };
      physicsConfig = {
        solver: 'forceAtlas2Based',
        forceAtlas2Based: {
          gravitationalConstant: -90, // Repulsione equilibrata tra i dispositivi client
          centralGravity: 0.0, // Zero gravità centrale: nessuna attrazione trascina i dispositivi verso il centro
          springLength: 90,
          springConstant: 0.05,
          damping: 0.85,
          avoidOverlap: 1,
        },
        minVelocity: 0.75,
        stabilization: {
          enabled: true,
          iterations: 35, // Relax rapido e dolce per distanziare solo le etichette dei dispositivi
          updateInterval: 10,
          fit: true,
        },
      };
    } else {
      // Radial / Costellazione (Configurazione originale ripristinata dal commit Git)
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

    const layoutMode = this._config?.layout_mode || 'molecular';
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

      // Auto-fit appropriato automatico non appena i nodi raggiungono la posizione definitiva
      this._network.on('stabilized', () => {
        try {
          this._network?.fit({
            animation: { duration: 350, easingFunction: 'easeInOutQuad' },
          });
        } catch (_) {}
      });

      // Modello Molecolare: repulsione dalle radici/genitori, vietando agli elettroni di entrare nello spazio del legame
      this._network.on('beforeDrawing', () => {
        if (this._currentLayoutMode === 'molecular' && this._network) {
          const bodyNodes = (this._network as any).body?.nodes;
          if (!bodyNodes) return;

          const maxAngleDeviation = Math.PI * 0.42; // ~75 gradi massimi dall'asse in avanti

          for (const [parentIfId, childrenIds] of this._interfaceChildrenMap.entries()) {
            const ifVisNode = bodyNodes[parentIfId];
            const incomingParentId = this._nodeParentMap.get(parentIfId);
            if (!ifVisNode || !incomingParentId) continue;
            const grandParentVisNode = bodyNodes[incomingParentId];
            if (!grandParentVisNode) continue;

            const fwdX = ifVisNode.x - grandParentVisNode.x;
            const fwdY = ifVisNode.y - grandParentVisNode.y;
            const fwdLen = Math.hypot(fwdX, fwdY);
            if (fwdLen < 1) continue;
            const fwdAngle = Math.atan2(fwdY, fwdX);

            for (const childId of childrenIds) {
              const childVisNode = bodyNodes[childId];
              if (!childVisNode || childVisNode.isFixed) continue;

              const relX = childVisNode.x - ifVisNode.x;
              const relY = childVisNode.y - ifVisNode.y;
              const dist = Math.hypot(relX, relY) || 1;
              const curAngle = Math.atan2(relY, relX);

              let diff = curAngle - fwdAngle;
              while (diff > Math.PI) diff -= 2 * Math.PI;
              while (diff < -Math.PI) diff += 2 * Math.PI;

              if (Math.abs(diff) > maxAngleDeviation) {
                const clampedDiff = Math.sign(diff) * maxAngleDeviation;
                const newAngle = fwdAngle + clampedDiff;
                childVisNode.x = ifVisNode.x + Math.cos(newAngle) * dist;
                childVisNode.y = ifVisNode.y + Math.sin(newAngle) * dist;
              }
            }
          }
        }
      });

      this._initialized = true;
      if (this._nodesDataSet.length > 0) {
        try {
          this._network.fit({ animation: false });
        } catch (_) {}
      }
      this._updateTopology();
    } catch (err) {
      console.error('[NetworkMapCard] Error initializing network canvas:', err);
    }
  }

  private async _updateTopology(): Promise<void> {
    if (!this._config || this._isBuilding) return;

    const debugData = (this._config as any)._debug_data;
    if (!this._hass && !debugData) return;

    this._isBuilding = true;
    this._lastUpdateTime = Date.now();

    try {
      let rawIntegrations = this._config.integrations || [];

      // Auto-detect root_mac for integrations if not provided
      const resolvedIntegrations = rawIntegrations.map((int) => {
        let mac = int.root_mac;
        if (!mac && this._hass && !debugData) {
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

      let clientsByConfigEntry: Map<string, DiscoveredClient[]>;
      let rootNames: Map<string, string> | undefined;

      if (debugData && debugData.clientsByConfigEntry) {
        clientsByConfigEntry = new Map();
        for (const [k, v] of Object.entries(debugData.clientsByConfigEntry)) {
          clientsByConfigEntry.set(k, v as DiscoveredClient[]);
        }
        rootNames = new Map();
        if (debugData.rootNames) {
          for (const [k, v] of Object.entries(debugData.rootNames)) {
            rootNames.set(k, v as string);
          }
        }
      } else {
        if (!this._hass) return;
        const fetchResult = await HaHelper.fetchClients(this._hass, resolvedIntegrations);
        this._diagnostics = fetchResult.diagnostics;
        clientsByConfigEntry = fetchResult.clientsByConfigEntry;
        rootNames = fetchResult.rootNames;
      }

      const graphData = TopologyEngine.buildGraph({
        masterRootMac: masterMac || '',
        integrations: resolvedIntegrations,
        clientsByConfigEntry,
        rootNames,
        homeassistantMac: this._config.homeassistant_mac,
      });

      this._currentNodes = graphData.nodes;

      const newSignature = JSON.stringify({
        n: graphData.nodes.map((n) => `${n.id}:${n.label}:${n.isConnected}:${n.ip}:${n.isHomeAssistant}`),
        e: graphData.edges.map((e) => `${e.from}->${e.to}:${e.label}:${e.connectionType}`),
        offline: this._showOffline,
        layout: this._config.layout_mode || 'molecular',
        ha: this._config.homeassistant_mac,
      });

      if (newSignature === this._lastDataSignature) {
        return;
      }
      this._lastDataSignature = newSignature;

      const isDark =
        this._hass?.themes?.darkMode ??
        window.matchMedia('(prefers-color-scheme: dark)').matches;

      const layoutMode = this._config.layout_mode || 'molecular';
      const isHierarchical = layoutMode === 'tree' || layoutMode === 'horizontal';

      if (this._network && this._currentLayoutMode && this._currentLayoutMode !== layoutMode) {
        this._currentLayoutMode = layoutMode;
        this._recreateNetwork();
        return;
      }
      this._currentLayoutMode = layoutMode;

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

      // Sort nodes to guarantee deterministic alphabetical layout: master first, interfaces sorted alphabetically, clients sorted alphabetically
      nodesToDisplay.sort((a, b) => {
        if (a.isMasterRoot) return -1;
        if (b.isMasterRoot) return 1;
        if (a.isInterface && !b.isInterface) return -1;
        if (!a.isInterface && b.isInterface) return 1;
        const nameA = a.interfaceName || a.label || a.id;
        const nameB = b.interfaceName || b.label || b.id;
        return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
      });

      // Radial positions calculation for 'radial' mode
      const childrenMap = new Map<string, string[]>();
      for (const edge of edgesToDisplay) {
        if (!childrenMap.has(edge.from)) {
          childrenMap.set(edge.from, []);
        }
        childrenMap.get(edge.from)!.push(edge.to);
      }

      // Sort children alphabetically (both interfaces and client devices)
      for (const [_, childList] of childrenMap.entries()) {
        childList.sort((a, b) => {
          const nodeA = nodesToDisplay.find((n) => n.id === a);
          const nodeB = nodesToDisplay.find((n) => n.id === b);
          const labelA = nodeA?.interfaceName || nodeA?.label || a;
          const labelB = nodeB?.interfaceName || nodeB?.label || b;
          return labelA.localeCompare(labelB, undefined, { numeric: true, sensitivity: 'base' });
        });
      }

      // Populate maps for molecular constraint
      this._nodeParentMap = new Map();
      this._interfaceChildrenMap = new Map();
      for (const edge of edgesToDisplay) {
        this._nodeParentMap.set(edge.to, edge.from);
      }
      for (const node of nodesToDisplay) {
        if (node.isInterface) {
          const children = childrenMap.get(node.id) || [];
          if (children.length > 0) {
            this._interfaceChildrenMap.set(node.id, children);
          }
        }
      }

      const masterNode =
        nodesToDisplay.find((n) => n.isMasterRoot) ||
        nodesToDisplay.find((n) => n.isRoot) ||
        nodesToDisplay[0];
      const masterId = masterNode?.id;

      const initialPositions = new Map<string, { x: number; y: number }>();
      if (!isHierarchical && masterId) {
        if (layoutMode === 'molecular') {
          // Modello Molecolare Viewport-Aware:
          // Orienta dinamicamente lo scheletro portante (Router e Access Point)
          // in base alle proporzioni dello schermo (Landscape orizzontale vs Portrait verticale)
          initialPositions.set(masterId, { x: 0, y: 0 });

          const countSubtree = (nodeId: string, visited: Set<string>): number => {
            visited.add(nodeId);
            const children = (childrenMap.get(nodeId) || []).filter((c) => !visited.has(c));
            let count = 1;
            for (const childId of children) {
              count += countSubtree(childId, visited);
            }
            return count;
          };

          const containsRoot = (nodeId: string, visited: Set<string>): boolean => {
            visited.add(nodeId);
            const node = nodesToDisplay.find((n) => n.id === nodeId);
            if (node?.isRoot && !node.isMasterRoot) return true;
            const children = (childrenMap.get(nodeId) || []).filter((c) => !visited.has(c));
            for (const childId of children) {
              if (containsRoot(childId, visited)) return true;
            }
            return false;
          };

          const masterChildren = childrenMap.get(masterId) || [];

          // Rileva proporzioni reali della viewport / contenitore
          const container = this.shadowRoot?.querySelector('.network-container') as HTMLDivElement | null;
          const cWidth = container?.clientWidth || (typeof window !== 'undefined' ? window.innerWidth : 800);
          const cHeight = container?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 600);
          const aspect = cWidth / Math.max(1, cHeight);
          const isLandscape = aspect >= 1.05;
          const isPortrait = aspect < 0.95;

          // Fattori di allungamento lungo gli assi X e Y per saturare lo spazio disponibile
          const stretchX = isLandscape ? Math.min(1.45, Math.max(1.0, Math.sqrt(aspect))) : 1.0;
          const stretchY = isPortrait ? Math.min(1.45, Math.max(1.0, Math.sqrt(1 / aspect))) : 1.0;

          // Distingui rami portanti di dorsale (che portano ad AP/Router) da rami terminali di client
          const backboneChildren: string[] = [];
          const terminalChildren: string[] = [];
          for (const ifId of masterChildren) {
            if (containsRoot(ifId, new Set([masterId]))) {
              backboneChildren.push(ifId);
            } else {
              terminalChildren.push(ifId);
            }
          }

          const childAngleMap = new Map<string, { angle: number; span: number }>();

          if (backboneChildren.length > 0 && (isLandscape || isPortrait)) {
            if (isLandscape) {
              // SCHERMO ORIZZONTALE (Landscape): Dorsale principale lungo l'asse X con lieve inclinazione organica naturale (~ -9.5°)
              const organicTilt = -0.16;

              if (backboneChildren.length === 1) {
                childAngleMap.set(backboneChildren[0], { angle: 0 + organicTilt, span: Math.PI * 0.7 });
              } else if (backboneChildren.length === 2) {
                childAngleMap.set(backboneChildren[0], { angle: 0 + organicTilt, span: Math.PI * 0.65 });
                childAngleMap.set(backboneChildren[1], { angle: Math.PI + organicTilt, span: Math.PI * 0.65 });
              } else {
                const step = (Math.PI * 0.8) / (backboneChildren.length - 1);
                backboneChildren.forEach((bId, idx) => {
                  const a = -Math.PI * 0.4 + idx * step + organicTilt;
                  childAngleMap.set(bId, { angle: a, span: step * 0.9 });
                });
              }

              // I client locali si distribuiscono nei settori verticali (In Alto: -PI/2 + tilt, In Basso: +PI/2 + tilt)
              const topTerminals: string[] = [];
              const bottomTerminals: string[] = [];
              terminalChildren.forEach((tId, idx) => {
                if (idx % 2 === 0) topTerminals.push(tId);
                else bottomTerminals.push(tId);
              });

              const assignSector = (list: string[], centerAngle: number) => {
                if (list.length === 0) return;
                const arc = Math.min(Math.PI * 0.85, 0.45 * list.length + 0.3);
                const step = list.length > 1 ? arc / (list.length - 1) : 0;
                list.forEach((id, idx) => {
                  const a = list.length === 1 ? centerAngle : centerAngle - arc / 2 + idx * step;
                  childAngleMap.set(id, { angle: a, span: step || Math.PI * 0.4 });
                });
              };

              assignSector(topTerminals, -Math.PI / 2 + organicTilt);
              assignSector(bottomTerminals, Math.PI / 2 + organicTilt);
            } else {
              // SCHERMO VERTICALE (Portrait): Dorsale principale lungo l'asse Y con lieve inclinazione organica naturale (~ +9.5°)
              const organicTilt = 0.16;

              if (backboneChildren.length === 1) {
                childAngleMap.set(backboneChildren[0], { angle: Math.PI / 2 + organicTilt, span: Math.PI * 0.7 });
              } else if (backboneChildren.length === 2) {
                childAngleMap.set(backboneChildren[0], { angle: Math.PI / 2 + organicTilt, span: Math.PI * 0.65 });
                childAngleMap.set(backboneChildren[1], { angle: -Math.PI / 2 + organicTilt, span: Math.PI * 0.65 });
              } else {
                const step = (Math.PI * 0.8) / (backboneChildren.length - 1);
                backboneChildren.forEach((bId, idx) => {
                  const a = Math.PI * 0.1 + idx * step + organicTilt;
                  childAngleMap.set(bId, { angle: a, span: step * 0.9 });
                });
              }

              // I client locali si distribuiscono nei settori orizzontali (A Destra: 0 + tilt, A Sinistra: PI + tilt)
              const leftTerminals: string[] = [];
              const rightTerminals: string[] = [];
              terminalChildren.forEach((tId, idx) => {
                if (idx % 2 === 0) rightTerminals.push(tId);
                else leftTerminals.push(tId);
              });

              const assignSector = (list: string[], centerAngle: number) => {
                if (list.length === 0) return;
                const arc = Math.min(Math.PI * 0.85, 0.45 * list.length + 0.3);
                const step = list.length > 1 ? arc / (list.length - 1) : 0;
                list.forEach((id, idx) => {
                  const a = list.length === 1 ? centerAngle : centerAngle - arc / 2 + idx * step;
                  childAngleMap.set(id, { angle: a, span: step || Math.PI * 0.4 });
                });
              };

              assignSector(rightTerminals, 0 + organicTilt);
              assignSector(leftTerminals, Math.PI + organicTilt);
            }
          } else {
            // Distribuzione circolare proporzionale per schermi quadrati o router singolo
            const weights = masterChildren.map((c) => countSubtree(c, new Set([masterId])));
            const totalWeight = weights.reduce((sum, w) => sum + w, 0) || 1;
            let currentAngle = isLandscape ? 0 : -Math.PI / 2;

            masterChildren.forEach((ifId, idx) => {
              const sectorSpan = (weights[idx] / totalWeight) * 2 * Math.PI;
              const midAngle = currentAngle + sectorSpan / 2;
              currentAngle += sectorSpan;
              childAngleMap.set(ifId, { angle: midAngle, span: sectorSpan });
            });
          }

          masterChildren.forEach((ifId) => {
            const angleInfo = childAngleMap.get(ifId) || { angle: 0, span: Math.PI / 2 };
            const midAngle = angleInfo.angle;
            const sectorSpan = angleInfo.span;

            // Posizione dell'interfaccia del router: allungata con fattore stretch
            const rIf = 120;
            const ifX = Math.cos(midAngle) * rIf * stretchX;
            const ifY = Math.sin(midAngle) * rIf * stretchY;
            initialPositions.set(ifId, { x: ifX, y: ifY });

            // Sventaglia i discendenti di questa interfaccia verso l'esterno lungo la direzione midAngle
            const layoutBranchOutward = (
              parentId: string,
              parentX: number,
              parentY: number,
              baseAngle: number,
              availSpan: number,
              hopDist: number,
              visited: Set<string>
            ) => {
              visited.add(parentId);
              const children = (childrenMap.get(parentId) || []).filter((c) => !visited.has(c));
              if (children.length === 0) return;

              const cCount = children.length;
              if (cCount === 1) {
                // Nodo singolo in cascata (es. LAN1 -> TP-Link AP): prosegue dritto lungo la direzione principale
                const childId = children[0];
                const childX = parentX + Math.cos(baseAngle) * hopDist * stretchX;
                const childY = parentY + Math.sin(baseAngle) * hopDist * stretchY;
                initialPositions.set(childId, { x: childX, y: childY });
                layoutBranchOutward(childId, childX, childY, baseAngle, availSpan, 95, visited);
                return;
              }

              // Più dispositivi o interfacce: sventagliati verso l'esterno (via dal centro!)
              const childWeights = children.map((c) => countSubtree(c, new Set(visited)));
              const cTotalWeight = childWeights.reduce((sum, w) => sum + w, 0) || 1;

              // Ampiezza del ventaglio outward, centrato sulla direzione baseAngle
              const fanSpan = Math.min(availSpan * 0.9, Math.PI * 0.82);
              let currentFanAngle = baseAngle - fanSpan / 2;

              children.forEach((childId, cIdx) => {
                const cSpan = (childWeights[cIdx] / cTotalWeight) * fanSpan;
                const cMidAngle = currentFanAngle + cSpan / 2;
                currentFanAngle += cSpan;

                // Raggio del ventaglio proporzionale al numero di elementi
                const dist = Math.max(95, Math.min(210, 80 + cCount * 7));
                const childX = parentX + Math.cos(cMidAngle) * dist * stretchX;
                const childY = parentY + Math.sin(cMidAngle) * dist * stretchY;
                initialPositions.set(childId, { x: childX, y: childY });

                layoutBranchOutward(childId, childX, childY, cMidAngle, cSpan, hopDist + 15, visited);
              });
            };

            layoutBranchOutward(ifId, ifX, ifY, midAngle, sectorSpan, 115, new Set([masterId]));
          });
        } else {
          // Layout Radiale originale ripristinato dal commit Git
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
      }

      // Transform nodes
      const isMolecular = layoutMode === 'molecular';
      const visNodes = nodesToDisplay.map((node) => {
        const isMaster = node.isMasterRoot || node.id === masterId;
        const pos = initialPositions.get(node.id);

        let fixedConstraint: any = false;
        if (!isHierarchical) {
          if (isMolecular) {
            // Nel modello molecolare: lo scheletro portante (nuclei router/AP e interfacce) ha distanza fissa!
            // Solo i dispositivi client periferici (elettroni) sono liberi di muoversi e respingersi!
            if (node.isMasterRoot || node.isRoot || node.isInterface) {
              fixedConstraint = { x: true, y: true };
            }
          } else if (isMaster) {
            fixedConstraint = { x: true, y: true };
          }
        }

        const initialX = pos ? pos.x : undefined;
        const initialY = pos ? pos.y : undefined;

        // Special styling for Interface Sub-branch nodes (Clean text, no emoji)
        if (node.isInterface) {
          const isLan = node.connectionType === 'lan';
          const isWifi = node.connectionType === 'wifi';
          const isOfflineIf =
            node.interfaceName?.toLowerCase().includes('disconness') ||
            node.interfaceName?.toLowerCase().includes('offline');

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
                ? isOfflineIf
                  ? '#262626'
                  : isLan
                  ? '#162836'
                  : '#122927'
                : isOfflineIf
                ? '#f0f0f0'
                : isLan
                ? '#e3f2fd'
                : '#e0f2f1',
              border: isOfflineIf ? '#9e9e9e' : isLan ? '#1976d2' : isWifi ? '#00897b' : '#757575',
              highlight: {
                background: isOfflineIf ? '#e0e0e0' : isLan ? '#bbdefb' : '#b2dfdb',
                border: isOfflineIf ? '#757575' : '#0288d1',
              },
            },
            font: {
              multi: 'html',
              size: 11,
              color: isDark ? (isOfflineIf ? '#9e9e9e' : '#e0e0e0') : isOfflineIf ? '#757575' : '#212121',
              face: 'Roboto, sans-serif',
            },
          };
        }

        // Home Assistant Server node: render official Home Assistant logo icon
        if (node.isHomeAssistant) {
          let label = `<b>${node.label}</b>`;
          if (node.ip) {
            label += `\n<i>${node.ip}</i>`;
          }
          return {
            id: node.id,
            label: label,
            title: `<b>Home Assistant Server</b><br/>MAC: ${node.mac}${node.ip ? `<br/>IP: ${node.ip}` : ''}`,
            shape: 'image',
            image: HA_OFFICIAL_ICON,
            brokenImage: HA_FALLBACK_ICON,
            size: 13,
            level: isHierarchical ? (node.depth ?? 0) : undefined,
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
                color: '#03a9f4',
                size: 12,
              },
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

        const isRadial = layoutMode === 'radial';
        const isMolecular = layoutMode === 'molecular';
        let edgeColor = isDark ? '#555555' : '#bbbbbb';
        let dashes: boolean | number[] = false;
        let width = 1.6;
        let length = isMolecular ? 85 : isRadial ? 95 : 95;

        // Nel modello molecolare i legami fissi hanno distanze equilibrate per dare respiro al centro
        if (isMolecular && edge.from === masterId) {
          length = 115;
        } else if (isLan) {
          dashes = false;
          width = 2.2;
          edgeColor = isDark ? '#64b5f6' : '#1976d2';
          length = isMolecular ? 105 : isRadial ? 90 : 90;
        } else if (isWifi) {
          dashes = [5, 5];
          width = 1.4;
          edgeColor = isDark ? '#4db6ac' : '#00897b';
          length = isMolecular ? 115 : isRadial ? 105 : 105;
        }

        let smoothConfig: any = {
          enabled: true,
          type: 'cubicBezier',
          forceDirection: layoutMode === 'horizontal' ? 'horizontal' : 'vertical',
          roundness: isLan ? 0.08 : 0.22,
        };

        if (layoutMode === 'radial' || layoutMode === 'molecular') {
          smoothConfig = {
            enabled: true,
            type: 'continuous',
            roundness: 0.2,
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

  private _recreateNetwork(): void {
    if (this._network) {
      try {
        this._network.destroy();
      } catch (_) {}
      this._network = undefined;
    }
    this._nodesDataSet.clear();
    this._edgesDataSet.clear();
    this._lastDataSignature = '';
    this._initNetwork();
  }

  private _cycleLayout(): void {
    const modes: ('molecular' | 'tree' | 'radial' | 'horizontal')[] = [
      'molecular',
      'tree',
      'radial',
      'horizontal',
    ];
    const current = this._currentLayoutMode || this._config?.layout_mode || 'molecular';
    const nextIdx = (modes.indexOf(current as any) + 1) % modes.length;
    const nextMode = modes[nextIdx];

    if (this._config) {
      this._config = { ...this._config, layout_mode: nextMode };
    }
    this._currentLayoutMode = nextMode;

    this._recreateNetwork();

    this.dispatchEvent(
      new CustomEvent('config-changed', {
        detail: { config: this._config },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _getLayoutLabel(): string {
    const mode = this._currentLayoutMode || this._config?.layout_mode || 'molecular';
    if (mode === 'molecular') return 'Molecolare';
    if (mode === 'tree') return 'Albero';
    if (mode === 'radial') return 'Radiale';
    if (mode === 'horizontal') return 'Orizzontale';
    return 'Molecolare';
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

  private _getTraceToRoot(nodeId: string): NetworkNode[] {
    const path: NetworkNode[] = [];
    let currentId: string | undefined = nodeId;
    const visited = new Set<string>();

    const edges = this._edgesDataSet.get() as any[];
    const parentMap = new Map<string, string>();
    for (const e of edges) {
      parentMap.set(e.to, e.from);
    }

    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const node = this._currentNodes.find((n) => n.id === currentId);
      if (node) {
        path.unshift(node);
      }
      currentId = parentMap.get(currentId);
    }

    // Exclude interface sub-branches so path strictly displays physical network devices
    return path.filter((n) => !n.isInterface || n.id === nodeId);
  }

  private _selectAndFocusNode(nodeId: string): void {
    const targetNode = this._currentNodes.find((n) => n.id === nodeId);
    if (targetNode) {
      this._selectedNode = targetNode;
      if (this._network) {
        this._network.focus(nodeId, {
          scale: 1.15,
          animation: { duration: 350, easingFunction: 'easeInOutQuad' },
        });
      }
      this.requestUpdate();
    }
  }

  private _copyToClipboard(text: string, label: string): void {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this._copyNotification = `${label} copiato!`;
        this.requestUpdate();
        setTimeout(() => {
          this._copyNotification = '';
          this.requestUpdate();
        }, 2500);
      });
    } else {
      prompt(`Copia ${label}:`, text);
    }
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
      layout_mode: 'molecular',
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
            <button
              class="zoom-btn"
              @click=${this._cycleLayout}
              title="Stile del grafo: ${this._getLayoutLabel()} (clicca per cambiare)"
            >
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M22 11V9h-7V3H9v6H2v2h7v6H7v4h4v-4H9v-6h6v4h-2v4h4v-4h-2v-4h7z"/></svg>
            </button>
            <button
              class="zoom-btn ${!this._showOffline ? 'filtered' : ''}"
              @click=${this._toggleOffline}
              title="${this._showOffline ? 'Nascondi dispositivi offline' : 'Mostra dispositivi offline'}"
            >
              ${this._showOffline
                ? html`<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`
                : html`<svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.44-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>`}
            </button>
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
    const tracePath = this._getTraceToRoot(node.id);

    if (node.isInterface) {
      return html`
        <div class="detail-drawer">
          <div class="detail-header">
            <div class="detail-title">${node.label}</div>
            <button class="close-btn" @click=${this._closeDetailDrawer} title="Chiudi">×</button>
          </div>

          <div class="detail-badges">
            <span class="role-tag ${isLan ? 'master' : 'ap'}">
              ${isLan ? 'Interfaccia LAN' : 'Interfaccia Wi-Fi'}
            </span>
            <span class="conn-tag ${isLan ? 'lan' : isWifi ? 'wifi' : ''}">
              ${isLan ? 'LAN' : isWifi ? 'Wi-Fi' : 'Standard'}
            </span>
          </div>

          <!-- Percorso di rete -->
          ${tracePath.length > 1
            ? html`
                <div class="drawer-section">
                  <div class="drawer-section-title">Percorso di rete</div>
                  <div class="trace-breadcrumb">
                    ${tracePath.map((hop, idx) => {
                      const isTarget = hop.id === node.id;
                      return html`
                        <span
                          class="trace-pill ${isTarget ? 'active' : ''}"
                          @click=${() => this._selectAndFocusNode(hop.id)}
                          title="Clicca per mettere a fuoco sulla mappa"
                        >
                          ${hop.label}
                        </span>
                        ${idx < tracePath.length - 1 ? html`<span class="trace-separator">&gt;</span>` : ''}
                      `;
                    })}
                  </div>
                </div>
              `
            : ''}

          <!-- Informazioni -->
          <div class="drawer-section">
            <div class="drawer-section-title">Informazioni</div>
            <div class="detail-row">
              <span class="detail-label">Interfaccia:</span>
              <span class="detail-value">${node.interfaceName || 'Non specificata'}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Tipo:</span>
              <span class="detail-value">${isLan ? 'Cablata (LAN)' : isWifi ? 'Wireless (Wi-Fi)' : 'Altro'}</span>
            </div>
          </div>
        </div>
      `;
    }

    const sources = node.sources && node.sources.length > 0 ? node.sources : [];

    return html`
      <div class="detail-drawer">
        <div class="detail-header">
          <div class="detail-title">${node.label}</div>
          <button class="close-btn" @click=${this._closeDetailDrawer} title="Chiudi">×</button>
        </div>

        <!-- Badges stato e ruolo -->
        <div class="detail-badges">
          <span class="status-badge ${isOnline ? 'online' : 'offline'}">
            <span>●</span> ${isOnline ? 'Connesso' : 'Disconnesso'}
          </span>

          ${node.isHomeAssistant
            ? html`<span class="role-tag master" style="background: rgba(3, 169, 244, 0.15); color: #0288d1; border-color: #03a9f4;">Server Home Assistant</span>`
            : node.isMasterRoot
            ? html`<span class="role-tag master">Router Gateway</span>`
            : node.isRoot
            ? html`<span class="role-tag ap">Access Point</span>`
            : ''}

          ${node.connectionType && node.connectionType !== 'unknown'
            ? html`
                <span class="conn-tag ${isLan ? 'lan' : isWifi ? 'wifi' : ''}">
                  ${isLan ? 'LAN' : isWifi ? 'Wi-Fi' : node.connectionType.toUpperCase()}
                </span>
              `
            : ''}
        </div>

        <!-- 1. Percorso dal dispositivo alla radice -->
        ${tracePath.length > 1
          ? html`
              <div class="drawer-section">
                <div class="drawer-section-title">Percorso di rete</div>
                <div class="trace-breadcrumb">
                  ${tracePath.map((hop, idx) => {
                    const isTarget = hop.id === node.id;
                    return html`
                      <span
                        class="trace-pill ${isTarget ? 'active' : ''}"
                        @click=${() => this._selectAndFocusNode(hop.id)}
                        title="Clicca per mettere a fuoco sulla mappa"
                      >
                        ${hop.label}
                      </span>
                      ${idx < tracePath.length - 1 ? html`<span class="trace-separator">&gt;</span>` : ''}
                    `;
                  })}
                </div>
              </div>
            `
          : ''}

        <!-- 2. Informazioni Comuni Consolidate -->
        <div class="drawer-section">
          <div class="drawer-section-title">Informazioni Comuni</div>

          <div class="detail-row">
            <span class="detail-label">Indirizzo IP:</span>
            <span class="detail-value" style="color: var(--primary-color, #0288d1); font-weight: bold;">
              ${node.ip || 'Non rilevato'}
              ${node.ip
                ? html`
                    <button
                      class="copy-chip"
                      @click=${() => this._copyToClipboard(node.ip!, 'IP')}
                      title="Copia indirizzo IP"
                    >
                      Copia
                    </button>
                  `
                : ''}
            </span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Indirizzo MAC:</span>
            <span class="detail-value">
              ${node.mac}
              <button
                class="copy-chip"
                @click=${() => this._copyToClipboard(node.mac, 'MAC')}
                title="Copia indirizzo MAC"
              >
                Copia
              </button>
            </span>
          </div>

          <div class="detail-row">
            <span class="detail-label">Stato globale:</span>
            <span class="detail-value">${isOnline ? 'Online (Attivo)' : 'Offline (Non connesso)'}</span>
          </div>

          ${this._copyNotification ? html`<div class="copy-alert">✓ ${this._copyNotification}</div>` : ''}
        </div>

        <!-- 3. Riferimenti alle varie Entità e Integrazioni -->
        <div class="drawer-section">
          <div class="drawer-section-title">
            Entità e Integrazioni ${sources.length > 0 ? `(${sources.length})` : ''}
          </div>

          ${sources.length > 0
            ? sources.map(
                (src) => html`
                  <div class="source-card">
                    <div class="source-header">
                      <span class="source-name">${src.integrationName}</span>
                      <span class="status-badge ${src.isConnected !== false ? 'online' : 'offline'}">
                        ● ${src.state || (src.isConnected !== false ? 'online' : 'offline')}
                      </span>
                    </div>

                    ${src.name
                      ? html`
                          <div class="source-row">
                            <span class="source-label">${src.deviceName && src.deviceName !== src.name ? 'Nome entità:' : 'Nome:'}</span>
                            <span class="source-val">${src.name}</span>
                          </div>
                        `
                      : ''}

                    ${src.deviceName && src.deviceName !== src.name
                      ? html`
                          <div class="source-row">
                            <span class="source-label">Dispositivo:</span>
                            <span class="source-val">${src.deviceName}</span>
                          </div>
                        `
                      : ''}

                    ${src.entityId
                      ? html`
                          <div class="source-row">
                            <span class="source-label">Entità:</span>
                            <span class="source-val mono">${src.entityId}</span>
                          </div>
                        `
                      : ''}

                    ${src.linkInfo
                      ? html`
                          <div class="source-row">
                            <span class="source-label">Porta / Canale:</span>
                            <span class="source-val">${src.linkInfo}</span>
                          </div>
                        `
                      : ''}

                    ${src.ip && src.ip !== node.ip
                      ? html`
                          <div class="source-row">
                            <span class="source-label">IP rilevato:</span>
                            <span class="source-val mono">${src.ip}</span>
                          </div>
                        `
                      : ''}

                    ${src.attributes?.signal !== undefined || src.attributes?.rssi !== undefined
                      ? html`
                          <div class="source-row">
                            <span class="source-label">Segnale:</span>
                            <span class="source-val">${src.attributes?.signal ?? src.attributes?.rssi} dBm</span>
                          </div>
                        `
                      : ''}

                    ${src.attributes?.rate !== undefined || src.attributes?.tx_rate !== undefined
                      ? html`
                          <div class="source-row">
                            <span class="source-label">Velocità Wi-Fi:</span>
                            <span class="source-val">${src.attributes?.rate ?? src.attributes?.tx_rate}</span>
                          </div>
                        `
                      : ''}

                    ${src.entityId
                      ? html`
                          <button
                            class="open-entity-btn"
                            @click=${() => this._openMoreInfo(src.entityId)}
                            title="Apri scheda entità in Home Assistant"
                          >
                            Apri scheda entità
                          </button>
                        `
                      : ''}
                  </div>
                `
              )
            : node.entityId
            ? html`
                <div class="source-card">
                  <div class="source-row">
                    <span class="source-label">Entità:</span>
                    <span class="source-val mono">${node.entityId}</span>
                  </div>
                  <button class="open-entity-btn" @click=${() => this._openMoreInfo(node.entityId)}>
                    Apri scheda entità
                  </button>
                </div>
              `
            : html`
                <div style="font-size: 0.8rem; color: var(--secondary-text-color); font-style: italic;">
                  Nessuna entità specifica associata.
                </div>
              `}
        </div>
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
