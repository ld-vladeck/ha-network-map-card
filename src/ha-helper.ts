import {
  EntityRegistryEntry,
  DeviceRegistryEntry,
  HomeAssistant,
  IntegrationConfig,
  DiscoveredClient,
} from './types';

export function normalizeMac(mac: string | undefined | null): string {
  if (!mac) return '';
  return mac.trim().toLowerCase().replace(/-/g, ':');
}

export interface AvailableIntegrationSummary {
  id: string;
  domain?: string;
  sampleName?: string;
  deviceCount: number;
  entityCount: number;
  trackerCount: number;
  suggestedRootMac?: string;
}

export function matchValueList(value: string | undefined | null, list?: string[] | string): boolean {
  if (!value || !list) return false;
  const normalizedValue = String(value).trim().toLowerCase();
  const items = Array.isArray(list)
    ? list
    : String(list)
        .split(',')
        .map((s) => s.trim());

  return items.some((item) => {
    const normItem = String(item).trim().toLowerCase();
    return normItem && (normalizedValue === normItem || normalizedValue.includes(normItem));
  });
}

export function detectConnectionType(
  label?: string,
  attrs?: Record<string, any>,
  lanValues?: string[] | string,
  wifiValues?: string[] | string
): 'lan' | 'wifi' | 'unknown' {
  // 1. Explicit user configuration takes top priority
  if (label) {
    if (matchValueList(label, lanValues)) return 'lan';
    if (matchValueList(label, wifiValues)) return 'wifi';
  }

  // 2. Standard Home Assistant attributes
  if (attrs) {
    if (attrs.is_wired === true) return 'lan';
    if (attrs.is_wired === false) return 'wifi';
    if (attrs.connection_type) {
      const ct = String(attrs.connection_type).toLowerCase();
      if (ct.includes('wire') || ct.includes('lan') || ct.includes('eth')) return 'lan';
      if (ct.includes('wifi') || ct.includes('wlan') || ct.includes('wireless')) return 'wifi';
    }
  }

  // 3. Fallback heuristics
  if (label) {
    const l = label.toLowerCase();
    if (
      l.includes('lan') ||
      l.includes('eth') ||
      l.includes('porta') ||
      l.includes('port') ||
      l.includes('cavo') ||
      l.includes('wired')
    ) {
      return 'lan';
    }
    if (
      l.includes('ghz') ||
      l.includes('wifi') ||
      l.includes('wlan') ||
      l.includes('ch ') ||
      l.includes('ch:') ||
      l.includes('channel') ||
      l.includes('wireless') ||
      l.includes('ssid')
    ) {
      return 'wifi';
    }
  }

  return 'unknown';
}

export interface RegistryFetchResult {
  clientsByConfigEntry: Map<string, DiscoveredClient[]>;
  rootNames: Map<string, string>;
  diagnostics: {
    totalDevices: number;
    matchedDevices: number;
    totalEntities: number;
    matchedEntities: number;
    availableIntegrations: AvailableIntegrationSummary[];
    errors: string[];
  };
}

export class HaHelper {
  private static entityRegistryCache: EntityRegistryEntry[] | null = null;
  private static deviceRegistryCache: DeviceRegistryEntry[] | null = null;
  private static lastFetchTime = 0;
  private static CACHE_TTL_MS = 10000;

