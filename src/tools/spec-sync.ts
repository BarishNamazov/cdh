import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { discoverConcepts } from "../repo-model/concepts.ts";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";

export interface SpecDiff {
  conceptName: string;
  specPath: string;
  issues: SpecIssue[];
  actionsInCode: string[];
  queriesInCode: string[];
  actionsInSpec: string[];
  queriesInSpec: string[];
}

export interface SpecIssue {
  severity: "missing" | "extra" | "stale";
  kind: "action" | "query" | "section";
  detail: string;
}

export async function checkSpecSync(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract,
  conceptName: string
): Promise<SpecDiff | null> {
  const concepts = await discoverConcepts(cwd, config, contract);
  const concept = concepts.find((c) => c.name.toLowerCase() === conceptName.toLowerCase());

  if (!concept) return null;
  if (!concept.specPath || !existsSync(concept.specPath)) return null;

  const specContent = readFileSync(concept.specPath, "utf8");
  const specLower = specContent.toLowerCase();

  const actionsInCode = concept.actions.map((a) => a.name);
  const queriesInCode = concept.queries.map((q) => q.name);

  const actionsInSpec = extractSectionItems(specContent, "Actions");
  const queriesInSpec = extractSectionItems(specContent, "Queries");

  const issues: SpecIssue[] = [];

  const requiredSections = ["## purpose", "## principle", "## state", "## actions", "## queries"];
  for (const section of requiredSections) {
    if (!specLower.includes(section)) {
      issues.push({ severity: "missing", kind: "section", detail: section });
    }
  }

  for (const action of actionsInCode) {
    if (!actionsInSpec.some((s) => s.toLowerCase() === action.toLowerCase())) {
      issues.push({ severity: "missing", kind: "action", detail: `${action} is in code but missing from spec` });
    }
  }

  for (const query of queriesInCode) {
    if (!queriesInSpec.some((s) => s.toLowerCase() === query.toLowerCase())) {
      issues.push({ severity: "missing", kind: "query", detail: `${query} is in code but missing from spec` });
    }
  }

  for (const action of actionsInSpec) {
    if (!actionsInCode.some((c) => c.toLowerCase() === action.toLowerCase())) {
      issues.push({ severity: "stale", kind: "action", detail: `${action} is in spec but not found in code` });
    }
  }

  for (const query of queriesInSpec) {
    if (!queriesInCode.some((c) => c.toLowerCase() === query.toLowerCase())) {
      issues.push({ severity: "stale", kind: "query", detail: `${query} is in spec but not found in code` });
    }
  }

  return {
    conceptName: concept.name,
    specPath: path.relative(cwd, concept.specPath),
    issues,
    actionsInCode,
    queriesInCode,
    actionsInSpec,
    queriesInSpec
  };
}

function extractSectionItems(content: string, sectionName: string): string[] {
  const regex = new RegExp(`## ${sectionName}([\\s\\S]*?)(?=\\n## (?!##)|$)`, "i");
  const match = content.match(regex);
  if (!match || !match[1]) return [];

  const sectionContent = match[1];
  const items: string[] = [];

  const methodRegex = /###\s+(\w+)/g;
  let m;
  while ((m = methodRegex.exec(sectionContent)) !== null) {
    if (m[1]) items.push(m[1]);
  }

  if (items.length === 0) {
    const listRegex = /[-*]\s+`?(\w+)`?\s*[:-]/g;
    while ((m = listRegex.exec(sectionContent)) !== null) {
      if (m[1]) items.push(m[1]);
    }
  }

  return items;
}

export function formatSpecDiff(diff: SpecDiff): string {
  const lines: string[] = [];

  lines.push(`Spec sync check: ${diff.conceptName}`);
  lines.push(`Spec: ${diff.specPath}`);
  lines.push("");

  lines.push(`Actions in code: ${diff.actionsInCode.join(", ") || "none"}`);
  lines.push(`Queries in code: ${diff.queriesInCode.join(", ") || "none"}`);
  lines.push(`Actions in spec: ${diff.actionsInSpec.join(", ") || "none"}`);
  lines.push(`Queries in spec: ${diff.queriesInSpec.join(", ") || "none"}`);
  lines.push("");

  if (diff.issues.length === 0) {
    lines.push("Status: IN SYNC");
  } else {
    lines.push(`Issues (${diff.issues.length}):`);
    for (const issue of diff.issues) {
      lines.push(`  [${issue.severity}] ${issue.kind}: ${issue.detail}`);
    }
  }

  return lines.join("\n");
}

export async function autoSyncSpec(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract,
  conceptName: string,
  options: { dryRun?: boolean } = {}
): Promise<{ updated: boolean; diff: SpecDiff | null; error?: string }> {
  const concepts = await discoverConcepts(cwd, config, contract);
  const concept = concepts.find((c) => c.name.toLowerCase() === conceptName.toLowerCase());

  if (!concept) return { updated: false, diff: null, error: `Concept '${conceptName}' not found` };
  if (!concept.specPath || !existsSync(concept.specPath)) {
    return { updated: false, diff: null, error: `Spec not found for '${conceptName}'` };
  }

  let specContent = readFileSync(concept.specPath, "utf8");

  const actionsSectionStart = findSectionStart(specContent, "## Actions");
  const actionsSectionEnd = findNextSectionStart(specContent, actionsSectionStart);

  if (actionsSectionStart > 0) {
    const newActions = concept.actions
      .map((a) => `### ${a.name}\n\nRequires: ...\n\nEffects: ...`)
      .join("\n\n");

    if (options.dryRun) {
      return { updated: true, diff: null };
    }

    specContent =
      specContent.slice(0, actionsSectionStart) +
      `## Actions\n\n${newActions}\n\n` +
      specContent.slice(actionsSectionEnd);
  }

  const queriesSectionStart = findSectionStart(specContent, "## Queries");
  const queriesSectionEnd = findNextSectionStart(specContent, queriesSectionStart);

  if (queriesSectionStart > 0) {
    const newQueries = concept.queries
      .map((q) => `### ${q.name}\n\nReturns ...`)
      .join("\n\n");

    if (options.dryRun) {
      return { updated: true, diff: null };
    }

    specContent =
      specContent.slice(0, queriesSectionStart) +
      `## Queries\n\n${newQueries}\n\n` +
      specContent.slice(queriesSectionEnd);
  }

  if (!options.dryRun) {
    writeFileSync(concept.specPath, specContent, "utf8");
  }

  return { updated: true, diff: null };
}

function findSectionStart(content: string, heading: string): number {
  const regex = new RegExp(`\\n${heading}`, "i");
  const match = content.match(regex);
  return match ? match.index ?? -1 : -1;
}

function findNextSectionStart(content: string, afterIndex: number): number {
  const rest = content.slice(afterIndex + 1);
  const nextMatch = rest.match(/\n## (?!##)/);
  if (!nextMatch || nextMatch.index === undefined) return content.length;
  return afterIndex + 1 + nextMatch.index;
}
