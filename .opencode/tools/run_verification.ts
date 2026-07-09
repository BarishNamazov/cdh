import { tool } from "@opencode-ai/plugin";
import { Journal } from "@/journal/journal.ts";
import { createRuleEngine } from "@/rules/rule-engine.ts";
import { formatStageResults } from "@/verify/format.ts";
import { runVerification } from "@/verify/runner.ts";
import { ENV_CAST, resolveCtx } from "./_shared.ts";

export default tool({
  description:
    "Run verification stages against the repo. Use tier 'quick' for fast checks or 'ship' for full pre-ship verification.",
  args: { tier: tool.schema.enum(["quick", "ship"]).describe("Verification tier: 'quick' or 'ship'") },
  async execute(args, context) {
    const cwd = context.worktree;
    const { config, contract } = await resolveCtx(cwd);
    const engine = createRuleEngine(cwd, config, contract);
    const journal = new Journal(cwd, config);
    journal.initRun(ENV_CAST);

    const results = await runVerification({ cwd, config, contract, ruleEngine: engine, journal, tier: args.tier });
    const lines = formatStageResults(results);
    const failed = results.filter((r) => r.status === "fail");
    const summary = failed.length > 0 ? `${failed.length} stage(s) failed.` : "All stages passed.";
    return `Verification (${args.tier}):\n${lines.join("\n")}\n\n${summary}`;
  },
});
