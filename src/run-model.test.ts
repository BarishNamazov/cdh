import { describe, expect, test } from "bun:test";
import {
  generateRunId,
  getOrCreateRunId,
  joinParentRun,
  setRunEnv,
  computeChangedScope
} from "./run-model.ts";

describe("generateRunId", () => {
  test("returns a string matching the run-YYYYMMDD-HHMMSS-xxxx pattern", () => {
    const id = generateRunId();
    expect(id).toMatch(/^run-\d{8}-\d{6}-[a-z0-9]{4}$/);
  });

  test("produces unique IDs on consecutive calls", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateRunId());
    }
    expect(ids.size).toBe(100);
  });
});

describe("getOrCreateRunId", () => {
  test("returns existing CDH_RUN_ID when set", () => {
    const id = getOrCreateRunId({ CDH_RUN_ID: "run-20250101-120000-abcd" });
    expect(id).toBe("run-20250101-120000-abcd");
  });

  test("generates a new run ID when CDH_RUN_ID is absent", () => {
    const id = getOrCreateRunId({});
    expect(id).toMatch(/^run-\d{8}-\d{6}-[a-z0-9]{4}$/);
  });

  test("generates a new run ID when CDH_RUN_ID is undefined", () => {
    const id = getOrCreateRunId({ CDH_RUN_ID: undefined });
    expect(id).toMatch(/^run-\d{8}-\d{6}-[a-z0-9]{4}$/);
  });
});

describe("joinParentRun", () => {
  test("returns true when CDH_RUN_ID is set", () => {
    expect(joinParentRun({ CDH_RUN_ID: "run-20250101-120000-abcd" })).toBe(true);
  });

  test("returns false when CDH_RUN_ID is not set", () => {
    expect(joinParentRun({})).toBe(false);
  });

  test("returns false when env is empty", () => {
    expect(joinParentRun({})).toBe(false);
  });
});

describe("setRunEnv", () => {
  test("adds CDH_RUN_ID and CDH_RUN_DIR to env", () => {
    const env = setRunEnv({ NODE_ENV: "test" }, "run-20250101-120000-abcd", "/tmp/runs/abc");
    expect(env.CDH_RUN_ID).toBe("run-20250101-120000-abcd");
    expect(env.CDH_RUN_DIR).toBe("/tmp/runs/abc");
    expect(env.NODE_ENV).toBe("test");
  });

  test("overwrites existing CDH_RUN_ID and CDH_RUN_DIR", () => {
    const env = setRunEnv(
      { CDH_RUN_ID: "old", CDH_RUN_DIR: "/old" },
      "new-id",
      "/new-dir"
    );
    expect(env.CDH_RUN_ID).toBe("new-id");
    expect(env.CDH_RUN_DIR).toBe("/new-dir");
  });
});

describe("computeChangedScope", () => {
  const conceptsRoot = "/app/src/concepts";
  const syncsRoot = "/app/src/syncs";

  test("identifies changed concepts from touched files", () => {
    const scope = computeChangedScope(conceptsRoot, syncsRoot, [
      "/app/src/concepts/Labeling/LabelingConcept.ts",
      "/app/src/concepts/Labeling/LabelingConcept.test.ts",
      "/app/src/concepts/Requesting/RequestingConcept.ts"
    ]);
    expect(scope.concepts.sort()).toEqual(["Labeling", "Requesting"]);
    expect(scope.syncs).toEqual([]);
  });

  test("identifies changed syncs from touched files", () => {
    const scope = computeChangedScope(conceptsRoot, syncsRoot, [
      "/app/src/syncs/approval-workflow.ts"
    ]);
    expect(scope.concepts).toEqual([]);
    expect(scope.syncs).toEqual(["approval-workflow.ts"]);
  });

  test("identifies both concepts and syncs", () => {
    const scope = computeChangedScope(conceptsRoot, syncsRoot, [
      "/app/src/concepts/Auth/AuthConcept.ts",
      "/app/src/syncs/login-flow.ts",
      "/app/src/syncs/logout-flow.ts"
    ]);
    expect(scope.concepts).toEqual(["Auth"]);
    expect(scope.syncs.sort()).toEqual(["login-flow.ts", "logout-flow.ts"]);
  });

  test("deduplicates concepts when multiple files from same concept are touched", () => {
    const scope = computeChangedScope(conceptsRoot, syncsRoot, [
      "/app/src/concepts/Labeling/LabelingConcept.ts",
      "/app/src/concepts/Labeling/LabelingConcept.test.ts",
      "/app/src/concepts/Labeling/helpers.ts"
    ]);
    expect(scope.concepts).toEqual(["Labeling"]);
  });

  test("returns empty arrays for no matches", () => {
    const scope = computeChangedScope(conceptsRoot, syncsRoot, [
      "/app/src/utils/helpers.ts",
      "/app/src/app.ts"
    ]);
    expect(scope.concepts).toEqual([]);
    expect(scope.syncs).toEqual([]);
  });

  test("preserves touchedFiles in the result", () => {
    const files = ["/app/src/concepts/X/XConcept.ts", "/app/src/syncs/a.ts"];
    const scope = computeChangedScope(conceptsRoot, syncsRoot, files);
    expect(scope.touchedFiles).toEqual(files);
  });

  test("handles empty touchedFiles array", () => {
    const scope = computeChangedScope(conceptsRoot, syncsRoot, []);
    expect(scope.concepts).toEqual([]);
    expect(scope.syncs).toEqual([]);
    expect(scope.touchedFiles).toEqual([]);
  });

  test("treats files at conceptsRoot with no subdirectory as a concept name", () => {
    const scope = computeChangedScope(conceptsRoot, syncsRoot, [
      "/app/src/concepts/README.md"
    ]);
    expect(scope.concepts).toEqual(["README.md"]);
    expect(scope.syncs).toEqual([]);
  });
});
