import path from "node:path";
import { discoverSyncs, type SyncModel } from "../repo-model/syncs.ts";
import { discoverConcepts, type ConceptModel } from "../repo-model/concepts.ts";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";

export interface TraceResult {
  action: string;
  asTrigger: SyncRef[];
  asEffect: SyncRef[];
  asQuery: SyncRef[];
  totalSyncs: number;
}

export interface SyncRef {
  syncFile: string;
  syncName: string;
  role: "when" | "then" | "where";
}

export async function traceSyncAction(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract,
  actionRef: string
): Promise<TraceResult> {
  const syncs = await discoverSyncs(cwd, config);
  const concepts = await discoverConcepts(cwd, config, contract);

  const parts = actionRef.split(".");
  if (parts.length !== 2) {
    throw new Error(`Action reference must be 'Concept.action' format, got '${actionRef}'`);
  }

  const [conceptName, actionName] = parts as [string, string];

  const concept = concepts.find((c) => c.name.toLowerCase() === conceptName.toLowerCase());
  const conceptActions = concept
    ? [...concept.actions.map((a) => a.name), ...concept.queries.map((q) => q.name)]
    : [];

  if (!concept) {
    const known = concepts.map((c) => c.name).sort().join(", ");
    if (known) {
      throw new Error(`Unknown concept '${conceptName}'. Known concepts: ${known}`);
    }
  }

  if (conceptActions.length > 0 && !conceptActions.includes(actionName)) {
    const known = conceptActions.sort().join(", ");
    throw new Error(`Unknown action '${actionRef}'. Known actions for ${conceptName}: ${known}`);
  }

  const asTrigger: SyncRef[] = [];
  const asEffect: SyncRef[] = [];
  const asQuery: SyncRef[] = [];

  for (const sync of syncs) {
    const syncShort = path.basename(sync.file, ".sync.ts");

    for (const wa of sync.whenActions) {
      if (matchesAction(wa, conceptName, actionName)) {
        asTrigger.push({ syncFile: path.relative(cwd, sync.file), syncName: syncShort, role: "when" });
      }
    }

    for (const ta of sync.thenActions) {
      if (matchesAction(ta, conceptName, actionName)) {
        asEffect.push({ syncFile: path.relative(cwd, sync.file), syncName: syncShort, role: "then" });
      }
    }

    for (const qr of sync.queryRefs) {
      if (matchesAction(qr, conceptName, actionName)) {
        asQuery.push({ syncFile: path.relative(cwd, sync.file), syncName: syncShort, role: "where" });
      }
    }
  }

  return { action: actionRef, asTrigger, asEffect, asQuery, totalSyncs: syncs.length };
}

function matchesAction(ref: string, conceptName: string, actionName: string): boolean {
  const [refConcept, refAction] = ref.split(".");
  return (
    (refConcept ?? "").toLowerCase() === conceptName.toLowerCase() &&
    (refAction ?? "").toLowerCase() === actionName.toLowerCase()
  );
}

export function formatTraceResult(result: TraceResult): string {
  const lines: string[] = [];

  lines.push(`Trace: ${result.action}`);
  lines.push(`Total syncs in repo: ${result.totalSyncs}`);
  lines.push("");

  if (result.asTrigger.length > 0) {
    lines.push("When this action fires (triggers syncs):");
    for (const ref of result.asTrigger) {
      lines.push(`  ${ref.syncFile} (${ref.syncName})`);
    }
  } else {
    lines.push("When this action fires: no syncs are triggered by it.");
  }

  lines.push("");

  if (result.asEffect.length > 0) {
    lines.push("Then this action is performed (as sync effect):");
    for (const ref of result.asEffect) {
      lines.push(`  ${ref.syncFile} (${ref.syncName})`);
    }
  } else {
    lines.push("Then this action is performed: no syncs produce this action as an effect.");
  }

  if (result.asQuery.length > 0) {
    lines.push("");
    lines.push("where this action is queried:");
    for (const ref of result.asQuery) {
      lines.push(`  ${ref.syncFile} (${ref.syncName})`);
    }
  }

  const totalInvolved = new Set(
    [...result.asTrigger, ...result.asEffect, ...result.asQuery].map((r) => r.syncFile)
  ).size;
  if (totalInvolved === 0) {
    lines.push("");
    lines.push(`Warning: ${result.action} is not referenced by any sync. It may be orphaned.`);
  }

  return lines.join("\n");
}
