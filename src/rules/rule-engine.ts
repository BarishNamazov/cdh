import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { Project } from "ts-morph";
import { type CdhConfig } from "../config.ts";
import { type RepoContract } from "../repo-contract.ts";
import { type RuleEngine, type RuleHit } from "./types.ts";

export function createRuleEngine(cwd: string, config: CdhConfig, _contract: RepoContract): RuleEngine {
  const checkFile = async (filePath: string): Promise<RuleHit[]> => {
    if (!existsSync(filePath)) return [];
    return checkR1Content(cwd, config, filePath, await readFile(filePath, "utf8"));
  };

  return {
    checkContent(filePath, proposed) {
      return checkR1Content(cwd, config, filePath, proposed);
    },
    checkFile,
    async checkRepo() {
      const conceptsRoot = path.resolve(cwd, config.paths.concepts);
      if (!existsSync(conceptsRoot)) return [];
      const files = (await walk(conceptsRoot)).filter((file) => file.endsWith(".ts"));
      const nested = await Promise.all(files.map((file) => checkFile(file)));
      return nested.flat();
    }
  };
}

function checkR1Content(cwd: string, config: CdhConfig, filePath: string, proposed: string): RuleHit[] {
  const absolutePath = path.resolve(cwd, filePath);
  const conceptsRoot = path.resolve(cwd, config.paths.concepts);
  const owningConceptDir = getOwningConceptDir(conceptsRoot, absolutePath);
  if (!owningConceptDir) return [];

  const imports = getImportSpecifiers(absolutePath, proposed);
  return imports.flatMap((specifier) => {
    const reason = r1ImportReason(cwd, config, conceptsRoot, owningConceptDir, absolutePath, specifier);
    if (!reason) return [];
    return [r1Hit(path.relative(cwd, absolutePath), specifier, reason)];
  });
}

function getImportSpecifiers(filePath: string, sourceText: string): string[] {
  try {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    return sourceFile.getImportDeclarations().map((declaration) => declaration.getModuleSpecifierValue());
  } catch {
    return [...sourceText.matchAll(/import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g)].map((match) => match[1] ?? "");
  }
}

function r1ImportReason(
  cwd: string,
  config: CdhConfig,
  conceptsRoot: string,
  owningConceptDir: string,
  filePath: string,
  specifier: string
): string | null {
  if (specifier === "@concepts" || specifier.startsWith("@concepts/")) return "imports through @concepts";
  if (specifier === "@engine" || specifier.startsWith("@engine/")) return "imports engine internals";
  if (specifier.includes("src/syncs") || specifier.startsWith("@syncs/")) return "imports synchronizations";

  const resolved = resolveImport(cwd, filePath, specifier);
  if (!resolved) return null;

  const syncsRoot = path.resolve(cwd, config.paths.syncs);
  if (isInside(syncsRoot, resolved)) return "imports synchronizations";
  if (isInside(path.resolve(cwd, "src/engine"), resolved)) return "imports engine internals";
  if (isInside(conceptsRoot, resolved) && !isInside(owningConceptDir, resolved)) return "imports another concept directory";

  return null;
}

function resolveImport(cwd: string, filePath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(filePath), specifier);
  if (specifier.startsWith("src/")) return path.resolve(cwd, specifier);
  return null;
}

function getOwningConceptDir(conceptsRoot: string, filePath: string): string | null {
  if (!isInside(conceptsRoot, filePath)) return null;
  const relative = path.relative(conceptsRoot, filePath).split(path.sep);
  if (relative.length < 2) return null;
  return path.join(conceptsRoot, relative[0] ?? "");
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function r1Hit(filePath: string, specifier: string, reason: string): RuleHit {
  return {
    rule: "R1",
    severity: "block",
    path: filePath,
    message: `R1 concept independence: ${reason} via '${specifier}'. Move cross-concept behavior into a sync or pass opaque data through actions.`,
    fix: "Remove the concept-to-concept import; coordinate concepts from src/syncs instead."
  };
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
