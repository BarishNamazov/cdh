import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { initProject } from "./init.ts";

describe("initProject", () => {
  test("scaffolds OpenCode npm plugin config and local agent prompts", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cdh-init-"));

    const result = initProject(cwd);

    expect(result.errors).toEqual([]);
    expect(existsSync(path.join(cwd, "opencode.json"))).toBe(true);
    expect(existsSync(path.join(cwd, "AGENTS.md"))).toBe(true);
    expect(existsSync(path.join(cwd, ".opencode", "cdh.json"))).toBe(true);
    expect(existsSync(path.join(cwd, ".opencode", "agents", "sync-implementer.md"))).toBe(true);
    expect(existsSync(path.join(cwd, ".opencode", "commands", "new-concept.md"))).toBe(true);
    expect(existsSync(path.join(cwd, ".opencode", "tools", "workflow_context.ts"))).toBe(false);
    expect(existsSync(path.join(cwd, ".opencode", "plugins", "cdh-verification.ts"))).toBe(false);
  });

  test("scaffolded tsconfig.json has no baseUrl and uses relative paths", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cdh-init-"));

    const result = initProject(cwd);

    expect(result.errors).toEqual([]);

    const tsconfig = JSON.parse(readFileSync(path.join(cwd, "tsconfig.json"), "utf8"));
    expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();

    const paths = tsconfig.compilerOptions.paths;
    expect(paths).toBeDefined();
    for (const alias of Object.values(paths) as string[][]) {
      for (const target of alias) {
        expect(target).toMatch(/^\.\//);
      }
    }
  });

  test("scaffolded cdh.json includes agentEnd and context config", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cdh-init-"));

    const result = initProject(cwd);

    expect(result.errors).toEqual([]);

    const cdhConfig = JSON.parse(readFileSync(path.join(cwd, ".opencode", "cdh.json"), "utf8"));
    expect(cdhConfig.verify.agentEnd).toEqual({ enabled: true, changedOnly: true });
    expect(cdhConfig.context).toEqual({ autoInject: true, maxDocChars: 2500 });
  });

  test("scaffold creates all template files", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cdh-init-"));

    const result = initProject(cwd);

    expect(result.errors).toEqual([]);

    const expectedFiles = [
      "opencode.json",
      "AGENTS.md",
      "package.json",
      "tsconfig.json",
      ".gitignore",
      "design/index.json",
      "design/concepts/greeting.md",
      "src/engine/server.ts",
      "src/concepts/Greeting/GreetingConcept.ts",
      "src/concepts/Greeting/GreetingConcept.test.ts",
      "src/syncs/greeting-audit.sync.ts",
      "src/syncs/greeting-audit.sync.test.ts",
      "src/utils/testing.ts",
      ".opencode/cdh.json",
      ".opencode/agents/concept-implementer.md",
      ".opencode/agents/spec-writer.md",
      ".opencode/agents/sync-implementer.md",
      ".opencode/agents/test-writer.md",
      ".opencode/agents/reviewer.md",
      ".opencode/agents/scout.md",
      ".opencode/commands/implement-feature.md",
      ".opencode/commands/new-concept.md",
      ".opencode/commands/new-sync.md",
      ".opencode/commands/report.md",
      ".opencode/commands/review.md",
      ".opencode/commands/ship.md",
      ".opencode/commands/status.md",
    ];

    for (const file of expectedFiles) {
      expect(existsSync(path.join(cwd, file)), `Missing: ${file}`).toBe(true);
    }
  });
});
