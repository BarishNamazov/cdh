#!/usr/bin/env bun

import { existsSync } from "node:fs";
import path from "node:path";
import { loadConfig } from "../src/config.ts";
import { loadRepoContract } from "../src/repo-contract.ts";
import { Journal } from "../src/journal/journal.ts";
import { createRuleEngine } from "../src/rules/rule-engine.ts";
import { runVerification } from "../src/verify/runner.ts";

const [, , command, ...args] = Bun.argv;
const cwd = process.cwd();

async function main(): Promise<void> {
  const config = await loadConfig(cwd);

  switch (command) {
    case "rules": {
      let contract;
      try {
        contract = (await loadRepoContract(cwd, config)).contract;
      } catch {
        console.error("Failed to load repo contract from design/index.json.");
        process.exit(1);
      }

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

      let contract;
      try {
        contract = (await loadRepoContract(cwd, config)).contract;
      } catch {
        console.error("Failed to load repo contract from design/index.json.");
        process.exit(1);
      }

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
        const icon = result.status === "pass" ? "PASS" : result.status === "skip" ? "SKIP" : "FAIL";
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

    case "doctor":
    case "init":
      console.log(`cdh ${command} is not implemented yet.`);
      break;

    case undefined:
    case "--help":
    case "-h":
      console.log([
        "Usage: cdh <init|doctor|rules|verify>",
        "",
        "Commands:",
        "  init     Initialize a new concept-design repo",
        "  doctor   Check harness and repo health",
        "  rules    Run all rules and report violations",
        "  verify   Run verification stages (--tier quick|ship)",
        "",
        "Options:",
        "  --tier   quick (default) or ship"
      ].join("\n"));
      break;

    default:
      console.error(`Unknown command: ${command}`);
      process.exitCode = 1;
  }
}

main();