  public static async fetchClients(
    hass: HomeAssistant,
    integrations: IntegrationConfig[],
    forceRefresh = false
  ): Promise<RegistryFetchResult> {
    const diagnostics = {
      totalDevices: 0,
      matchedDevices: 0,
      totalEntities: 0,
      matchedEntities: 0,
      availableIntegrations: [] as AvailableIntegrationSummary[],
      errors: [] as string[],
    };

    const clientsByConfigEntry = new Map<string, DiscoveredClient[]>();
    for (const integration of integrations) {
      clientsByConfigEntry.set(integration.config_entry_id, []);
    }

    const now = Date.now();
    const shouldFetch = forceRefresh || !this.entityRegistryCache || (now - this.lastFetchTime > this.CACHE_TTL_MS);

    if (shouldFetch) {
      try {
        const callWS = hass.callWS
          ? hass.callWS.bind(hass)
          : (msg: any) => hass.connection.sendMessagePromise(msg);

        const [entityRes, deviceRes] = await Promise.allSettled([
          callWS<EntityRegistryEntry[]>({ type: 'config/entity_registry/list' }),
          callWS<DeviceRegistryEntry[]>({ type: 'config/device_registry/list' }),
        ]);

        if (entityRes.status === 'fulfilled') {
          this.entityRegistryCache = entityRes.value;
        } else {
          diagnostics.errors.push(`Errore entity_registry: ${entityRes.reason}`);
        }

        if (deviceRes.status === 'fulfilled') {
          this.deviceRegistryCache = deviceRes.value;
        } else {
          diagnostics.errors.push(`Errore device_registry: ${deviceRes.reason}`);
        }

        this.lastFetchTime = now;
      } catch (err: any) {
        diagnostics.errors.push(`Errore WebSocket: ${err.message || err}`);
      }
    }

    const devices = this.deviceRegistryCache || [];
    const entities = this.entityRegistryCache || [];
    diagnostics.totalDevices = devices.length;
    diagnostics.totalEntities = entities.length;

    // Collect all available integrations from devices
    const intMap = new Map<string, AvailableIntegrationSummary>();
    const deviceToConfigEntries = new Map<string, string[]>();

    for (const dev of devices) {
      if (dev.disabled_by) continue; // Skip disabled devices

      if (dev.config_entries) {
        deviceToConfigEntries.set(dev.id, dev.config_entries);

        let devMac: string | undefined = undefined;
        if (dev.connections && Array.isArray(dev.connections)) {
          const macConn = dev.connections.find((c) => Array.isArray(c) && c[0]?.toLowerCase() === 'mac');
          if (macConn && macConn[1]) {
            devMac = normalizeMac(macConn[1]);
          }
        }

        for (const entryId of dev.config_entries) {
          if (!intMap.has(entryId)) {
            intMap.set(entryId, {
              id: entryId,
              sampleName: dev.manufacturer || dev.name || undefined,
              deviceCount: 0,
              entityCount: 0,
              trackerCount: 0,
              suggestedRootMac: undefined,
            });
          }
          const item = intMap.get(entryId)!;
          item.deviceCount++;

          if (!item.sampleName && (dev.manufacturer || dev.name)) {
            item.sampleName = dev.manufacturer || dev.name || undefined;
          }

          if (!dev.via_device_id && devMac && !item.suggestedRootMac) {
            item.suggestedRootMac = devMac;
          }
        }
      }
    }

    for (const ent of entities) {
      if (ent.disabled_by) continue; // Skip disabled entities

      const isTracker = ent.entity_id.startsWith('device_tracker.');

      // Directly linked config entry
      if (ent.config_entry_id) {
        if (!intMap.has(ent.config_entry_id)) {
          intMap.set(ent.config_entry_id, {
            id: ent.config_entry_id,
            domain: ent.platform,
            deviceCount: 0,
            entityCount: 0,
            trackerCount: 0,
          });
        }
        const item = intMap.get(ent.config_entry_id)!;
        item.entityCount++;
        if (isTracker) {
          item.trackerCount++;
        }
        if (!item.domain && ent.platform) {
          item.domain = ent.platform;
        }
      } else if (ent.device_id && deviceToConfigEntries.has(ent.device_id)) {
        // Linked via device
        const configEntries = deviceToConfigEntries.get(ent.device_id) || [];
        for (const entryId of configEntries) {
          if (intMap.has(entryId)) {
            const item = intMap.get(entryId)!;
            item.entityCount++;
            if (isTracker) {
              item.trackerCount++;
            }
          }
        }
      }
    }

    // Filter to ONLY integrations that expose device_tracker entities!
    diagnostics.availableIntegrations = Array.from(intMap.values())
      .filter((i) => i.trackerCount > 0)
      .sort((a, b) => b.trackerCount - a.trackerCount);

    // Build index of entities by device_id
    const entitiesByDeviceId = new Map<string, EntityRegistryEntry[]>();
    for (const ent of entities) {
      if (ent.device_id) {
        if (!entitiesByDeviceId.has(ent.device_id)) {
          entitiesByDeviceId.set(ent.device_id, []);
        }
        entitiesByDeviceId.get(ent.device_id)!.push(ent);
      }
    }

    const rootNames = new Map<string, string>();
    const rootMacsToFind = new Set(integrations.map((i) => normalizeMac(i.root_mac)).filter(Boolean));

    // Look for root devices to get their friendly names
    for (const dev of devices) {
      if (dev.connections && Array.isArray(dev.connections)) {
        const macConn = dev.connections.find((c) => Array.isArray(c) && c[0]?.toLowerCase() === 'mac');
        if (macConn && macConn[1]) {
          const normMac = normalizeMac(macConn[1]);
          if (rootMacsToFind.has(normMac)) {
            const name = dev.name_by_user || dev.name;
            if (name) {
              rootNames.set(normMac, name);
            }
          }
        }
      }
    }

    // Also look in entities for root names (e.g. device_tracker representing router/AP)
    for (const ent of entities) {
      const stateObj = hass.states[ent.entity_id];
      if (stateObj?.attributes) {
        for (const attrKey of ['mac', 'mac_address', 'mac_addr', 'wifi_mac']) {
          const val = stateObj.attributes[attrKey];
          if (val) {
            const normMac = normalizeMac(String(val));
            if (rootMacsToFind.has(normMac) && !rootNames.has(normMac)) {
              const name = stateObj.attributes.friendly_name || stateObj.attributes.name;
              if (name) {
                rootNames.set(normMac, name);
              }
            }
          }
        }
      }
    }
    // Process each configured integration
    for (const integration of integrations) {
      const searchKey = integration.config_entry_id.trim();
      const targetList = clientsByConfigEntry.get(integration.config_entry_id)!;

      const matchingDevices = devices.filter((dev) => {
        if (!dev.config_entries) return false;
        if (dev.disabled_by) return false; // Exclude disabled devices
        return (
          dev.config_entries.includes(searchKey) ||
          dev.config_entries.some((c) => c.toLowerCase() === searchKey.toLowerCase())
        );
      });

      diagnostics.matchedDevices += matchingDevices.length;

      for (const dev of matchingDevices) {
        let macFromDevice: string | undefined = undefined;
        if (dev.connections && Array.isArray(dev.connections)) {
          const macConn = dev.connections.find((c) => Array.isArray(c) && c[0]?.toLowerCase() === 'mac');
          if (macConn && macConn[1]) {
            macFromDevice = normalizeMac(macConn[1]);
          }
        }

        const devEntities = entitiesByDeviceId.get(dev.id) || [];
        const enabledDevEntities = devEntities.filter((e) => !e.disabled_by);
        const trackerEntities = enabledDevEntities.filter((e) => e.entity_id.startsWith('device_tracker.'));
        const primaryEntity = trackerEntities.length > 0 ? trackerEntities[0] : enabledDevEntities[0];

        let entityState = primaryEntity ? hass.states[primaryEntity.entity_id] : undefined;

        let clientMac = macFromDevice;
        if (!clientMac && entityState) {
          const attrMac =
            (integration.mac_attribute && entityState.attributes?.[integration.mac_attribute]) ||
            entityState.attributes?.mac_address ||
            entityState.attributes?.mac ||
            entityState.attributes?.mac_addr;
          if (attrMac) {
            clientMac = normalizeMac(String(attrMac));
          }
        }

        if (!clientMac) {
          continue;
        }

        let linkInfo: string | undefined = undefined;
        if (integration.link_attribute) {
          const rawLink = entityState?.attributes?.[integration.link_attribute];
          if (rawLink !== undefined && rawLink !== null) {
            const trimmed = String(rawLink).trim();
            if (
              trimmed &&
              trimmed.toLowerCase() !== 'null' &&
              trimmed.toLowerCase() !== 'none' &&
              trimmed.toLowerCase() !== 'unknown'
            ) {
              linkInfo = trimmed;
            }
          }
        }

        const entityName =
          primaryEntity?.name ||
          entityState?.attributes?.friendly_name ||
          entityState?.attributes?.host_name ||
          undefined;

        const devName =
          dev.name_by_user ||
          dev.name ||
          undefined;

        const resolvedPrimaryName = entityName || devName || clientMac;

        const ip =
          entityState?.attributes?.ip ||
          entityState?.attributes?.ip_address ||
          entityState?.attributes?.ipv4;

        const rawState = entityState?.state;
        const isConnected = entityState
          ? rawState === 'home' || rawState === 'on' || rawState === 'connected'
          : true;

        const connType = detectConnectionType(
          linkInfo,
          entityState?.attributes,
          integration.lan_values,
          integration.wifi_values
        );

        targetList.push({
          mac: clientMac,
          name: resolvedPrimaryName,
          entityName: entityName,
          deviceName: devName,
          ip: ip,
          state: rawState,
          isConnected: isConnected,
          connectionType: connType,
          entityId: primaryEntity?.entity_id,
          deviceId: dev.id,
          linkInfo: linkInfo,
          attributes: entityState?.attributes,
        });

        diagnostics.matchedEntities++;
      }
    }

    return {
      clientsByConfigEntry,
      rootNames,
      diagnostics,
    };
  }

