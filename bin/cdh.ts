#!/usr/bin/env bun

import { existsSync } from "node:fs";
import path from "node:path";
import type { CdhConfig } from "../src/config.ts";
import { loadConfig } from "../src/config.ts";
import { Journal } from "../src/journal/journal.ts";
import { loadRepoContract } from "../src/repo-contract.ts";
import { discoverConcepts } from "../src/repo-model/concepts.ts";
import { discoverSyncs } from "../src/repo-model/syncs.ts";
import { createRuleEngine } from "../src/rules/rule-engine.ts";
import { commitShip, createPullRequest, createShipBranch, pushBranch } from "../src/ship/git-mutation.ts";
import { captureSnapshot, computeTouched, runShipPreflight } from "../src/ship/index.ts";
import { describeConcept, formatConceptDetail } from "../src/tools/describe-concept.ts";
import { formatDesignDoc, readDesignDoc } from "../src/tools/design-doc.ts";
import { formatConcepts, listConcepts } from "../src/tools/list-concepts.ts";
import { formatSyncs, listSyncs } from "../src/tools/list-syncs.ts";
import { autoSyncSpec, checkSpecSync, formatSpecDiff } from "../src/tools/spec-sync.ts";
import { formatDiagnostics, formatDiagnosticsJson, runSyncDiagnostics } from "../src/tools/sync-diagnostics.ts";
import {
  buildSyncGraph,
  formatGraphDot,
  formatGraphJson,
  formatGraphMermaid,
  formatGraphReport,
} from "../src/tools/sync-graph.ts";
import { formatTraceResult, traceSyncAction } from "../src/tools/trace-sync.ts";
import { formatStageResults } from "../src/verify/format.ts";
import { runVerification } from "../src/verify/runner.ts";

const [, , command, ...args] = Bun.argv;
const cwd = process.cwd();

function showCommandHelp(cmd: string | undefined): void {
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log(
      [
        "Usage: cdh <command> [options]",
        "",
        "Commands:",
        "  init               Initialize a new concept-design repo",
        "  doctor             Check harness and repo health",
        "  rules              Run all rules and report violations",
        "  verify             Run verification stages (--tier quick|ship)",
        "  ship               Preflight, verify, and ship changes (--confirm to commit, --no-review --no-ci)",
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
        "  --format           Output format for sync-graph/sync-diagnostics",
        "",
        `Run 'cdh <command> --help' for command-specific options.`,
      ].join("\n")
    );
    return;
  }

  switch (cmd) {
    case "init":
      console.log("Usage: cdh init\n\nScaffold a new concept-design repo with directory structure,\nconfig file, and repo contract.");
      break;
    case "doctor":
      console.log("Usage: cdh doctor\n\nCheck harness and repo health. Reports missing directories,\nspec files, test files, and contract validity.");
      break;
    case "rules":
      console.log("Usage: cdh rules\n\nRun all rules (R1-R10) and report violations with severity.");
      break;
    case "verify":
      console.log(
        [
          "Usage: cdh verify [--tier quick|ship]",
          "",
          "  --tier quick   Typecheck and rules (default, runs on agent end)",
          "  --tier ship     Full verification: journal, typecheck, rules, tests,",
          "                  surface-coverage, legibility, sync-diagnostics",
        ].join("\n")
      );
      break;
    case "ship":
      console.log(
        [
          "Usage: cdh ship [--confirm|--execute] [--no-review] [--no-ci]",
          "",
          "Preflight, verify, commit, branch, push, and create PR.",
          "  --confirm, --execute   Execute git mutations (commit/branch/push/PR)",
          "                          Without this flag, ship only preflights and verifies.",
          "  --no-review            Skip review stage",
          "  --no-ci                Skip CI stage",
        ].join("\n")
      );
      break;
    case "trace":
      console.log("Usage: cdh trace <Concept.action>\n\nShow all syncs involving a concept action.\nExample: cdh trace Labeling.addLabel");
      break;
    case "syncs":
      console.log("Usage: cdh syncs [--concept <name>]\n\nList all synchronizations, optionally filtered by concept.");
      break;
    case "sync-graph":
      console.log(
        [
          "Usage: cdh sync-graph [--format report|json|mermaid|dot]",
          "",
          "Build and display the sync dependency graph.",
          "  --format report   Human-readable report (default)",
          "  --format json      JSON output",
          "  --format mermaid   Mermaid diagram",
          "  --format dot       Graphviz DOT output",
        ].join("\n")
      );
      break;
    case "sync-diagnostics":
      console.log(
        [
          "Usage: cdh sync-diagnostics [--format report|json]",
          "",
          "Run diagnostics on syncs: unknown actions, missing tests, orphaned actions,",
          "untested branches, missing respond, heavy where clauses.",
          "Exits 1 if any warnings are found.",
          "  --format report   Human-readable report (default)",
          "  --format json      JSON output",
        ].join("\n")
      );
      break;
    case "concepts":
      console.log("Usage: cdh concepts\n\nList all concepts with action and query counts.");
      break;
    case "concept":
      console.log("Usage: cdh concept <name>\n\nShow detailed surface for a concept including its spec.\nExample: cdh concept Labeling");
      break;
    case "spec-check":
      console.log("Usage: cdh spec-check <concept-name>\n\nCheck if a concept's spec file matches its code surface.\nExits 1 if differences are found.");
      break;
    case "spec-sync":
      console.log(
        [
          "Usage: cdh spec-sync <concept-name> [--dry-run]",
          "Auto-update a spec file to match code surface.",
          "  --dry-run   Preview changes without writing",
        ].join("\n")
      );
      break;
    case "doc":
      console.log("Usage: cdh doc <key>\n\nRead a design document by its key from design/index.json docs.\nExample: cdh doc testing-conventions");
      break;
    default:
      console.error(`Unknown command: ${cmd}`);
  }
}

