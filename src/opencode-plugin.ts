import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { type Plugin, type ToolDefinition, tool } from "@opencode-ai/plugin";
import { type CatalogEntry, copyCatalogConcept } from "./catalog-lib.ts";
import { type CdhConfig, loadConfig } from "./config.ts";
import { type InitResult, initProject } from "./init.ts";
import { Journal } from "./journal/journal.ts";
import { getBuiltinCatalogRoot } from "./package-root.ts";
import { loadRepoContract, type RepoContract } from "./repo-contract.ts";
import { createRuleEngine } from "./rules/rule-engine.ts";
import { describeConcept, formatConceptDetail } from "./tools/describe-concept.ts";
import { formatDesignDoc, listDocs, readDesignDoc } from "./tools/design-doc.ts";
import { formatConcepts, listConcepts } from "./tools/list-concepts.ts";
import { formatSyncs, listSyncs } from "./tools/list-syncs.ts";
import { checkSpecSync, formatSpecDiff } from "./tools/spec-sync.ts";
import { formatDiagnostics, formatDiagnosticsJson, runSyncDiagnostics } from "./tools/sync-diagnostics.ts";
import { buildSyncGraph, formatGraphJson, formatGraphMermaid, formatGraphReport } from "./tools/sync-graph.ts";
import { formatTraceResult, traceSyncAction } from "./tools/trace-sync.ts";
import { buildWorkflowContext, WORKFLOW_KINDS, type WorkflowKind } from "./tools/workflow-context.ts";
import { formatStageResults } from "./verify/format.ts";
import { runVerification } from "./verify/runner.ts";

const CDH_AGENTS = new Set(["spec-writer", "concept-implementer", "sync-implementer", "test-writer", "reviewer"]);

const AGENT_WORKFLOW: Record<string, WorkflowKind> = {
  "spec-writer": "concept",
  "concept-implementer": "concept",
  "sync-implementer": "sync",
  "test-writer": "test",
  reviewer: "review",
};

let verificationRunning = false;
const lastVerificationHash = new Map<string, string>();
let cachedRegistry: { concepts: CatalogEntry[] } | null = null;
let cwdState: { cwd: string; config: CdhConfig; contract: RepoContract } | null = null;

