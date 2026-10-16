export interface IntegrationConfig {
  config_entry_id: string;
  root_mac: string;
  mac_attribute?: string; // (Opzionale) se presente negli attributi
  link_attribute?: string; // (Opzionale) porta o canale wifi
  lan_values?: string[] | string; // Valori dell'attributo porta da considerare LAN (es. ['LAN1', 'LAN2', 'eth0'])
  wifi_values?: string[] | string; // Valori dell'attributo porta da considerare Wi-Fi (es. ['5GHz', '2.4GHz', 'wlan0'])
}

export interface NetworkMapCardConfig {
  type: string;
  title?: string;
  master_root_mac: string;
  // Ora supporta sia un'integrazione singola che un array
  integrations?: IntegrationConfig[];
  // Supporto rapido per testare una singola integrazione diretta
  config_entry_id?: string;
  root_mac?: string;
  mac_attribute?: string;
  link_attribute?: string;
  lan_values?: string[] | string;
  wifi_values?: string[] | string;
  height?: string;
  debug?: boolean; // Opzione per mostrare info di debug a schermo
}

export interface HassEntity {
  entity_id: string;
  state: string;
  attributes: Record<string, any>;
  last_changed: string;
  last_updated: string;
}

export interface EntityRegistryEntry {
  entity_id: string;
  config_entry_id?: string | null;
  device_id?: string | null;
  platform?: string;
  name?: string | null;
}

export interface DeviceRegistryEntry {
  id: string;
  config_entries: string[];
  connections: [string, string][]; // es. [["mac", "00:11:22:33:44:55"]]
  identifiers?: [string, string][];
  name?: string | null;
  name_by_user?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  via_device_id?: string | null;
}

export interface HomeAssistant {
  states: Record<string, HassEntity>;
  connection: {
    sendMessagePromise: <T>(message: { type: string; [key: string]: any }) => Promise<T>;
    subscribeEvents?: (callback: (event: any) => void, eventType: string) => Promise<() => void>;
  };
  callWS?: <T>(message: { type: string; [key: string]: any }) => Promise<T>;
  themes?: {
    darkMode?: boolean;
  };
}

export interface DiscoveredClient {
  mac: string;
  name: string;
  ip?: string;
  state?: string;
  isConnected?: boolean;
  connectionType?: 'lan' | 'wifi' | 'unknown';
  entityId?: string;
  deviceId?: string;
  linkInfo?: string;
  attributes?: Record<string, any>;
}

export interface NetworkNode {
  id: string;
  label: string;
  mac: string;
  ip?: string;
  state?: string;
  isConnected?: boolean;
  connectionType?: 'lan' | 'wifi' | 'unknown';
  isRoot?: boolean;
  isMasterRoot?: boolean;
  isInterface?: boolean;
  interfaceName?: string;
  depth?: number;
  entityId?: string;
  rawAttributes?: Record<string, any>;
}

export interface NetworkEdge {
  from: string;
  to: string;
  label?: string;
  fromDepth?: number;
  connectionType?: 'lan' | 'wifi' | 'unknown';
}