  /**
   * Scans ALL devices and entities for a given configEntryId and returns all discovered attribute names.
   */
  public static scanAvailableAttributes(hass: HomeAssistant, configEntryId: string): string[] {
    const devices = this.deviceRegistryCache || [];
    const entities = this.entityRegistryCache || [];

    const targetDevices = new Set(
      devices
        .filter((d) => !d.disabled_by && d.config_entries && d.config_entries.includes(configEntryId))
        .map((d) => d.id)
    );

    const attributeSet = new Set<string>();

    for (const ent of entities) {
      if (ent.disabled_by) continue;
      const matchesDirect = ent.config_entry_id === configEntryId;
      const matchesDevice = ent.device_id && targetDevices.has(ent.device_id);

      if (matchesDirect || matchesDevice) {
        const stateObj = hass.states[ent.entity_id];
        if (stateObj && stateObj.attributes) {
          for (const key of Object.keys(stateObj.attributes)) {
            // Ignore common internal HA attributes
            if (
              key === 'friendly_name' ||
              key === 'icon' ||
              key === 'entity_picture' ||
              key === 'restored' ||
              key === 'supported_features'
            ) {
              continue;
            }
            attributeSet.add(key);
          }
        }
      }
    }

    // Sort with common port/channel candidate attributes first
    const priorityKeywords = ['port', 'channel', 'lan', 'wifi', 'conn', 'type', 'interface', 'ssid'];
    return Array.from(attributeSet).sort((a, b) => {
      const aLower = a.toLowerCase();
      const bLower = b.toLowerCase();
      const aScore = priorityKeywords.findIndex((k) => aLower.includes(k));
      const bScore = priorityKeywords.findIndex((k) => bLower.includes(k));

      if (aScore !== -1 && bScore !== -1) return aScore - bScore;
      if (aScore !== -1) return -1;
      if (bScore !== -1) return 1;
      return a.localeCompare(b);
    });
  }