export const CdhPlugin: Plugin = async (ctx) => {
  return {
    tool: createCdhTools(),
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "task") return;
      const subagent = output.args?.subagent_type;
      if (typeof subagent !== "string" || !CDH_AGENTS.has(subagent)) return;

      const prompt = typeof output.args?.prompt === "string" ? output.args.prompt : "";
      try {
        const state = await getOrResolveCtx(ctx.worktree);
        if (!state || state.config.context?.autoInject === false) return;

        const workflow = AGENT_WORKFLOW[subagent];
        if (!workflow) return;

        const conceptName = inferConceptName(prompt);
        const maxDocChars = state.config.context?.maxDocChars ?? 2500;

        const contextBlock = await buildWorkflowContext(ctx.worktree, state.config, state.contract, {
          workflow,
          concept: conceptName,
          includeDocs: true,
          maxDocChars,
        });

        const header = `\n\n## CDH Auto Context\nGenerated before this subagent ran. Do not perform broad codebase exploration unless this context is insufficient. Use CDH tools (list_concepts, describe_concept, etc.) only for focused refreshes.\n\n`;

        output.args.prompt = `${header}${contextBlock}\n\n---\n\n${prompt}`;
      } catch (err) {
        console.error(
          `[cdh] context injection failed for ${subagent}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },
    "tool.execute.after": async (input, output) => {
      if (input.tool !== "task") return;
      const subagent = input.args?.subagent_type;
      if (typeof subagent !== "string" || !CDH_AGENTS.has(subagent)) return;

      if (verificationRunning) return;

      try {
        const state = await getOrResolveCtx(ctx.worktree);
        if (!state || state.config.verify.agentEnd?.enabled === false) return;

        const changedOnly = state.config.verify.agentEnd?.changedOnly !== false;
        if (changedOnly) {
          const hash = computeWorkspaceHash(ctx.worktree);
          if (hash === lastVerificationHash.get(subagent)) return;
          lastVerificationHash.set(subagent, hash);
        }

        verificationRunning = true;
        const result = await runVerificationForAgent(ctx.worktree, state.config, state.contract);
        verificationRunning = false;

        if (output.output && typeof output.output === "string") {
          output.output += `\n\n${result}`;
        } else if (output) {
          (output as Record<string, unknown>).output = result;
        }
      } catch (err) {
        verificationRunning = false;
        console.error(`[cdh] agent-end verification failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    event: async ({ event }) => {
      if (event.type !== "session.idle" || verificationRunning) return;
      verificationRunning = true;

      try {
        await runAgentEndVerification(ctx.worktree);
      } catch (error) {
        console.error(`[cdh] agent-end verification failed: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        verificationRunning = false;
      }
    },
    "experimental.session.compacting": async (_input, output) => {
      output.context.push(`## CDH Verification State
Use \`workflow_context\` for deterministic workflow prompts before implementing concepts, syncs, tests, or reviews.
Agent-end verification runs configured stages from \`.opencode/cdh.json\` (\`verify.onAgentEnd\`).
Run \`run_verification\` with tier \`ship\` before declaring shippable work complete.`);
    },
  };
};

export default CdhPlugin;

async function runVerificationForAgent(cwd: string, config: CdhConfig, contract: RepoContract): Promise<string> {
  const journal = new Journal(cwd, config);
  journal.initRun(process.env as Record<string, string | undefined>);
  const results = await runVerification({
    cwd,
    config,
    contract,
    ruleEngine: createRuleEngine(cwd, config, contract),
    journal,
    tier: "quick",
    stages: config.verify.onAgentEnd,
  });
  const failed = results.filter((r) => r.status === "fail");
  const summary = failed.length > 0 ? `${failed.length} stage(s) failed.` : "All stages passed.";
  const lines = ["", "### CDH Agent-End Verification", ...formatStageResults(results), "", summary];
  return lines.join("\n");
}

function computeWorkspaceHash(_cwd: string): string {
  return ""; // simplified: let session.idle serve as fallback; task hook runs once per completed CDH subagent
}

function inferConceptName(prompt: string): string | undefined {
  const patterns = [/concept\s+(\w+)/i, /(\w+)\s+concept/i, /src\/concepts\/(\w+)/, /design\/concepts\/(\w+)/i];
  for (const pattern of patterns) {
    const match = pattern.exec(prompt);
    if (match?.[1]) {
      const name = match[1];
      if (name.length > 1 && name[0] === name[0].toUpperCase()) return name;
    }
  }
  const words = prompt.split(/\s+/).filter((w) => w.length > 0 && w[0] === w[0].toUpperCase());
  if (words.length === 1) return words[0];
  return undefined;
}

function createCdhTools(): Record<string, ToolDefinition> {
  return {
    workflow_context: tool({
      description:
        "Build deterministic CDH workflow context from static docs plus dynamic concept/sync/verification state.",
      args: {
        workflow: tool.schema.enum(WORKFLOW_KINDS).describe("Workflow kind to assemble context for"),
        concept: tool.schema.string().optional().describe("Optional focus concept name"),
        actions: tool.schema
          .array(tool.schema.string())
          .optional()
          .describe("Optional action refs to trace, e.g. Labeling.addLabel"),
        includeDocs: tool.schema.boolean().optional().describe("Include static background docs; defaults to true"),
      },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        return buildWorkflowContext(context.worktree, config, contract, {
          workflow: args.workflow,
          concept: args.concept,
          actions: args.actions,
          includeDocs: args.includeDocs,
        });
      },
    }),
    list_concepts: tool({
      description: "List all concepts in the repo with action/query counts, spec status, and test status.",
      args: {},
      async execute(_args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        return formatConcepts(await listConcepts(context.worktree, config, contract), context.worktree);
      },
    }),
    describe_concept: tool({
      description: "Show detailed surface (actions, queries, signatures) and spec for a concept.",
      args: { name: tool.schema.string().describe("Concept name") },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        const result = await describeConcept(context.worktree, config, contract, args.name);
        return result ? formatConceptDetail(result, context.worktree) : `Concept '${args.name}' not found.`;
      },
    }),
    list_syncs: tool({
      description: "List all syncs, optionally filtered by concept name.",
      args: { concept: tool.schema.string().optional().describe("Optional concept name filter") },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        return formatSyncs(
          await listSyncs(context.worktree, config, contract, args.concept),
          context.worktree,
          args.concept
        );
      },
    }),
    trace_sync: tool({
      description: "Trace an action ref through syncs as trigger, effect, or query. Example: Labeling.addLabel.",
      args: { action: tool.schema.string().describe("Action ref in Concept.action format") },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        return formatTraceResult(await traceSyncAction(context.worktree, config, contract, args.action));
      },
    }),
    read_design_doc: tool({
      description: "Read a design document by key. Call without a key to list available documents.",
      args: { key: tool.schema.string().optional().describe("Design doc key, or omit to list available docs") },
      async execute(args, context) {
        const { contract } = await resolveCtx(context.worktree);
        if (!args.key) return listDocs(contract, context.worktree);
        return formatDesignDoc(readDesignDoc(context.worktree, contract, args.key));
      },
    }),
    spec_lint: tool({
      description: "Check a concept spec for required sections and alignment with code surface.",
      args: { name: tool.schema.string().describe("Concept name") },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        const diff = await checkSpecSync(context.worktree, config, contract, args.name);
        return diff ? formatSpecDiff(diff) : `Concept '${args.name}' not found or has no spec file.`;
      },
    }),
    sync_graph: tool({
      description:
        "Build and display the sync graph showing relationships between syncs, actions, queries, and endpoints.",
      args: { format: tool.schema.string().optional().describe("Output format: report (default), json, or mermaid") },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        const graph = await buildSyncGraph(context.worktree, config, contract);
        if (args.format === "json") return formatGraphJson(graph);
        if (args.format === "mermaid") return formatGraphMermaid(graph);
        return formatGraphReport(graph);
      },
    }),
    sync_diagnostics: tool({
      description: "Run diagnostics on syncs: orphan actions, missing tests, unhandled errors, and graph smells.",
      args: { format: tool.schema.string().optional().describe("Output format: report (default) or json") },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        const report = await runSyncDiagnostics(context.worktree, config, contract);
        return args.format === "json" ? formatDiagnosticsJson(report) : formatDiagnostics(report);
      },
    }),
    run_verification: tool({
      description:
        "Run deterministic verification stages. Use tier quick for agent-end checks or ship for full checks.",
      args: { tier: tool.schema.enum(["quick", "ship"]).describe("Verification tier") },
      async execute(args, context) {
        const { config, contract } = await resolveCtx(context.worktree);
        const journal = new Journal(context.worktree, config);
        journal.initRun(process.env as Record<string, string | undefined>);
        const results = await runVerification({
          cwd: context.worktree,
          config,
          contract,
          ruleEngine: createRuleEngine(context.worktree, config, contract),
          journal,
          tier: args.tier,
        });
        const failed = results.filter((result) => result.status === "fail");
        const summary = failed.length > 0 ? `${failed.length} stage(s) failed.` : "All stages passed.";
        return `Verification (${args.tier}):\n${formatStageResults(results).join("\n")}\n\n${summary}`;
      },
    }),
    record_decision: tool({
      description: "Record an architectural or implementation decision with alternatives in the run journal.",
      args: {
        title: tool.schema.string().describe("Decision title"),
        body: tool.schema.string().describe("Decision body/description"),
        alternatives: tool.schema.array(tool.schema.string()).optional().describe("Alternatives considered"),
      },
      async execute(args, context) {
        const config = await loadConfig(context.worktree);
        const journal = new Journal(context.worktree, config);
        journal.initRun(process.env as Record<string, string | undefined>);
        journal.emitDecision(args.title, args.body, args.alternatives);
        return `Decision recorded: ${args.title}`;
      },
    }),
    catalog_search: tool({
      description: "Search the CDH catalog for reusable concept implementations.",
      args: { query: tool.schema.string().optional().describe("Search query; matches name, summary, or tags") },
      async execute(args) {
        const concepts = getRegistry().concepts;
        const query = args.query?.toLowerCase();
        const filtered = query
          ? concepts.filter(
              (concept) =>
                concept.name.toLowerCase().includes(query) ||
                concept.summary.toLowerCase().includes(query) ||
                concept.tags.some((tag) => tag.toLowerCase().includes(query))
            )
          : concepts;
        const lines = [`Catalog concepts (${filtered.length}):`, ""];
        for (const concept of filtered) {
          lines.push(`  ${concept.name} (${concept.version}): ${concept.summary}`);
          if (concept.tags.length > 0) lines.push(`    Tags: ${concept.tags.join(", ")}`);
        }
        return lines.join("\n");
      },
    }),
    catalog_show: tool({
      description: "Show details for a catalog concept including its spec.",
      args: { name: tool.schema.string().describe("Catalog concept name") },
      async execute(args) {
        const entry = findCatalogEntry(args.name);
        if (!entry) return `Catalog concept '${args.name}' not found.`;
        const specPath = path.join(getBuiltinCatalogRoot(), "concepts", entry.name, "concept.md");
        const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : null;
        const lines = [`# ${entry.name} (${entry.version})`, entry.summary, `Tags: ${entry.tags.join(", ")}`, ""];
        if (spec) lines.push("## Spec", spec);
        return lines.join("\n");
      },
    }),
    catalog_copy: tool({
      description: "Copy a catalog concept into the local repo's concepts and specs directories.",
      args: {
        name: tool.schema.string().describe("Catalog concept name to copy"),
        as: tool.schema.string().optional().describe("Rename the copied concept"),
        overwrite: tool.schema.boolean().optional().describe("Overwrite existing concept directory"),
      },
      async execute(args, context) {
        try {
          const { config, contract } = await resolveCtx(context.worktree);
          const entry = findCatalogEntry(args.name);
          if (!entry) return `Catalog concept '${args.name}' not found.`;
          const result = copyCatalogConcept(getBuiltinCatalogRoot(), context.worktree, entry, config, contract, {
            as: args.as,
            overwrite: args.overwrite,
          });
          return `Copied '${result.conceptName}' to ${result.targetDir} (${result.files.length} files).`;
        } catch (error) {
          return error instanceof Error ? error.message : String(error);
        }
      },
    }),
    cdh_init: tool({
      description: "Scaffold a minimal, working concept-design repo in the current directory. Idempotent.",
      args: {},
      async execute(_args, context) {
        return formatInitResult(context.worktree, initProject(context.worktree));
      },
    }),
  };
}

