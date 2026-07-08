import { describe, expect, test, mock } from "bun:test";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";
import type { RuleEngine, RuleHit } from "../rules/types.ts";
import type { Journal } from "../journal/journal.ts";
import type { StageContext } from "./types.ts";
import { journalHealthStage, rulesStage, syncDiagnosticsStage } from "./stages.ts";

function baseConfig(overrides: Partial<CdhConfig["verify"]> = {}): CdhConfig {
  return {
    paths: { concepts: "src/concepts", syncs: "src/syncs", designIndex: "design/index.json", journal: "design/journal" },
    rules: { importAllowlist: { syncs: ["@engine"] }, helperMethodAllowlist: [] },
    testing: { errorAssertionPatterns: ["expectError("] },
    verify: {
      onAgentEnd: [], onShipLocal: [], optionalStages: [],
      autofixRetries: 2, lineCoverageInfoThreshold: 85, syncDiagnostics: "warn",
      ...overrides
    },
    catalogPaths: [],
    ship: { confirm: "interactive" as const, branchPrefix: "cdh/", review: true, push: true, createPr: true, ci: true },
    ci: { provider: "github", workflow: "ci.yml" },
    frontend: { enabled: false }
  };
}

const baseContract: RepoContract = {
  specsDir: "design/concepts",
  docs: {},
  helpers: { testingModule: "@utils/testing.ts", exports: [] },
  scripts: { test: "true", typecheck: "true", start: "true" },
  health: { path: "/api/health" }
};

function mockJournal(isDegradedResult: boolean = false) {
  return {
    initRun() {},
    emit() {},
    emitGateBlocked() {},
    emitRuleWarning() {},
    emitSuppression() {},
    emitVerificationStarted() {},
    emitVerificationStage() {},
    emitVerificationFinished() {},
    emitDecision() {},
    emitCatalogCopy() {},
    isDegraded() { return isDegradedResult; },
    getEvents() { return []; },
    getRunId() { return "test-run"; },
    generateReport(_task: string) { return ""; }
  } as unknown as Journal;
}

function mockRuleEngine(hits: RuleHit[] = []): RuleEngine {
  return {
    checkContent() { return []; },
    checkFile() { return Promise.resolve([]); },
    checkRepo() { return Promise.resolve(hits); }
  };
}

function makeContext(overrides: Partial<{
  tier: "quick" | "ship";
  degraded: boolean;
  ruleHits: RuleHit[];
  config: CdhConfig;
}> = {}): StageContext {
  return {
    cwd: "/tmp/test",
    config: overrides.config ?? baseConfig(),
    contract: baseContract,
    ruleEngine: mockRuleEngine(overrides.ruleHits ?? []),
    journal: mockJournal(overrides.degraded ?? false),
    tier: overrides.tier ?? "ship"
  };
}

