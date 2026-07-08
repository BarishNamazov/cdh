import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { runSyncDiagnostics } from "../tools/sync-diagnostics.ts";
import type { StageContext, StageResult } from "./types.ts";

async function runCommand(
  command: string,
  options: {
    cwd: string;
    timeout?: number;
    env?: Record<string, string | undefined>;
  }
): Promise<{ stdout: string; stderr: string }> {
  const proc = Bun.spawn(["sh", "-c", command], {
    cwd: options.cwd,
    env: { ...Bun.env, ...options.env },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  const timer = options.timeout
    ? setTimeout(() => {
        proc.kill();
      }, options.timeout)
    : undefined;

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (timer) clearTimeout(timer);

  if (exitCode !== 0) {
    const error = new Error(`Command exited with code ${exitCode}: ${stderr.slice(0, 500)}`);
    throw error;
  }

  return { stdout, stderr };
}

export async function journalHealthStage(ctx: StageContext): Promise<StageResult> {
  const start = Date.now();
  const degraded = ctx.journal.isDegraded();

  return {
    stage: "journal-health",
    status: degraded ? "fail" : "pass",
    durationMs: Date.now() - start,
    summary: degraded ? "Journal is degraded; event persistence may be lost." : "Journal is healthy.",
  };
}

export async function typecheckStage(ctx: StageContext): Promise<StageResult> {
  const start = Date.now();
  const command = ctx.contract.scripts.typecheck;

  try {
    await runCommand(command, { cwd: ctx.cwd, timeout: 120_000 });
    return {
      stage: "typecheck",
      status: "pass",
      durationMs: Date.now() - start,
      summary: "TypeScript typecheck passed.",
    };
  } catch (error) {
    const output = error instanceof Error ? error.message : String(error);
    return {
      stage: "typecheck",
      status: "fail",
      durationMs: Date.now() - start,
      summary: `TypeScript typecheck failed: ${output.slice(0, 200)}`,
    };
  }
}

export async function rulesStage(ctx: StageContext, scope: "changed" | "all"): Promise<StageResult> {
  const start = Date.now();
  const hits = await ctx.ruleEngine.checkRepo(scope);

  const blocked = hits.filter((h) => h.severity === "block");
  const warnings = hits.filter((h) => h.severity === "warn");
  const shipFail = hits.filter((h) => h.severity === "fail-ship");

  if (ctx.tier === "quick") {
    const quickFail = hits.filter((h) => h.severity === "block");
    const passed = quickFail.length === 0;
    return {
      stage: `rules:${scope}`,
      status: passed ? "pass" : "fail",
      durationMs: Date.now() - start,
      summary: passed
        ? "No blocking rule violations."
        : `${quickFail.length} blocking violation(s): ${quickFail.map((h) => `${h.rule} ${h.path}`).join(", ")}`,
    };
  }

  const failed = blocked.length + shipFail.length;
  const passed = failed === 0;

  return {
    stage: `rules:${scope}`,
    status: passed ? "pass" : "fail",
    durationMs: Date.now() - start,
    summary: passed
      ? `All rules pass. ${warnings.length} warning(s).`
      : `${failed} violation(s) — blocks: ${blocked.length}, ship-fails: ${shipFail.length}. ${warnings.length} warning(s).`,
  };
}

export async function testStage(ctx: StageContext, scope: "changed" | "all"): Promise<StageResult> {
  const start = Date.now();
  const command = ctx.contract.scripts.test;

  try {
    await runCommand(command, { cwd: ctx.cwd, timeout: 300_000 });
    return {
      stage: `tests:${scope}`,
      status: "pass",
      durationMs: Date.now() - start,
      summary: "All tests passed.",
    };
  } catch (error) {
    const output = error instanceof Error ? error.message : String(error);
    return {
      stage: `tests:${scope}`,
      status: "fail",
      durationMs: Date.now() - start,
      summary: `Tests failed: ${output.slice(0, 200)}`,
    };
  }
}

export async function surfaceCoverageStage(ctx: StageContext): Promise<StageResult> {
  const start = Date.now();

  if (!existsSync(path.resolve(ctx.cwd, ctx.config.paths.concepts))) {
    return {
      stage: "surface-coverage",
      status: "skip",
      durationMs: Date.now() - start,
      summary: "No concept sources found.",
    };
  }

  const surfaceOut = path.join(tmpdir(), `cdh-surface-${Date.now()}.jsonl`);
  const command = ctx.contract.scripts.test;

  try {
    await runCommand(command, {
      cwd: ctx.cwd,
      timeout: 300_000,
      env: { CDH_SURFACE_OUT: surfaceOut },
    });
  } catch {
    return {
      stage: "surface-coverage",
      status: "fail",
      durationMs: Date.now() - start,
      summary: "Coverage inconclusive because tests failed. Skipping coverage diff.",
    };
  }

  if (!existsSync(surfaceOut)) {
    return {
      stage: "surface-coverage",
      status: "fail",
      durationMs: Date.now() - start,
      summary: "No coverage artifact produced. Ensure concepts are wrapped with track().",
    };
  }

  const content = readFileSync(surfaceOut, "utf8");
  const lines = content.split("\n").filter((l) => l.trim());

  return {
    stage: "surface-coverage",
    status: "pass",
    durationMs: Date.now() - start,
    summary: `${lines.length} surface method call(s) recorded.`,
  };
}

export async function legibilityStage(ctx: StageContext): Promise<StageResult> {
  const start = Date.now();
  const hits = await ctx.ruleEngine.checkRepo("all");
  const r10hits = hits.filter((h) => h.rule === "R10");

  const passed = r10hits.length === 0;
  return {
    stage: "legibility",
    status: passed ? "pass" : "fail",
    durationMs: Date.now() - start,
    summary: passed ? "All tests have narration." : `${r10hits.length} test(s) lack trace() or console.log narration.`,
  };
}

export async function syncDiagnosticsStage(ctx: StageContext): Promise<StageResult> {
  const start = Date.now();
  const severity = ctx.config.verify.syncDiagnostics ?? "warn";

  if (severity === "off") {
    return {
      stage: "sync-diagnostics",
      status: "skip",
      durationMs: Date.now() - start,
      summary: "Sync diagnostics disabled by config (off).",
    };
  }

  const report = await runSyncDiagnostics(ctx.cwd, ctx.config, ctx.contract);
  const warns = report.diagnostics.filter((d) => d.severity === "warn");
  const infos = report.diagnostics.filter((d) => d.severity === "info");

  if (warns.length === 0 && infos.length === 0) {
    return {
      stage: "sync-diagnostics",
      status: "pass",
      durationMs: Date.now() - start,
      summary: `No issues found in ${report.syncs} sync(s).`,
    };
  }

  const status = severity === "fail-ship" ? "fail" : "warn";

  return {
    stage: "sync-diagnostics",
    status,
    durationMs: Date.now() - start,
    summary: `${warns.length} warning(s), ${infos.length} info(s) across ${report.syncs} sync(s).`,
  };
}
