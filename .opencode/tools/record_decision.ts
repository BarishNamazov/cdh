import { tool } from "@opencode-ai/plugin";
import { Journal } from "@/journal/journal.ts";
import { ENV_CAST, resolveConfig } from "./_shared.ts";

export default tool({
  description: "Record an architectural or implementation decision with alternatives for the run journal.",
  args: {
    title: tool.schema.string().describe("Decision title"),
    body: tool.schema.string().describe("Decision body/description"),
    alternatives: tool.schema.array(tool.schema.string()).optional().describe("Alternatives considered"),
  },
  async execute(args, context) {
    const config = await resolveConfig(context.worktree);
    const journal = new Journal(context.worktree, config);
    journal.initRun(ENV_CAST);
    journal.emitDecision(args.title, args.body, args.alternatives);
    return `Decision recorded: ${args.title}`;
  },
});
