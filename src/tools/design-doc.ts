import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { RepoContract } from "../repo-contract.ts";

export function readDesignDoc(
  cwd: string,
  contract: RepoContract,
  key: string
): { content: string; path: string } | { error: string } {
  const docPath = contract.docs[key];
  if (!docPath) {
    const keys = Object.keys(contract.docs).sort().join(", ");
    return { error: `Unknown document key '${key}'. Available keys: ${keys}` };
  }

  const resolved = path.resolve(cwd, docPath);
  if (!existsSync(resolved)) {
    return { error: `Document not found: ${docPath}` };
  }

  const content = readFileSync(resolved, "utf8");
  return { content, path: docPath };
}

export function formatDesignDoc(result: { content: string; path: string } | { error: string }): string {
  if ("error" in result) return result.error;
  return `File: ${result.path}\n\n${result.content}`;
}
