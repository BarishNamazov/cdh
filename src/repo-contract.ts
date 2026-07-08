import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { type CdhConfig, loadConfig } from "./config.ts";

export const RepoContractSchema = Type.Object({
  specsDir: Type.String(),
  docs: Type.Record(Type.String(), Type.String()),
  helpers: Type.Object({
    testingModule: Type.String(),
    exports: Type.Array(Type.String()),
  }),
  scripts: Type.Object({
    test: Type.String(),
    typecheck: Type.String(),
    start: Type.String(),
  }),
  health: Type.Object({
    path: Type.String(),
  }),
});

export type RepoContract = Static<typeof RepoContractSchema>;

export interface LoadedRepoContract {
  contract: RepoContract;
  path: string;
}

export async function loadRepoContract(cwd: string, config?: CdhConfig): Promise<LoadedRepoContract> {
  const cdhConfig = config ?? (await loadConfig(cwd));
  const contractPath = path.resolve(cwd, cdhConfig.paths.designIndex);
  const raw = JSON.parse(await readFile(contractPath, "utf8"));

  if (!Value.Check(RepoContractSchema, raw)) {
    const errors = [...Value.Errors(RepoContractSchema, raw)].map((error) => `${error.path}: ${error.message}`);
    throw new Error(`Invalid repo contract at ${contractPath}:\n${errors.join("\n")}`);
  }

  return { contract: raw, path: contractPath };
}

export function resolveRepoPath(cwd: string, repoPath: string): string {
  return path.resolve(cwd, repoPath.replace(/^@/, "src/"));
}

export function checkRepoContractFiles(cwd: string, contract: RepoContract): string[] {
  const missing: string[] = [];

  for (const [key, docPath] of Object.entries(contract.docs)) {
    if (!existsSync(path.resolve(cwd, docPath))) missing.push(`docs.${key}: ${docPath}`);
  }

  if (!existsSync(resolveRepoPath(cwd, contract.helpers.testingModule))) {
    missing.push(`helpers.testingModule: ${contract.helpers.testingModule}`);
  }

  if (!existsSync(path.resolve(cwd, contract.specsDir))) {
    missing.push(`specsDir: ${contract.specsDir}`);
  }

  return missing;
}

export function assertRepoContractFiles(cwd: string, contract: RepoContract): void {
  const missing = checkRepoContractFiles(cwd, contract);
  if (missing.length > 0) throw new Error(`Repo contract references missing files:\n${missing.join("\n")}`);
}
