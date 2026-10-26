import { describe, it, expect } from 'vitest';
import { HaHelper } from './ha-helper';
import { TopologyEngine } from './topology-engine';
import { DiscoveredClient, IntegrationConfig } from './types';

describe('Diagnostics Anonymizer', () => {
  it('anonymizes sensitive data while preserving exact graph topology', () => {
    const realRouterMac = '44:D9:E7:AA:BB:CC';
    const realApMac = '00:1A:2B:3C:4D:5E';
    const realPhoneMac = 'FA:16:3E:99:88:77';
    const realPcMac = 'BC:24:11:22:33:44';

    const realRouterClients: DiscoveredClient[] = [
      {
        mac: realApMac,
        name: 'Access Point Salotto (TP-Link Deco)',
        ip: '192.168.1.200',
        linkInfo: 'LAN 1',
        isConnected: true,
        state: 'home',
      },
      {
        mac: realPcMac,
        name: 'PC Fisso Gaming Paolo',
        ip: '192.168.1.15',
        linkInfo: 'LAN 2',
        isConnected: true,
        state: 'home',
      },
    ];

    const realApClients: DiscoveredClient[] = [
      {
        mac: realPhoneMac,
        name: 'iPhone 15 Pro Mario',
        ip: '192.168.1.105',
        linkInfo: '5 GHz',
        isConnected: true,
        state: 'home',
        attributes: { signal: -52, rate: '866 Mbps' },
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('entry_router_123', realRouterClients);
    clientsMap.set('entry_ap_456', realApClients);

    const integrations: IntegrationConfig[] = [
      {
        config_entry_id: 'entry_router_123',
        root_mac: realRouterMac,
        name: 'Router Fibra Principale',
        is_master: true,
        lan_values: ['LAN 1', 'LAN 2'],
      },
      {
        config_entry_id: 'entry_ap_456',
        root_mac: realApMac,
        name: 'AP Salotto',
        wifi_values: ['5 GHz'],
      },
    ];

    // 1. Generate Anonymized Diagnostics Payload
    const anonymizedJson = HaHelper.generateAnonymizedDiagnostics({
      masterRootMac: realRouterMac,
      homeassistantMac: realPcMac,
      integrations,
      clientsByConfigEntry: clientsMap,
    });

    // Verify it is valid JSON
    expect(anonymizedJson).toBeDefined();
    const parsed = JSON.parse(anonymizedJson);

    // Verify card_config_yaml is generated and accurate
    expect(parsed.card_config_yaml).toBeDefined();
    expect(parsed.card_config_yaml).toContain('type: custom:network-map-card');
    expect(parsed.card_config_yaml).toContain('layout_mode:');
    expect(parsed.card_config_yaml).toContain('integrations:');
    expect(parsed.card_config_yaml).not.toContain(realRouterMac);

    // 2. PRIVACY ASSERTIONS: Real MACs, IPs, and Personal Names must NOT be present!
    expect(anonymizedJson).not.toContain(realRouterMac);
    expect(anonymizedJson).not.toContain(realApMac);
    expect(anonymizedJson).not.toContain(realPhoneMac);
    expect(anonymizedJson).not.toContain('192.168.1.200');
    expect(anonymizedJson).not.toContain('192.168.1.105');
    expect(anonymizedJson).not.toContain('Paolo');
    expect(anonymizedJson).not.toContain('Mario');
    expect(anonymizedJson).not.toContain('TP-Link Deco');

    // 3. TOPOLOGY FIDELITY: When built with TopologyEngine, original and anonymized graphs match!
    const originalGraph = TopologyEngine.buildGraph({
      masterRootMac: realRouterMac,
      homeassistantMac: realPcMac,
      integrations,
      clientsByConfigEntry: clientsMap,
    });

    const anonClientsMap = new Map<string, DiscoveredClient[]>();
    for (const [k, v] of Object.entries(parsed.clientsByConfigEntry as Record<string, DiscoveredClient[]>)) {
      anonClientsMap.set(k, v);
    }

    const anonymizedGraph = TopologyEngine.buildGraph({
      masterRootMac: parsed.masterRootMac,
      homeassistantMac: parsed.homeassistantMac,
      integrations: parsed.integrations,
      clientsByConfigEntry: anonClientsMap,
    });

    // Exact same number of nodes and edges
    expect(anonymizedGraph.nodes.length).toBe(originalGraph.nodes.length);
    expect(anonymizedGraph.edges.length).toBe(originalGraph.edges.length);

    // Exact same connection types
    const origTypes = originalGraph.edges.map((e) => e.connectionType).sort();
    const anonTypes = anonymizedGraph.edges.map((e) => e.connectionType).sort();
    expect(anonTypes).toEqual(origTypes);
  });

  it('excludes devices and entities where disabled_by is not null', async () => {
    const mockHass = {
      callWS: async (msg: any) => {
        if (msg.type === 'config/device_registry/list') {
          return [
            {
              id: 'dev_active',
              name: 'Active Phone',
              config_entries: ['test_entry'],
              connections: [['mac', 'AA:BB:CC:11:22:33']],
              disabled_by: null,
            },
            {
              id: 'dev_disabled',
              name: 'Old Disabled Device',
              config_entries: ['test_entry'],
              connections: [['mac', 'AA:BB:CC:99:99:99']],
              disabled_by: 'user', // DISABLED DEVICE
            },
          ];
        }
        if (msg.type === 'config/entity_registry/list') {
          return [
            {
              entity_id: 'device_tracker.active_phone',
              device_id: 'dev_active',
              config_entry_id: 'test_entry',
              disabled_by: null,
            },
            {
              entity_id: 'device_tracker.disabled_device',
              device_id: 'dev_disabled',
              config_entry_id: 'test_entry',
              disabled_by: 'user',
            },
          ];
        }
        return [];
      },
      states: {
        'device_tracker.active_phone': { state: 'home', attributes: {} },
        'device_tracker.disabled_device': { state: 'home', attributes: {} },
      },
    } as any;

    const result = await HaHelper.fetchClients(mockHass, [
      { config_entry_id: 'test_entry', root_mac: '00:00:00:00:00:01' },
    ]);

    const clients = result.clientsByConfigEntry.get('test_entry') || [];
    expect(clients.length).toBe(1);
    expect(clients[0].mac).toBe('aa:bb:cc:11:22:33');
    expect(clients.some((c) => c.mac === 'aa:bb:cc:99:99:99')).toBe(false);
  });
});
