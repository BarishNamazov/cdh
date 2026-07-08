import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../src/config.ts";
import { Journal } from "../src/journal/journal.ts";

// ----- Agent filesystem discovery -----

const PI_AGENT_DIR = path.join(homedir(), ".pi", "agent", "agents");

function parseAgentFrontmatter(content: string): { name: string; description: string; tools: string[] } | null {
  const headerEnd = content.indexOf("---\n", 4);
  if (!headerEnd) return null;

  const header = content.slice(4, headerEnd);
  const name = header.match(/^name:\s*(.+)/m)?.[1]?.trim();
  const description = header.match(/^description:\s*(.+)/m)?.[1]?.trim();
  const toolsRaw = header.match(/^tools:\s*(.+)/m)?.[1]?.trim();

  if (!name || !description) return null;
  return { name, description, tools: toolsRaw ? toolsRaw.split(/,\s*/).filter(Boolean) : [] };
}

function discoverAgents(): Map<string, AgentSpec> {
  const discovered = new Map<string, AgentSpec>();

  if (!existsSync(PI_AGENT_DIR)) return discovered;

  let entries: string[];
  try {
    entries = readdirSync(PI_AGENT_DIR);
  } catch {
    return discovered;
  }

  for (const entry of entries) {
    if (!entry.startsWith("cdh-") || !entry.endsWith(".md")) continue;

    const content = readFileSync(path.join(PI_AGENT_DIR, entry), "utf8");
    const meta = parseAgentFrontmatter(content);
    if (!meta) continue;

    const agentName = meta.name;

    discovered.set(agentName, {
      label: agentName.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
      tools: meta.tools,
      system: content.slice(content.indexOf("---\n", 4) + 4).trim(),
    });
  }

  return discovered;
}

export function installAgents(): { installed: string[]; skipped: string[]; errors: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const sourceDir = path.resolve(import.meta.dir, "..", "agents");
  if (!existsSync(sourceDir)) {
    errors.push(`Agent source directory not found: ${sourceDir}`);
    return { installed, skipped, errors };
  }

  mkdirSync(PI_AGENT_DIR, { recursive: true });

  let files: string[];
  try {
    files = readdirSync(sourceDir);
  } catch {
    errors.push(`Failed to read agent source directory: ${sourceDir}`);
    return { installed, skipped, errors };
  }

  for (const file of files) {
    if (!file.endsWith(".md")) continue;

    const sourcePath = path.join(sourceDir, file);
    const content = readFileSync(sourcePath, "utf8");
    const meta = parseAgentFrontmatter(content);

    if (!meta) {
      errors.push(`Invalid agent frontmatter in ${file}`);
      continue;
    }

    const destPath = path.join(PI_AGENT_DIR, `cdh-${file}`);
    const exists = existsSync(destPath);

    if (exists) {
      const existing = readFileSync(destPath, "utf8");
      const existingMeta = parseAgentFrontmatter(existing);
      if (existingMeta && existingMeta.name === meta.name) {
        skipped.push(meta.name);
        continue;
      }
    }

    try {
      writeFileSync(destPath, content, { encoding: "utf8", mode: 0o644 });
      installed.push(meta.name);
    } catch {
      errors.push(`Failed to write ${destPath}`);
    }
  }

  return { installed, skipped, errors };
}

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
      "Purpose, Principle, State, Actions, Queries, Requires, Effects, Errors.",
  },
  "concept-implementer": {
    label: "Concept Implementer",
    tools: [
      "read",
      "write",
      "edit",
      "bash",
      "describe_concept",
      "list_concepts",
      "read_design_doc",
      "run_verification",
      "record_decision",
    ],
    system:
      "Implement concept classes from specifications. Create src/concepts/<Name>/<Name>Concept.ts. " +
      "Default export a class. Actions accept single-object params, return objects. " +
      "Queries start with _. No cross-concept imports. Write colocated tests.",
  },
  "sync-implementer": {
    label: "Sync Implementer",
    tools: [
      "read",
      "write",
      "edit",
      "bash",
      "trace_sync",
      "sync_graph",
      "list_syncs",
      "sync_diagnostics",
      "read_design_doc",
      "run_verification",
      "record_decision",
    ],
    system:
      "Implement synchronizations between concepts using the @mit-sdg/sync-engine DSL. " +
      "Trace before and after. Use when(), act(), where(), branch(on(...), onError(...)). " +
      "Export const declarations. Write sibling test files with positive and negative cases.",
  },
  "test-writer": {
    label: "Test Writer",
    tools: ["read", "write", "edit", "bash", "describe_concept", "list_syncs", "read_design_doc"],
    system:
      "Write tests for concepts and syncs. For concepts: use setupTestDb, trace, testAction, expectError. " +
      "For syncs: use setupSyncTest with positive and negative cases. Tests must have trace() narration.",
  },
  reviewer: {
    label: "Reviewer",
    tools: [
      "read",
      "list_concepts",
      "list_syncs",
      "trace_sync",
      "sync_graph",
      "sync_diagnostics",
      "read_design_doc",
      "run_verification",
    ],
    system:
      "Review changes for CDH rule compliance. Do NOT edit, write, or execute commands. " +
      "Check: R1 (no cross-imports), R2 (tests colocated), R6 (specs exist), " +
      "R9 (sync test shape), R10 (trace narration). Output verdict: APPROVED / NEEDS WORK / REJECTED.",
  },
  scout: {
    label: "Scout",
    tools: [
      "read",
      "list_concepts",
      "describe_concept",
      "list_syncs",
      "trace_sync",
      "sync_graph",
      "sync_diagnostics",
      "read_design_doc",
      "catalog_search",
      "catalog_show",
    ],
    system:
      "Explore the codebase and report findings. Read-only — do NOT edit, write, delete, or execute commands. " +
      "Report concept surfaces, sync relationships, gaps, and architectural patterns.",
  },
};

