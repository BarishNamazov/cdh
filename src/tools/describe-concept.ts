import path from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { discoverConcepts, type ConceptModel } from "../repo-model/concepts.ts";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";

export async function describeConcept(
  cwd: string,
  config: CdhConfig,
  contract: RepoContract,
  name: string
): Promise<ConceptModel | null> {
  const concepts = await discoverConcepts(cwd, config, contract);
  return concepts.find((c) => c.name.toLowerCase() === name.toLowerCase()) ?? null;
}

export function formatConceptDetail(concept: ConceptModel, cwd: string): string {
  const lines: string[] = [];
  lines.push(`Concept: ${concept.name}`);
  lines.push(`File: ${path.relative(cwd, concept.file)}`);
  lines.push("");

  if (concept.actions.length > 0) {
    lines.push("Actions:");
    for (const action of concept.actions) {
      const params = action.parameters.length > 0 ? `(${action.parameters.join(", ")})` : "()";
      lines.push(`  ${action.name}${params}: ${action.returnType}`);
    }
    lines.push("");
  } else {
    lines.push("Actions: none");
    lines.push("");
  }

  if (concept.queries.length > 0) {
    lines.push("Queries:");
    for (const query of concept.queries) {
      const params = query.parameters.length > 0 ? `(${query.parameters.join(", ")})` : "()";
      lines.push(`  ${query.name}${params}: ${query.returnType}`);
    }
    lines.push("");
  } else {
    lines.push("Queries: none");
    lines.push("");
  }

  lines.push(`Spec: ${concept.specPath ? path.relative(cwd, concept.specPath) : "missing"}`);
  lines.push(`Tests: ${concept.testPath ? path.relative(cwd, concept.testPath) : "missing"}`);

  if (concept.specPath && existsSync(concept.specPath)) {
    lines.push("");
    lines.push("--- Spec Content ---");
    const specContent = readFileSync(concept.specPath, "utf8");
    lines.push(specContent.trim());
  }

  return lines.join("\n");
}
