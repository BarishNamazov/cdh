import { tool } from "@opencode-ai/plugin";
import { formatConcepts, listConcepts } from "@/tools/list-concepts.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description: "List all concepts in the repo with action/query counts, spec status, and test status.",
  args: {},
  async execute(_args, context) {
    const { config, contract } = await resolveCtx(context.worktree);
    const concepts = await listConcepts(context.worktree, config, contract);
    return formatConcepts(concepts, context.worktree);
  },
});
