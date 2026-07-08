import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Message } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../src/config.ts";
import { Journal } from "../src/journal/journal.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BUILTIN_AGENTS_DIR = path.resolve(__dirname, "..", "agents");
const HARNESS_DESIGN_DIR = path.resolve(__dirname, "..", "..", "design", "background");

// ----- Agent types -----

interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  docs: string[];
  systemPrompt: string;
}

interface AgentResult {
  agent: string;
  task: string;
  exitCode: number;
  messages: Message[];
  stderr: string;
  usage: UsageStats;
  model?: string;
  stopReason?: string;
  errorMessage?: string;
  step?: number;
}

interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  contextTokens: number;
  turns: number;
}

interface OrchestratorDetails {
  mode: "single" | "parallel" | "chain";
  results: AgentResult[];
}

// ----- Agent loading -----

let _agentsCache: AgentConfig[] | null = null;

function loadAgents(): AgentConfig[] {
  if (_agentsCache) return _agentsCache;

  const agents: AgentConfig[] = [];

  if (!existsSync(BUILTIN_AGENTS_DIR)) return agents;

  let entries: string[];
  try {
    entries = readdirSync(BUILTIN_AGENTS_DIR);
  } catch {
    return agents;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;

    const filePath = path.join(BUILTIN_AGENTS_DIR, entry);
    let content: string;
    try {
      content = readFileSync(filePath, "utf-8");
    } catch {
      continue;
    }

    const { frontmatter, body } = parseFrontmatter<Record<string, string>>(content);

    if (!frontmatter.name || !frontmatter.description) continue;

    const tools =
      frontmatter.tools
        ?.split(",")
        .map((t: string) => t.trim())
        .filter(Boolean) ?? [];

    const docs =
      frontmatter.docs
        ?.split(",")
        .map((d: string) => d.trim())
        .filter(Boolean) ?? [];

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools,
      model: frontmatter.model,
      docs,
      systemPrompt: body,
    });
  }

  _agentsCache = agents;
  return agents;
}

// ----- Helpers -----

const CONCURRENCY_LIMIT = 4;

function zeroUsage(): UsageStats {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, contextTokens: 0, turns: 0 };
}

function getFinalOutput(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role === "assistant") {
      for (const part of msg.content ?? []) {
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
  agent: AgentConfig,
  task: string,
  step?: number,
  signal?: AbortSignal,
  onUpdate?: (update: string) => void
): Promise<AgentResult> {
  let systemPrompt = agent.systemPrompt;

  for (const docName of agent.docs) {
    const docPath = path.join(HARNESS_DESIGN_DIR, docName);
    try {
      if (existsSync(docPath)) {
        const docContent = readFileSync(docPath, "utf-8");
        systemPrompt = `${docContent}\n\n---\n\n${systemPrompt}`;
      }
    } catch {
      /* skip missing doc */
    }
  }

  const args: string[] = ["--print", "--mode", "json", "--no-session"];
  if (agent.model) args.push("--model", agent.model);
  if (agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  const { filePath: promptPath, tmpDir: promptDir } = await writeTempFile(agent.name, systemPrompt);
  args.push("--append-system-prompt", promptPath);

  args.push(`Task: ${task}`);

  onUpdate?.(`[${agent.name}] Starting: ${task.slice(0, 80)}...`);

  const result: AgentResult = {
    agent: agent.name,
    task,
    exitCode: 0,
    messages: [],
    stderr: "",
    usage: zeroUsage(),
    step,
    model: agent.model,
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
        const msg = event.message as Message;
        result.messages.push(msg);

        if (msg.role === "assistant") {
          result.usage.turns++;
          const usage = msg.usage;
          if (usage) {
            result.usage.input += usage.input || 0;
            result.usage.output += usage.output || 0;
            result.usage.cacheRead += usage.cacheRead || 0;
            result.usage.cacheWrite += usage.cacheWrite || 0;
            result.usage.cost += usage.cost?.total || 0;
            result.usage.contextTokens = usage.totalTokens || 0;
          }
          if (!result.model && msg.model) {
            result.model = msg.model;
          }
          if (msg.stopReason) {
            result.stopReason = msg.stopReason;
          }
          if ((msg as { errorMessage?: string }).errorMessage) {
            result.errorMessage = (msg as { errorMessage?: string }).errorMessage;
          }
        }
      }

      if (event.type === "tool_result_end" && event.message) {
        result.messages.push(event.message as Message);
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
  onUpdate?.(`[${agent.name}] ${status} (${result.usage.output} output tokens)`);

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
  agent: AgentConfig,
  signal?: AbortSignal,
  onUpdate?: (update: string) => void
): Promise<AgentResult[]> {
  return mapWithConcurrencyLimit(tasks, CONCURRENCY_LIMIT, async (task, index) => {
    return runSingleAgent(cwd, agent, task, index, signal, onUpdate);
  });
}

// ----- Chain execution -----

async function runChain(
  cwd: string,
  tasks: string[],
  agent: AgentConfig,
  signal?: AbortSignal,
  onUpdate?: (update: string) => void
): Promise<AgentResult[]> {
  const results: AgentResult[] = [];
  let previousOutput = "";

  for (let i = 0; i < tasks.length; i++) {
    const rawTask = tasks[i];
    if (!rawTask) continue;
    const task = rawTask.replace(/\{previous\}/g, previousOutput);

    onUpdate?.(`[chain ${i + 1}/${tasks.length}] ${agent.name}`);

    const result = await runSingleAgent(cwd, agent, task, i + 1, signal, onUpdate);
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
    description: [
      "Delegate work to specialized subagents with isolated context.",
      "Six agents are loaded from the CDH package: spec-writer, concept-implementer, sync-implementer, test-writer, reviewer, scout.",
      "Modes: single (agent + task), chain (sequential with {previous} placeholder), parallel (fan out up to 4 agents).",
    ].join(" "),
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

      const agents = loadAgents();
      const agent = agents.find((a) => a.name === params.agent);

      if (!agent) {
        const available = agents.map((a) => a.name).join(", ") || "none";
        return {
          content: [{ type: "text", text: `Unknown agent: "${params.agent}". Available: ${available}` }],
          details: { mode: params.mode, results: [] } as OrchestratorDetails,
          isError: true,
        };
      }

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
          results = [await runSingleAgent(cwd, agent, task, undefined, signal ?? undefined, onUpdate)];
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