  /**
   * Scans ALL devices of a config entry to collect all observed unique values for a given attribute.
   */
  public static scanUniqueAttributeValues(
    hass: HomeAssistant,
    configEntryId: string,
    attributeName: string
  ): string[] {
    if (!attributeName) return [];

    const devices = this.deviceRegistryCache || [];
    const entities = this.entityRegistryCache || [];

    const targetDevices = new Set(
      devices
        .filter((d) => !d.disabled_by && d.config_entries && d.config_entries.includes(configEntryId))
        .map((d) => d.id)
    );

    const valuesSet = new Set<string>();

    for (const ent of entities) {
      if (ent.disabled_by) continue;
      const matchesDirect = ent.config_entry_id === configEntryId;
      const matchesDevice = ent.device_id && targetDevices.has(ent.device_id);

      if (matchesDirect || matchesDevice) {
        const stateObj = hass.states[ent.entity_id];
        if (stateObj && stateObj.attributes && stateObj.attributes[attributeName] !== undefined) {
          const val = String(stateObj.attributes[attributeName]).trim();
          if (val) {
            valuesSet.add(val);
          }
        }
      }
    }

    return Array.from(valuesSet).sort();
  }

  /**
   * Auto-detects the root MAC address of an integration from its gateway/main device.
   */
  public static autoDetectRootMac(hass: HomeAssistant, configEntryId: string): string | undefined {
    const devices = this.deviceRegistryCache || [];
    const matching = devices.filter((d) => d.config_entries && d.config_entries.includes(configEntryId));

    // Prefer device without parent (gateway device)
    const gateway = matching.find((d) => !d.via_device_id) || matching[0];
    if (gateway && gateway.connections && Array.isArray(gateway.connections)) {
      const macConn = gateway.connections.find((c) => Array.isArray(c) && c[0]?.toLowerCase() === 'mac');
      if (macConn && macConn[1]) {
        return normalizeMac(macConn[1]);
      }
    }
    return undefined;
  }

