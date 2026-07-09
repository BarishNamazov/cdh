import { tool } from "@opencode-ai/plugin";
import { formatSyncs, listSyncs } from "@/tools/list-syncs.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description: "List all syncs with their when/then action references. Optionally filter by concept.",
  args: { concept: tool.schema.string().optional().describe("Optional concept name filter") },
  async execute(args, context) {
    const { config, contract } = await resolveCtx(context.worktree);
    const syncs = await listSyncs(context.worktree, config, contract, args.concept);
    return formatSyncs(syncs, context.worktree, args.concept);
  },
});
