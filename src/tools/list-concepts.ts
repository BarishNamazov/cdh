import path from "node:path";
import { discoverConcepts, type ConceptModel } from "../repo-model/concepts.ts";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";

export interface ConceptListEntry {
  name: string;
  actionCount: number;
  queryCount: number;
  specPath?: string;
  testPath?: string;
  hasSpec: boolean;
  hasTests: boolean;
}

export async function listConcepts(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract
): Promise<ConceptModel[]> {
  return discoverConcepts(cwd, config, contract);
}

export function formatConcepts(concepts: ConceptModel[], cwd: string): string {
  if (concepts.length === 0) return "No concepts found.";

  const lines: string[] = [];
  lines.push(`Concepts (${concepts.length}):`);
  lines.push("");

  for (const concept of concepts) {
    const relPath = path.relative(cwd, concept.file);
    lines.push(`## ${concept.name}`);
    lines.push(`  Actions: ${concept.actions.map((a) => a.name).join(", ") || "none"}`);
    lines.push(`  Queries: ${concept.queries.map((q) => q.name).join(", ") || "none"}`);
    lines.push(`  Spec: ${concept.specPath ? "yes" : "missing"}`);
    lines.push(`  Tests: ${concept.testPath ? "yes" : "missing"}`);
    lines.push(`  File: ${relPath}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}
