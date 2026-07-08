import path from "node:path";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";
import { discoverConcepts } from "../repo-model/concepts.ts";
import { discoverSyncs } from "../repo-model/syncs.ts";

export interface SyncDiagnostic {
  severity: "warn" | "info";
  rule: string;
  path: string;
  message: string;
}

export interface SyncDiagnosticsReport {
  syncs: number;
  diagnostics: SyncDiagnostic[];
}

const HEAVY_WHERE_THRESHOLD = 2;

export async function runSyncDiagnostics(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract
): Promise<SyncDiagnosticsReport> {
  const syncs = await discoverSyncs(cwd, config);
  const concepts = await discoverConcepts(cwd, config, contract);
  const diagnostics: SyncDiagnostic[] = [];

  const allConceptRefs = new Set<string>();
  for (const concept of concepts) {
    for (const a of concept.actions) allConceptRefs.add(`${concept.name}.${a.name}`);
    for (const q of concept.queries) allConceptRefs.add(`${concept.name}.${q.name}`);
  }

  for (const sync of syncs) {
    const relPath = path.relative(cwd, sync.file);
    const hasTest = Boolean(sync.testPath);

    if (allConceptRefs.size > 0) {
      for (const wa of sync.whenActions) {
        if (!allConceptRefs.has(wa)) {
          diagnostics.push({
            severity: "warn",
            rule: "unknown-when-action",
            path: relPath,
            message: `when action '${wa}' does not match any known concept action`,
          });
        }
      }

      for (const ta of sync.thenActions) {
        if (!allConceptRefs.has(ta)) {
          diagnostics.push({
            severity: "warn",
            rule: "unknown-then-action",
            path: relPath,
            message: `then action '${ta}' does not match any known concept action`,
          });
        }
      }

      for (const qr of sync.queryRefs) {
        if (!allConceptRefs.has(qr)) {
          diagnostics.push({
            severity: "warn",
            rule: "unknown-query-ref",
            path: relPath,
            message: `query ref '${qr}' does not match any known concept query`,
          });
        }
      }
    }

    if (!hasTest) {
      diagnostics.push({
        severity: "warn",
        rule: "missing-test",
        path: relPath,
        message: "No sibling test file found",
      });
    } else if (sync.hasBranches) {
      diagnostics.push({
        severity: "info",
        rule: "untested-branches",
        path: relPath,
        message: "Sync has branches (on/branch/onError). Ensure tests cover all paths.",
      });
    }

    if (sync.endpointPaths.length > 0) {
      const hasRespond = sync.thenActions.some((ta) => {
        const actionName = ta.split(".").pop() ?? "";
        return actionName.toLowerCase() === "respond";
      });
      if (!hasRespond) {
        diagnostics.push({
          severity: "warn",
          rule: "endpoint-no-respond",
          path: relPath,
          message: `Endpoint sync (${sync.endpointPaths.join(", ")}) has no Respond action in thenActions`,
        });
      }
    }
  }

  const orphaned = findOrphanedActions(syncs, allConceptRefs);
  for (const action of orphaned) {
    diagnostics.push({
      severity: "info",
      rule: "orphan-action",
      path: "",
      message: `Action '${action}' is defined but not referenced by any sync`,
    });
  }

  const heavyWhere = syncs.filter((s) => s.hasWhere && s.queryRefs.length > HEAVY_WHERE_THRESHOLD);
  for (const hw of heavyWhere) {
    diagnostics.push({
      severity: "info",
      rule: "heavy-where",
      path: path.relative(cwd, hw.file),
      message: `Sync has ${hw.queryRefs.length} query refs in where clause: ${hw.queryRefs.join(", ")}`,
    });
  }

  return { syncs: syncs.length, diagnostics };
}

function findOrphanedActions(
  syncs: import("../repo-model/syncs.ts").SyncModel[],
  allConceptRefs: Set<string>
): string[] {
  const referenced = new Set<string>();

  for (const sync of syncs) {
    for (const wa of sync.whenActions) referenced.add(wa);
    for (const ta of sync.thenActions) referenced.add(ta);
    for (const qr of sync.queryRefs) referenced.add(qr);
  }

  return [...allConceptRefs].filter((ref) => !referenced.has(ref)).sort();
}

export function formatDiagnostics(report: SyncDiagnosticsReport): string {
  const lines: string[] = [];
  const warns = report.diagnostics.filter((d) => d.severity === "warn");
  const infos = report.diagnostics.filter((d) => d.severity === "info");

  lines.push("Sync Diagnostics Report");
  lines.push("=======================");
  lines.push(`Syncs analyzed: ${report.syncs}`);
  lines.push(`Warnings: ${warns.length}`);
  lines.push(`Info: ${infos.length}`);

  if (report.diagnostics.length === 0) {
    lines.push("");
    lines.push("No issues found.");
    return lines.join("\n");
  }

  for (const diag of report.diagnostics) {
    lines.push("");
    lines.push(`[${diag.severity.toUpperCase()}] ${diag.rule}`);
    if (diag.path) lines.push(`  File: ${diag.path}`);
    lines.push(`  Message: ${diag.message}`);
  }

  return lines.join("\n");
}

export function formatDiagnosticsJson(report: SyncDiagnosticsReport): string {
  return JSON.stringify(report, null, 2);
}
