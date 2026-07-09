import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
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
});