async function getContract(config: CdhConfig) {
  try {
    return (await loadRepoContract(cwd, config)).contract;
  } catch (err) {
    console.error(
      "Failed to load repo contract from design/index.json:",
      err instanceof Error ? err.message : String(err)
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  const config = await loadConfig(cwd);

  if (args.includes("--help") || args.includes("-h")) {
    showCommandHelp(command);
    return;
  }

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
      const tier = tierIndex >= 0 && args[tierIndex + 1] ? (args[tierIndex + 1] as "quick" | "ship") : "quick";

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
        tier,
      });

      console.log(`\nVerification (${tier}):`);
      const lines = formatStageResults(results);
      for (const line of lines) {
        console.log(line);
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
      if (!actionRef?.includes(".")) {
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
        const concepts = await discoverConcepts(cwd, config, contract);
        const names = concepts.map((c) => c.name).sort();
        console.error(`Concept '${name}' not found. Available concepts: ${names.length > 0 ? names.join(", ") : "(none)"}`);
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
        const concepts = await discoverConcepts(cwd, config, contract);
        const names = concepts.map((c) => c.name).sort();
        console.error(`Concept '${name}' not found or has no spec file. Available concepts: ${names.length > 0 ? names.join(", ") : "(none)"}`);
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

      let contract: Awaited<ReturnType<typeof loadRepoContract>>["contract"] | undefined;
      try {
        contract = (await loadRepoContract(cwd, config)).contract;
        checks.push({ name: "repo-contract", status: "PASS", detail: "design/index.json is valid." });
      } catch (err) {
        checks.push({
          name: "repo-contract",
          status: "FAIL",
          detail: err instanceof Error ? err.message : "Invalid contract",
        });
      }

      if (contract) {
        const conceptsRoot = path.resolve(cwd, config.paths.concepts);
        checks.push({
          name: "concepts-dir",
          status: existsSync(conceptsRoot) ? "PASS" : "FAIL",
          detail: existsSync(conceptsRoot) ? config.paths.concepts : `${config.paths.concepts} does not exist`,
        });

        const syncsRoot = path.resolve(cwd, config.paths.syncs);
        checks.push({
          name: "syncs-dir",
          status: existsSync(syncsRoot) ? "PASS" : "FAIL",
          detail: existsSync(syncsRoot) ? config.paths.syncs : `${config.paths.syncs} does not exist`,
        });

        const specsDir = path.resolve(cwd, contract.specsDir);
        checks.push({
          name: "specs-dir",
          status: existsSync(specsDir) ? "PASS" : "FAIL",
          detail: existsSync(specsDir) ? contract.specsDir : `${contract.specsDir} does not exist`,
        });

        for (const [key, docPath] of Object.entries(contract.docs)) {
          checks.push({
            name: `doc:${key}`,
            status: existsSync(path.resolve(cwd, docPath)) ? "PASS" : "WARN",
            detail: docPath,
          });
        }

        const concepts = await discoverConcepts(cwd, config, contract);
        const syncs = await discoverSyncs(cwd, config);

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
          detail: existsSync(journalDir)
            ? config.paths.journal
            : `${config.paths.journal} does not exist (created on first run)`,
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
      const confirm = args.includes("--confirm") || args.includes("--execute");

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
      const runId = journal.getRunId() ?? "unknown";

      const results = await runVerification({
        cwd,
        config,
        contract,
        ruleEngine: engine,
        journal,
        tier: "ship",
      });

      for (const line of formatStageResults(results)) {
        console.log(line);
      }

      const failed = results.filter((r) => r.status === "fail");
      if (failed.length > 0) {
        console.log(`\n${failed.length} stage(s) failed. Ship aborted.`);
        process.exit(1);
      }

      console.log("\nAll verification stages passed.");

      if (!confirm) {
        console.log(`\nShip ready. Run 'cdh ship --confirm' (or --execute) to commit and branch.`);
        break;
      }

      if (config.ship.confirm === "never") {
        console.log("\nGit mutation disabled by config (ship.confirm: never).");
        break;
      }

      console.log("\nCommitting changes...");

      const commitResult = commitShip(cwd, config, runId, preflight.touched);
      if (!commitResult.ok) {
        console.error(`Commit failed: ${commitResult.errors.join("; ")}`);
        process.exit(1);
      }

      console.log(`Committed: ${commitResult.commitSha}`);

      if (config.ship.branchPrefix) {
        console.log("\nCreating branch...");
        const branchResult = createShipBranch(cwd, config, runId);

        if (!branchResult.ok) {
          console.error(`Branch creation failed: ${branchResult.errors.join("; ")}`);
          process.exit(1);
        }

        console.log(`Branch: ${branchResult.branch}`);

        const branchName = branchResult.branch;
        if (branchName && config.ship.push) {
          const pushResult = pushBranch(cwd, "origin", branchName);

          if (pushResult.ok) {
            console.log(`Pushed: ${branchName}`);

            if (config.ship.createPr) {
              const prResult = createPullRequest(cwd, branchName, `CDH Ship ${runId}`);
              if (prResult.ok) {
                console.log(`PR created: ${prResult.prUrl}`);
              } else {
                console.log(`PR creation failed: ${prResult.errors.join("; ")}`);
              }
            }
          } else {
            console.log(`Push failed: ${pushResult.errors.join("; ")}`);
          }
        }
      }

      console.log("\nShip complete.");
      break;
    }

    case "init": {
      const { mkdirSync, writeFileSync } = await import("node:fs");

      const dirs = [
        path.join(cwd, "src", "concepts"),
        path.join(cwd, "src", "syncs"),
        path.join(cwd, "design", "concepts"),
        path.join(cwd, "design", "background"),
        path.join(cwd, "design", "journal"),
      ];

      for (const dir of dirs) {
        mkdirSync(dir, { recursive: true });
        console.log(`  create  ${path.relative(cwd, dir)}/`);
      }

      const cdhConfigPath = path.join(cwd, ".pi", "cdh.json");
      const settingsPath = path.join(cwd, ".pi", "settings.json");

      if (!existsSync(cdhConfigPath)) {
        mkdirSync(path.dirname(cdhConfigPath), { recursive: true });
        writeFileSync(cdhConfigPath, JSON.stringify({
          paths: {
            concepts: "src/concepts",
            syncs: "src/syncs",
            designIndex: "design/index.json",
            journal: "design/journal",
          },
          rules: { importAllowlist: { syncs: ["@engine"] }, helperMethodAllowlist: [] },
          testing: { errorAssertionPatterns: ["expectError(", ".error"] },
          verify: {
            onAgentEnd: ["typecheck", "rules:changed"],
            onShipLocal: ["journal-health", "typecheck", "rules:all", "tests:changed", "tests:all", "surface-coverage", "sync-tests", "legibility"],
            optionalStages: ["smoke"],
            autofixRetries: 2,
            lineCoverageInfoThreshold: 85,
            syncDiagnostics: "warn",
          },
          catalogPaths: [],
          ship: { confirm: "interactive", branchPrefix: "cdh/", review: true, push: true, createPr: true, ci: true },
          ci: { provider: "github", workflow: "ci.yml" },
          frontend: { enabled: false },
        }, null, 2));
        console.log(`  create  ${path.relative(cwd, cdhConfigPath)}`);
      } else {
        console.log(`  exists  ${path.relative(cwd, cdhConfigPath)}`);
      }

      if (!existsSync(settingsPath)) {
        mkdirSync(path.dirname(settingsPath), { recursive: true });
        writeFileSync(settingsPath, JSON.stringify({ packages: ["@sdg/cdh"] }, null, 2));
        console.log(`  create  ${path.relative(cwd, settingsPath)}`);
      } else {
        console.log(`  exists  ${path.relative(cwd, settingsPath)}`);
      }

      const designIndexPath = path.join(cwd, "design", "index.json");
      if (!existsSync(designIndexPath)) {
        writeFileSync(designIndexPath, JSON.stringify({
          specsDir: "design/concepts",
          docs: {
            "concept-design-overview": "design/background/concept-design-overview.md",
            "concept-spec-conventions": "design/background/concept-specifications.md",
            "implementation-conventions": "design/background/implementing-concepts.md",
            "sync-conventions": "design/background/implementing-synchronizations.md",
            "testing-conventions": "design/background/testing-concepts.md",
            "architecture": "design/background/architecture.md",
          },
          helpers: {
            testingModule: "@utils/testing.ts",
            exports: ["setupTestDb", "trace", "track", "testAction", "expectError", "setupSyncTest"],
          },
          scripts: { test: "bun test", typecheck: "bun run check", start: "bun run start" },
          health: { path: "/api/health" },
        }, null, 2));
        console.log(`  create  ${path.relative(cwd, designIndexPath)}`);
      } else {
        console.log(`  exists  ${path.relative(cwd, designIndexPath)}`);
      }

      console.log("\nCDH project initialized. Next steps:");
      console.log("  1. Create src/concepts/<Name>/<Name>Concept.ts");
      console.log("  2. Create design/concepts/<name>.md (spec)");
      console.log("  3. Run 'cdh rules' to check compliance");
      break;
    }

    case undefined:
    case "--help":
    case "-h":
      console.log(
        [
          "Usage: cdh <command> [options]",
          "",
          "Commands:",
          "  init               Initialize a new concept-design repo",
          "  doctor             Check harness and repo health",
          "  rules              Run all rules and report violations",
          "  verify             Run verification stages (--tier quick|ship)",
          "  ship               Preflight, verify, and ship changes (--confirm|--execute to commit, --no-review --no-ci)",
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
          "  --format           Output format for sync-graph/sync-diagnostics",
          "  --execute          Execute ship mutations (alias for --confirm)",
          "",
          `Run 'cdh <command> --help' for command-specific options.`,
        ].join("\n")
      );
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main();
