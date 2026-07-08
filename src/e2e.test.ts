import { describe, expect, test } from "bun:test";
import path from "node:path";
import { loadConfig } from "./config.ts";
import { loadRepoContract } from "./repo-contract.ts";
import { createRuleEngine } from "./rules/rule-engine.ts";
import { listConcepts } from "./tools/list-concepts.ts";
import { describeConcept } from "./tools/describe-concept.ts";
import { runSyncDiagnostics } from "./tools/sync-diagnostics.ts";

const validAppDir = path.resolve(import.meta.dir, "..", "fixtures", "valid-app");

describe("E2E CLI", () => {
  test("cdh rules on valid-app passes with no blocking violations", async () => {
    const config = await loadConfig(validAppDir);
    const { contract } = await loadRepoContract(validAppDir, config);
    const engine = createRuleEngine(validAppDir, config, contract);
    const hits = await engine.checkRepo("all");
    const blocks = hits.filter((h) => h.severity === "block");

    expect(blocks.length).toBe(0);
  });

  test("cdh concepts on valid-app lists concepts", async () => {
    const config = await loadConfig(validAppDir);
    const { contract } = await loadRepoContract(validAppDir, config);
    const concepts = await listConcepts(validAppDir, config, contract);

    expect(concepts.length).toBeGreaterThanOrEqual(2);
    expect(concepts.some((c) => c.name === "Labeling")).toBe(true);
    expect(concepts.some((c) => c.name === "Requesting")).toBe(true);
  });

  test("cdh concept with non-existent name returns null", async () => {
    const config = await loadConfig(validAppDir);
    const { contract } = await loadRepoContract(validAppDir, config);
    const result = await describeConcept(validAppDir, config, contract, "NonExistent");

    expect(result).toBeNull();
  });

  test("cdh doctor on valid-app passes contract checks", async () => {
    const config = await loadConfig(validAppDir);
    const { contract } = await loadRepoContract(validAppDir, config);

    expect(contract.scripts.test).toBeDefined();
    expect(contract.scripts.typecheck).toBeDefined();
    expect(contract.specsDir).toBeDefined();
  });

  test("cdh sync-diagnostics on valid-app returns report", async () => {
    const config = await loadConfig(validAppDir);
    const { contract } = await loadRepoContract(validAppDir, config);
    const report = await runSyncDiagnostics(validAppDir, config, contract);

    expect(report.syncs).toBeGreaterThan(0);
    expect(Array.isArray(report.diagnostics)).toBe(true);
  });
});
