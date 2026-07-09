import type { CdhConfig } from "../config.ts";
import type { Journal } from "../journal/journal.ts";
import type { RepoContract } from "../repo-contract.ts";
import type { RuleEngine } from "../rules/types.ts";
import { buildStagePlan } from "./stage-registry.ts";
import type { StageContext, StageFn, StageResult } from "./types.ts";

export interface RunVerificationOptions {
  cwd: string;
  config: CdhConfig;
  contract: RepoContract;
  ruleEngine: RuleEngine;
  journal: Journal;
  tier: "quick" | "ship";
  stages?: string[];
  onStageStart?: (stage: string, index: number, total: number) => void;
  onStageDone?: (result: StageResult, index: number, total: number) => void;
}

export async function runVerification(options: RunVerificationOptions): Promise<StageResult[]> {
  const { cwd, config, contract, ruleEngine, journal, tier } = options;
  const ctx: StageContext = { cwd, config, contract, ruleEngine, journal, tier };

  const stageList: [string, StageFn][] = buildStagePlan(config, tier, options.stages);

  const stageNames = stageList.map(([name]) => name);
  journal.emitVerificationStarted(tier, stageNames);

  const results: StageResult[] = [];

  const total = stageList.length;

  for (let i = 0; i < stageList.length; i++) {
    const [name, fn] = stageList[i]!;
    options.onStageStart?.(name, i, total);

    let result: StageResult;
    try {
      result = await fn(ctx);
    } catch (error) {
      result = {
        stage: name,
        status: "fail",
        durationMs: 0,
        summary: `Stage threw: ${error instanceof Error ? error.message : String(error)}`,
      };
    }

    options.onStageDone?.(result, i, total);

    journal.emitVerificationStage(result.stage, result.status, result.durationMs, result.summary, result.detailPath);

    results.push(result);
  }

  const ok = results.every((r) => r.status === "pass" || r.status === "skip");
  const failures = results.filter((r) => r.status === "fail").map((r) => r.stage);

  journal.emitVerificationFinished(tier, ok, failures);

  return results;
}
