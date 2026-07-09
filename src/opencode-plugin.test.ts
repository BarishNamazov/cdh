import { describe, expect, test } from "bun:test";
import path from "node:path";
import type { PluginInput } from "@opencode-ai/plugin";
import { CdhPlugin } from "./opencode-plugin.ts";

const validAppDir = path.resolve(import.meta.dir, "..", "fixtures", "valid-app");

describe("CdhPlugin", () => {
  test("registers deterministic CDH tools from the npm plugin export", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);

    expect(hooks.tool).toBeDefined();
    expect(Object.keys(hooks.tool ?? {}).sort()).toEqual([
      "catalog_copy",
      "catalog_search",
      "catalog_show",
      "cdh_init",
      "describe_concept",
      "list_concepts",
      "list_syncs",
      "read_design_doc",
      "record_decision",
      "run_verification",
      "spec_lint",
      "sync_diagnostics",
      "sync_graph",
      "trace_sync",
      "workflow_context",
    ]);
  });

  test("workflow_context tool executes through plugin registration", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);
    const workflowContext = hooks.tool?.workflow_context;

    expect(workflowContext).toBeDefined();
    if (!workflowContext) throw new Error("workflow_context tool was not registered");
    const result = await workflowContext.execute({ workflow: "concept", concept: "Labeling", includeDocs: false }, {
      directory: validAppDir,
      worktree: validAppDir,
    } as Parameters<typeof workflowContext.execute>[1]);

    expect(typeof result).toBe("string");
    expect(result).toContain("CDH Workflow Context");
    expect(result).toContain("Concept: Labeling");
  });
});
