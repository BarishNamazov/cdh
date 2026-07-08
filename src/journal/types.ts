export type CdhEvent =
  | { type: "task_started"; data: { prompt: string } }
  | { type: "gate_blocked"; data: { rule: string; toolName: string; path: string; reason: string } }
  | { type: "rule_warning"; data: { rule: string; path: string; detail: string } }
  | { type: "suppression"; data: { rule: string; path: string; reason: string } }
  | { type: "verification_started"; data: { tier: string; stages: string[] } }
  | {
      type: "verification_stage";
      data: {
        stage: string;
        status: "pass" | "fail" | "warn" | "skip";
        durationMs: number;
        summary: string;
        detailPath?: string;
      };
    }
  | { type: "verification_finished"; data: { tier: string; ok: boolean; failures: string[] } }
  | { type: "autofix_attempt"; data: { n: number; of: number; failuresFedBack: string[] } }
  | { type: "agent_spawned"; data: { agent: string; task: string; childSessionFile: string } }
  | { type: "agent_finished"; data: { agent: string; ok: boolean; usage: unknown } }
  | { type: "decision"; data: { title: string; body: string; alternatives?: string[] } }
  | { type: "catalog_copy"; data: { id: string; version: string; as?: string; files: string[] } }
  | { type: "ship_preflight"; data: { status: "pass" | "fail" | "confirm"; detail: string } }
  | { type: "ship_started"; data: Record<string, never> }
  | { type: "ship_finished"; data: { ok: boolean } }
  | { type: "ci_triggered"; data: { ref: string; workflow: string } }
  | { type: "ci_status"; data: { status: string; url?: string } }
  | {
      type: "cost_snapshot";
      data: {
        model?: string;
        tokens: { input: number; output: number; cacheRead: number; cacheWrite: number } | "unknown";
        costUsd: number | "unknown";
      };
    };

export interface JournalEntry {
  runId: string;
  seq: number;
  ts: string;
  event: CdhEvent;
}
