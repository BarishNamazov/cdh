import path from "node:path";
import { discoverSyncs, type SyncModel } from "../repo-model/syncs.ts";
import { discoverConcepts } from "../repo-model/concepts.ts";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";

export interface SyncGraphNode {
  id: string;
  type: "sync" | "action" | "endpoint" | "query";
  label: string;
  file?: string;
}

export interface SyncGraphEdge {
  from: string;
  to: string;
  type: "when" | "then" | "where" | "endpoint-route";
}

export interface SyncGraph {
  nodes: SyncGraphNode[];
  edges: SyncGraphEdge[];
}

export async function buildSyncGraph(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract
): Promise<SyncGraph> {
  const syncs = await discoverSyncs(cwd, config);
  const concepts = await discoverConcepts(cwd, config, contract);

  const nodes: SyncGraphNode[] = [];
  const edges: SyncGraphEdge[] = [];
  const nodeIds = new Set<string>();

  const addNode = (node: SyncGraphNode) => {
    if (!nodeIds.has(node.id)) {
      nodeIds.add(node.id);
      nodes.push(node);
    }
  };

  const conceptNames = new Set(concepts.map((c) => c.name));

  for (const sync of syncs) {
    const syncName = path.basename(sync.file, ".sync.ts");
    const syncId = `sync:${syncName}`;
    const relPath = path.relative(cwd, sync.file);

    addNode({ id: syncId, type: "sync", label: syncName, file: relPath });

    for (const wa of sync.whenActions) {
      addNode({ id: wa, type: "action", label: wa });
      edges.push({ from: wa, to: syncId, type: "when" });
    }

    for (const ta of sync.thenActions) {
      addNode({ id: ta, type: "action", label: ta });
      edges.push({ from: syncId, to: ta, type: "then" });
    }

    for (const qr of sync.queryRefs) {
      const [cn, qn] = qr.split(".");
      if (cn && qn && conceptNames.has(cn)) {
        addNode({ id: qr, type: "query", label: qr });
        edges.push({ from: syncId, to: qr, type: "where" });
      }
    }

    for (const ep of sync.endpointPaths) {
      const epId = `endpoint:${ep}`;
      addNode({ id: epId, type: "endpoint", label: ep });
      edges.push({ from: epId, to: syncId, type: "endpoint-route" });
    }
  }

  return { nodes, edges };
}

export function formatGraphReport(graph: SyncGraph): string {
  const lines: string[] = [];

  const syncs = graph.nodes.filter((n) => n.type === "sync");
  const endpoints = graph.nodes.filter((n) => n.type === "endpoint");
  const actions = graph.nodes.filter((n) => n.type === "action");
  const queries = graph.nodes.filter((n) => n.type === "query");

  lines.push("Sync Graph Report");
  lines.push("=================");
  lines.push(`Syncs: ${syncs.length}`);
  lines.push(`Endpoints: ${endpoints.length}`);
  lines.push(`Actions: ${actions.length}`);
  lines.push(`Queries: ${queries.length}`);
  lines.push(`Edges: ${graph.edges.length}`);
  lines.push("");

  lines.push("--- Nodes ---");
  for (const node of graph.nodes) {
    const file = node.file ? ` [${node.file}]` : "";
    lines.push(`  [${node.type}] ${node.label}${file}`);
  }

  lines.push("");
  lines.push("--- Edges ---");
  for (const edge of graph.edges) {
    lines.push(`  ${edge.from} --[${edge.type}]--> ${edge.to}`);
  }

  return lines.join("\n");
}

export function formatGraphJson(graph: SyncGraph): string {
  return JSON.stringify(graph, null, 2);
}

export function formatGraphMermaid(graph: SyncGraph): string {
  const lines: string[] = ["graph LR"];

  const id = (s: string) => s.replace(/[^a-zA-Z0-9]/g, "_");

  for (const node of graph.nodes) {
    const shape = node.type === "endpoint" ? "([{label}])" : "[{label}]";
    lines.push(`  ${id(node.id)}${shape.replace("{label}", node.label)}`);
  }

  for (const edge of graph.edges) {
    const label = edge.type === "when" ? "" : `|${edge.type}|`;
    lines.push(`  ${id(edge.from)} --${label}--> ${id(edge.to)}`);
  }

  return lines.join("\n");
}

export function formatGraphDot(graph: SyncGraph): string {
  const lines: string[] = ["digraph SyncGraph {", "  rankdir=LR;", "  node [shape=box];"];

  const id = (s: string) => `n_${s.replace(/[^a-zA-Z0-9]/g, "_")}`;

  for (const node of graph.nodes) {
    const shape = node.type === "endpoint" ? "ellipse" : "box";
    lines.push(`  ${id(node.id)} [label="${node.label}" shape=${shape}];`);
  }

  for (const edge of graph.edges) {
    lines.push(`  ${id(edge.from)} -> ${id(edge.to)} [label="${edge.type}"];`);
  }

  lines.push("}");
  return lines.join("\n");
}
