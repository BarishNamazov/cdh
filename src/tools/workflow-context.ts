import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";
import { describeConcept, formatConceptDetail } from "./describe-concept.ts";
import { formatDesignDoc, readDesignDoc } from "./design-doc.ts";
import { formatConcepts, listConcepts } from "./list-concepts.ts";
import { formatSyncs, listSyncs } from "./list-syncs.ts";
import { formatDiagnostics, runSyncDiagnostics } from "./sync-diagnostics.ts";
import { buildSyncGraph, formatGraphReport } from "./sync-graph.ts";
import { formatTraceResult, traceSyncAction } from "./trace-sync.ts";

export const WORKFLOW_KINDS = ["concept", "sync", "test", "review", "debug-sync", "frontend"] as const;

export type WorkflowKind = (typeof WORKFLOW_KINDS)[number];

export interface BuildWorkflowContextOptions {
  workflow: WorkflowKind;
  concept?: string;
  actions?: string[];
  includeDocs?: boolean;
  maxDocChars?: number;
}

interface WorkflowSpec {
  title: string;
  purpose: string;
  docKeys: string[];
  steps: string[];
  verificationTier: "quick" | "ship";
}

const WORKFLOWS: Record<WorkflowKind, WorkflowSpec> = {
  concept: {
    title: "Concept Specification and Implementation",
    purpose: "Create or modify one independent concept, its spec, implementation, and colocated tests.",
    docKeys: [
      "deterministic-workflows",
      "concept-design-overview",
      "concept-spec-conventions",
      "implementation-conventions",
      "testing-conventions",
    ],
    steps: [
      "Search the catalog before inventing a new concept surface.",
      "Write or update the concept spec before changing implementation code.",
      "Keep the concept independent: no imports from other concept directories or syncs.",
      "Implement actions as single-object-input, object-output methods; implement queries as `_` methods returning arrays.",
      "Write colocated tests with `track()` and narrated principle/multi-action cases.",
    ],
    verificationTier: "quick",
  },
  sync: {
    title: "Synchronization Implementation",
    purpose: "Compose concepts through declarative syncs without coupling concept implementations.",
    docKeys: ["deterministic-workflows", "sync-conventions", "sync-testing-diagnostics", "testing-conventions"],
    steps: [
      "Trace every trigger and effect action before editing the sync graph.",
      "Implement cross-concept behavior only in `src/syncs/**/*.sync.ts`.",
      "Use output patterns, `.as()`, `seq`, `par`, and branches deliberately; handle error outputs explicitly.",
      "Write a sibling sync test with `setupSyncTest`, positive cases, negative cases, and branch coverage.",
      "Trace actions again and run sync diagnostics after editing.",
    ],
    verificationTier: "ship",
  },
  test: {
    title: "Concept and Sync Testing",
    purpose: "Add deterministic tests that prove concept principles, action effects, and sync firing behavior.",
    docKeys: ["deterministic-workflows", "testing-conventions", "sync-testing-diagnostics"],
    steps: [
      "For concepts, cover each action/query plus requires-error and effects-success paths.",
      "Wrap concept instances with `track()` so surface coverage can observe method calls.",
      "Use `trace()` in principle and multi-action tests so behavior is legible.",
      "For syncs, use `setupSyncTest` and include at least one positive and one negative case.",
    ],
    verificationTier: "quick",
  },
  review: {
    title: "CDH Review",
    purpose: "Review changed work against deterministic CDH rules, verification, and sync diagnostics.",
    docKeys: ["deterministic-workflows", "journal-and-verification", "sync-testing-diagnostics"],
    steps: [
      "Scope the review to changed files and affected concepts/syncs.",
      "Use deterministic tools first: concept list/detail, sync graph, sync diagnostics, and verification.",
      "Report findings with file paths and rule IDs before summaries.",
      "Record substantial architectural decisions in the journal.",
    ],
    verificationTier: "quick",
  },
  "debug-sync": {
    title: "Sync Debugging",
    purpose: "Diagnose missing, unexpected, or incorrect sync behavior from static traces and diagnostics.",
    docKeys: ["deterministic-workflows", "sync-conventions", "sync-testing-diagnostics"],
    steps: [
      "Run diagnostics and inspect warnings before reading code manually.",
      "Trace suspected actions as triggers, effects, and where-query references.",
      "Inspect the sync graph for missing edges, broken cascades, and endpoints that never respond.",
      "Confirm involved concept surfaces match the action/query names used by syncs.",
    ],
    verificationTier: "ship",
  },
  frontend: {
    title: "Frontend Boundary Work",
    purpose: "Implement frontend/API work while preserving concept boundaries.",
    docKeys: ["deterministic-workflows", "concept-design-overview", "implementation-conventions"],
    steps: [
      "Identify concept actions available through the request/API boundary.",
      "Do not import concept classes directly from UI code; call the app boundary instead.",
      "Preserve the existing frontend design system and routing conventions.",
      "Run CDH quick verification plus the frontend project's own checks.",
    ],
    verificationTier: "quick",
  },
};

