import { describe, it, expect } from 'vitest';
import { TopologyEngine, normalizeMac, detectConnectionType } from './topology-engine';
import { IntegrationConfig, DiscoveredClient } from './types';

describe('TopologyEngine', () => {
  it('normalizes MAC addresses correctly', () => {
    expect(normalizeMac('AA-BB-CC-DD-EE-FF')).toBe('aa:bb:cc:dd:ee:ff');
    expect(normalizeMac('  00:11:22:33:44:55  ')).toBe('00:11:22:33:44:55');
    expect(normalizeMac(undefined)).toBe('');
  });

  it('detects connection types correctly', () => {
    expect(detectConnectionType('LAN 1')).toBe('lan');
    expect(detectConnectionType('Port 2')).toBe('lan');
    expect(detectConnectionType('5 GHz')).toBe('wifi');
    expect(detectConnectionType('Channel 6')).toBe('wifi');
    expect(detectConnectionType(undefined, { is_wired: true })).toBe('lan');
    expect(detectConnectionType(undefined, { is_wired: false })).toBe('wifi');

    expect(detectConnectionType('P1', undefined, ['P1', 'P2'], ['WLAN_GUEST'])).toBe('lan');
    expect(detectConnectionType('WLAN_GUEST', undefined, ['P1'], ['WLAN_GUEST'])).toBe('wifi');
  });

  it('creates interface sub-branches and routes clients through them', () => {
    const routerMac = '00:00:00:00:00:01';
    const apMac = '00:00:00:00:00:02';
    const phoneMac = 'aa:bb:cc:dd:ee:01';
    const pcMac = 'bb:bb:cc:dd:ee:02';

    const integrations: IntegrationConfig[] = [
      {
        config_entry_id: 'zte_router_id',
        root_mac: routerMac,
        lan_values: ['LAN 1', 'LAN 2'],
      },
      {
        config_entry_id: 'tplink_ap_id',
        root_mac: apMac,
        wifi_values: ['5 GHz'],
      },
    ];

    const zteClients: DiscoveredClient[] = [
      {
        mac: apMac,
        name: 'TP-Link Access Point',
        linkInfo: 'LAN 1',
      },
      {
        mac: pcMac,
        name: 'PC Fisso',
        linkInfo: 'LAN 2',
      },
      {
        mac: phoneMac,
        name: 'Smartphone (ZTE detected)',
        // No linkInfo -> generic interface
      },
    ];

    const tplinkClients: DiscoveredClient[] = [
      {
        mac: phoneMac,
        name: 'Smartphone Mario',
        ip: '192.168.1.105',
        linkInfo: '5 GHz',
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('zte_router_id', zteClients);
    clientsMap.set('tplink_ap_id', tplinkClients);

    const rootNames = new Map<string, string>();
    rootNames.set(routerMac, 'Router ZTE Principale');
    rootNames.set(apMac, 'Access Point TP-Link');

    const result = TopologyEngine.buildGraph({
      masterRootMac: routerMac,
      integrations,
      clientsByConfigEntry: clientsMap,
      rootNames,
    });

    // 1. Verify Interface Nodes were created
    const interfaceNodes = result.nodes.filter((n) => n.isInterface);
    expect(interfaceNodes.length).toBeGreaterThanOrEqual(2);

    const lan1Interface = interfaceNodes.find((n) => n.interfaceName === 'LAN 1');
    expect(lan1Interface).toBeDefined();
    expect(lan1Interface?.connectionType).toBe('lan');

    const wifi5GhzInterface = interfaceNodes.find((n) => n.interfaceName === '5 GHz');
    expect(wifi5GhzInterface).toBeDefined();
    expect(wifi5GhzInterface?.connectionType).toBe('wifi');

    // 2. Verify Phone is connected through the deeper TP-Link 5 GHz interface
    const phoneEdge = result.edges.find((e) => e.to === phoneMac);
    expect(phoneEdge).toBeDefined();
    expect(phoneEdge?.from).toBe(wifi5GhzInterface?.id);

    // 3. Verify AP is connected through Router LAN 1 interface
    const apEdge = result.edges.find((e) => e.to === apMac);
    expect(apEdge).toBeDefined();
    expect(apEdge?.from).toBe(lan1Interface?.id);

    // 4. Verify PC is connected through Router LAN 2 interface
    const pcEdge = result.edges.find((e) => e.to === pcMac);
    expect(pcEdge).toBeDefined();
  });
});
