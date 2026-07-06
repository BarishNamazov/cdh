import path from "node:path";
import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { createRuleEngine } from "./rule-engine.ts";

const root = path.resolve(import.meta.dir, "..", "..");
const validApp = path.join(root, "fixtures", "valid-app");
const r1Fixture = path.join(root, "fixtures", "violations", "R1-cross-concept-import");

describe("RuleEngine R1", () => {
  test("reports zero R1 hits for valid-app", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const engine = createRuleEngine(validApp, defaultConfig, contract);

    expect(await engine.checkRepo("all")).toEqual([]);
  });

  test("blocks cross-concept imports", async () => {
    const { contract } = await loadRepoContract(r1Fixture, defaultConfig);
    const engine = createRuleEngine(r1Fixture, defaultConfig, contract);
    const file = path.join(r1Fixture, "src", "concepts", "Alpha", "AlphaConcept.ts");

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

    expect(hits.map((hit) => hit.rule)).toEqual(["R1"]);
  });
});
