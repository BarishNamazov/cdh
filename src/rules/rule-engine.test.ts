import path from "node:path";
import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { createRuleEngine } from "./rule-engine.ts";

const root = path.resolve(import.meta.dir, "..", "..");
const validApp = path.join(root, "fixtures", "valid-app");
const violationsDir = path.join(root, "fixtures", "violations");

function fixturePath(name: string): string {
  return path.join(violationsDir, name);
}

async function engineFor(cwd: string) {
  const { contract } = await loadRepoContract(cwd, defaultConfig);
  return createRuleEngine(cwd, defaultConfig, contract);
}

describe("RuleEngine R1", () => {
  test("reports zero R1 hits for valid-app", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const engine = createRuleEngine(validApp, defaultConfig, contract);
    expect(await engine.checkRepo("all")).toEqual([]);
  });

  test("blocks cross-concept imports", async () => {
    const fp = fixturePath("R1-cross-concept-import");
    const engine = await engineFor(fp);
    const file = path.join(fp, "src", "concepts", "Tagging", "TaggingConcept.ts");

    const hits = await engine.checkFile(file);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.rule).toBe("R1");
    expect(hits[0]?.severity).toBe("block");
    expect(hits[0]?.message).toContain("imports another concept directory");
  });

  test("checkContent catches proposed imports before write", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const engine = createRuleEngine(validApp, defaultConfig, contract);
    const file = path.join(validApp, "src", "concepts", "Labeling", "LabelingConcept.ts");

    const hits = engine.checkContent(file, `import Other from "../Other/OtherConcept.ts";\nexport default class LabelingConcept {}`);

    expect(hits.map((h) => h.rule)).toContain("R1");
  });
});

describe("RuleEngine R2", () => {
  test("flags action with wrong parameter type", async () => {
    const fp = fixturePath("R2-action-signature");
    const engine = await engineFor(fp);
    const file = path.join(fp, "src", "concepts", "Indexing", "IndexingConcept.ts");

    const hits = await engine.checkFile(file);
    const r2 = hits.filter((h) => h.rule === "R2");
    expect(r2.length).toBeGreaterThanOrEqual(1);
    expect(r2[0]?.severity).toBe("warn");
    expect(r2[0]?.message).toContain("R2");
  });

  test("no R2 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const file = path.join(validApp, "src", "concepts", "Labeling", "LabelingConcept.ts");
    const hits = await engine.checkFile(file);
    expect(hits.filter((h) => h.rule === "R2")).toEqual([]);
  });
});

describe("RuleEngine R3", () => {
  test("flags query that returns object instead of array", async () => {
    const fp = fixturePath("R3-query-signature");
    const engine = await engineFor(fp);
    const file = path.join(fp, "src", "concepts", "Listing", "ListingConcept.ts");

    const hits = await engine.checkFile(file);
    const r3 = hits.filter((h) => h.rule === "R3");
    expect(r3.length).toBeGreaterThanOrEqual(1);
    expect(r3[0]?.severity).toBe("warn");
    expect(r3[0]?.message).toContain("R3");
  });

  test("no R3 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const file = path.join(validApp, "src", "concepts", "Labeling", "LabelingConcept.ts");
    const hits = await engine.checkFile(file);
    expect(hits.filter((h) => h.rule === "R3")).toEqual([]);
  });
});

describe("RuleEngine R4", () => {
  test("flags class name that doesn't match directory", async () => {
    const fp = fixturePath("R4-placement-naming");
    const engine = await engineFor(fp);
    const file = path.join(fp, "src", "concepts", "Ranking", "RankingConcept.ts");

    const hits = await engine.checkFile(file);
    const r4 = hits.filter((h) => h.rule === "R4");
    expect(r4.length).toBeGreaterThanOrEqual(1);
    expect(r4[0]?.message).toContain("RankedConcept");
    expect(r4[0]?.message).toContain("RankingConcept");
  });

  test("no R4 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const file = path.join(validApp, "src", "concepts", "Labeling", "LabelingConcept.ts");
    const hits = await engine.checkFile(file);
    expect(hits.filter((h) => h.rule === "R4")).toEqual([]);
  });
});

describe("RuleEngine R6", () => {
  test("flags missing spec sections", async () => {
    const fp = fixturePath("R6-spec-presence");
    const engine = await engineFor(fp);

    const hits = await engine.checkRepo("all");
    const r6 = hits.filter((h) => h.rule === "R6");
    expect(r6.length).toBeGreaterThanOrEqual(1);
    expect(r6[0]?.severity).toBe("fail-ship");
    expect(r6[0]?.message).toContain("missing required sections");
  });

  test("no R6 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const hits = await engine.checkRepo("all");
    expect(hits.filter((h) => h.rule === "R6")).toEqual([]);
  });
});

describe("RuleEngine R7", () => {
  test("flags concept without colocated test", async () => {
    const fp = fixturePath("R7-test-presence");
    const engine = await engineFor(fp);

    const hits = await engine.checkRepo("all");
    const r7 = hits.filter((h) => h.rule === "R7");
    expect(r7.length).toBeGreaterThanOrEqual(1);
    expect(r7[0]?.severity).toBe("fail-ship");
    expect(r7[0]?.message).toContain("no colocated test file");
  });

  test("no R7 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const hits = await engine.checkRepo("all");
    expect(hits.filter((h) => h.rule === "R7")).toEqual([]);
  });
});

describe("RuleEngine R8", () => {
  test("flags untracked concept tests (heuristic)", async () => {
    const fp = fixturePath("R8-surface-coverage");
    const engine = await engineFor(fp);

    const hits = await engine.checkRepo("all");
    const r8 = hits.filter((h) => h.rule === "R8");
    expect(r8.length).toBeGreaterThanOrEqual(1);
    expect(r8[0]?.severity).toBe("fail-ship");
    expect(r8[0]?.message).toContain("track(");
  });

  test("no R8 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const hits = await engine.checkRepo("all");
    expect(hits.filter((h) => h.rule === "R8")).toEqual([]);
  });
});

describe("RuleEngine R9", () => {
  test("flags sync test without proper shape", async () => {
    const fp = fixturePath("R9-sync-test-shape");
    const engine = await engineFor(fp);

    const hits = await engine.checkRepo("all");
    const r9 = hits.filter((h) => h.rule === "R9");
    expect(r9.length).toBeGreaterThanOrEqual(1);
    expect(r9[0]?.severity).toBe("fail-ship");
    expect(r9[0]?.message).toContain("R9");
  });

  test("no R9 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const hits = await engine.checkRepo("all");
    expect(hits.filter((h) => h.rule === "R9")).toEqual([]);
  });
});

describe("RuleEngine R10", () => {
  test("flags tests without trace() in principle/testAction tests", async () => {
    const fp = fixturePath("R10-legible-tests");
    const engine = await engineFor(fp);

    const hits = await engine.checkRepo("all");
    const r10 = hits.filter((h) => h.rule === "R10");
    expect(r10.length).toBeGreaterThanOrEqual(1);
    expect(r10[0]?.message).toContain("R10");
  });

  test("no R10 hits for valid-app", async () => {
    const engine = await engineFor(validApp);
    const hits = await engine.checkRepo("all");
    expect(hits.filter((h) => h.rule === "R10")).toEqual([]);
  });
});

describe("checkRepo full scan", () => {
  test("valid-app reports zero rule hits across all rules", async () => {
    const engine = await engineFor(validApp);
    const hits = await engine.checkRepo("all");
    expect(hits).toEqual([]);
  });
});