describe("journalHealthStage", () => {
  test("passes when journal is healthy", async () => {
    const result = await journalHealthStage(makeContext({ degraded: false }));

    expect(result.stage).toBe("journal-health");
    expect(result.status).toBe("pass");
    expect(result.summary).toBe("Journal is healthy.");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test("fails when journal is degraded", async () => {
    const result = await journalHealthStage(makeContext({ degraded: true }));

    expect(result.stage).toBe("journal-health");
    expect(result.status).toBe("fail");
    expect(result.summary).toBe("Journal is degraded; event persistence may be lost.");
  });
});

describe("rulesStage", () => {
  test("quick tier passes when there are no blocking violations", async () => {
    const result = await rulesStage(
      makeContext({
        tier: "quick",
        ruleHits: [
          { rule: "R01", severity: "warn", path: "foo.ts", message: "warning" }
        ]
      }),
      "all"
    );

    expect(result.status).toBe("pass");
    expect(result.summary).toBe("No blocking rule violations.");
  });

  test("quick tier fails when there are blocking violations", async () => {
    const hit: RuleHit = { rule: "R01", severity: "block", path: "src/foo.ts", message: "missing" };
    const result = await rulesStage(
      makeContext({ tier: "quick", ruleHits: [hit] }),
      "all"
    );

    expect(result.status).toBe("fail");
    expect(result.summary).toContain("1 blocking violation(s)");
    expect(result.summary).toContain("R01 src/foo.ts");
  });

  test("quick tier ignores warnings (only blocks matter)", async () => {
    const result = await rulesStage(
      makeContext({
        tier: "quick",
        ruleHits: [
          { rule: "R01", severity: "warn", path: "a.ts", message: "w" },
          { rule: "R02", severity: "warn", path: "b.ts", message: "w" }
        ]
      }),
      "all"
    );

    expect(result.status).toBe("pass");
  });

  test("ship tier passes when no blocks or fail-ship violations", async () => {
    const result = await rulesStage(
      makeContext({
        tier: "ship",
        ruleHits: [
          { rule: "R01", severity: "warn", path: "a.ts", message: "warn" }
        ]
      }),
      "all"
    );

    expect(result.status).toBe("pass");
    expect(result.summary).toContain("1 warning(s)");
  });

  test("ship tier fails on blocking violations", async () => {
    const result = await rulesStage(
      makeContext({
        tier: "ship",
        ruleHits: [{ rule: "R05", severity: "block", path: "x.ts", message: "bad" }]
      }),
      "all"
    );

    expect(result.status).toBe("fail");
    expect(result.summary).toContain("1 violation(s)");
    expect(result.summary).toContain("blocks: 1");
  });

  test("ship tier fails on fail-ship violations", async () => {
    const result = await rulesStage(
      makeContext({
        tier: "ship",
        ruleHits: [{ rule: "R07", severity: "fail-ship", path: "y.ts", message: "no test" }]
      }),
      "all"
    );

    expect(result.status).toBe("fail");
    expect(result.summary).toContain("ship-fails: 1");
  });

  test("ship tier fails on both block and fail-ship violations", async () => {
    const result = await rulesStage(
      makeContext({
        tier: "ship",
        ruleHits: [
          { rule: "R01", severity: "block", path: "a.ts", message: "m1" },
          { rule: "R07", severity: "fail-ship", path: "b.ts", message: "m2" },
          { rule: "R02", severity: "warn", path: "c.ts", message: "m3" }
        ]
      }),
      "all"
    );

    expect(result.status).toBe("fail");
    expect(result.summary).toContain("2 violation(s)");
    expect(result.summary).toContain("blocks: 1");
    expect(result.summary).toContain("ship-fails: 1");
    expect(result.summary).toContain("1 warning(s)");
  });

  test("uses the correct stage name with scope", async () => {
    const result = await rulesStage(makeContext({ tier: "quick" }), "changed");
    expect(result.stage).toBe("rules:changed");
  });
});

describe("syncDiagnosticsStage", () => {
  test("returns skip when severity is off", async () => {
    const config = baseConfig({ syncDiagnostics: "off" });
    const ctx = makeContext({ config });

    const result = await syncDiagnosticsStage(ctx);

    expect(result.stage).toBe("sync-diagnostics");
    expect(result.status).toBe("skip");
    expect(result.summary).toBe("Sync diagnostics disabled by config (off).");
  });

  test("returns fail when severity is fail-ship and there are warnings", async () => {
    mock.module("../tools/sync-diagnostics.ts", () => ({
      runSyncDiagnostics: async () => ({
        syncs: 1,
        diagnostics: [
          { severity: "warn" as const, rule: "unknown-when-action", path: "foo.ts", message: "bad ref" },
          { severity: "warn" as const, rule: "unknown-then-action", path: "foo.ts", message: "bad ref" }
        ]
      }),
      formatDiagnostics: () => "",
      formatDiagnosticsJson: () => ""
    }));

    const config = baseConfig({ syncDiagnostics: "fail-ship" });
    const ctx = makeContext({ config });

    const result = await syncDiagnosticsStage(ctx);

    expect(result.status).toBe("fail");
    expect(result.summary).toContain("2 warning(s)");
  });

  test("returns pass when severity is fail-ship but no diagnostics issued", async () => {
    mock.module("../tools/sync-diagnostics.ts", () => ({
      runSyncDiagnostics: async () => ({
        syncs: 2,
        diagnostics: []
      }),
      formatDiagnostics: () => "",
      formatDiagnosticsJson: () => ""
    }));

    const config = baseConfig({ syncDiagnostics: "fail-ship" });
    const ctx = makeContext({ config });

    const result = await syncDiagnosticsStage(ctx);

    expect(result.status).toBe("pass");
    expect(result.summary).toContain("No issues found");
    expect(result.summary).toContain("2 sync(s)");
  });

  test("returns warn when severity is warn and there are warnings", async () => {
    mock.module("../tools/sync-diagnostics.ts", () => ({
      runSyncDiagnostics: async () => ({
        syncs: 1,
        diagnostics: [
          { severity: "warn" as const, rule: "missing-test", path: "foo.ts", message: "No test" }
        ]
      }),
      formatDiagnostics: () => "",
      formatDiagnosticsJson: () => ""
    }));

    const config = baseConfig({ syncDiagnostics: "warn" });
    const ctx = makeContext({ config });

    const result = await syncDiagnosticsStage(ctx);

    expect(result.status).toBe("warn");
    expect(result.summary).toContain("1 warning(s)");
  });
});
