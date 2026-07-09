import { describe, expect, test } from "bun:test";
import path from "node:path";
import { defaultConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { formatDesignDoc, readDesignDoc } from "./design-doc.ts";

const validApp = path.resolve(import.meta.dir, "..", "..", "fixtures", "valid-app");

describe("readDesignDoc", () => {
  test("returns content for a known document key", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const result = readDesignDoc(validApp, contract, "testing-conventions");

    expect("content" in result).toBe(true);
    if ("content" in result) {
      expect(result.content).toContain("Concept Testing");
      expect(result.path).toBe("design/background/testing-concepts.md");
    }
  });

  test("returns content for architecture doc", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const result = readDesignDoc(validApp, contract, "architecture");

    expect("content" in result).toBe(true);
    if ("content" in result) {
      expect(result.content.length).toBeGreaterThan(0);
    }
  });

  test("returns error for unknown document key", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const result = readDesignDoc(validApp, contract, "nonexistent");

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("Unknown document key");
      expect(result.error).toContain("Available keys:");
    }
  });

  test("returns error for unknown key and lists available keys", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const result = readDesignDoc(validApp, contract, "bad-key");

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("testing-conventions");
      expect(result.error).toContain("architecture");
    }
  });

  test("falls back to built-in background docs when the repo contract omits a key", () => {
    const result = readDesignDoc(
      validApp,
      {
        specsDir: "design/concepts",
        docs: {},
        helpers: { testingModule: "@utils/testing.ts", exports: [] },
        scripts: { test: "bun test", typecheck: "bun run check", start: "bun run start" },
        health: { path: "/health" },
      },
      "deterministic-workflows"
    );

    expect("content" in result).toBe(true);
    if ("content" in result) {
      expect(result.content).toContain("Deterministic Agent Workflows");
      expect(result.path).toBe("deterministic-agent-workflows.md");
    }
  });
});

describe("formatDesignDoc", () => {
  test("formats a successful result with file path and content", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const result = readDesignDoc(validApp, contract, "testing-conventions");
    const formatted = formatDesignDoc(result);

    expect(formatted).toContain("File: design/background/testing-concepts.md");
    expect(formatted).toContain("Concept Testing");
  });

  test("returns the error string for an error result", () => {
    const formatted = formatDesignDoc({ error: "Document not found: foo.md" });

    expect(formatted).toBe("Document not found: foo.md");
  });

  test("formats error result with available keys", () => {
    const formatted = formatDesignDoc({ error: "Unknown document key 'bad'. Available keys: a, b" });

    expect(formatted).toBe("Unknown document key 'bad'. Available keys: a, b");
  });
});
