import path from "node:path";
import { mkdtempSync, readFileSync, existsSync, rmSync } from "node:fs";
import { describe, expect, test } from "bun:test";
import { defaultConfig, type CdhConfig } from "./config.ts";
import { copyCatalogConcept, type CatalogEntry } from "./catalog-lib.ts";
import type { RepoContract } from "./repo-contract.ts";

const catalogDir = path.resolve(import.meta.dir, "..", "catalog");

const authenticatingEntry: CatalogEntry = {
  id: "authenticating",
  name: "Authenticating",
  version: "1.0.0",
  summary: "Username/password identity with registration and credential checks.",
  tags: ["identity", "security"],
  pairsWith: ["sessioning", "accesscontrolling"],
  files: ["concept.md", "AuthenticatingConcept.ts", "AuthenticatingConcept.test.ts", "README.md"]
};

function makeConfig(conceptsPath: string): CdhConfig {
  return {
    ...defaultConfig,
    paths: { ...defaultConfig.paths, concepts: conceptsPath }
  };
}

function makeContract(specsDir: string): RepoContract {
  return {
    specsDir,
    docs: {},
    helpers: { testingModule: "@utils/testing.ts", exports: [] },
    scripts: { test: "echo ok", typecheck: "echo ok", start: "echo ok" },
    health: { path: "/api/health" }
  };
}

function makeTempDir(): string {
  return mkdtempSync(path.join("/tmp", "cdh-test-catalog-"));
}

describe("copyCatalogConcept", () => {
  test("copies concept files to the target concept directory", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    const result = copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract);

    expect(result.conceptName).toBe("Authenticating");
    expect(result.files.length).toBeGreaterThanOrEqual(2);

    const conceptFile = path.join(tmp, "src/concepts", "Authenticating", "AuthenticatingConcept.ts");
    expect(existsSync(conceptFile)).toBe(true);

    rmSync(tmp, { recursive: true, force: true });
  });

  test("copies concept.md to the specsDir", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract);

    const specPath = path.join(tmp, "design", "concepts", "authenticating.md");
    expect(existsSync(specPath)).toBe(true);

    rmSync(tmp, { recursive: true, force: true });
  });

  test("renames the concept when the as option is provided", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    const result = copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract, {
      as: "Auth"
    });

    expect(result.conceptName).toBe("Auth");
    expect(result.as).toBe("Auth");

    const renamedFile = path.join(tmp, "src/concepts", "Auth", "AuthConcept.ts");
    expect(existsSync(renamedFile)).toBe(true);

    const content = readFileSync(renamedFile, "utf8");
    expect(content).toContain("AuthConcept");

    rmSync(tmp, { recursive: true, force: true });
  });

  test("lowercase concept name is used when renaming with as option", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract, {
      as: "Auth"
    });

    const specPath = path.join(tmp, "design", "concepts", "auth.md");
    expect(existsSync(specPath)).toBe(true);

    rmSync(tmp, { recursive: true, force: true });
  });

  test("throws when target directory already exists without overwrite", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract);

    expect(() => {
      copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract);
    }).toThrow("Target directory already exists");

    rmSync(tmp, { recursive: true, force: true });
  });

  test("overwrites existing files when overwrite option is set", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract);

    const result = copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract, {
      overwrite: true
    });

    expect(result.conceptName).toBe("Authenticating");
    expect(result.files.length).toBeGreaterThanOrEqual(2);

    rmSync(tmp, { recursive: true, force: true });
  });

  test("copied files start with the cdh:catalog header line", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract);

    const conceptFile = path.join(tmp, "src/concepts", "Authenticating", "AuthenticatingConcept.ts");
    const content = readFileSync(conceptFile, "utf8");
    expect(content.startsWith("// cdh:catalog authenticating@1.0.0")).toBe(true);

    const specFile = path.join(tmp, "design", "concepts", "authenticating.md");
    const specContent = readFileSync(specFile, "utf8");
    expect(specContent.startsWith("// cdh:catalog authenticating@1.0.0")).toBe(true);

    rmSync(tmp, { recursive: true, force: true });
  });

  test("returns correct CopyResult structure", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    const result = copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract);

    expect(result.id).toBe("authenticating");
    expect(result.version).toBe("1.0.0");
    expect(result.conceptName).toBe("Authenticating");
    expect(result.targetDir).toBe("src/concepts/Authenticating");
    expect(result.files).toBeInstanceOf(Array);

    rmSync(tmp, { recursive: true, force: true });
  });

  test("renamed concept files have content references replaced", () => {
    const tmp = makeTempDir();
    const config = makeConfig("src/concepts");
    const contract = makeContract("design/concepts");

    copyCatalogConcept(catalogDir, tmp, authenticatingEntry, config, contract, {
      as: "IdentityManager"
    });

    const conceptFile = path.join(tmp, "src/concepts", "IdentityManager", "IdentityManagerConcept.ts");
    const content = readFileSync(conceptFile, "utf8");
    expect(content).toContain("IdentityManagerConcept");
    expect(content).toContain("IdentityManagerState");

    const specFile = path.join(tmp, "design", "concepts", "identitymanager.md");
    const specContent = readFileSync(specFile, "utf8");
    expect(specContent).toContain("IdentityManager");

    rmSync(tmp, { recursive: true, force: true });
  });
});
