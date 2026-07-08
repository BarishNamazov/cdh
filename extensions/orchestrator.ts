import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Message } from "@earendil-works/pi-ai";
import { StringEnum } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../src/config.ts";
import { Journal } from "../src/journal/journal.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----- Agent types -----

export type AgentScope = "user" | "project" | "both";

interface AgentConfig {
  name: string;
  description: string;
  tools: string[];
  model?: string;
  systemPrompt: string;
  source: "user" | "project" | "builtin";
  filePath: string;
}

interface AgentDiscoveryResult {
  agents: AgentConfig[];
  projectAgentsDir: string | null;
}

// ----- Agent discovery -----

const PI_AGENT_DIR = path.join(getAgentDir(), "agents");
const BUILTIN_AGENTS_DIR = path.resolve(__dirname, "..", "agents");

function loadAgentsFromDir(dir: string, source: "user" | "project" | "builtin"): AgentConfig[] {
  const agents: AgentConfig[] = [];

  if (!existsSync(dir)) return agents;

  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return agents;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;

    const filePath = path.join(dir, entry);
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

    agents.push({
      name: frontmatter.name,
      description: frontmatter.description,
      tools,
      model: frontmatter.model,
      systemPrompt: body,
      source,
      filePath,
    });
  }

  return agents;
}

function isDirectory(p: string): boolean {
  try {
    return require("node:fs").statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function findNearestProjectAgentsDir(cwd: string): string | null {
  let currentDir = cwd;
  while (true) {
    const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
    if (isDirectory(candidate)) return candidate;

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) return null;
    currentDir = parentDir;
  }
}

function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
  const projectAgentsDir = findNearestProjectAgentsDir(cwd);

  const userAgents = scope === "project" ? [] : loadAgentsFromDir(PI_AGENT_DIR, "user");
  const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");
  const builtinAgents = loadAgentsFromDir(BUILTIN_AGENTS_DIR, "builtin");

  const agentMap = new Map<string, AgentConfig>();

  for (const agent of builtinAgents) agentMap.set(agent.name, agent);
  for (const agent of userAgents) agentMap.set(agent.name, agent);
  for (const agent of projectAgents) agentMap.set(agent.name, agent);

  return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

// ----- Agent installation (cdh setup) -----

export function installAgents(): { installed: string[]; skipped: string[]; errors: string[] } {
  const installed: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const sourceDir = path.resolve(__dirname, "..", "agents");
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
    const { frontmatter } = parseFrontmatter<Record<string, string>>(content);

    if (!frontmatter.name) {
      errors.push(`Invalid agent frontmatter in ${file}`);
      continue;
    }

    const destPath = path.join(PI_AGENT_DIR, `cdh-${file}`);
    const exists = existsSync(destPath);

    if (exists) {
      const existing = readFileSync(destPath, "utf8");
      const { frontmatter: existingFrontmatter } = parseFrontmatter<Record<string, string>>(existing);
      if (existingFrontmatter.name === frontmatter.name) {
        skipped.push(frontmatter.name);
        continue;
      }
    }

    try {
      writeFileSync(destPath, content, { encoding: "utf8", mode: 0o644 });
      installed.push(frontmatter.name);
    } catch {
      errors.push(`Failed to write ${destPath}`);
    }
  }

  return { installed, skipped, errors };
}

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
  agentSource: "user" | "project" | "builtin" | "unknown";
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

interface OrchestratorDetails {
  mode: "single" | "parallel" | "chain";
  agentScope: AgentScope;
  projectAgentsDir: string | null;
  results: AgentResult[];
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
  const args: string[] = ["--print", "--mode", "json", "--no-session"];
  if (agent.model) args.push("--model", agent.model);
  if (agent.tools.length > 0) args.push("--tools", agent.tools.join(","));

  const { filePath: promptPath, tmpDir: promptDir } = await writeTempFile(agent.name, agent.systemPrompt);
  args.push("--append-system-prompt", promptPath);

  args.push(`Task: ${task}`);

  onUpdate?.(`[${agent.name}] Starting: ${task.slice(0, 80)}...`);

  const result: AgentResult = {
    agent: agent.name,
    agentSource: agent.source,
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

const AgentScopeSchema = StringEnum(["user", "project", "both"] as const, {
  description: 'Which agent directories to use. Default: "user". Use "both" to include project-local agents.',
  default: "user",
});

export default function orchestrator(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "orchestrate_run",
    label: "Orchestrate Agents",
    description: [
      "Delegate work to specialized subagents with isolated context.",
      "Agents are discovered from ~/.pi/agent/agents/ (user) and .pi/agents/ (project).",
      "Use agentScope to control which pool is used.",
      "Modes: single (agent + task), chain (sequential with {previous} placeholder), parallel (fan out up to 4 agents).",
    ].join(" "),
    parameters: Type.Object({
      mode: Type.Union([Type.Literal("single"), Type.Literal("chain"), Type.Literal("parallel")]),
      tasks: Type.Array(Type.String(), { description: "Task descriptions, one per agent or step" }),
      agent: Type.String({
        description: "Agent name to delegate to",
      }),
      agentScope: Type.Optional(AgentScopeSchema),
      confirmProjectAgents: Type.Optional(
        Type.Boolean({ description: "Prompt before running project-local agents. Default: true.", default: true })
      ),
    }),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const agentScope: AgentScope = params.agentScope ?? "user";
      const confirmProjectAgents = params.confirmProjectAgents ?? true;

      const onUpdate = _onUpdate
        ? (msg: string) => _onUpdate({ content: [{ type: "text" as const, text: msg }], details: undefined })
        : undefined;

      const config = await loadConfig(cwd);
      const journal = new Journal(cwd, config);
      journal.initRun(process.env as Record<string, string | undefined>);

      const runId = journal.getRunId() ?? "orchestrate";
      const orchestratorDir = path.join(cwd, config.paths.journal, "runs", runId, "orchestrate");
      mkdirSync(orchestratorDir, { recursive: true });

      const discovery = discoverAgents(cwd, agentScope);
      const agents = discovery.agents;

      const agent = agents.find((a) => a.name === params.agent);

      if (!agent) {
        const available = agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
        return {
          content: [{ type: "text", text: `Unknown agent: "${params.agent}". Available: ${available}` }],
          details: {
            mode: params.mode,
            agentScope,
            projectAgentsDir: discovery.projectAgentsDir,
            results: [],
          } as OrchestratorDetails,
          isError: true,
        };
      }

      if (agent.source === "project" && confirmProjectAgents && ctx.hasUI) {
        const ok = await ctx.ui.confirm(
          "Run project-local agent?",
          `Agent: ${agent.name}\nSource: ${agent.filePath}\n\nProject agents are repo-controlled. Only continue for trusted repositories.`
        );
        if (!ok)
          return {
            content: [{ type: "text", text: "Canceled: project-local agent not approved." }],
            details: {
              mode: params.mode,
              agentScope,
              projectAgentsDir: discovery.projectAgentsDir,
              results: [],
            } as OrchestratorDetails,
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
        agentScope,
        projectAgentsDir: discovery.projectAgentsDir,
        results,
      };

      const lines: string[] = [`Orchestration complete (${params.mode}, ${agentScope}):`, ""];

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
