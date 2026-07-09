import { tool } from "@opencode-ai/plugin";
import { checkSpecSync, formatSpecDiff } from "@/tools/spec-sync.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description: "Check a concept's spec file for required sections and alignment with code surface (actions/queries).",
  args: { name: tool.schema.string().describe("Concept name") },
  async execute(args, context) {
    const { config, contract } = await resolveCtx(context.worktree);
    const diff = await checkSpecSync(context.worktree, config, contract, args.name);
    return diff ? formatSpecDiff(diff) : `Concept '${args.name}' not found or has no spec file.`;
  },
});
