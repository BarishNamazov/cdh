import { describe, expect, test } from "bun:test";
import path from "node:path";
import { loadConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { buildWorkflowContext } from "./workflow-context.ts";

const validAppDir = path.resolve(import.meta.dir, "..", "..", "fixtures", "valid-app");

describe("buildWorkflowContext", () => {
  test("builds deterministic concept context with static docs and focused concept detail", async () => {
    const config = await loadConfig(validAppDir);
    const { contract } = await loadRepoContract(validAppDir, config);

    const context = await buildWorkflowContext(validAppDir, config, contract, {
      workflow: "concept",
      concept: "Labeling",
    });

    expect(context).toContain("# CDH Workflow Context: Concept Specification and Implementation");
    expect(context).toContain("This context is assembled by deterministic TypeScript tools");
    expect(context).toContain("### deterministic-workflows");
    expect(context).toContain("### Focus Concept: Labeling");
    expect(context).toContain("Concept: Labeling");
    expect(context).toContain("Agent-end stages:");
  });

  test("builds sync context with traces, graph, and diagnostics", async () => {
    const config = await loadConfig(validAppDir);
    const { contract } = await loadRepoContract(validAppDir, config);

    const context = await buildWorkflowContext(validAppDir, config, contract, {
      workflow: "sync",
      actions: ["Labeling.addLabel"],
      includeDocs: false,
    });

    expect(context).toContain("# CDH Workflow Context: Synchronization Implementation");
    expect(context).toContain("### Syncs");
    expect(context).toContain("Trace: Labeling.addLabel");
    expect(context).toContain("### Sync Graph");
    expect(context).toContain("### Sync Diagnostics");
    expect(context).not.toContain("### sync-conventions");
  });
});
