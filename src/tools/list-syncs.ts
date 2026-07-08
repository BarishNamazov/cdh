import path from "node:path";
import { discoverSyncs, type SyncModel } from "../repo-model/syncs.ts";
import { type CdhConfig } from "../config.ts";
import { type RepoContract } from "../repo-contract.ts";

export async function listSyncs(
  cwd: string,
  config: CdhConfig,
  _contract: RepoContract,
  filterConcept?: string
): Promise<SyncModel[]> {
  const syncs = await discoverSyncs(cwd, config);

  if (!filterConcept) return syncs;

  const lower = filterConcept.toLowerCase();
  return syncs.filter(
    (s) =>
      s.whenActions.some((a) => a.split(".")[0]?.toLowerCase() === lower) ||
      s.thenActions.some((a) => a.split(".")[0]?.toLowerCase() === lower) ||
      s.queryRefs.some((a) => a.split(".")[0]?.toLowerCase() === lower)
  );
}

export function formatSyncs(syncs: SyncModel[], cwd: string, filterConcept?: string): string {
  if (syncs.length === 0) {
    const msg = filterConcept
      ? `No syncs reference concept '${filterConcept}'.`
      : "No syncs found.";
    return msg;
  }

  const lines: string[] = [];
  const header = filterConcept
    ? `Syncs involving concept '${filterConcept}' (${syncs.length}):`
    : `All syncs (${syncs.length}):`;
  lines.push(header);
  lines.push("");

  for (const sync of syncs) {
    const relPath = path.relative(cwd, sync.file);
    const name = path.basename(sync.file, ".sync.ts");
    lines.push(`${name}`);
    lines.push(`  File: ${relPath}`);
    lines.push(`  When: ${sync.whenActions.join(", ") || "none"}`);
    lines.push(`  Then: ${sync.thenActions.join(", ") || "none"}`);
    if (sync.queryRefs.length > 0) {
      lines.push(`  Queries: ${sync.queryRefs.join(", ")}`);
    }
    if (sync.endpointPaths.length > 0) {
      lines.push(`  Endpoints: ${sync.endpointPaths.join(", ")}`);
    }
    if (sync.hasWhere) lines.push(`  Where: yes`);
    if (sync.hasBranches) lines.push(`  Branches: yes`);
    lines.push(`  Tests: ${sync.testPath ? "yes" : "no"}`);
    lines.push("");
  }

  return lines.join("\n").trim();
}
