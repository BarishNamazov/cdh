import {
  designDocPathForKey,
  getDesignDocLead,
  listDesignDocKeys,
  readResolvedDesignDoc,
  resolveDesignDoc,
} from "../background-docs.ts";
import type { RepoContract } from "../repo-contract.ts";

export function listDocs(contract: RepoContract, cwd: string = process.cwd()): string {
  const keys = listDesignDocKeys(contract.docs);
  if (keys.length === 0) return "No design documents available.";

  const lines: string[] = ["Available design documents:"];

  for (const key of keys) {
    const docPath = designDocPathForKey(contract.docs, key);
    if (!docPath) continue;
    const firstLine = getDesignDocLead(cwd, docPath);
    lines.push(`- ${key}: ${firstLine || "(no description)"}`);
  }

  return lines.join("\n");
}

export function readDesignDoc(
  cwd: string,
  contract: RepoContract,
  key: string
): { content: string; path: string } | { error: string } {
  const docPath = designDocPathForKey(contract.docs, key);
  if (!docPath) {
    const keys = listDesignDocKeys(contract.docs).join(", ");
    return { error: `Unknown document key '${key}'. Available keys: ${keys}` };
  }

  const resolved = resolveDesignDoc(cwd, docPath);
  if (!resolved) {
    return { error: `Document not found: ${docPath}` };
  }

  const content = readResolvedDesignDoc(resolved);
  return { content, path: docPath };
}

export function formatDesignDoc(result: { content: string; path: string } | { error: string }): string {
  if ("error" in result) return result.error;
  return `File: ${result.path}\n\n${result.content}`;
}
