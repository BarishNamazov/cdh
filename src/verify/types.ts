import { type CdhConfig } from "../config.ts";
import { type RepoContract } from "../repo-contract.ts";
import { type RuleEngine } from "../rules/types.ts";
import { type Journal } from "../journal/journal.ts";

export interface StageResult {
  stage: string;
  status: "pass" | "fail" | "warn" | "skip";
  durationMs: number;
  summary: string;
  detailPath?: string;
}

export type StageFn = (ctx: StageContext) => Promise<StageResult>;

export interface StageContext {
  cwd: string;
  config: CdhConfig;
  contract: RepoContract;
  ruleEngine: RuleEngine;
  journal: Journal;
  tier: "quick" | "ship";
}
