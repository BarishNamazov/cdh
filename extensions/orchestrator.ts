import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { loadConfig } from "../src/config.ts";
import { Journal } from "../src/journal/journal.ts";

// ----- Agent registry -----

interface AgentSpec {
  label: string;
  tools: string[];
  system: string;
}

const AGENTS: Record<string, AgentSpec> = {
  "spec-writer": {
    label: "Spec Writer",
    tools: ["read", "write", "read_design_doc", "catalog_search", "catalog_show", "record_decision"],
    system:
      "Write concept specification documents following CDH conventions. " +
      "Output a markdown spec at design/concepts/<lowercase-name>.md with sections: " +
      "Purpose, Principle, State, Actions, Queries, Requires, Effects, Errors."
  },
  "concept-implementer": {
    label: "Concept Implementer",
    tools: ["read", "write", "edit", "bash", "describe_concept", "list_concepts", "read_design_doc", "run_verification", "record_decision"],
    system:
      "Implement concept classes from specifications. Create src/concepts/<Name>/<Name>Concept.ts. " +
      "Default export a class. Actions accept single-object params, return objects. " +
      "Queries start with _. No cross-concept imports. Write colocated tests."
  },
  "sync-implementer": {
    label: "Sync Implementer",
    tools: ["read", "write", "edit", "bash", "trace_sync", "sync_graph", "list_syncs", "sync_diagnostics", "read_design_doc", "run_verification", "record_decision"],
    system:
      "Implement synchronizations between concepts using the sync-engine DSL. " +
      "Trace before and after. Use when(), act(), where(), branch(on(...), onError(...)). " +
      "Export const declarations. Write sibling test files with positive and negative cases."
  },
  "test-writer": {
    label: "Test Writer",
    tools: ["read", "write", "edit", "bash", "describe_concept", "list_syncs", "read_design_doc"],
    system:
      "Write tests for concepts and syncs. For concepts: use setupTestDb, trace, testAction, expectError. " +
      "For syncs: use setupSyncTest with positive and negative cases. Tests must have trace() narration."
  },
  "reviewer": {
    label: "Reviewer",
    tools: ["read", "list_concepts", "list_syncs", "trace_sync", "sync_graph", "sync_diagnostics", "read_design_doc", "run_verification"],
    system:
      "Review changes for CDH rule compliance. Do NOT edit, write, or execute commands. " +
      "Check: R1 (no cross-imports), R2 (tests colocated), R6 (specs exist), " +
      "R9 (sync test shape), R10 (trace narration). Output verdict: APPROVED / NEEDS WORK / REJECTED."
  },
  "scout": {
    label: "Scout",
    tools: ["read", "list_concepts", "describe_concept", "list_syncs", "trace_sync", "sync_graph", "sync_diagnostics", "read_design_doc", "catalog_search", "catalog_show"],
    system:
      "Explore the codebase and report findings. Read-only — do NOT edit, write, delete, or execute commands. " +
      "Report concept surfaces, sync relationships, gaps, and architectural patterns."
  }
};

// ----- Subprocess helpers -----

interface AgentResult {
  agent: string;
  task: string;
  exitCode: number;
  output: string;
}

function quoted(s: string): string {
  return `"${s.replace(/"/g, '\\"')}"`;
}

function buildAgentPrompt(agent: AgentSpec, task: string): string {
  return [
    `You are the ${agent.label} agent. ${agent.system}`,
    ``,
    `Complete this task and output your result:`,
    task,
    ``,
    `After completing the task, run run_verification with tier quick if applicable.`,
    `Call record_decision with title and body to record significant decisions made during this work.`
  ].join("\n");
}

function executePi(cwd: string, prompt: string, tools: string[], env: Record<string, string>): AgentResult {
  const result = spawnSync("pi", [
    "--print",
    "--mode", "json",
    "--tools", tools.join(","),
    prompt
  ], {
    cwd,
    env: { ...process.env, ...env },
    timeout: 300_000,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024
  });

  return {
    agent: "subagent",
    task: prompt.slice(0, 200),
    exitCode: result.status ?? 1,
    output: result.stdout ?? ""
  };
}

// ----- Orchestration -----

function runSingle(
  cwd: string, task: string, agent: AgentSpec, runDir: string
): AgentResult {
  const prompt = buildAgentPrompt(agent, task);
  return executePi(cwd, prompt, agent.tools, { CDH_RUN_DIR: runDir });
}

