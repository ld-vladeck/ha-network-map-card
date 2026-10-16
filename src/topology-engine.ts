import {
  DiscoveredClient,
  IntegrationConfig,
  NetworkEdge,
  NetworkNode,
} from './types';
import { normalizeMac, detectConnectionType } from './ha-helper';

export { normalizeMac, detectConnectionType };

export interface BuildGraphInput {
  masterRootMac: string;
  integrations: IntegrationConfig[];
  clientsByConfigEntry: Map<string, DiscoveredClient[]>;
  rootNames?: Map<string, string>;
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
    const nodesMap = new Map<string, NetworkNode>();
    const allRoots = new Set<string>();
    const rootNames = input.rootNames || new Map<string, string>();

    // 1. Register all roots with real friendly names
    for (const integration of input.integrations) {
      const rootMac = normalizeMac(integration.root_mac);
      if (rootMac) {
        allRoots.add(rootMac);
        if (!nodesMap.has(rootMac)) {
          const resolvedName =
            rootNames.get(rootMac) ||
            (rootMac === masterRootMac ? 'Router Principale' : `Access Point (${rootMac})`);

          nodesMap.set(rootMac, {
            id: rootMac,
            label: resolvedName,
            mac: rootMac,
            isRoot: true,
            isMasterRoot: rootMac === masterRootMac,
            depth: rootMac === masterRootMac ? 0 : undefined,
          });
        }
      }
    }

    if (masterRootMac && !nodesMap.has(masterRootMac)) {
      allRoots.add(masterRootMac);
      const resolvedName = rootNames.get(masterRootMac) || 'Router Principale';
      nodesMap.set(masterRootMac, {
        id: masterRootMac,
        label: resolvedName,
        mac: masterRootMac,
        isRoot: true,
        isMasterRoot: true,
        depth: 0,
      });
    }

    // 2. Build Interface Sub-branches and Candidate Edges
    // Interface edges: rootMac -> interfaceNodeId
    const rootToInterfaceEdges = new Map<string, NetworkEdge>(); // key = from->to
    // Interface to child edges: key = childMac -> Array of candidate edges
    const interfaceToChildEdges = new Map<string, (NetworkEdge & { rootMac: string })[]>();

    for (const integration of input.integrations) {
      const rootMac = normalizeMac(integration.root_mac);
      const clients = input.clientsByConfigEntry.get(integration.config_entry_id) || [];

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

        // Register / update client node
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
            entityId: client.entityId,
            rawAttributes: client.attributes,
          });
        } else {
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

    // 4. Resolve Edges: select edge from interface with MAX depth
    const finalEdges: NetworkEdge[] = [];
    const activeInterfaceIds = new Set<string>();

    for (const [childMac, candidateEdges] of interfaceToChildEdges.entries()) {
      let bestEdge = candidateEdges[0];
      let maxDepth = (nodesMap.get(bestEdge.from)?.depth ?? 0);

      for (let i = 1; i < candidateEdges.length; i++) {
        const edge = candidateEdges[i];
        const depth = nodesMap.get(edge.from)?.depth ?? 0;
        if (depth > maxDepth) {
          maxDepth = depth;
          bestEdge = edge;
        }
      }

      finalEdges.push({
        from: bestEdge.from,
        to: bestEdge.to,
        connectionType: bestEdge.connectionType,
      });

      activeInterfaceIds.add(bestEdge.from);

      // Update child depth
      const childNode = nodesMap.get(childMac);
      if (childNode) {
        childNode.depth = maxDepth + 1;
        if (bestEdge.connectionType && bestEdge.connectionType !== 'unknown') {
          childNode.connectionType = bestEdge.connectionType;
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

    return {
      nodes: finalNodes,
      edges: finalEdges,
    };
  }
}
