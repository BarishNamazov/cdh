import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { RepoContract } from "../repo-contract.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HARNESS_BACKGROUND = path.resolve(__dirname, "..", "..", "design", "background");

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

  const harnessPath = path.resolve(HARNESS_BACKGROUND, path.basename(docPath));
  const projectPath = path.resolve(cwd, docPath);

  const resolved = existsSync(harnessPath) ? harnessPath : projectPath;
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
