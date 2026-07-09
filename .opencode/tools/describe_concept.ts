import { tool } from "@opencode-ai/plugin";
import { describeConcept, formatConceptDetail } from "@/tools/describe-concept.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description: "Show detailed surface (actions, queries, signatures) and spec for a concept.",
  args: { name: tool.schema.string().describe("Concept name") },
  async execute(args, context) {
    const { config, contract } = await resolveCtx(context.worktree);
    const result = await describeConcept(context.worktree, config, contract, args.name);
    return result ? formatConceptDetail(result, context.worktree) : `Concept '${args.name}' not found.`;
  },
});
