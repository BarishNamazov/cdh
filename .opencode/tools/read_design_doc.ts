import { tool } from "@opencode-ai/plugin";
import { formatDesignDoc, listDocs, readDesignDoc } from "@/tools/design-doc.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description:
    "Read a design document by its key (e.g. 'testing-conventions', 'concept-spec-conventions'). Call without a key to list available documents.",
  args: { key: tool.schema.string().optional().describe("Design doc key, or omit to list available docs") },
  async execute(args, context) {
    const { contract } = await resolveCtx(context.worktree);
    if (!args.key) return listDocs(contract);
    const result = readDesignDoc(context.worktree, contract, args.key);
    return formatDesignDoc(result);
  },
});
