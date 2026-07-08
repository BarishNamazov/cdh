import { describe, expect, test } from "bun:test";
import path from "node:path";
import { Project } from "ts-morph";
import { defaultConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { discoverConcepts, enumerateSurfaceMethods } from "./concepts.ts";

const validApp = path.resolve(import.meta.dir, "..", "..", "fixtures", "valid-app");

describe("discoverConcepts", () => {
  test("discovers valid-app concept surface", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const concepts = await discoverConcepts(validApp, defaultConfig, contract);

    expect(concepts.length).toBeGreaterThanOrEqual(1);
    const labeling = concepts.find((c) => c.name === "Labeling");
    expect(labeling).toBeDefined();
    expect(labeling?.actions.map((method) => method.name)).toEqual(["addLabel", "removeLabel"]);
    expect(labeling?.queries.map((method) => method.name)).toEqual(["_getLabels"]);
    expect(labeling?.specPath?.endsWith("design/concepts/labeling.md")).toBe(true);
    expect(labeling?.testPath?.endsWith("LabelingConcept.test.ts")).toBe(true);
  });
});

describe("enumerateSurfaceMethods", () => {
  test("applies the T2 surface filter", () => {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const sourceFile = project.createSourceFile(
      "SurfaceConcept.ts",
      `
      class Base { inherited(): object { return {}; } }
      export default class SurfaceConcept extends Base {
        overload(input: { a: string }): { a: string };
        overload(input: { a: string }): { a: string } { return input; }
        action(input: { value: string }): { value: string } { return input; }
        _query(): string[] { return []; }
        helper(): void {}
        static ignoredStatic(): object { return {}; }
        private ignoredPrivate(): object { return {}; }
        protected ignoredProtected(): object { return {}; }
        get ignoredGetter(): string { return ""; }
        set ignoredSetter(value: string) {}
      }
      `
    );

    const classDeclaration = sourceFile.getClassOrThrow("SurfaceConcept");
    const surface = enumerateSurfaceMethods(classDeclaration.getMethods(), ["helper"]);

    expect(surface.map((method) => method.name)).toEqual(["_query", "action", "overload"]);
  });
});