function runChain(
  cwd: string, tasks: string[], agent: AgentSpec, runDir: string
): AgentResult[] {
  const results: AgentResult[] = [];
  const priorOutputs: string[] = [];

  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!;
    let fullTask = task;

    if (priorOutputs.length > 0) {
      fullTask += "\n\n--- Previous step outputs ---\n" +
        priorOutputs.map((o, j) => `Step ${j + 1}: ${o.slice(0, 3000)}`).join("\n\n");
    }

    const result = executePi(cwd, buildAgentPrompt(agent, fullTask), agent.tools, { CDH_RUN_DIR: runDir });
    results.push(result);

    if (result.exitCode === 0 && result.output) {
      const stepDir = path.join(runDir, `step-${i}`);
      mkdirSync(stepDir, { recursive: true });
      priorOutputs.push(result.output);
    }
  }

  return results;
}

function runParallel(
  cwd: string, tasks: string[], agent: AgentSpec, agents: AgentSpec[], runDir: string
): AgentResult[] {
  // No real concurrency in spawnSync, but we can run sequentially and pretend
  const results: AgentResult[] = [];
  const batch = Math.min(tasks.length, 3);

  for (let i = 0; i < batch; i++) {
    const task = tasks[i]!;
    const a = agents[i] ?? agent;
    results.push(runSingle(cwd, task, a, path.join(runDir, `agent-${i}`)));
  }

  return results;
}

function resolveAgent(name: string): AgentSpec {
  return AGENTS[name] ?? {
    label: name,
    tools: ["read", "write", "edit", "bash"],
    system: `You are the ${name} agent. Complete the task and report your result.`
  };
}

// ----- Extension -----

export default function orchestrator(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "orchestrate_run",
    label: "Orchestrate Agents",
    description:
      "Delegate work to specialized subagents. " +
      "Available agents: spec-writer, concept-implementer, sync-implementer, test-writer, reviewer, scout. " +
      "Mode 'single' runs one agent on one task. " +
      "Mode 'chain' runs sequentials steps, each receiving prior outputs. " +
      "Mode 'parallel' fans out to up to 3 agents on independent tasks.",
    parameters: Type.Object({
      mode: Type.Union([Type.Literal("single"), Type.Literal("chain"), Type.Literal("parallel")]),
      tasks: Type.Array(Type.String(), { description: "Task descriptions, one per agent or step" }),
      agent: Type.String({ description: "Agent name: spec-writer, concept-implementer, sync-implementer, test-writer, reviewer, scout" }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const config = await loadConfig(cwd);
      const journal = new Journal(cwd, config);
      journal.initRun(process.env as Record<string, string | undefined>);

      const runId = journal.getRunId() ?? "orchestrate";
      const orchestratorDir = path.join(cwd, config.paths.journal, "runs", runId, "orchestrate");
      mkdirSync(orchestratorDir, { recursive: true });

      const agent = resolveAgent(params.agent);

      let results: AgentResult[];

      switch (params.mode) {
        case "chain":
          results = runChain(cwd, params.tasks, agent, orchestratorDir);
          break;
        case "parallel": {
          const agents = params.tasks.map((_, i) => i === 0 ? agent : resolveAgent(params.agent));
          results = runParallel(cwd, params.tasks, agent, agents, orchestratorDir);
          break;
        }
        default:
          results = [runSingle(cwd, params.tasks[0] ?? "No task provided", agent, orchestratorDir)];
      }

      for (const result of results) {
        journal.emit("agent_spawned", {
          agent: result.agent,
          task: result.task.slice(0, 200),
          childSessionFile: orchestratorDir
        });

        journal.emit("agent_finished", {
          agent: result.agent,
          ok: result.exitCode === 0,
          usage: "unknown"
        });
      }

      const lines: string[] = [`Orchestration complete (${params.mode}):`, ""];

      for (const result of results) {
        const status = result.exitCode === 0 ? "OK" : `FAIL (${result.exitCode})`;
        lines.push(`[${status}] ${result.agent}: ${result.task.slice(0, 120)}`);
        if (result.output) {
          lines.push(result.output.slice(0, 600));
        }
        lines.push("");
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { results, mode: params.mode }
      };
    }
  });

  pi.registerCommand("orchestrate", {
    description: "Orchestrate subagents: /orchestrate single|chain|parallel <agent> <tasks...>",
    handler: async (_args, ctx) => {
      ctx.ui.setStatus("cdh-orchestrate", "Orchestration command ready");
    }
  });
}
