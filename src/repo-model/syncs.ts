import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { Project, SyntaxKind } from "ts-morph";
import { type CdhConfig } from "../config.ts";

export interface SyncModel {
  file: string;
  exports: string[];
  whenActions: string[];
  thenActions: string[];
  testPath?: string;
}

export async function discoverSyncs(cwd: string, config: CdhConfig): Promise<SyncModel[]> {
  const syncsRoot = path.resolve(cwd, config.paths.syncs);
  if (!existsSync(syncsRoot)) return [];

  const files = (await walk(syncsRoot)).filter(
    (file) => file.endsWith(".sync.ts") && !file.endsWith(".test.ts")
  );

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  return files
    .map((file) => syncFromFile(file, project))
    .filter((sync): sync is SyncModel => sync !== null)
    .sort((a, b) => a.file.localeCompare(b.file));
}

function syncFromFile(file: string, project: Project): SyncModel | null {
  const sourceFile = project.addSourceFileAtPathIfExists(file);
  if (!sourceFile) return null;

  const exportNames = sourceFile.getVariableDeclarations()
    .filter((v) => v.isExported())
    .map((v) => v.getName());

  const text = sourceFile.getFullText();
  const whenActions = extractActionRefs(text, "when");
  const thenActions = extractActionRefs(text, "then");

  const testPath = siblingIfExists(file.replace(/\.ts$/, ".test.ts"));

  return {
    file,
    exports: exportNames,
    whenActions,
    thenActions,
    testPath
  };
}

function extractActionRefs(text: string, pattern: string): string[] {
  const refs = new Set<string>();
  const regex = new RegExp(`${pattern}\\s*:\\s*(?:Sync\\(|[^,{]*?)([A-Z]\\w+)\\.(\\w+)`, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const concept = match[1];
    const action = match[2];
    if (concept && action) {
      refs.add(`${concept}.${action}`);
    }
  }
  return [...refs].sort();
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

function siblingIfExists(file: string): string | undefined {
  return existsSync(file) ? file : undefined;
}
