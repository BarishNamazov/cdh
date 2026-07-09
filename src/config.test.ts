import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { deepMerge, defaultConfig, loadConfig } from "./config.ts";

describe("loadConfig", () => {
  test("deep merges defaults, global config, and project config", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cdh-config-"));
    const globalPath = path.join(dir, "global.json");
    const projectPath = path.join(dir, ".opencode", "cdh.json");
    await writeFile(
      globalPath,
      JSON.stringify({ verify: { syncDiagnostics: "off" }, ship: { branchPrefix: "test/" } })
    );
    await mkdir(path.dirname(projectPath), { recursive: true });
    await Bun.write(projectPath, JSON.stringify({ paths: { concepts: "custom/concepts" } }));

    const config = await loadConfig(dir, { globalPath, projectPath });

    expect(config.verify.syncDiagnostics).toBe("off");
    expect(config.ship.branchPrefix).toBe("test/");
    expect(config.paths.concepts).toBe("custom/concepts");
    expect(config.paths.syncs).toBe(defaultConfig.paths.syncs);
  });

  test("rejects invalid merged config", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "cdh-config-invalid-"));
    const projectPath = path.join(dir, "cdh.json");
    await writeFile(projectPath, JSON.stringify({ ship: { confirm: "sometimes" } }));

    await expect(loadConfig(dir, { globalPath: path.join(dir, "missing.json"), projectPath })).rejects.toThrow(
      "Invalid CDH config"
    );
  });
});

describe("deepMerge", () => {
  test("replaces arrays instead of concatenating", () => {
    const merged = deepMerge<Record<string, unknown>>({ a: ["x"], b: { c: 1 } }, { a: ["y"], b: { d: 2 } });

    expect(merged).toEqual({
      a: ["y"],
      b: { c: 1, d: 2 },
    });
  });
});
