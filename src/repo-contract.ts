import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveDesignDoc } from "./background-docs.ts";
import { type CdhConfig, loadConfig } from "./config.ts";

export interface RepoContract {
  specsDir: string;
  docs: Record<string, string>;
  helpers: {
    testingModule: string;
    exports: string[];
  };
  scripts: {
    test: string;
    typecheck: string;
    start: string;
  };
  health: {
    path: string;
  };
}

export interface LoadedRepoContract {
  contract: RepoContract;
  path: string;
}

export async function loadRepoContract(cwd: string, config?: CdhConfig): Promise<LoadedRepoContract> {
  const cdhConfig = config ?? (await loadConfig(cwd));
  const contractPath = path.resolve(cwd, cdhConfig.paths.designIndex);
  const raw = JSON.parse(await readFile(contractPath, "utf8"));

  const errors = validateRepoContract(raw);
  if (errors.length > 0) {
    throw new Error(`Invalid repo contract at ${contractPath}:\n${errors.join("\n")}`);
  }

  return { contract: raw as RepoContract, path: contractPath };
}

function validateRepoContract(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [": Expected object"];

  requireString(value, "/specsDir", errors);
  const docs = value.docs;
  if (!isRecord(docs) || !Object.values(docs).every((item) => typeof item === "string")) {
    errors.push("/docs: Expected string record");
  }
  requireString(value, "/helpers/testingModule", errors);
  requireStringArray(value, "/helpers/exports", errors);
  requireString(value, "/scripts/test", errors);
  requireString(value, "/scripts/typecheck", errors);
  requireString(value, "/scripts/start", errors);
  requireString(value, "/health/path", errors);

  return errors;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireString(root: Record<string, unknown>, pointer: string, errors: string[]): void {
  if (typeof getPath(root, pointer) !== "string") errors.push(`${pointer}: Expected string`);
}

function requireStringArray(root: Record<string, unknown>, pointer: string, errors: string[]): void {
  const value = getPath(root, pointer);
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) {
    errors.push(`${pointer}: Expected string array`);
  }
}

function getPath(root: Record<string, unknown>, pointer: string): unknown {
  return pointer
    .split("/")
    .filter(Boolean)
    .reduce<unknown>((current, part) => (isRecord(current) ? current[part] : undefined), root);
}

export function resolveRepoPath(cwd: string, repoPath: string): string {
  return path.resolve(cwd, repoPath.replace(/^@/, "src/"));
}

export function checkRepoContractFiles(cwd: string, contract: RepoContract): string[] {
  const missing: string[] = [];

  for (const [key, docPath] of Object.entries(contract.docs)) {
    if (!resolveDesignDoc(cwd, docPath)) missing.push(`docs.${key}: ${docPath}`);
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
