import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { TopologyEngine } from './topology-engine';
import { DiscoveredClient, IntegrationConfig } from './types';

/**
 * Helper to simulate and test an exact user network from an exported diagnostic JSON.
 */
export function runDiagnosticsSimulation(jsonString: string) {
  const parsed = JSON.parse(jsonString);
  const clientsMap = new Map<string, DiscoveredClient[]>();
  for (const [k, v] of Object.entries(parsed.clientsByConfigEntry as Record<string, DiscoveredClient[]>)) {
    clientsMap.set(k, v);
  }

  return TopologyEngine.buildGraph({
    masterRootMac: parsed.masterRootMac || '',
    homeassistantMac: parsed.homeassistantMac,
    integrations: (parsed.integrations || []) as IntegrationConfig[],
    clientsByConfigEntry: clientsMap,
  });
}

/**
 * Generates an interactive, standalone HTML preview page by loading the EXACT production component bundle.
 */
export function generatePreviewHtml(jsonString: string, outputPath: string) {
  const parsed = JSON.parse(jsonString);
  const bundlePath = path.resolve(__dirname, '../dist/network-map-card.js');
  const bundleJs = fs.readFileSync(bundlePath, 'utf-8');

  const html = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Anteprima Rete Locale - Network Map Card</title>
  <style>
    :root {
      --primary-color: #0288d1;
      --card-background-color: #ffffff;
      --primary-text-color: #212121;
      --secondary-text-color: #757575;
      --divider-color: #e0e0e0;
      --ha-card-border-radius: 0px;
    }
    * { box-sizing: border-box; }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #f5f5f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }
    #preview-card {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
  </style>
  <script>
    if (!customElements.get('ha-card')) {
      customElements.define('ha-card', class extends HTMLElement {});
    }
  </script>
  <script type="module">
${bundleJs}
  </script>
</head>
<body>
  <network-map-card id="preview-card"></network-map-card>

  <script type="module">
    const payload = ${JSON.stringify(parsed)};
    const card = document.getElementById('preview-card');

    card.setConfig({
      type: 'custom:network-map-card',
      layout_mode: payload.layoutMode || 'molecular',
      master_root_mac: payload.masterRootMac,
      homeassistant_mac: payload.homeassistantMac,
      integrations: payload.integrations || [],
      show_offline: true,
      _debug_data: payload,
    });

    card.hass = {
      themes: { darkMode: false },
      states: {},
      callWS: async () => [],
    };
  </script>
</body>
</html>`;

  fs.writeFileSync(outputPath, html, 'utf-8');
}

describe('Issue Reproduction Runner', () => {
  it('simulates and verifies network topology from reference JSON payload', () => {
    const referencePath = path.resolve(__dirname, './reference-network.json');
    const rawJson = fs.readFileSync(referencePath, 'utf-8');

    const graph = runDiagnosticsSimulation(rawJson);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.edges.length).toBeGreaterThanOrEqual(1);
  });

  it('simulates real network topology from reference-network.json (or debug_rete.json / report_test.txt) and generates preview.html', () => {
    const debugPath = path.resolve(__dirname, '../debug_rete.json');
    const reportPath = path.resolve(__dirname, '../report_test.txt');
    const referencePath = path.resolve(__dirname, './reference-network.json');
    const filePath = fs.existsSync(debugPath)
      ? debugPath
      : fs.existsSync(reportPath)
      ? reportPath
      : referencePath;

    const rawJson = fs.readFileSync(filePath, 'utf-8');
    const graph = runDiagnosticsSimulation(rawJson);

    // Deep Topology Audit
    const roots = graph.nodes.filter((n) => n.isRoot);
    const interfaces = graph.nodes.filter((n) => n.isInterface);
    const clients = graph.nodes.filter((n) => !n.isRoot && !n.isInterface);

    // Verify Master Router is root at depth 0
    const masterNode = graph.nodes.find((n) => n.mac === '00:00:00:00:00:01');
    expect(masterNode).toBeDefined();
    expect(masterNode?.isMasterRoot).toBe(true);
    expect(masterNode?.depth).toBe(0);

    // Verify Home Assistant server node is identified
    const haNode = graph.nodes.find((n) => n.mac === '00:00:00:00:00:0b');
    expect(haNode).toBeDefined();
    expect(haNode?.isHomeAssistant).toBe(true);

    // Verify Secondary AP (Device_02)
    const apNode = graph.nodes.find((n) => n.mac === '00:00:00:00:00:02');
    expect(apNode).toBeDefined();
    expect(apNode?.isRoot).toBe(true);
    expect(apNode?.depth).toBe(2);

    // Verify Huawei EchoLife (Device_03)
    const huaweiNode = graph.nodes.find((n) => n.mac === '00:00:00:00:00:03');
    expect(huaweiNode).toBeDefined();
    expect(huaweiNode?.isRoot).toBe(true);
    expect(huaweiNode?.depth).toBe(2);

    // Detailed Topology Breakdown
    const interfaceMap = new Map(interfaces.map((i) => [i.id, i]));
    const rootMap = new Map(roots.map((r) => [r.id, r]));

    const summary = interfaces.map((ifNode) => {
      const parentRoot = rootMap.get(ifNode.parentId || '') || roots.find((r) => graph.edges.some((e) => e.from === r.id && e.to === ifNode.id));
      const connectedEdges = graph.edges.filter((e) => e.from === ifNode.id);
      const connectedDevices = connectedEdges.map((e) => {
        const client = graph.nodes.find((n) => n.id === e.to);
        return {
          label: client?.label,
          type: e.connectionType,
          online: client?.isConnected !== false,
          isRoot: client?.isRoot,
        };
      });
      return {
        interface: ifNode.interfaceName || ifNode.label,
        type: ifNode.connectionType,
        parent: parentRoot?.label || parentRoot?.mac,
        devicesCount: connectedDevices.length,
        devices: connectedDevices,
      };
    });

    console.log(JSON.stringify(summary, null, 2));

    expect(roots.length).toBe(3);
    expect(interfaces.length).toBeGreaterThanOrEqual(4);
    expect(clients.length).toBeGreaterThanOrEqual(20);

    // Generate preview.html loading the production bundle directly
    const previewPath = path.resolve(__dirname, '../preview.html');
    generatePreviewHtml(rawJson, previewPath);
    expect(fs.existsSync(previewPath)).toBe(true);
  });

  it('correctly resolves debug_rete.json keeping active devices online and linked to master router', () => {
    const debugPath = path.resolve(__dirname, '../debug_rete.json');
    if (!fs.existsSync(debugPath)) return;

    const rawJson = fs.readFileSync(debugPath, 'utf-8');
    const graph = runDiagnosticsSimulation(rawJson);

    // Device [05] (Interruttore Luce) is online on router SSID1
    const dev05 = graph.nodes.find((n) => n.mac === '00:00:00:00:00:05');
    expect(dev05).toBeDefined();
    expect(dev05?.isConnected).toBe(true);
    expect(dev05?.state).toBe('home');

    const dev05Edge = graph.edges.find((e) => e.to === '00:00:00:00:00:05');
    const ssid1Interface = graph.nodes.find((n) => n.isInterface && n.interfaceName === 'SSID1');
    expect(dev05Edge?.from).toBe(ssid1Interface?.id);

    // Device [13] (Climatizzatore) is online on router LAN1
    const dev13 = graph.nodes.find((n) => n.mac === '00:00:00:00:00:13');
    expect(dev13).toBeDefined();
    expect(dev13?.isConnected).toBe(true);
    expect(dev13?.state).toBe('home');

    const dev13Edge = graph.edges.find((e) => e.to === '00:00:00:00:00:13');
    const lan1Interface = graph.nodes.find((n) => n.isInterface && n.interfaceName === 'LAN1');
    expect(dev13Edge?.from).toBe(lan1Interface?.id);
  });
});
