import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { CdhConfig } from "./config.ts";
import type { RepoContract } from "./repo-contract.ts";

export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  summary: string;
  tags: string[];
  pairsWith?: string[];
  files: string[];
}

export interface CopyResult {
  id: string;
  version: string;
  as?: string;
  files: string[];
  conceptName: string;
  targetDir: string;
}

export function copyCatalogConcept(
  sourceDir: string,
  targetCwd: string,
  entry: CatalogEntry,
  config: CdhConfig,
  contract: RepoContract,
  options: { as?: string; overwrite?: boolean } = {}
): CopyResult {
  const conceptName = options.as ?? entry.name;
  const lowercaseName = conceptName.toLowerCase();
  const conceptsRoot = path.resolve(targetCwd, config.paths.concepts);
  const targetConceptDir = path.join(conceptsRoot, conceptName);

  if (existsSync(targetConceptDir) && !options.overwrite) {
    throw new Error(`Target directory already exists: ${targetConceptDir}. Use overwrite: true to replace.`);
  }

  mkdirSync(targetConceptDir, { recursive: true });

  const copiedFiles: string[] = [];
  const sourceConceptDir = path.join(sourceDir, "concepts", entry.name);

  for (const file of entry.files) {
    const sourcePath = path.join(sourceConceptDir, file);
    if (!existsSync(sourcePath)) continue;

    if (file.endsWith("Concept.ts") || file.endsWith(".test.ts")) {
      const targetName = options.as ? file.replace(new RegExp(entry.name, "g"), conceptName) : file;
      const targetPath = path.join(targetConceptDir, targetName);
      copyAndRename(sourcePath, targetPath, entry.name, conceptName, entry.id, entry.version);
      copiedFiles.push(path.relative(targetCwd, targetPath));
    } else if (file === "concept.md") {
      const specPath = path.resolve(targetCwd, contract.specsDir, `${lowercaseName}.md`);
      const specDir = path.dirname(specPath);
      mkdirSync(specDir, { recursive: true });
      copyAndRename(sourcePath, specPath, entry.name, conceptName, entry.id, entry.version);
      copiedFiles.push(path.relative(targetCwd, specPath));
    } else if (file === "README.md") {
      const targetPath = path.join(targetConceptDir, file);
      copyAndRename(sourcePath, targetPath, entry.name, conceptName, entry.id, entry.version);
      copiedFiles.push(path.relative(targetCwd, targetPath));
    }
  }

  return {
    id: entry.id,
    version: entry.version,
    as: options.as,
    files: copiedFiles,
    conceptName,
    targetDir: path.relative(targetCwd, targetConceptDir),
  };
}

function copyAndRename(
  source: string,
  target: string,
  oldName: string,
  newName: string,
  catalogId: string,
  version: string
): void {
  let content = readFileSync(source, "utf8");

  if (!content.startsWith("// cdh:catalog")) {
    content = `// cdh:catalog ${catalogId}@${version}\n${content}`;
  }

  if (oldName !== newName) {
    const oldLower = oldName.toLowerCase();
    const newLower = newName.toLowerCase();
    const oldCamel = oldLower.slice(0, 1).toLowerCase() + oldName.slice(1);
    const newCamel = newLower.slice(0, 1).toLowerCase() + newName.slice(1);

    content = content
      .replace(new RegExp(oldName, "g"), newName)
      .replace(new RegExp(oldLower, "g"), newLower)
      .replace(new RegExp(oldCamel, "g"), newCamel);
  }

  writeFileSync(target, content, "utf8");
}
