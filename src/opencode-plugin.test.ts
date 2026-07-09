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

  test("registers task execute hooks for context injection and verification", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);

    expect(hooks["tool.execute.before"]).toBeDefined();
    expect(hooks["tool.execute.after"]).toBeDefined();
    expect(hooks.event).toBeDefined();
    expect(hooks["experimental.session.compacting"]).toBeDefined();
  });

  test("tool.execute.before injects CDH context for concept-implementer task", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);
    const beforeHook = hooks["tool.execute.before"];
    expect(beforeHook).toBeDefined();
    if (!beforeHook) throw new Error("tool.execute.before hook not registered");

    const output = {
      args: {
        subagent_type: "concept-implementer",
        prompt: "Implement the Todo concept",
      },
    };

    await beforeHook(
      {
        tool: "task",
        sessionID: "test-session-1",
        callID: "test-call-1",
      },
      output as { args: Record<string, unknown> }
    );

    expect(typeof output.args.prompt).toBe("string");
    const prompt = output.args.prompt as string;
    expect(prompt).toContain("CDH Auto Context");
    expect(prompt).toContain("CDH Workflow Context");
    expect(prompt).toContain("Implement the Todo concept");
  });

  test("tool.execute.before skips non-CDH subagents", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);
    const beforeHook = hooks["tool.execute.before"];
    expect(beforeHook).toBeDefined();
    if (!beforeHook) throw new Error("tool.execute.before hook not registered");

    const output = {
      args: {
        subagent_type: "general",
        prompt: "Do general research",
      },
    };

    await beforeHook(
      {
        tool: "task",
        sessionID: "test-session-2",
        callID: "test-call-2",
      },
      output as { args: Record<string, unknown> }
    );

    // prompt should be unchanged for non-CDH agents
    expect(typeof output.args.prompt).toBe("string");
    expect(output.args.prompt).toBe("Do general research");
  });

  test("tool.execute.before skips non-task tools", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);
    const beforeHook = hooks["tool.execute.before"];
    expect(beforeHook).toBeDefined();
    if (!beforeHook) throw new Error("tool.execute.before hook not registered");

    const output = {
      args: {
        command: "some command",
      },
    };

    await beforeHook(
      {
        tool: "bash",
        sessionID: "test-session-3",
        callID: "test-call-3",
      },
      output as { args: Record<string, unknown> }
    );

    // output should be untouched
    expect(output.args.command).toBe("some command");
  });

  test("tool.execute.after runs verification for CDH subagents", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);
    const afterHook = hooks["tool.execute.after"];
    expect(afterHook).toBeDefined();
    if (!afterHook) throw new Error("tool.execute.after hook not registered");

    const output: Record<string, unknown> = { output: "Task completed." };

    await afterHook(
      {
        tool: "task",
        sessionID: "test-session-4",
        callID: "test-call-4",
        args: { subagent_type: "concept-implementer" },
      },
      output as { title: string; output: string; metadata: unknown }
    );

    const outputStr = output.output as string;
    expect(outputStr).toContain("CDH Agent-End Verification");
  });

  test("tool.execute.after skips non-CDH subagents", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);
    const afterHook = hooks["tool.execute.after"];
    expect(afterHook).toBeDefined();
    if (!afterHook) throw new Error("tool.execute.after hook not registered");

    const output: Record<string, unknown> = { output: "Task completed." };

    await afterHook(
      {
        tool: "task",
        sessionID: "test-session-5",
        callID: "test-call-5",
        args: { subagent_type: "general" },
      },
      output as { title: string; output: string; metadata: unknown }
    );

    expect(output.output).toBe("Task completed.");
  });

  test("compaction hook injects CDH verification state", async () => {
    const hooks = await CdhPlugin({ directory: validAppDir, worktree: validAppDir } as PluginInput);
    const compactHook = hooks["experimental.session.compacting"];
    expect(compactHook).toBeDefined();
    if (!compactHook) throw new Error("compaction hook not registered");

    const output: { context: string[]; prompt?: string } = { context: [] };
    await compactHook({ sessionID: "test-session-6" }, output);

    expect(output.context.length).toBeGreaterThan(0);
    expect(output.context[0]).toContain("CDH Verification State");
    expect(output.context[0]).toContain("workflow_context");
  });
});