  /**
   * Generates a completely anonymized, privacy-safe diagnostic JSON payload
   * containing exact topology inputs without any real MACs, IPs, or personal names.
   */
  public static generateAnonymizedDiagnostics(input: {
    masterRootMac?: string;
    homeassistantMac?: string;
    layoutMode?: string;
    integrations: IntegrationConfig[];
    clientsByConfigEntry: Map<string, DiscoveredClient[]>;
  }): string {
    const macMap = new Map<string, string>();
    const ipMap = new Map<string, string>();
    let macCounter = 1;
    let ipCounter = 10;

    const getAnonMac = (mac?: string): string => {
      if (!mac) return '';
      const norm = normalizeMac(mac);
      if (!norm) return '';
      if (!macMap.has(norm)) {
        const hex = macCounter.toString(16).padStart(2, '0');
        macMap.set(norm, `00:00:00:00:00:${hex}`);
        macCounter++;
      }
      return macMap.get(norm)!;
    };

    const getAnonIp = (ip?: string): string | undefined => {
      if (!ip) return undefined;
      const cleanIp = String(ip).trim();
      if (!ipMap.has(cleanIp)) {
        ipMap.set(cleanIp, `192.168.1.${ipCounter++}`);
      }
      return ipMap.get(cleanIp);
    };

    // Anonymize integrations
    const anonIntegrations: IntegrationConfig[] = input.integrations.map((int, idx) => {
      const anonRoot = int.root_mac ? getAnonMac(int.root_mac) : undefined;
      return {
        config_entry_id: `integration_entry_${idx + 1}`,
        root_mac: anonRoot,
        name: `Integrazione Apparato ${idx + 1}`,
        is_master: Boolean(int.is_master),
        link_attribute: int.link_attribute,
        lan_values: int.lan_values,
        wifi_values: int.wifi_values,
      };
    });

    const inferCategory = (client: DiscoveredClient): string => {
      const icon = String(client.attributes?.icon || '').toLowerCase();
      const rawText = `${client.name || ''} ${client.entityName || ''} ${client.attributes?.friendly_name || ''}`.toLowerCase();

      // 1. Icon matches
      if (icon.includes('television')) return 'Smart TV';
      if (icon.includes('air-conditioner')) return 'Climatizzatore';
      if (icon.includes('thermostat')) return 'Termostato';
      if (icon.includes('washing-machine')) return 'Lavatrice';
      if (icon.includes('dishwasher')) return 'Lavastoviglie';
      if (icon.includes('fan')) return 'Ventilatore';
      if (icon.includes('meter-electric')) return 'Sensore Energia';
      if (icon.includes('solar-panel')) return 'Inverter FV';
      if (icon.includes('nas')) return 'NAS Storage';
      if (icon.includes('home-assistant')) return 'Server Home Assistant';
      if (icon.includes('router') || icon.includes('access-point')) return 'Access Point / Router';
      if (icon.includes('laptop')) return 'Computer';
      if (icon.includes('cellphone')) return 'Smartphone';
      if (icon.includes('printer')) return 'Stampante';
      if (icon.includes('car')) return 'Infotainment Auto';
      if (icon.includes('light-switch')) return 'Interruttore Luce';
      if (icon.includes('power-plug') || icon.includes('plug')) return 'Presa Smart';
      if (icon.includes('shield')) return 'Server Sicurezza / DNS';

      // 2. Keyword fallback matches
      if (rawText.includes('tv') || rawText.includes('television')) return 'Smart TV';
      if (rawText.includes('clima') || rawText.includes('condizionat') || rawText.includes('net_ac')) return 'Climatizzatore';
      if (rawText.includes('termostato') || rawText.includes('thermostat')) return 'Termostato';
      if (rawText.includes('lavatrice')) return 'Lavatrice';
      if (rawText.includes('lavastoviglie')) return 'Lavastoviglie';
      if (rawText.includes('inverter') || rawText.includes('fv') || rawText.includes('solar')) return 'Inverter FV';
      if (rawText.includes('nas') || rawText.includes('qnap') || rawText.includes('synology')) return 'NAS Storage';
      if (rawText.includes('home assistant') || rawText.includes('homeassistant')) return 'Server Home Assistant';
      if (rawText.includes('router') || rawText.includes('re505') || rawText.includes('repeater') || rawText.includes('deco') || rawText.includes('ap')) return 'Access Point / Router';
      if (rawText.includes('macbook') || rawText.includes('laptop') || rawText.includes('pc') || rawText.includes('computer')) return 'Computer';
      if (rawText.includes('phone') || rawText.includes('galaxy') || rawText.includes('iphone') || rawText.includes('redmi') || rawText.includes('cellulare')) return 'Smartphone';
      if (rawText.includes('printer') || rawText.includes('stampante') || rawText.includes('epson')) return 'Stampante';
      if (rawText.includes('shelly') || rawText.includes('plug') || rawText.includes('switch') || rawText.includes('presa')) return 'Modulo Smart (IoT)';

      return 'Dispositivo';
    };

    // Anonymize clients by config entry
    const anonClientsRecord: Record<string, DiscoveredClient[]> = {};
    for (let i = 0; i < input.integrations.length; i++) {
      const origEntryId = input.integrations[i].config_entry_id;
      const anonEntryId = `integration_entry_${i + 1}`;
      const origClients = input.clientsByConfigEntry.get(origEntryId) || [];

      anonClientsRecord[anonEntryId] = origClients.map((client) => {
        const anonMac = getAnonMac(client.mac);
        const anonIp = getAnonIp(client.ip);
        const suffix = anonMac.slice(-2).toUpperCase();
        const category = inferCategory(client);
        const anonLabel = `${category} [${suffix}]`;

        let anonAttributes: Record<string, any> | undefined = undefined;
        if (client.attributes) {
          anonAttributes = { ...client.attributes };
          if (anonAttributes.mac) anonAttributes.mac = anonMac;
          if (anonAttributes.mac_address) anonAttributes.mac_address = anonMac;
          if (anonAttributes.ip) anonAttributes.ip = anonIp;
          if (anonAttributes.ip_address) anonAttributes.ip_address = anonIp;
          if (anonAttributes.friendly_name) anonAttributes.friendly_name = anonLabel;
          if (anonAttributes.host_name) anonAttributes.host_name = anonLabel;
          if (anonAttributes.hostname) anonAttributes.hostname = anonLabel;
        }

        return {
          mac: anonMac,
          name: anonLabel,
          entityName: client.entityName ? `${category} Tracker [${suffix}]` : undefined,
          deviceName: client.deviceName ? `${category} Hardware [${suffix}]` : undefined,
          ip: anonIp,
          state: client.state,
          isConnected: client.isConnected,
          connectionType: client.connectionType,
          linkInfo: client.linkInfo,
          entityId: client.entityId ? `device_tracker.client_${anonMac.replace(/:/g, '')}` : undefined,
          deviceId: client.deviceId ? `device_${anonMac.replace(/:/g, '')}` : undefined,
          attributes: anonAttributes,
        };
      });
    }

    // Generate clean YAML string representing the anonymized card configuration
    const yamlLines: string[] = [
      'type: custom:network-map-card',
      `layout_mode: ${input.layoutMode || 'molecular'}`,
    ];
    if (input.masterRootMac) {
      yamlLines.push(`master_root_mac: "${getAnonMac(input.masterRootMac)}"`);
    }
    if (input.homeassistantMac) {
      yamlLines.push(`homeassistant_mac: "${getAnonMac(input.homeassistantMac)}"`);
    }
    yamlLines.push('show_offline: true');
    yamlLines.push('integrations:');

    for (const int of anonIntegrations) {
      yamlLines.push(`  - config_entry_id: "${int.config_entry_id}"`);
      if (int.is_master) {
        yamlLines.push('    is_master: true');
      }
      if (int.root_mac) {
        yamlLines.push(`    root_mac: "${int.root_mac}"`);
      }
      if (int.link_attribute) {
        yamlLines.push(`    link_attribute: "${int.link_attribute}"`);
      }
      if (int.lan_values && (Array.isArray(int.lan_values) ? int.lan_values.length > 0 : Boolean(int.lan_values))) {
        const vals = Array.isArray(int.lan_values) ? int.lan_values : [int.lan_values];
        yamlLines.push(`    lan_values: ${JSON.stringify(vals)}`);
      }
      if (int.wifi_values && (Array.isArray(int.wifi_values) ? int.wifi_values.length > 0 : Boolean(int.wifi_values))) {
        const vals = Array.isArray(int.wifi_values) ? int.wifi_values : [int.wifi_values];
        yamlLines.push(`    wifi_values: ${JSON.stringify(vals)}`);
      }
    }

    const payload = {
      schema_version: '1.0',
      exported_at: new Date().toISOString(),
      card_config_yaml: yamlLines.join('\n'),
      layoutMode: input.layoutMode || 'molecular',
      masterRootMac: input.masterRootMac ? getAnonMac(input.masterRootMac) : undefined,
      homeassistantMac: input.homeassistantMac ? getAnonMac(input.homeassistantMac) : undefined,
      integrations: anonIntegrations,
      clientsByConfigEntry: anonClientsRecord,
    };

    return JSON.stringify(payload, null, 2);
  }
}