// ----- Types -----

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface AgentResult {
  agent: string;
  task: string;
  exitCode: number;
  messages: Record<string, unknown>[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
}

interface OrchestratorDetails {
  mode: "single" | "parallel" | "chain";
  results: AgentResult[];
}

// ----- Helpers -----

const CONCURRENCY_LIMIT = 4;

function resolveAgent(name: string): AgentSpec {
  const discovered = discoverAgents();
  if (discovered.has(name)) {
    return discovered.get(name)!;
  }

  return (
    AGENTS[name] ?? {
      label: name,
      tools: ["read", "write", "edit", "bash"],
      system: `You are the ${name} agent. Complete the task and report your result.`,
    }
  );
}

function zeroUsage(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

function getFinalOutput(messages: Record<string, unknown>[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (!msg) continue;
    if ((msg as { role?: string }).role === "assistant") {
      for (const part of (msg as { content?: { type: string; text: string }[] }).content ?? []) {
        if (part.type === "text") return part.text;
      }
    }
  }
  return "";
}

function isFailed(result: AgentResult): boolean {
  return result.exitCode !== 0 || result.stopReason === "error" || result.stopReason === "aborted";
}

// ----- Spawn & JSONL streaming -----

async function writeTempFile(agentName: string, content: string): Promise<{ filePath: string; tmpDir: string }> {
  const tmpDir = await mkdtemp(path.join(tmpdir(), "cdh-agent-"));
  const safeName = agentName.replace(/[^\w.-]+/g, "_");
  const filePath = path.join(tmpDir, `prompt-${safeName}.txt`);
  await writeFile(filePath, content, { encoding: "utf-8", mode: 0o600 });
  return { filePath, tmpDir };
}

async function runSingleAgent(
  defaultCwd: string,
  agentName: string,
  task: string,
  step?: number,
  signal?: AbortSignal,
  onUpdate?: (update: string) => void
): Promise<AgentResult> {
  const agent = resolveAgent(agentName);

  const args: string[] = ["--print", "--mode", "json", "--no-session"];
  if (agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  const systemPrompt = `You are the ${agent.label} agent. ${agent.system}`;
  const { filePath: promptPath, tmpDir: promptDir } = await writeTempFile(agentName, systemPrompt);
  args.push("--append-system-prompt", promptPath);

  args.push(`Task: ${task}`);

  onUpdate?.(`[${agentName}] Starting: ${task.slice(0, 80)}...`);

  const result: AgentResult = {
    agent: agentName,
    task,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: zeroUsage(),
    step,
  };

  let wasAborted = false;

  const exitCode = await new Promise<number>((resolve) => {
    const proc = spawn("pi", args, {
      cwd: defaultCwd,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let buffer = "";

    const processLine = (line: string) => {
      if (!line.trim()) return;
      let event: Record<string, unknown>;
      try {
        event = JSON.parse(line);
      } catch {
        return;
      }

      if (event.type === "message_end" && event.message) {
        const msg = event.message as Record<string, unknown>;
        result.messages.push(msg);

        if ((msg as { role?: string }).role === "assistant") {
          result.usage.turns++;
          const usage = (
            msg as {
              usage?: {
                input?: number;
                output?: number;
                cacheRead?: number;
                cacheWrite?: number;
                cost?: { total?: number };
                totalTokens?: number;
              };
            }
          ).usage;
          if (usage) {
            result.usage.input += usage.input || 0;
            result.usage.output += usage.output || 0;
            result.usage.cacheRead += usage.cacheRead || 0;
            result.usage.cacheWrite += usage.cacheWrite || 0;
            result.usage.cost += usage.cost?.total || 0;
            result.usage.contextTokens = usage.totalTokens || 0;
          }
          if (!result.model && (msg as { model?: string }).model) {
            result.model = (msg as { model?: string }).model;
          }
          if ((msg as { stopReason?: string }).stopReason) {
            result.stopReason = (msg as { stopReason?: string }).stopReason;
          }
          if ((msg as { errorMessage?: string }).errorMessage) {
            result.errorMessage = (msg as { errorMessage?: string }).errorMessage;
          }
        }
      }

      if (event.type === "tool_result_end" && event.message) {
        result.messages.push(event.message as Record<string, unknown>);
      }
    };

    proc.stdout?.on("data", (data: Buffer) => {
      buffer += data.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) processLine(line);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      result.stderr += data.toString();
    });

    proc.on("close", (code) => {
      if (buffer.trim()) processLine(buffer);
      resolve(code ?? 0);
    });

    proc.on("error", () => {
      resolve(1);
    });

    if (signal) {
      const killProc = () => {
        wasAborted = true;
        proc.kill("SIGTERM");
        setTimeout(() => {
          if (!proc.killed) proc.kill("SIGKILL");
        }, 5000);
      };
      if (signal.aborted) killProc();
      else signal.addEventListener("abort", killProc, { once: true });
    }
  });

  result.exitCode = exitCode;
  if (wasAborted) {
    result.stopReason = "aborted";
    result.errorMessage = "Subagent was aborted";
  }

  try {
    await unlink(promptPath);
    await rm(promptDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }

  const status = isFailed(result) ? "FAILED" : "COMPLETE";
  onUpdate?.(`[${agentName}] ${status} (${result.usage.output} output tokens)`);

  return result;
}

// ----- Concurrency-limited parallel -----

async function mapWithConcurrencyLimit<TIn, TOut>(
  items: TIn[],
  concurrency: number,
  fn: (item: TIn, index: number) => Promise<TOut>
): Promise<TOut[]> {
  if (items.length === 0) return [];
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results: TOut[] = new Array(items.length);
  let nextIndex = 0;

  const workers = new Array(limit).fill(null).map(async () => {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      const item = items[current];
      if (!item) return;
      results[current] = await fn(item, current);
    }
  });

  await Promise.all(workers);
  return results;
}

// ----- Parallel execution -----

async function runParallel(
  cwd: string,
  tasks: string[],
  agent: AgentSpec,
  signal?: AbortSignal,
  onUpdate?: (update: string) => void
): Promise<AgentResult[]> {
  return mapWithConcurrencyLimit(tasks, CONCURRENCY_LIMIT, async (task, index) => {
    return runSingleAgent(cwd, agent.label, task, index, signal, onUpdate);
  });
}

// ----- Chain execution -----

async function runChain(
  cwd: string,
  tasks: string[],
  agent: AgentSpec,
  signal?: AbortSignal,
  onUpdate?: (update: string) => void
): Promise<AgentResult[]> {
  const results: AgentResult[] = [];
  let previousOutput = "";

  for (let i = 0; i < tasks.length; i++) {
    const rawTask = tasks[i];
    if (!rawTask) continue;
    const task = rawTask.replace(/\{previous\}/g, previousOutput);

    onUpdate?.(`[chain ${i + 1}/${tasks.length}] ${agent.label}`);

    const result = await runSingleAgent(cwd, agent.label, task, i + 1, signal, onUpdate);
    results.push(result);

    if (isFailed(result)) break;

    previousOutput = getFinalOutput(result.messages);
  }

  return results;
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
      "Mode 'chain' runs sequential steps, each receiving prior output via {previous} placeholder. " +
      "Mode 'parallel' fans out to up to 4 concurrent agents on independent tasks.",
    parameters: Type.Object({
      mode: Type.Union([Type.Literal("single"), Type.Literal("chain"), Type.Literal("parallel")]),
      tasks: Type.Array(Type.String(), { description: "Task descriptions, one per agent or step" }),
      agent: Type.String({
        description: "Agent name: spec-writer, concept-implementer, sync-implementer, test-writer, reviewer, scout",
      }),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const onUpdate = _onUpdate
        ? (msg: string) => _onUpdate({ content: [{ type: "text" as const, text: msg }], details: undefined })
        : undefined;
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
          results = await runChain(cwd, params.tasks, agent, signal ?? undefined, onUpdate);
          break;
        case "parallel":
          results = await runParallel(cwd, params.tasks, agent, signal ?? undefined, onUpdate);
          break;
        default: {
          const task = params.tasks[0] ?? "No task provided";
          results = [await runSingleAgent(cwd, params.agent, task, undefined, signal ?? undefined, onUpdate)];
        }
      }

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result) continue;
        const agentStepDir = path.join(orchestratorDir, `agent-${i}`);
        mkdirSync(agentStepDir, { recursive: true });

        journal.emit("agent_spawned", {
          agent: result.agent,
          task: result.task.slice(0, 200),
          childSessionFile: agentStepDir,
        });

        journal.emit("agent_finished", {
          agent: result.agent,
          ok: result.exitCode === 0,
          usage: result.usage,
        });
      }

      const detail: OrchestratorDetails = {
        mode: params.mode,
        results,
      };

      const lines: string[] = [`Orchestration complete (${params.mode}):`, ""];

      for (const result of results) {
        const status = isFailed(result) ? `FAIL${result.stopReason ? ` (${result.stopReason})` : ""}` : "OK";
        lines.push(`[${status}] ${result.agent}: ${result.task.slice(0, 120)}`);

        const output = getFinalOutput(result.messages);
        if (output) {
          lines.push(output.slice(0, 600));
        }
        lines.push("");
      }

      const allPassed = results.every((r) => !isFailed(r));

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: detail,
        isError: !allPassed,
      };
    },
  });

  pi.registerCommand("orchestrate", {
    description: "Orchestrate subagents: /orchestrate single|chain|parallel <agent> <tasks...>",
    handler: async (_args, ctx) => {
      ctx.ui.setStatus("cdh-orchestrate", "Orchestration command ready");
    },
  });
}
