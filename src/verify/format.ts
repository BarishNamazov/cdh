import type { StageResult } from "./types.ts";

export function stageIcon(status: StageResult["status"]): string {
  switch (status) {
    case "pass":
      return "PASS";
    case "skip":
      return "SKIP";
    case "warn":
      return "WARN";
    default:
      return "FAIL";
  }
}

export function formatStageResults(results: StageResult[]): string[] {
  return results.map(
    (result) => `  ${stageIcon(result.status)}  ${result.stage} (${result.durationMs}ms) — ${result.summary}`
  );
}
