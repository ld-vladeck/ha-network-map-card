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
        config_entry_id: 'router_integration_id',
        root_mac: routerMac,
        lan_values: ['LAN 1', 'LAN 2'],
      },
      {
        config_entry_id: 'ap_integration_id',
        root_mac: apMac,
        wifi_values: ['5 GHz'],
      },
    ];

    const routerClients: DiscoveredClient[] = [
      {
        mac: apMac,
        name: 'Access Point Secondario',
        linkInfo: 'LAN 1',
      },
      {
        mac: pcMac,
        name: 'PC Fisso',
        linkInfo: 'LAN 2',
      },
      {
        mac: phoneMac,
        name: 'Smartphone (Router detected)',
        // No linkInfo -> generic interface
      },
    ];

    const apClients: DiscoveredClient[] = [
      {
        mac: phoneMac,
        name: 'Smartphone Mario',
        ip: '192.168.1.105',
        linkInfo: '5 GHz',
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('router_integration_id', routerClients);
    clientsMap.set('ap_integration_id', apClients);

    const rootNames = new Map<string, string>();
    rootNames.set(routerMac, 'Router Principale');
    rootNames.set(apMac, 'Access Point Secondario');

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

    // 2. Verify Phone is connected through the deeper AP 5 GHz interface
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

  it('prioritizes online candidate over offline candidate regardless of depth', () => {
    const routerMac = '00:00:00:00:00:01';
    const apMac = '00:00:00:00:00:02';
    const deviceMac = 'cc:cc:cc:dd:ee:ff';

    const integrations: IntegrationConfig[] = [
      {
        config_entry_id: 'router_id',
        root_mac: routerMac,
        lan_values: ['LAN 1', 'LAN 2'],
      },
      {
        config_entry_id: 'ap_id',
        root_mac: apMac,
        wifi_values: ['5 GHz'],
      },
    ];

    // AP is connected to router on LAN 1
    const routerClients: DiscoveredClient[] = [
      {
        mac: apMac,
        name: 'Access Point',
        linkInfo: 'LAN 1',
        isConnected: true,
      },
      // Router sees device ONLINE on LAN 2
      {
        mac: deviceMac,
        name: 'Device Mario (Router Online)',
        linkInfo: 'LAN 2',
        isConnected: true,
        state: 'home',
      },
    ];

    // AP has an old stale cache entry seeing device OFFLINE on 5 GHz
    const apClients: DiscoveredClient[] = [
      {
        mac: deviceMac,
        name: 'Device Mario (AP Offline)',
        linkInfo: '5 GHz',
        isConnected: false,
        state: 'not_home',
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('router_id', routerClients);
    clientsMap.set('ap_id', apClients);

    const result = TopologyEngine.buildGraph({
      masterRootMac: routerMac,
      integrations,
      clientsByConfigEntry: clientsMap,
    });

    // Device should be attached to Router LAN 2 (online), NOT to AP 5 GHz (offline), even though AP has higher depth!
    const deviceEdge = result.edges.find((e) => e.to === deviceMac);
    expect(deviceEdge).toBeDefined();

    const lan2Interface = result.nodes.find((n) => n.isInterface && n.interfaceName === 'LAN 2');
    const wifiInterface = result.nodes.find((n) => n.isInterface && n.interfaceName === '5 GHz');

    expect(deviceEdge?.from).toBe(lan2Interface?.id);
    expect(deviceEdge?.from).not.toBe(wifiInterface?.id);

    // Device node should be online
    const deviceNode = result.nodes.find((n) => n.mac === deviceMac);
    expect(deviceNode?.isConnected).toBe(true);
    expect(deviceNode?.state).toBe('home');
  });

  it('collects entity sources from multiple integrations discovering the same device MAC', () => {
    const routerMac = '00:00:00:00:00:01';
    const apMac = '00:00:00:00:00:02';
    const phoneMac = 'aa:bb:cc:dd:ee:01';

    const integrations: IntegrationConfig[] = [
      {
        config_entry_id: 'router_id',
        root_mac: routerMac,
        name: 'Router Principale',
        lan_values: ['LAN 1'],
      },
      {
        config_entry_id: 'ap_id',
        root_mac: apMac,
        name: 'Access Point',
        wifi_values: ['5 GHz'],
      },
    ];

    const routerClients: DiscoveredClient[] = [
      {
        mac: phoneMac,
        name: 'iPhone Mario (Router)',
        entityId: 'device_tracker.iphone_router',
        ip: '192.168.1.150',
        linkInfo: 'LAN 1',
        isConnected: true,
        state: 'home',
      },
    ];

    const apClients: DiscoveredClient[] = [
      {
        mac: phoneMac,
        name: 'iPhone Mario (AP)',
        entityId: 'device_tracker.iphone_ap',
        ip: '192.168.1.150',
        linkInfo: '5 GHz',
        isConnected: true,
        state: 'home',
        attributes: { signal: -55, rate: '433 Mbps' },
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('router_id', routerClients);
    clientsMap.set('ap_id', apClients);

    const result = TopologyEngine.buildGraph({
      masterRootMac: routerMac,
      integrations,
      clientsByConfigEntry: clientsMap,
    });

    const phoneNode = result.nodes.find((n) => n.mac === phoneMac);
    expect(phoneNode).toBeDefined();
    expect(phoneNode?.sources).toBeDefined();
    expect(phoneNode?.sources?.length).toBe(2);

    const routerSource = phoneNode?.sources?.find((s) => s.integrationId === 'router_id');
    expect(routerSource?.entityId).toBe('device_tracker.iphone_router');
    expect(routerSource?.linkInfo).toBe('LAN 1');

    const apSource = phoneNode?.sources?.find((s) => s.integrationId === 'ap_id');
    expect(apSource?.entityId).toBe('device_tracker.iphone_ap');
    expect(apSource?.linkInfo).toBe('5 GHz');
    expect(apSource?.attributes?.signal).toBe(-55);
  });

  it('retains online state and real interface when another integration provides ghost client without state and third provides unavailable state', () => {
    const routerMac = '00:00:00:00:00:01';
    const apMac = '00:00:00:00:00:02';
    const deadRootMac = '00:00:00:00:00:03';
    const deviceMac = 'aa:bb:cc:dd:ee:99';

    const integrations: IntegrationConfig[] = [
      {
        config_entry_id: 'router_id',
        root_mac: routerMac,
        name: 'Router Principale',
        lan_values: ['LAN 1', 'LAN 2'],
      },
      {
        config_entry_id: 'ap_id',
        root_mac: apMac,
        name: 'Access Point TP-Link',
      },
      {
        config_entry_id: 'dead_id',
        root_mac: deadRootMac,
        name: 'Vecchio Router',
      },
    ];

    // Router sees AP on LAN 1 and Device on LAN 2 (online, state: home)
    const routerClients: DiscoveredClient[] = [
      {
        mac: apMac,
        name: 'Access Point TP-Link',
        linkInfo: 'LAN 1',
        isConnected: true,
        state: 'home',
      },
      {
        mac: deviceMac,
        name: 'Lampadina Smart',
        linkInfo: 'LAN 2',
        isConnected: true,
        state: 'home',
        entityId: 'device_tracker.lampadina',
      },
    ];

    // AP integration had an HA issue: client has no state, no linkInfo, isConnected defaulted to true
    const apClients: DiscoveredClient[] = [
      {
        mac: deviceMac,
        name: 'Lampadina Smart',
        isConnected: true,
      },
    ];

    // Dead/restored integration: client is unavailable/restored
    const deadClients: DiscoveredClient[] = [
      {
        mac: deviceMac,
        name: 'Lampadina Smart',
        isConnected: false,
        state: 'unavailable',
        entityId: 'device_tracker.lampadina_old',
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('router_id', routerClients);
    clientsMap.set('ap_id', apClients);
    clientsMap.set('dead_id', deadClients);

    const result = TopologyEngine.buildGraph({
      masterRootMac: routerMac,
      integrations,
      clientsByConfigEntry: clientsMap,
    });

    const deviceNode = result.nodes.find((n) => n.mac === deviceMac);
    expect(deviceNode).toBeDefined();
    // Device must be ONLINE with state 'home'
    expect(deviceNode?.isConnected).toBe(true);
    expect(deviceNode?.state).toBe('home');

    // Device must be connected to router LAN 2, NOT to AP "Non specificata" or "Disconnessi"
    const edge = result.edges.find((e) => e.to === deviceMac);
    expect(edge).toBeDefined();
    const lan2Interface = result.nodes.find((n) => n.isInterface && n.interfaceName === 'LAN 2');
    expect(edge?.from).toBe(lan2Interface?.id);
  });

  it('breaks ties between equal-depth APs during Wi-Fi roaming using most recent timestamp (last_seen)', () => {
    const routerMac = '00:00:00:00:00:01';
    const ap1Mac = '00:00:00:00:00:02';
    const ap2Mac = '00:00:00:00:00:03';
    const clientMac = 'aa:bb:cc:dd:ee:88';

    const integrations: IntegrationConfig[] = [
      {
        config_entry_id: 'router_id',
        root_mac: routerMac,
        name: 'Router Principale',
        lan_values: ['LAN 1', 'LAN 2'],
      },
      // AP1 is defined first
      {
        config_entry_id: 'ap1_id',
        root_mac: ap1Mac,
        name: 'Access Point Salotto',
        wifi_values: ['5 GHz'],
      },
      // AP2 is defined second
      {
        config_entry_id: 'ap2_id',
        root_mac: ap2Mac,
        name: 'Access Point Cucina',
        wifi_values: ['5 GHz'],
      },
    ];

    // Router connects AP1 on LAN 1 and AP2 on LAN 2
    const routerClients: DiscoveredClient[] = [
      {
        mac: ap1Mac,
        name: 'AP Salotto',
        linkInfo: 'LAN 1',
        isConnected: true,
        state: 'home',
      },
      {
        mac: ap2Mac,
        name: 'AP Cucina',
        linkInfo: 'LAN 2',
        isConnected: true,
        state: 'home',
      },
    ];

    // AP1 has stale cache seeing client 4 minutes ago
    const ap1Clients: DiscoveredClient[] = [
      {
        mac: clientMac,
        name: 'Smartphone Mario',
        linkInfo: '5 GHz',
        isConnected: true,
        state: 'home',
        entityId: 'device_tracker.mario_ap1',
        attributes: {
          last_seen: '2026-11-06T12:00:00Z',
        },
      },
    ];

    // AP2 sees client more recently (just roamed here)
    const ap2Clients: DiscoveredClient[] = [
      {
        mac: clientMac,
        name: 'Smartphone Mario',
        linkInfo: '5 GHz',
        isConnected: true,
        state: 'home',
        entityId: 'device_tracker.mario_ap2',
        attributes: {
          last_seen: '2026-11-06T12:04:00Z',
        },
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('router_id', routerClients);
    clientsMap.set('ap1_id', ap1Clients);
    clientsMap.set('ap2_id', ap2Clients);

    const result = TopologyEngine.buildGraph({
      masterRootMac: routerMac,
      integrations,
      clientsByConfigEntry: clientsMap,
    });

    const edge = result.edges.find((e) => e.to === clientMac);
    expect(edge).toBeDefined();

    // Must be connected to AP2 5 GHz interface because AP2 has the more recent timestamp
    const ap2InterfaceId = `if_${ap2Mac}_5_ghz`;
    expect(edge?.from).toBe(ap2InterfaceId);
  });

  it('breaks ties between equal-depth APs using signal strength when timestamps are equal or absent', () => {
    const routerMac = '00:00:00:00:00:01';
    const ap1Mac = '00:00:00:00:00:02';
    const ap2Mac = '00:00:00:00:00:03';
    const clientMac = 'aa:bb:cc:dd:ee:77';

    const integrations: IntegrationConfig[] = [
      {
        config_entry_id: 'router_id',
        root_mac: routerMac,
        name: 'Router Principale',
        lan_values: ['LAN 1', 'LAN 2'],
      },
      {
        config_entry_id: 'ap1_id',
        root_mac: ap1Mac,
        name: 'AP 1',
        wifi_values: ['5 GHz'],
      },
      {
        config_entry_id: 'ap2_id',
        root_mac: ap2Mac,
        name: 'AP 2',
        wifi_values: ['5 GHz'],
      },
    ];

    const routerClients: DiscoveredClient[] = [
      { mac: ap1Mac, name: 'AP 1', linkInfo: 'LAN 1', isConnected: true },
      { mac: ap2Mac, name: 'AP 2', linkInfo: 'LAN 2', isConnected: true },
    ];

    // AP1 has weak signal (-82 dBm)
    const ap1Clients: DiscoveredClient[] = [
      {
        mac: clientMac,
        name: 'Tablet',
        linkInfo: '5 GHz',
        isConnected: true,
        state: 'home',
        entityId: 'device_tracker.tablet_ap1',
        attributes: { signal: -82 },
      },
    ];

    // AP2 has strong signal (-52 dBm)
    const ap2Clients: DiscoveredClient[] = [
      {
        mac: clientMac,
        name: 'Tablet',
        linkInfo: '5 GHz',
        isConnected: true,
        state: 'home',
        entityId: 'device_tracker.tablet_ap2',
        attributes: { signal: -52 },
      },
    ];

    const clientsMap = new Map<string, DiscoveredClient[]>();
    clientsMap.set('router_id', routerClients);
    clientsMap.set('ap1_id', ap1Clients);
    clientsMap.set('ap2_id', ap2Clients);

    const result = TopologyEngine.buildGraph({
      masterRootMac: routerMac,
      integrations,
      clientsByConfigEntry: clientsMap,
    });

    const edge = result.edges.find((e) => e.to === clientMac);
    expect(edge).toBeDefined();

    const ap2InterfaceId = `if_${ap2Mac}_5_ghz`;
    expect(edge?.from).toBe(ap2InterfaceId);
  });
});
