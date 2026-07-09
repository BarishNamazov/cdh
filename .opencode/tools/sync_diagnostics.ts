import { tool } from "@opencode-ai/plugin";
import { formatDiagnostics, formatDiagnosticsJson, runSyncDiagnostics } from "@/tools/sync-diagnostics.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description:
    "Run diagnostics on syncs to find issues like orphan actions, missing tests, unhandled errors, and more.",
  args: { format: tool.schema.string().optional().describe("Output format: 'report' (default) or 'json'") },
  async execute(args, context) {
    const { config, contract } = await resolveCtx(context.worktree);
    const report = await runSyncDiagnostics(context.worktree, config, contract);
    return args.format === "json" ? formatDiagnosticsJson(report) : formatDiagnostics(report);
  },
});
