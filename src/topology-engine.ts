import {
  DiscoveredClient,
  IntegrationConfig,
  NetworkEdge,
  NetworkNode,
  NodeEntitySource,
} from './types';
import { normalizeMac, detectConnectionType } from './ha-helper';

export { normalizeMac, detectConnectionType };

export interface BuildGraphInput {
  masterRootMac: string;
  integrations: IntegrationConfig[];
  clientsByConfigEntry: Map<string, DiscoveredClient[]>;
  rootNames?: Map<string, string>;
  homeassistantMac?: string;
}

export interface GraphData {
  nodes: NetworkNode[];
  edges: NetworkEdge[];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export class TopologyEngine {
  public static buildGraph(input: BuildGraphInput): GraphData {
    const masterRootMac = normalizeMac(input.masterRootMac);
    const haMac = normalizeMac(input.homeassistantMac);
    const nodesMap = new Map<string, NetworkNode>();
    const allRoots = new Set<string>();
    const rootNames = input.rootNames || new Map<string, string>();

    // 1. Register all roots with real friendly names
    for (const integration of input.integrations) {
      const rootMac = normalizeMac(integration.root_mac);
      if (rootMac) {
        allRoots.add(rootMac);
        if (!nodesMap.has(rootMac)) {
          const resolvedName = rootNames.get(rootMac) || integration.name || rootMac;

          nodesMap.set(rootMac, {
            id: rootMac,
            label: resolvedName,
            mac: rootMac,
            isRoot: true,
            isMasterRoot: rootMac === masterRootMac,
            isHomeAssistant: Boolean(haMac && rootMac === haMac),
            depth: rootMac === masterRootMac ? 0 : undefined,
          });
        }
      }
    }

    if (masterRootMac && !nodesMap.has(masterRootMac)) {
      allRoots.add(masterRootMac);
      const resolvedName = rootNames.get(masterRootMac) || masterRootMac;
      nodesMap.set(masterRootMac, {
        id: masterRootMac,
        label: resolvedName,
        mac: masterRootMac,
        isRoot: true,
        isMasterRoot: true,
        isHomeAssistant: Boolean(haMac && masterRootMac === haMac),
        depth: 0,
      });
    }

    // 2. Build Interface Sub-branches and Candidate Edges
    // Interface edges: rootMac -> interfaceNodeId
    const rootToInterfaceEdges = new Map<string, NetworkEdge>(); // key = from->to
    // Interface to child edges: key = childMac -> Array of candidate edges
    const interfaceToChildEdges = new Map<string, (NetworkEdge & { rootMac: string; isConnected?: boolean; client?: DiscoveredClient })[]>();

    for (const integration of input.integrations) {
      const rootMac = normalizeMac(integration.root_mac);
      const clients = input.clientsByConfigEntry.get(integration.config_entry_id) || [];
      const intName = rootNames.get(rootMac) || integration.name || 'Integrazione';

      for (const client of clients) {
        const childMac = normalizeMac(client.mac);
        if (!childMac || childMac === rootMac) {
          continue;
        }

        // Determine interface name and connection type
        let rawInterface = client.linkInfo ? String(client.linkInfo).trim() : '';
        let connType = detectConnectionType(
          rawInterface || undefined,
          client.attributes,
          integration.lan_values,
          integration.wifi_values
        );

        if (!rawInterface) {
          // Generic interface node for unspecified connections
          if (connType === 'lan') {
            rawInterface = 'LAN';
          } else if (connType === 'wifi') {
            rawInterface = 'Wi-Fi';
          } else {
            rawInterface = 'Rete';
          }
        }

        // Build unique ID and label for interface node
        const ifSlug = slugify(rawInterface);
        const interfaceNodeId = `if_${rootMac}_${ifSlug}`;

        if (!nodesMap.has(interfaceNodeId)) {
          // Clean interface label without emoji icons
          const ifLabel = rawInterface;

          nodesMap.set(interfaceNodeId, {
            id: interfaceNodeId,
            label: ifLabel,
            mac: `${rootMac}_${ifSlug}`,
            isInterface: true,
            interfaceName: rawInterface,
            connectionType: connType,
          });

          // Edge from root -> interface
          const edgeKey = `${rootMac}->${interfaceNodeId}`;
          rootToInterfaceEdges.set(edgeKey, {
            from: rootMac,
            to: interfaceNodeId,
            connectionType: connType,
          });
        }

        const sourceEntry: NodeEntitySource = {
          integrationId: integration.config_entry_id,
          integrationName: intName,
          name: client.entityName || client.name,
          deviceName: client.deviceName,
          entityId: client.entityId,
          state: client.state,
          isConnected: client.isConnected,
          linkInfo: client.linkInfo,
          ip: client.ip,
          attributes: client.attributes,
        };

        // Register / update client node
        const isHa = Boolean(haMac && childMac === haMac);
        const existingNode = nodesMap.get(childMac);
        if (!existingNode) {
          nodesMap.set(childMac, {
            id: childMac,
            label: client.name || childMac,
            mac: childMac,
            ip: client.ip,
            state: client.state,
            isConnected: client.isConnected,
            connectionType: connType,
            isRoot: allRoots.has(childMac),
            isMasterRoot: childMac === masterRootMac,
            isHomeAssistant: isHa,
            entityId: client.entityId,
            rawAttributes: client.attributes,
            sources: [sourceEntry],
          });
        } else {
          if (isHa) {
            existingNode.isHomeAssistant = true;
          }
          if (!existingNode.sources) {
            existingNode.sources = [];
          }
          if (!existingNode.sources.some((s) => s.integrationId === sourceEntry.integrationId)) {
            existingNode.sources.push(sourceEntry);
          }

          const hasAuthoritativeRootName = rootNames.has(childMac);
          if (
            !hasAuthoritativeRootName &&
            (existingNode.label === 'Router Principale' ||
              existingNode.label.startsWith('Access Point (') ||
              existingNode.label === childMac) &&
            client.name &&
            client.name !== childMac
          ) {
            existingNode.label = client.name;
          }
          if (!existingNode.ip && client.ip) {
            existingNode.ip = client.ip;
          }
          if (!existingNode.entityId && client.entityId) {
            existingNode.entityId = client.entityId;
          }
          if (client.state !== undefined) {
            existingNode.state = client.state;
            existingNode.isConnected = client.isConnected;
          }
          if (connType !== 'unknown') {
            existingNode.connectionType = connType;
          }
        }

        // Candidate edge: interface -> child
        if (!interfaceToChildEdges.has(childMac)) {
          interfaceToChildEdges.set(childMac, []);
        }
        interfaceToChildEdges.get(childMac)!.push({
          from: interfaceNodeId,
          to: childMac,
          connectionType: connType,
          rootMac: rootMac,
          isConnected: client.isConnected,
          client: client,
        });
      }
    }

    // 3. Root-to-root Adjacency and Depth calculation
    // Build root adjacency graph through their connecting interface nodes
    const rootAdjacency = new Map<string, string[]>();
    for (const root of allRoots) {
      rootAdjacency.set(root, []);
    }

    for (const root of allRoots) {
      const candidateEdges = interfaceToChildEdges.get(root) || [];
      for (const edge of candidateEdges) {
        if (rootAdjacency.has(edge.rootMac)) {
          rootAdjacency.get(edge.rootMac)!.push(root);
        }
      }
    }

    // BFS for root depths
    const rootDepths = new Map<string, number>();
    rootDepths.set(masterRootMac, 0);

    const queue: { mac: string; depth: number }[] = [{ mac: masterRootMac, depth: 0 }];
    const visitedRoots = new Set<string>([masterRootMac]);

    while (queue.length > 0) {
      const current = queue.shift()!;
      rootDepths.set(current.mac, current.depth);

      const neighbors = rootAdjacency.get(current.mac) || [];
      for (const neighbor of neighbors) {
        if (!visitedRoots.has(neighbor)) {
          visitedRoots.add(neighbor);
          queue.push({ mac: neighbor, depth: current.depth + 2 }); // Each hop: root (d) -> interface (d+1) -> child root (d+2)
        }
      }
    }

    for (const root of allRoots) {
      if (!rootDepths.has(root)) {
        rootDepths.set(root, 0);
      }
      const node = nodesMap.get(root);
      if (node) {
        node.depth = rootDepths.get(root);
      }
    }

    // Assign depths to interface nodes: root depth + 1
    for (const edge of rootToInterfaceEdges.values()) {
      const parentRootDepth = rootDepths.get(edge.from) ?? 0;
      const ifNode = nodesMap.get(edge.to);
      if (ifNode) {
        ifNode.depth = parentRootDepth + 1;
      }
    }

    // 4. Resolve Edges: prioritize online candidate, fallback to max depth
    const finalEdges: NetworkEdge[] = [];
    const activeInterfaceIds = new Set<string>();

    for (const [childMac, candidateEdges] of interfaceToChildEdges.entries()) {
      let bestEdge = candidateEdges[0];

      for (let i = 1; i < candidateEdges.length; i++) {
        const edge = candidateEdges[i];

        const edgeOnline = edge.isConnected !== false;
        const bestOnline = bestEdge.isConnected !== false;

        // Rule 1: Online device takes precedence over offline device
        if (edgeOnline && !bestOnline) {
          bestEdge = edge;
          continue;
        }
        if (!edgeOnline && bestOnline) {
          continue;
        }

        // Rule 2: If both online or both offline, evaluate topology depth
        const depth = nodesMap.get(edge.from)?.depth ?? 0;
        const bestDepth = nodesMap.get(bestEdge.from)?.depth ?? 0;

        if (depth > bestDepth) {
          bestEdge = edge;
        }
      }

      finalEdges.push({
        from: bestEdge.from,
        to: bestEdge.to,
        connectionType: bestEdge.connectionType,
      });

      activeInterfaceIds.add(bestEdge.from);

      // Update child node with the winning candidate's attributes
      const childNode = nodesMap.get(childMac);
      if (childNode) {
        const bestDepth = nodesMap.get(bestEdge.from)?.depth ?? 0;
        childNode.depth = bestDepth + 1;
        if (bestEdge.connectionType && bestEdge.connectionType !== 'unknown') {
          childNode.connectionType = bestEdge.connectionType;
        }
        if (bestEdge.client) {
          if (bestEdge.client.state !== undefined) {
            childNode.state = bestEdge.client.state;
            childNode.isConnected = bestEdge.client.isConnected;
          }
          if (bestEdge.client.ip) {
            childNode.ip = bestEdge.client.ip;
          }
          if (bestEdge.client.entityId) {
            childNode.entityId = bestEdge.client.entityId;
          }
        }
      }
    }

    // Include root -> interface edges ONLY for active interfaces (prunes unused interfaces)
    for (const edge of rootToInterfaceEdges.values()) {
      if (activeInterfaceIds.has(edge.to)) {
        finalEdges.push(edge);
      }
    }

    // Filter nodes: keep roots, clients, and active interface nodes
    const finalNodes = Array.from(nodesMap.values()).filter((node) => {
      if (node.isRoot) return true;
      if (node.isInterface) return activeInterfaceIds.has(node.id);
      return true;
    });

    // Process forced links
    if (input.forcedLinks) {
      for (const fl of input.forcedLinks) {
        const fromMac = resolveMac(fl.from);
        const toMac = resolveMac(fl.to);
        if (fromMac && toMac && fromMac !== toMac) {
          const existingIdx = finalEdges.findIndex((e) => e.to === toMac);
          if (existingIdx !== -1) {
            finalEdges.splice(existingIdx, 1);
          }
          finalEdges.push({
            from: fromMac,
            to: toMac,
            label: fl.label,
            connectionType: fl.connection_type || 'lan',
          });
        }
      }
    }

    return {
      nodes: finalNodes,
      edges: finalEdges,
    };
  }
}