export async function buildWorkflowContext(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract,
  options: BuildWorkflowContextOptions
): Promise<string> {
  const spec = WORKFLOWS[options.workflow];
  const includeDocs = options.includeDocs ?? true;
  const maxDocChars = options.maxDocChars ?? 4000;
  const lines: string[] = [];

  lines.push(`# CDH Workflow Context: ${spec.title}`);
  lines.push("");
  lines.push(`Purpose: ${spec.purpose}`);
  lines.push("This context is assembled by deterministic TypeScript tools, not by an LLM-selected skill.");
  lines.push("");

  lines.push("## Required Steps");
  for (const step of spec.steps) lines.push(`- ${step}`);
  lines.push("");

  lines.push("## Verification Contract");
  lines.push(`- Recommended tier for this workflow: ${spec.verificationTier}`);
  lines.push(`- Agent-end stages: ${config.verify.onAgentEnd.join(", ") || "(none)"}`);
  lines.push(`- Ship stages: ${config.verify.onShipLocal.join(", ") || "(none)"}`);
  lines.push("- Unknown configured stages fail verification explicitly.");
  lines.push("");

  if (includeDocs) {
    lines.push("## Static Background Docs");
    for (const key of spec.docKeys) {
      const result = readDesignDoc(cwd, contract, key);
      lines.push(`### ${key}`);
      lines.push(truncate(formatDesignDoc(result), maxDocChars));
      lines.push("");
    }
  }

  lines.push("## Dynamic Repository Context");
  lines.push(await buildDynamicContext(cwd, config, contract, options));

  return lines.join("\n").trim();
}

async function buildDynamicContext(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract,
  options: BuildWorkflowContextOptions
): Promise<string> {
  const sections: string[] = [];

  const concepts = await listConcepts(cwd, config, contract);
  sections.push("### Concepts");
  sections.push(formatConcepts(concepts, cwd));
  sections.push("");

  if (options.concept) {
    const concept = await describeConcept(cwd, config, contract, options.concept);
    sections.push(`### Focus Concept: ${options.concept}`);
    sections.push(concept ? formatConceptDetail(concept, cwd) : `Concept '${options.concept}' not found.`);
    sections.push("");
  }

  if (options.workflow === "sync" || options.workflow === "debug-sync" || options.workflow === "review") {
    const syncs = await listSyncs(cwd, config, contract);
    sections.push("### Syncs");
    sections.push(formatSyncs(syncs, cwd));
    sections.push("");

    if (options.actions && options.actions.length > 0) {
      sections.push("### Action Traces");
      for (const action of options.actions) {
        try {
          sections.push(formatTraceResult(await traceSyncAction(cwd, config, contract, action)));
        } catch (error) {
          sections.push(`Trace ${action}: ${error instanceof Error ? error.message : String(error)}`);
        }
        sections.push("");
      }
    }

    sections.push("### Sync Graph");
    sections.push(formatGraphReport(await buildSyncGraph(cwd, config, contract)));
    sections.push("");

    sections.push("### Sync Diagnostics");
    sections.push(formatDiagnostics(await runSyncDiagnostics(cwd, config, contract)));
    sections.push("");
  }

  return sections.join("\n").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars).trimEnd()}\n\n[truncated to ${maxChars} chars]`;
}
