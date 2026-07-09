import { tool } from "@opencode-ai/plugin";
import { formatTraceResult, traceSyncAction } from "@/tools/trace-sync.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description:
    "Given a concept action (e.g. 'Labeling.addLabel'), list all syncs whose when/then reference it. Flags orphaned actions.",
  args: { action: tool.schema.string().describe("Action reference, e.g. 'Labeling.addLabel'") },
  async execute(args, context) {
    try {
      const { config, contract } = await resolveCtx(context.worktree);
      const result = await traceSyncAction(context.worktree, config, contract, args.action);
      return formatTraceResult(result);
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },
});
