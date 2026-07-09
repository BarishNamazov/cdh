import { tool } from "@opencode-ai/plugin";
import { buildSyncGraph, formatGraphJson, formatGraphMermaid, formatGraphReport } from "@/tools/sync-graph.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description: "Build and display the sync graph showing relationships between syncs, actions, queries, and endpoints.",
  args: { format: tool.schema.string().optional().describe("Output format: 'report' (default), 'json', or 'mermaid'") },
  async execute(args, context) {
    const { config, contract } = await resolveCtx(context.worktree);
    const graph = await buildSyncGraph(context.worktree, config, contract);
    switch (args.format ?? "report") {
      case "json":
        return formatGraphJson(graph);
      case "mermaid":
        return formatGraphMermaid(graph);
      default:
        return formatGraphReport(graph);
    }
  },
});
