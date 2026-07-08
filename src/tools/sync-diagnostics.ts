import path from "node:path";
import { discoverSyncs, type SyncModel } from "../repo-model/syncs.ts";
import { discoverConcepts } from "../repo-model/concepts.ts";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";

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

export async function runSyncDiagnostics(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract
): Promise<SyncDiagnosticsReport> {
  const syncs = await discoverSyncs(cwd, config);
  const concepts = await discoverConcepts(cwd, config, contract);
  const diagnostics: SyncDiagnostic[] = [];

  const conceptActions = new Map<string, Set<string>>();
  const conceptQueries = new Map<string, Set<string>>();

  for (const concept of concepts) {
    conceptActions.set(concept.name, new Set(concept.actions.map((a) => a.name)));
    conceptQueries.set(concept.name, new Set(concept.queries.map((q) => q.name)));
  }

  const allConceptRefs = new Set<string>();
  for (const concept of concepts) {
    for (const a of concept.actions) allConceptRefs.add(`${concept.name}.${a.name}`);
    for (const q of concept.queries) allConceptRefs.add(`${concept.name}.${q.name}`);
  }

  for (const sync of syncs) {
    const relPath = path.relative(cwd, sync.file);

    if (allConceptRefs.size > 0) {
      for (const wa of sync.whenActions) {
        if (sync.parser === "legacy") {
          const [cn, an] = wa.split(".");
          if (cn && an && !allConceptRefs.has(wa)) {
            diagnostics.push({
              severity: "warn",
              rule: "unknown-when-action",
              path: relPath,
              message: `when action '${wa}' does not match any known concept action`
            });
          }
        }
      }

      for (const ta of sync.thenActions) {
        const [cn, an] = ta.split(".");
        if (cn && an && !allConceptRefs.has(ta)) {
          diagnostics.push({
            severity: "warn",
            rule: "unknown-then-action",
            path: relPath,
            message: `then action '${ta}' does not match any known concept action`
          });
        }
      }

      for (const qr of sync.queryRefs) {
        const [cn, an] = qr.split(".");
        if (cn && an) {
          const queries = conceptQueries.get(cn);
          if (!queries || !queries.has(an)) {
            diagnostics.push({
              severity: "warn",
              rule: "unknown-query-ref",
              path: relPath,
              message: `query ref '${qr}' does not match any known concept query`
            });
          }
        }
      }
    }

    if (!sync.testPath) {
      diagnostics.push({
        severity: "warn",
        rule: "missing-test",
        path: relPath,
        message: "No sibling test file found"
      });
    }

    if (sync.hasBranches && !sync.testPath) {
      diagnostics.push({
        severity: "warn",
        rule: "untested-branches",
        path: relPath,
        message: "Sync has branches (on/onError) without tests"
      });
    }

    if (sync.endpointPaths.length > 0) {
      const hasRespond = sync.thenActions.some((ta) =>
        ta.includes("respond") || ta.includes("Respond")
      );
      if (!hasRespond) {
        diagnostics.push({
          severity: "warn",
          rule: "endpoint-no-respond",
          path: relPath,
          message: `Endpoint sync (${sync.endpointPaths.join(", ")}) has no Respond action in thenActions`
        });
      }
    }
  }

  const orphanedActions = findOrphanedActions(syncs, allConceptRefs);

  for (const action of orphanedActions) {
    diagnostics.push({
      severity: "info",
      rule: "orphan-action",
      path: "",
      message: `Action '${action}' is defined but not referenced by any sync`
    });
  }

  const heavyWhere = findHeavyWhere(syncs);
  for (const hw of heavyWhere) {
    diagnostics.push({
      severity: "info",
      rule: "heavy-where",
      path: path.relative(cwd, hw.file),
      message: `Sync has where clause with queries: ${hw.queryRefs.join(", ")}`
    });
  }

  return { syncs: syncs.length, diagnostics };
}

function findOrphanedActions(syncs: SyncModel[], allConceptRefs: Set<string>): string[] {
  const referenced = new Set<string>();

  for (const sync of syncs) {
    for (const wa of sync.whenActions) referenced.add(wa);
    for (const ta of sync.thenActions) referenced.add(ta);
    for (const qr of sync.queryRefs) referenced.add(qr);
  }

  return [...allConceptRefs].filter((ref) => !referenced.has(ref)).sort();
}

function findHeavyWhere(syncs: SyncModel[]): SyncModel[] {
  return syncs.filter((sync) => sync.hasWhere && sync.queryRefs.length > 2);
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
