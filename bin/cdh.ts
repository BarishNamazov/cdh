#!/usr/bin/env bun

import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config.ts";
import { loadRepoContract } from "../src/repo-contract.ts";
import { Journal } from "../src/journal/journal.ts";
import { createRuleEngine } from "../src/rules/rule-engine.ts";
import { runVerification } from "../src/verify/runner.ts";
import { traceSyncAction, formatTraceResult } from "../src/tools/trace-sync.ts";
import { listSyncs, formatSyncs } from "../src/tools/list-syncs.ts";
import { listConcepts, formatConcepts } from "../src/tools/list-concepts.ts";
import { describeConcept, formatConceptDetail } from "../src/tools/describe-concept.ts";
import { checkSpecSync, formatSpecDiff, autoSyncSpec } from "../src/tools/spec-sync.ts";
import { readDesignDoc, formatDesignDoc } from "../src/tools/design-doc.ts";
import { buildSyncGraph, formatGraphReport, formatGraphJson, formatGraphMermaid, formatGraphDot } from "../src/tools/sync-graph.ts";
import { runSyncDiagnostics, formatDiagnostics, formatDiagnosticsJson } from "../src/tools/sync-diagnostics.ts";
import { captureSnapshot, computeTouched, runShipPreflight } from "../src/ship/index.ts";

const [, , command, ...args] = Bun.argv;
const cwd = process.cwd();

