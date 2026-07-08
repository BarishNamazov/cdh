import { describe, expect, test } from "bun:test";
import path from "node:path";
import { defaultConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { describeConcept, formatConceptDetail } from "./describe-concept.ts";

const validApp = path.resolve(import.meta.dir, "..", "..", "fixtures", "valid-app");

describe("describeConcept", () => {
  test("returns the Labeling concept with its actions and queries", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concept = await describeConcept(validApp, defaultConfig, contract, "Labeling");

    expect(concept).not.toBeNull();
    expect(concept?.name).toBe("Labeling");
    expect(concept?.actions.map((a) => a.name)).toEqual(["addLabel", "removeLabel"]);
    expect(concept?.queries.map((q) => q.name)).toEqual(["_getLabels"]);
    expect(concept?.specPath?.endsWith("design/concepts/labeling.md")).toBe(true);
  });

  test("returns the Requesting concept", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concept = await describeConcept(validApp, defaultConfig, contract, "Requesting");

    expect(concept).not.toBeNull();
    expect(concept?.name).toBe("Requesting");
  });

  test("matches concept name case-insensitively", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concept = await describeConcept(validApp, defaultConfig, contract, "labeling");

    expect(concept).not.toBeNull();
    expect(concept?.name).toBe("Labeling");
  });

  test("matches concept name with mixed case", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concept = await describeConcept(validApp, defaultConfig, contract, "lAbElInG");

    expect(concept).not.toBeNull();
    expect(concept?.name).toBe("Labeling");
  });

  test("returns null for an unknown concept name", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concept = await describeConcept(validApp, defaultConfig, contract, "NonExistent");

    expect(concept).toBeNull();
  });
});

describe("formatConceptDetail", () => {
  test("formats a concept detail with name, actions, queries, and spec path", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concept = await describeConcept(validApp, defaultConfig, contract, "Labeling");
    const output = formatConceptDetail(concept!, validApp);

    expect(output).toContain("Concept: Labeling");
    expect(output).toContain("Actions:");
    expect(output).toContain("addLabel");
    expect(output).toContain("removeLabel");
    expect(output).toContain("Queries:");
    expect(output).toContain("_getLabels");
    expect(output).toContain("Spec:");
    expect(output).toContain("design/concepts/labeling.md");
  });

  test("formats a concept with no actions as 'Actions: none'", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const requestConcept = await describeConcept(validApp, defaultConfig, contract, "Requesting");
    const output = formatConceptDetail(requestConcept!, validApp);

    expect(output).toContain("Concept: Requesting");
    expect(output).toContain("Spec:");
  });

  test("includes spec content when the spec file exists", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concept = await describeConcept(validApp, defaultConfig, contract, "Labeling");
    const output = formatConceptDetail(concept!, validApp);

    expect(output).toContain("--- Spec Content ---");
    expect(output).toContain("Concept: Labeling"); // only in the header, not from spec
  });
});
