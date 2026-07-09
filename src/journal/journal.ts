import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CdhConfig } from "../config.ts";
import { generateRunId, joinParentRun } from "../run-model.ts";
import type { CdhEvent, JournalEntry } from "./types.ts";
import { JsonlWriter } from "./writer.ts";

export class Journal {
  private writer: JsonlWriter | null = null;
  private runId: string | null = null;
  private degraded = false;
  private events: JournalEntry[] = [];
  private runDir: string | null = null;

  constructor(
    private readonly cwd: string,
    private readonly config: CdhConfig
  ) {}

  initRun(env: Record<string, string | undefined>, taskPrompt?: string): void {
    if (joinParentRun(env)) {
      this.runId = env.CDH_RUN_ID ?? null;
      this.runDir = env.CDH_RUN_DIR ?? null;
    } else {
      this.runId = generateRunId();
      this.runDir = path.join(this.cwd, this.config.paths.journal, "runs", this.runId);
      mkdirSync(this.runDir, { recursive: true });
      env.CDH_RUN_ID = this.runId;
      env.CDH_RUN_DIR = this.runDir;
    }

    if (this.runDir) {
      const eventsPath = path.join(this.runDir, "events.jsonl");
      this.writer = new JsonlWriter(eventsPath);
    } else {
      this.degraded = true;
    }

    if (taskPrompt) {
      this.emit("task_started", { prompt: taskPrompt });
    }
  }

  emit(type: CdhEvent["type"], data: CdhEvent["data"]): void {
    const event: CdhEvent = { type, data } as CdhEvent;
    const entry: JournalEntry = {
      runId: this.runId ?? "unknown",
      seq: this.writer?.nextSequence() ?? this.events.length + 1,
      ts: new Date().toISOString(),
      event,
    };

    this.events.push(entry);

    if (this.writer && !this.writer.isDegraded()) {
      try {
        this.writer.writeEntry(entry);
      } catch {
        this.degraded = true;
      }
    }
  }

  emitGateBlocked(rule: string, toolName: string, filePath: string, reason: string): void {
    this.emit("gate_blocked", { rule, toolName, path: filePath, reason });
  }

  emitRuleWarning(rule: string, filePath: string, detail: string): void {
    this.emit("rule_warning", { rule, path: filePath, detail });
  }

  emitSuppression(rule: string, filePath: string, reason: string): void {
    this.emit("suppression", { rule, path: filePath, reason });
  }

  emitVerificationStarted(tier: string, stages: string[]): void {
    this.emit("verification_started", { tier, stages });
  }

  emitVerificationStage(
    stage: string,
    status: "pass" | "fail" | "warn" | "skip",
    durationMs: number,
    summary: string,
    detailPath?: string
  ): void {
    this.emit("verification_stage", { stage, status, durationMs, summary, detailPath });
  }

  emitVerificationFinished(tier: string, ok: boolean, failures: string[]): void {
    this.emit("verification_finished", { tier, ok, failures });
  }

  emitDecision(title: string, body: string, alternatives?: string[]): void {
    this.emit("decision", { title, body, alternatives });
  }

  emitCatalogCopy(id: string, version: string, as: string | undefined, files: string[]): void {
    this.emit("catalog_copy", { id, version, as, files });
  }

  isDegraded(): boolean {
    if (this.degraded) return true;
    if (this.writer?.isDegraded()) return true;
    return false;
  }

  getEvents(): JournalEntry[] {
    return [...this.events];
  }

  getRunId(): string | null {
    return this.runId;
  }

  generateReport(taskPrompt: string): string {
    const reportPath = this.runDir ? path.join(this.runDir, "report.md") : null;

    const events = this.events;
    const verifications = events.filter((e) => e.event.type === "verification_stage");
    const decisions = events.filter((e) => e.event.type === "decision");
    const warnings = events.filter((e) => e.event.type === "rule_warning");
    const suppressions = events.filter((e) => e.event.type === "suppression");

    const allPassed = verifications.every((e) => {
      const ev = e.event as Extract<CdhEvent, { type: "verification_stage" }>;
      return ev.data.status === "pass" || ev.data.status === "skip";
    });

    const report = [
      `# Run ${this.runId} - ${taskPrompt.split("\n")[0]?.slice(0, 80) || "task"}`,
      "",
      `**Date:** ${new Date().toISOString()} | **Result:** ${allPassed ? "PASS" : "FAIL"} | **Cost:** unknown`,
      "",
      "## Task",
      "",
      taskPrompt,
      "",
      "## What Happened",
      "",
      ...events.map((e) => {
        const t = e.event;
        if (t.type === "verification_stage") {
          const d = (t as Extract<CdhEvent, { type: "verification_stage" }>).data;
          return `- ${t.type}: ${d.stage} ${d.status} (${d.durationMs}ms) - ${d.summary}`;
        }
        if (t.type === "decision") {
          return `- decision: ${(t as Extract<CdhEvent, { type: "decision" }>).data.title}`;
        }
        return `- ${t.type}`;
      }),
      "",
      "## Verification",
      "",
      "| Stage | Status | Duration | Summary |",
      "|-------|--------|----------|---------|",
      ...verifications.map((e) => {
        const d = (e.event as Extract<CdhEvent, { type: "verification_stage" }>).data;
        return `| ${d.stage} | ${d.status} | ${d.durationMs}ms | ${d.summary} |`;
      }),
      "",
      "## Decisions",
      "",
      ...decisions.map((e) => {
        const d = (e.event as Extract<CdhEvent, { type: "decision" }>).data;
        const alts = d.alternatives ? `\nAlternatives: ${d.alternatives.join(", ")}` : "";
        return `### ${d.title}\n\n${d.body}${alts}\n`;
      }),
      "",
      "## Follow-Ups",
      "",
      warnings.length > 0
        ? [
            "Unresolved warnings:",
            ...warnings.map((e) => {
              const d = (e.event as Extract<CdhEvent, { type: "rule_warning" }>).data;
              return `- ${d.rule}: ${d.path} - ${d.detail}`;
            }),
          ]
        : ["No unresolved warnings."],
      "",
      suppressions.length > 0
        ? [
            "Suppressions:",
            ...suppressions.map((e) => {
              const d = (e.event as Extract<CdhEvent, { type: "suppression" }>).data;
              return `- ${d.rule}: ${d.path} - ${d.reason}`;
            }),
          ]
        : [],
    ]
      .flat()
      .join("\n");

    if (reportPath) {
      writeFileSync(reportPath, report, "utf8");
      appendReportIndex(this.cwd, this.config, this.runId ?? "unknown", taskPrompt);
    }

    return report;
  }
}

function appendReportIndex(cwd: string, config: CdhConfig, runId: string, taskPrompt: string): void {
  const indexPath = path.join(cwd, config.paths.journal, "INDEX.md");
  const firstLine = taskPrompt.split("\n")[0]?.slice(0, 80) || "task";
  const indexDir = path.dirname(indexPath);

  if (!existsSync(indexDir)) {
    mkdirSync(indexDir, { recursive: true });
  }

  if (!existsSync(indexPath)) {
    writeFileSync(indexPath, "# Journal Index\n\n| Run ID | Date | Task |\n|--------|------|------|\n", "utf8");
  }

  appendFileSync(indexPath, `| ${runId} | ${new Date().toISOString().slice(0, 10)} | ${firstLine} |\n`, "utf8");
}
