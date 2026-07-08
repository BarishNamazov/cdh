import { describe, expect, test } from "bun:test";
import type { CdhConfig } from "../config.ts";
import type { Journal } from "../journal/journal.ts";
import type { RepoContract } from "../repo-contract.ts";
import type { RuleEngine, RuleHit } from "../rules/types.ts";
import { runVerification } from "./runner.ts";

const baseConfig: CdhConfig = {
  paths: { concepts: "src/concepts", syncs: "src/syncs", designIndex: "design/index.json", journal: "design/journal" },
  rules: { importAllowlist: { syncs: ["@engine"] }, helperMethodAllowlist: [] },
  testing: { errorAssertionPatterns: ["expectError("] },
  verify: {
    onAgentEnd: [],
    onShipLocal: [],
    optionalStages: [],
    autofixRetries: 2,
    lineCoverageInfoThreshold: 85,
    syncDiagnostics: "warn",
  },
  catalogPaths: [],
  ship: { confirm: "interactive" as const, branchPrefix: "cdh/", review: true, push: true, createPr: true, ci: true },
  ci: { provider: "github", workflow: "ci.yml" },
  frontend: { enabled: false },
};

const baseContract: RepoContract = {
  specsDir: "design/concepts",
  docs: {},
  helpers: { testingModule: "@utils/testing.ts", exports: [] },
  scripts: { test: "true", typecheck: "true", start: "true" },
  health: { path: "/api/health" },
};

interface JournalSpy {
  journal: Journal;
  startedEvents: Array<{ tier: string; stages: string[] }>;
  stageEvents: Array<{ stage: string; status: string; durationMs: number; summary: string }>;
  finishedEvents: Array<{ tier: string; ok: boolean; failures: string[] }>;
}

function makeJournalSpy(): JournalSpy {
  const startedEvents: Array<{ tier: string; stages: string[] }> = [];
  const stageEvents: Array<{ stage: string; status: string; durationMs: number; summary: string }> = [];
  const finishedEvents: Array<{ tier: string; ok: boolean; failures: string[] }> = [];

  const journal = {
    initRun() {},
    emit() {},
    emitGateBlocked() {},
    emitRuleWarning() {},
    emitSuppression() {},
    emitVerificationStarted(tier: string, stages: string[]) {
      startedEvents.push({ tier, stages });
    },
    emitVerificationStage(stage: string, status: string, durationMs: number, summary: string) {
      stageEvents.push({ stage, status, durationMs, summary });
    },
    emitVerificationFinished(tier: string, ok: boolean, failures: string[]) {
      finishedEvents.push({ tier, ok, failures });
    },
    emitDecision() {},
    emitCatalogCopy() {},
    isDegraded() {
      return false;
    },
    getEvents() {
      return [];
    },
    getRunId() {
      return "test-run";
    },
    generateReport() {
      return "";
    },
  } as unknown as Journal;

  return { journal, startedEvents, stageEvents, finishedEvents };
}

function makeRuleEngine(hits: RuleHit[] = []): RuleEngine {
  return {
    checkContent() {
      return [];
    },
    checkFile() {
      return Promise.resolve([]);
    },
    checkRepo() {
      return Promise.resolve(hits);
    },
  };
}

describe("runVerification", () => {
  test("quick tier returns results for typecheck and rules:all stages", async () => {
    const spy = makeJournalSpy();

    const results = await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: makeRuleEngine(),
      journal: spy.journal,
      tier: "quick",
    });

    expect(results.length).toBe(2);
    expect(results.map((r) => r.stage)).toEqual(["typecheck", "rules:all"]);
    expect(results.every((r) => r.status === "pass")).toBe(true);
  });

  test("ship tier returns results for all 7 stages", async () => {
    const spy = makeJournalSpy();

    const results = await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: makeRuleEngine(),
      journal: spy.journal,
      tier: "ship",
    });

    expect(results.length).toBe(7);
    expect(results.map((r) => r.stage)).toEqual([
      "journal-health",
      "typecheck",
      "rules:all",
      "tests:all",
      "surface-coverage",
      "legibility",
      "sync-diagnostics",
    ]);
  });

  test("emits verification_started journal event", async () => {
    const spy = makeJournalSpy();

    await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: makeRuleEngine(),
      journal: spy.journal,
      tier: "quick",
    });

    expect(spy.startedEvents.length).toBe(1);
    expect(spy.startedEvents[0].tier).toBe("quick");
    expect(spy.startedEvents[0].stages).toEqual(["typecheck", "rules:all"]);
  });

  test("emits verification_stage events for each stage", async () => {
    const spy = makeJournalSpy();

    await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: makeRuleEngine(),
      journal: spy.journal,
      tier: "quick",
    });

    expect(spy.stageEvents.length).toBe(2);
    expect(spy.stageEvents.map((e) => e.stage)).toEqual(["typecheck", "rules:all"]);
    for (const ev of spy.stageEvents) {
      expect(ev.status).toBe("pass");
      expect(typeof ev.durationMs).toBe("number");
      expect(typeof ev.summary).toBe("string");
    }
  });

  test("emits verification_finished journal event", async () => {
    const spy = makeJournalSpy();

    await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: makeRuleEngine(),
      journal: spy.journal,
      tier: "quick",
    });

    expect(spy.finishedEvents.length).toBe(1);
    expect(spy.finishedEvents[0].tier).toBe("quick");
    expect(spy.finishedEvents[0].ok).toBe(true);
    expect(spy.finishedEvents[0].failures).toEqual([]);
  });

  test("failed stages are tracked in verification_finished", async () => {
    const spy = makeJournalSpy();

    const blockingHits: RuleHit[] = [
      { rule: "R07", severity: "block", path: "src/foo.ts", message: "missing test" },
      { rule: "R08", severity: "fail-ship", path: "src/bar.ts", message: "no track" },
    ];
    const engine = makeRuleEngine(blockingHits);

    const results = await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: engine,
      journal: spy.journal,
      tier: "ship",
    });

    const failedStages = results.filter((r) => r.status === "fail");
    expect(failedStages.length).toBeGreaterThanOrEqual(1);
    expect(failedStages.map((r) => r.stage)).toContain("rules:all");

    expect(spy.finishedEvents.length).toBe(1);
    expect(spy.finishedEvents[0].ok).toBe(false);
    expect(spy.finishedEvents[0].failures).toContain("rules:all");
  });

  test("result objects have the correct StageResult structure", async () => {
    const spy = makeJournalSpy();

    const results = await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: makeRuleEngine(),
      journal: spy.journal,
      tier: "quick",
    });

    for (const result of results) {
      expect(result.stage).toBeString();
      expect(["pass", "fail", "warn", "skip"]).toContain(result.status);
      expect(typeof result.durationMs).toBe("number");
      expect(result.summary).toBeString();
    }
  });

  test("ship tier emits started event with all stage names", async () => {
    const spy = makeJournalSpy();

    await runVerification({
      cwd: "/tmp",
      config: baseConfig,
      contract: baseContract,
      ruleEngine: makeRuleEngine(),
      journal: spy.journal,
      tier: "ship",
    });

    expect(spy.startedEvents[0].stages).toEqual([
      "journal-health",
      "typecheck",
      "rules:all",
      "tests:all",
      "surface-coverage",
      "legibility",
      "sync-diagnostics",
    ]);
  });
});
