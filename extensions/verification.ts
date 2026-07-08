import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../src/config.ts";
import { loadRepoContract } from "../src/repo-contract.ts";
import { createRuleEngine } from "../src/rules/rule-engine.ts";
import { Journal } from "../src/journal/journal.ts";
import { runVerification } from "../src/verify/runner.ts";

export default function verification(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "record_decision",
    label: "Record Decision",
    description: "Record an architectural or implementation decision with alternatives for the run journal.",
    parameters: Type.Object({
      title: Type.String(),
      body: Type.String(),
      alternatives: Type.Optional(Type.Array(Type.String())),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const config = await loadConfig(cwd);
      const journal = new Journal(cwd, config);
      journal.initRun(process.env as Record<string, string | undefined>);
      journal.emitDecision(params.title, params.body, params.alternatives);
      return {
        content: [{ type: "text", text: `Decision recorded: ${params.title}` }],
        details: { title: params.title }
      };
    }
  });
  pi.registerTool({
    name: "run_verification",
    label: "Run Verification",
    description: "Run verification stages against the repo. Use tier 'quick' for fast checks or 'ship' for full pre-ship verification.",
    parameters: Type.Object({
      tier: Type.Union([Type.Literal("quick"), Type.Literal("ship")]),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const config = await loadConfig(cwd);
      const { contract } = await loadRepoContract(cwd, config);
      const engine = createRuleEngine(cwd, config, contract);
      const journal = new Journal(cwd, config);
      journal.initRun(process.env as Record<string, string | undefined>);

      const results = await runVerification({
        cwd,
        config,
        contract,
        ruleEngine: engine,
        journal,
        tier: params.tier
      });

      const lines: string[] = [];
      for (const result of results) {
        const icon = result.status === "pass" ? "PASS"
          : result.status === "skip" ? "SKIP"
          : result.status === "warn" ? "WARN"
          : "FAIL";
        lines.push(`  ${icon}  ${result.stage} (${result.durationMs}ms) — ${result.summary}`);
      }

      const failed = results.filter((r) => r.status === "fail");
      const summary = failed.length > 0
        ? `${failed.length} stage(s) failed.`
        : "All stages passed.";

      return {
        content: [{ type: "text", text: `Verification (${params.tier}):\n${lines.join("\n")}\n\n${summary}` }],
        details: { results, tier: params.tier, passed: failed.length === 0 }
      };
    }
  });

  pi.on("agent_end", async (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    const config = await loadConfig(cwd);

    try {
      const { contract } = await loadRepoContract(cwd, config);
      const journal = new Journal(cwd, config);
      journal.initRun(process.env as Record<string, string | undefined>);
      const engine = createRuleEngine(cwd, config, contract);

      const results = await runVerification({
        cwd,
        config,
        contract,
        ruleEngine: engine,
        journal,
        tier: "quick"
      });

      const failed = results.filter((r) => r.status === "fail");

      if (failed.length > 0) {
        journal.emitDecision(
          "agent_end verification failed",
          `${failed.length} stage(s) failed: ${failed.map((r) => r.stage).join(", ")}`
        );
      }
    } catch {
    }
  });
}