async function runAgentEndVerification(cwd: string): Promise<void> {
  const config = await loadConfig(cwd);
  const { contract } = await loadRepoContract(cwd, config);
  const journal = new Journal(cwd, config);
  journal.initRun(process.env as Record<string, string | undefined>);
  const results = await runVerification({
    cwd,
    config,
    contract,
    ruleEngine: createRuleEngine(cwd, config, contract),
    journal,
    tier: "quick",
    stages: config.verify.onAgentEnd,
  });
  const failed = results.filter((result) => result.status === "fail");
  const summary = failed.length > 0 ? `${failed.length} stage(s) failed.` : "all configured stages passed.";
  console.log(`[cdh] agent-end verification: ${summary}\n${formatStageResults(results).join("\n")}`);
}

async function getOrResolveCtx(cwd: string): Promise<{ config: CdhConfig; contract: RepoContract } | null> {
  try {
    if (cwdState && cwdState.cwd === cwd) return cwdState;
    const { config, contract } = await resolveCtx(cwd);
    cwdState = { cwd, config, contract };
    return cwdState;
  } catch {
    return null;
  }
}

async function resolveCtx(cwd: string): Promise<{ config: CdhConfig; contract: RepoContract }> {
  const config = await loadConfig(cwd);
  const { contract } = await loadRepoContract(cwd, config);
  return { config, contract };
}

function getRegistry(): { concepts: CatalogEntry[] } {
  if (cachedRegistry) return cachedRegistry;
  const registryPath = path.join(getBuiltinCatalogRoot(), "registry.json");
  cachedRegistry = existsSync(registryPath)
    ? (JSON.parse(readFileSync(registryPath, "utf8")) as { concepts: CatalogEntry[] })
    : { concepts: [] };
  return cachedRegistry;
}

function findCatalogEntry(name: string): CatalogEntry | undefined {
  return getRegistry().concepts.find((concept) => concept.name.toLowerCase() === name.toLowerCase());
}

function formatInitResult(cwd: string, result: InitResult): string {
  const lines = [`CDH project initialized in ${cwd}`, "", "Created:"];
  for (const file of result.created) lines.push(`  + ${file}`);
  if (result.skipped.length > 0) {
    lines.push("", "Skipped (already exist):");
    for (const file of result.skipped) lines.push(`  - ${file}`);
  }
  if (result.errors.length > 0) {
    lines.push("", "Errors:");
    for (const error of result.errors) lines.push(`  ! ${error}`);
  }
  lines.push("", "Next steps:", "  1. bun install", "  2. bun test", "  3. opencode");
  return lines.join("\n");
}
