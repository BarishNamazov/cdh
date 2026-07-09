import type { CdhConfig } from "../config.ts";
import {
  journalHealthStage,
  legibilityStage,
  rulesStage,
  surfaceCoverageStage,
  syncDiagnosticsStage,
  syncTestsStage,
  testStage,
  typecheckStage,
} from "./stages.ts";
import type { StageFn, StageResult } from "./types.ts";

export type VerificationTier = "quick" | "ship";

export const STAGE_REGISTRY = {
  "journal-health": journalHealthStage,
  typecheck: typecheckStage,
  "rules:changed": (ctx) => rulesStage(ctx, "changed"),
  "rules:all": (ctx) => rulesStage(ctx, "all"),
  "tests:changed": (ctx) => testStage(ctx, "changed"),
  "tests:all": (ctx) => testStage(ctx, "all"),
  "surface-coverage": surfaceCoverageStage,
  "sync-tests": syncTestsStage,
  legibility: legibilityStage,
  "sync-diagnostics": syncDiagnosticsStage,
} satisfies Record<string, StageFn>;

export type VerificationStageName = keyof typeof STAGE_REGISTRY;

export function getConfiguredStageNames(
  config: CdhConfig,
  tier: VerificationTier,
  requestedStages?: string[]
): string[] {
  if (requestedStages && requestedStages.length > 0) return requestedStages;
  return tier === "quick" ? config.verify.onAgentEnd : config.verify.onShipLocal;
}

export function buildStagePlan(
  config: CdhConfig,
  tier: VerificationTier,
  requestedStages?: string[]
): Array<[string, StageFn]> {
  return getConfiguredStageNames(config, tier, requestedStages).map((name) => [
    name,
    STAGE_REGISTRY[name as VerificationStageName] ?? unknownStage(name),
  ]);
}

function unknownStage(name: string): StageFn {
  return async (): Promise<StageResult> => ({
    stage: name,
    status: "fail",
    durationMs: 0,
    summary: `Unknown verification stage '${name}'. Known stages: ${Object.keys(STAGE_REGISTRY).join(", ")}`,
  });
}