async function getContract(config: ReturnType<typeof loadConfig> extends Promise<infer T> ? T : never) {
  try {
    return (await loadRepoContract(cwd, config)).contract;
  } catch {
    console.error("Failed to load repo contract from design/index.json.");
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const config = await loadConfig(cwd);

  switch (command) {
    case "rules": {
      const contract = await getContract(config);
      const engine = createRuleEngine(cwd, config, contract);
      const hits = await engine.checkRepo("all");

      if (hits.length === 0) {
        console.log("No rule violations found.");
      } else {
        for (const hit of hits) {
          const severityLabel = hit.severity.toUpperCase();
          const suppressed = hit.suppressed ? ` [suppressed: ${hit.suppressed.reason}]` : "";
          console.log(`${severityLabel} ${hit.rule}: ${hit.path} — ${hit.message}${suppressed}`);
        }
        const blocks = hits.filter((h) => h.severity === "block");
        if (blocks.length > 0) process.exit(1);
      }
      break;
    }

    case "verify": {
      const tierIndex = args.indexOf("--tier");
      const tier = tierIndex >= 0 && args[tierIndex + 1]
        ? (args[tierIndex + 1] as "quick" | "ship")
        : "quick";

      const contract = await getContract(config);

      const engine = createRuleEngine(cwd, config, contract);
      const journal = new Journal(cwd, config);
      journal.initRun(process.env as Record<string, string | undefined>);

      const results = await runVerification({
        cwd,
        config,
        contract,
        ruleEngine: engine,
        journal,
        tier
      });

      console.log(`\nVerification (${tier}):`);
      for (const result of results) {
        const icon = result.status === "pass" ? "PASS"
          : result.status === "skip" ? "SKIP"
          : result.status === "warn" ? "WARN"
          : "FAIL";
        console.log(`  ${icon}  ${result.stage} (${result.durationMs}ms) — ${result.summary}`);
      }

      const failed = results.filter((r) => r.status === "fail");
      if (failed.length > 0) {
        console.log(`\n${failed.length} stage(s) failed.`);
        process.exit(1);
      } else {
        console.log("\nAll stages passed.");
      }
      break;
    }

    case "trace": {
      const actionRef = args[0];
      if (!actionRef || !actionRef.includes(".")) {
        console.error("Usage: cdh trace <Concept.action>");
        console.error("Example: cdh trace Labeling.addLabel");
        process.exit(1);
      }

      const contract = await getContract(config);

      try {
        const result = await traceSyncAction(cwd, config, contract, actionRef);
        console.log(formatTraceResult(result));

        const totalInvolved = new Set([...result.asTrigger, ...result.asEffect].map((r) => r.syncFile)).size;
        if (totalInvolved === 0) process.exit(1);
      } catch (err) {
        console.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }
      break;
    }

    case "syncs": {
      const conceptIndex = args.indexOf("--concept");
      const filterConcept = conceptIndex >= 0 && args[conceptIndex + 1] ? args[conceptIndex + 1] : undefined;

      const contract = await getContract(config);
      const syncs = await listSyncs(cwd, config, contract, filterConcept);
      console.log(formatSyncs(syncs, cwd, filterConcept));
      break;
    }

    case "concepts": {
      const contract = await getContract(config);
      const concepts = await listConcepts(cwd, config, contract);
      console.log(formatConcepts(concepts, cwd));
      break;
    }

    case "concept": {
      const name = args[0];
      if (!name) {
        console.error("Usage: cdh concept <name>");
        console.error("Example: cdh concept Labeling");
        process.exit(1);
      }

      const contract = await getContract(config);
      const result = await describeConcept(cwd, config, contract, name);

      if (!result) {
        console.error(`Concept '${name}' not found.`);
        process.exit(1);
      }

      console.log(formatConceptDetail(result, cwd));
      break;
    }

    case "spec-check": {
      const name = args[0];
      if (!name) {
        console.error("Usage: cdh spec-check <concept-name>");
        process.exit(1);
      }

      const contract = await getContract(config);
      const diff = await checkSpecSync(cwd, config, contract, name);

      if (!diff) {
        console.error(`Concept '${name}' not found or has no spec file.`);
        process.exit(1);
      }

      console.log(formatSpecDiff(diff));
      if (diff.issues.length > 0) process.exit(1);
      break;
    }

    case "spec-sync": {
      const name = args[0];
      if (!name) {
        console.error("Usage: cdh spec-sync <concept-name> [--dry-run]");
        process.exit(1);
      }

      const dryRun = args.includes("--dry-run");
      const contract = await getContract(config);
      const result = await autoSyncSpec(cwd, config, contract, name, { dryRun });

      if (result.error) {
        console.error(result.error);
        process.exit(1);
      }

      if (dryRun) {
        console.log(`Would update spec for '${name}' (matching actions/queries in code).`);
      } else {
        console.log(`Updated spec for '${name}' to match code surface.`);
      }
      break;
    }

    case "doc": {
      const key = args[0];
      if (!key) {
        const contract = await getContract(config);
        const keys = Object.keys(contract.docs).sort().join(", ");
        console.error(`Usage: cdh doc <key>`);
        console.error(`Available keys: ${keys}`);
        process.exit(1);
      }

      const contract = await getContract(config);
      const result = readDesignDoc(cwd, contract, key);
      console.log(formatDesignDoc(result));

      if ("error" in result) process.exit(1);
      break;
    }

    case "doctor": {
      const checks: { name: string; status: "PASS" | "FAIL" | "WARN"; detail: string }[] = [];

      let contract;
      try {
        contract = (await loadRepoContract(cwd, config)).contract;
        checks.push({ name: "repo-contract", status: "PASS", detail: "design/index.json is valid." });
      } catch (err) {
        checks.push({ name: "repo-contract", status: "FAIL", detail: err instanceof Error ? err.message : "Invalid contract" });
      }

      if (contract) {
        const conceptsRoot = path.resolve(cwd, config.paths.concepts);
        checks.push({
          name: "concepts-dir",
          status: existsSync(conceptsRoot) ? "PASS" : "FAIL",
          detail: existsSync(conceptsRoot) ? config.paths.concepts : `${config.paths.concepts} does not exist`
        });

        const syncsRoot = path.resolve(cwd, config.paths.syncs);
        checks.push({
          name: "syncs-dir",
          status: existsSync(syncsRoot) ? "PASS" : "FAIL",
          detail: existsSync(syncsRoot) ? config.paths.syncs : `${config.paths.syncs} does not exist`
        });

        const specsDir = path.resolve(cwd, contract.specsDir);
        checks.push({
          name: "specs-dir",
          status: existsSync(specsDir) ? "PASS" : "FAIL",
          detail: existsSync(specsDir) ? contract.specsDir : `${contract.specsDir} does not exist`
        });

        for (const [key, docPath] of Object.entries(contract.docs)) {
          checks.push({
            name: `doc:${key}`,
            status: existsSync(path.resolve(cwd, docPath)) ? "PASS" : "WARN",
            detail: docPath
          });
        }

        const { discoverConcepts: dc } = await import("../src/repo-model/concepts.ts");
        const { discoverSyncs: ds } = await import("../src/repo-model/syncs.ts");
        const concepts = await dc(cwd, config, contract);
        const syncs = await ds(cwd, config);

        for (const concept of concepts) {
          if (!concept.specPath) {
            checks.push({ name: `spec:${concept.name}`, status: "FAIL", detail: "Missing spec file" });
          }
          if (!concept.testPath) {
            checks.push({ name: `test:${concept.name}`, status: "FAIL", detail: "Missing test file" });
          }
        }

        for (const sync of syncs) {
          if (!sync.testPath) {
            checks.push({ name: `test:${path.basename(sync.file)}`, status: "FAIL", detail: "Missing sync test file" });
          }
        }

        const journalDir = path.resolve(cwd, config.paths.journal);
        checks.push({
          name: "journal-dir",
          status: existsSync(journalDir) ? "PASS" : "WARN",
          detail: existsSync(journalDir) ? config.paths.journal : `${config.paths.journal} does not exist (created on first run)`
        });
      }

      console.log("\nCDH Doctor Report:");
      console.log("==================");
      for (const check of checks) {
        console.log(`  ${check.status}  ${check.name}: ${check.detail}`);
      }

      const failed = checks.filter((c) => c.status === "FAIL");
      const warnings = checks.filter((c) => c.status === "WARN");
      console.log(`\nSummary: ${checks.length - failed.length} pass, ${warnings.length} warn, ${failed.length} fail`);
      if (failed.length > 0) process.exit(1);
      break;
    }

    case "sync-graph": {
      const fmtIdx = args.indexOf("--format");
      const format = fmtIdx >= 0 && args[fmtIdx + 1] ? args[fmtIdx + 1] : "report";

      const contract = await getContract(config);
      const graph = await buildSyncGraph(cwd, config, contract);

      switch (format) {
        case "json":
          console.log(formatGraphJson(graph));
          break;
        case "mermaid":
          console.log(formatGraphMermaid(graph));
          break;
        case "dot":
          console.log(formatGraphDot(graph));
          break;
        default:
          console.log(formatGraphReport(graph));
      }
      break;
    }

    case "sync-diagnostics": {
      const fmtIdx = args.indexOf("--format");
      const format = fmtIdx >= 0 && args[fmtIdx + 1] ? args[fmtIdx + 1] : "report";

      const contract = await getContract(config);
      const report = await runSyncDiagnostics(cwd, config, contract);

      if (format === "json") {
        console.log(formatDiagnosticsJson(report));
      } else {
        console.log(formatDiagnostics(report));
      }

      if (report.diagnostics.some((d) => d.severity === "warn")) process.exit(1);
      break;
    }

    case "ship": {
      const noReview = args.includes("--no-review");
      const noCi = args.includes("--no-ci");

      console.log("CDH Ship — preflight checks...\n");

      const snapshot = captureSnapshot(cwd);
      if (!snapshot) {
        console.error("Not a git repository. Ship requires a git repository.");
        process.exit(1);
      }

      const touched = computeTouched(cwd, snapshot);
      const preflight = runShipPreflight(cwd, snapshot, touched);

      if (!preflight.ok) {
        for (const err of preflight.errors) {
          console.error(`ERROR: ${err}`);
        }
        process.exit(1);
      }

      for (const warn of preflight.warnings) {
        console.log(`WARN: ${warn}`);
      }

      console.log(`Touched files (${preflight.touched.length}):`);
      for (const f of preflight.touched) {
        console.log(`  ${f}`);
      }

      if (preflight.preExistingDirty.length > 0) {
        console.log(`\nPre-existing dirty files excluded (${preflight.preExistingDirty.length}):`);
        for (const f of preflight.preExistingDirty) {
          console.log(`  ${f}`);
        }
      }

      console.log("\nRunning ship-tier verification...\n");

      const contract = await getContract(config);
      const engine = createRuleEngine(cwd, config, contract);
      const journal = new Journal(cwd, config);
      journal.initRun(process.env as Record<string, string | undefined>);

      const results = await runVerification({
        cwd,
        config,
        contract,
        ruleEngine: engine,
        journal,
        tier: "ship"
      });

      for (const result of results) {
        const icon = result.status === "pass" ? "PASS"
          : result.status === "skip" ? "SKIP"
          : result.status === "warn" ? "WARN"
          : "FAIL";
        console.log(`  ${icon}  ${result.stage} (${result.durationMs}ms) — ${result.summary}`);
      }

      const failed = results.filter((r) => r.status === "fail");
      if (failed.length > 0) {
        console.log(`\n${failed.length} stage(s) failed. Ship aborted.`);
        process.exit(1);
      }

      console.log("\nAll verification stages passed.");
      console.log(`\nShip ready. Run 'cdh ship --confirm' to commit and branch.`);
      break;
    }

    case "init":
      console.log(`cdh ${command} is not implemented yet.`);
      break;

    case undefined:
    case "--help":
    case "-h":
      console.log([
        "Usage: cdh <command> [options]",
        "",
        "Commands:",
        "  init               Initialize a new concept-design repo",
        "  doctor             Check harness and repo health",
        "  rules              Run all rules and report violations",
        "  verify             Run verification stages (--tier quick|ship)",
        "  ship               Preflight, verify, and ship changes (--no-review --no-ci)",
        "  trace <C.action>   Show all syncs involving a concept action",
        "  syncs              List all syncs (--concept <name> to filter)",
        "  sync-graph         Build and display sync graph (--format report|json|mermaid|dot)",
        "  sync-diagnostics   Run graph diagnostics (--format report|json)",
        "  concepts           List all concepts with action/query counts",
        "  concept <name>     Show detailed surface for a concept",
        "  spec-check <name>  Check if concept spec matches code surface",
        "  spec-sync <name>   Update spec to match code (--dry-run to preview)",
        "  doc <key>          Read a design document (convention doc)",
        "",
        "Options:",
        "  --tier             quick (default) or ship",
        "  --concept <name>   Filter syncs by concept",
        "  --format           Output format for sync-graph/sync-diagnostics"
      ].join("\n"));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main();
