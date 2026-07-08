import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";
import type { RuleEngine } from "../rules/types.ts";
import type { Journal } from "../journal/journal.ts";
import {
  journalHealthStage,
  legibilityStage,
  rulesStage,
  surfaceCoverageStage,
  syncDiagnosticsStage,
  testStage,
  typecheckStage
} from "./stages.ts";
import { type StageContext, type StageFn, type StageResult } from "./types.ts";

export interface RunVerificationOptions {
  cwd: string;
  config: CdhConfig;
  contract: RepoContract;
  ruleEngine: RuleEngine;
  journal: Journal;
  tier: "quick" | "ship";
  stages?: string[];
}

export async function runVerification(options: RunVerificationOptions): Promise<StageResult[]> {
  const { cwd, config, contract, ruleEngine, journal, tier } = options;
  const ctx: StageContext = { cwd, config, contract, ruleEngine, journal, tier };

  const stageList: [string, StageFn][] = [];

  if (tier === "quick") {
    stageList.push(["typecheck", typecheckStage]);
    stageList.push(["rules:all", (ctx) => rulesStage(ctx, "all")]);
  } else {
    stageList.push(["journal-health", journalHealthStage]);
    stageList.push(["typecheck", typecheckStage]);
    stageList.push(["rules:all", (ctx) => rulesStage(ctx, "all")]);
    stageList.push(["tests:all", (ctx) => testStage(ctx, "all")]);
    stageList.push(["surface-coverage", surfaceCoverageStage]);
    stageList.push(["legibility", legibilityStage]);
    stageList.push(["sync-diagnostics", syncDiagnosticsStage]);
  }

  const stageNames = stageList.map(([name]) => name);
  journal.emitVerificationStarted(tier, stageNames);

  const results: StageResult[] = [];

  for (const [name, fn] of stageList) {
    let result: StageResult;
    try {
      result = await fn(ctx);
    } catch (error) {
      result = {
        stage: name,
        status: "fail",
        durationMs: 0,
        summary: `Stage threw: ${error instanceof Error ? error.message : String(error)}`
      };
    }

    journal.emitVerificationStage(
      result.stage,
      result.status,
      result.durationMs,
      result.summary,
      result.detailPath
    );

    results.push(result);
  }

  const ok = results.every((r) => r.status === "pass" || r.status === "skip");
  const failures = results
    .filter((r) => r.status === "fail")
    .map((r) => r.stage);

  journal.emitVerificationFinished(tier, ok, failures);

  return results;
}
