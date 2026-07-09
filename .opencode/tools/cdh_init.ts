import { tool } from "@opencode-ai/plugin";
import { type InitResult, initProject } from "@/init.ts";

export default tool({
  description:
    "Scaffold a minimal, working concept-design repo in the current directory. " +
    "Creates package.json, tsconfig.json, .gitignore, a Greeting concept with spec, " +
    "sync, tests, and utility helpers. Idempotent — skips existing files.",
  args: {},
  async execute(_args, context) {
    const result: InitResult = initProject(context.worktree);
    const lines = [`CDH project initialized in ${context.worktree}`, "", "Created:"];
    for (const file of result.created) lines.push(`  + ${file}`);
    if (result.skipped.length > 0) {
      lines.push("", "Skipped (already exist):");
      for (const file of result.skipped) lines.push(`  · ${file}`);
    }
    if (result.errors.length > 0) {
      lines.push("", "Errors:");
      for (const err of result.errors) lines.push(`  ! ${err}`);
      return lines.join("\n");
    }
    lines.push("", "Next steps:", "  1. bun install", "  2. bun test", "  3. cdh rules");
    return lines.join("\n");
  },
});
