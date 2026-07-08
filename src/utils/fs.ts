import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

export async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

export async function walkLimited(dir: string, maxDepth: number = 20): Promise<string[]> {
  if (maxDepth <= 0) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const results: string[] = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkLimited(entryPath, maxDepth - 1)));
    } else {
      results.push(entryPath);
    }
  }
  return results;
}

export function siblingIfExists(file: string): string | undefined {
  return existsSync(file) ? file : undefined;
}
