import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { getBuiltinBackgroundRoot } from "./package-root.ts";

export const BUILTIN_BACKGROUND_DOCS: Record<string, string> = {
  "concept-design-overview": "concept-design-overview.md",
  "concept-spec-conventions": "concept-specifications.md",
  "implementation-conventions": "implementing-concepts.md",
  "sync-conventions": "implementing-synchronizations.md",
  "testing-conventions": "testing-concepts.md",
  "deterministic-workflows": "deterministic-agent-workflows.md",
  "journal-and-verification": "journal-and-verification.md",
  "sync-testing-diagnostics": "sync-testing-and-diagnostics.md",
};

export interface ResolvedDesignDoc {
  displayPath: string;
  resolvedPath: string;
  source: "builtin" | "project";
}

export function resolveDesignDoc(cwd: string, docPath: string): ResolvedDesignDoc | null {
  const builtinPath = path.resolve(getBuiltinBackgroundRoot(), path.basename(docPath));
  if (existsSync(builtinPath)) {
    return { displayPath: docPath, resolvedPath: builtinPath, source: "builtin" };
  }

  const projectPath = path.resolve(cwd, docPath);
  if (existsSync(projectPath)) {
    return { displayPath: docPath, resolvedPath: projectPath, source: "project" };
  }

  return null;
}

export function designDocPathForKey(docs: Record<string, string>, key: string): string | undefined {
  return docs[key] ?? BUILTIN_BACKGROUND_DOCS[key];
}

export function listDesignDocKeys(docs: Record<string, string>): string[] {
  return [...new Set([...Object.keys(BUILTIN_BACKGROUND_DOCS), ...Object.keys(docs)])].sort();
}

export function readResolvedDesignDoc(resolved: ResolvedDesignDoc): string {
  return readFileSync(resolved.resolvedPath, "utf8");
}

export function getDesignDocLead(cwd: string, docPath: string): string {
  const resolved = resolveDesignDoc(cwd, docPath);
  if (!resolved) return "";

  try {
    const content = readResolvedDesignDoc(resolved);
    return (
      content
        .split("\n")
        .find((line) => line.trim() && !line.startsWith("#"))
        ?.trim()
        .slice(0, 80) ?? ""
    );
  } catch {
    return "";
  }
}
