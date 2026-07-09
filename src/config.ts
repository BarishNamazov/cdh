import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export interface CdhConfig {
  paths: {
    concepts: string;
    syncs: string;
    designIndex: string;
    journal: string;
  };
  rules: {
    importAllowlist: { syncs: string[] };
    helperMethodAllowlist: string[];
  };
  testing: {
    errorAssertionPatterns: string[];
  };
  verify: {
    onAgentEnd: string[];
    onShipLocal: string[];
    optionalStages: string[];
    autofixRetries?: number;
    lineCoverageInfoThreshold?: number;
    syncDiagnostics: string;
    agentEnd?: {
      enabled?: boolean;
      changedOnly?: boolean;
    };
  };
  context?: {
    autoInject?: boolean;
    maxDocChars?: number;
  };
  catalogPaths: string[];
  ship: {
    confirm: "interactive" | "never" | "headless-auto";
    branchPrefix: string;
    review: boolean;
    push: boolean;
    createPr: boolean;
    ci: boolean;
  };
  ci?: {
    provider: string;
    workflow: string;
  };
  frontend?: {
    enabled: boolean;
  };
}

export const defaultConfig: CdhConfig = {
  paths: {
    concepts: "src/concepts",
    syncs: "src/syncs",
    designIndex: "design/index.json",
    journal: "design/journal",
  },
  rules: {
    importAllowlist: { syncs: ["@engine"] },
    helperMethodAllowlist: [],
  },
  testing: {
    errorAssertionPatterns: ["expectError(", ".error"],
  },
  verify: {
    onAgentEnd: ["typecheck", "rules:changed"],
    onShipLocal: [
      "journal-health",
      "typecheck",
      "rules:all",
      "tests:all",
      "surface-coverage",
      "sync-tests",
      "legibility",
      "sync-diagnostics",
    ],
    optionalStages: ["smoke"],
    syncDiagnostics: "warn",
    agentEnd: {
      enabled: true,
      changedOnly: true,
    },
  },
  context: {
    autoInject: true,
    maxDocChars: 2500,
  },
  catalogPaths: [],
  ship: {
    confirm: "interactive",
    branchPrefix: "cdh/",
    review: true,
    push: true,
    createPr: true,
    ci: true,
  },
};

interface LoadConfigOptions {
  globalPath?: string;
  projectPath?: string;
}

export async function loadConfig(cwd: string, options: LoadConfigOptions = {}): Promise<CdhConfig> {
  const globalPath = options.globalPath ?? path.join(homedir(), ".opencode", "cdh.json");
  const projectPath = options.projectPath ?? path.join(cwd, ".opencode", "cdh.json");
  const merged = deepMerge(
    deepMerge(defaultConfig, await readJsonIfExists(globalPath)),
    await readJsonIfExists(projectPath)
  );

  const errors = validateConfig(merged);
  if (errors.length > 0) {
    throw new Error(`Invalid CDH config:\n${errors.join("\n")}`);
  }

  return merged as CdhConfig;
}

async function readJsonIfExists(filePath: string): Promise<unknown> {
  if (!existsSync(filePath)) return {};
  return JSON.parse(await readFile(filePath, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateConfig(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return [": Expected object"];

  requireString(value, "/paths/concepts", errors);
  requireString(value, "/paths/syncs", errors);
  requireString(value, "/paths/designIndex", errors);
  requireString(value, "/paths/journal", errors);
  requireStringArray(value, "/rules/importAllowlist/syncs", errors);
  requireStringArray(value, "/rules/helperMethodAllowlist", errors);
  requireStringArray(value, "/testing/errorAssertionPatterns", errors);
  requireStringArray(value, "/verify/onAgentEnd", errors);
  requireStringArray(value, "/verify/onShipLocal", errors);
  requireStringArray(value, "/verify/optionalStages", errors);
  requireOptionalNumber(value, "/verify/autofixRetries", errors);
  requireOptionalNumber(value, "/verify/lineCoverageInfoThreshold", errors);
  requireString(value, "/verify/syncDiagnostics", errors);

  const agentEnd = getPath(value, "/verify/agentEnd");
  if (agentEnd !== undefined && isRecord(agentEnd)) {
    if (agentEnd.enabled !== undefined)
      requireOptionalBoolean(agentEnd as Record<string, unknown>, "/enabled", "/verify/agentEnd", errors);
    if (agentEnd.changedOnly !== undefined)
      requireOptionalBoolean(agentEnd as Record<string, unknown>, "/changedOnly", "/verify/agentEnd", errors);
  }

  const context = getPath(value, "/context");
  if (context !== undefined && isRecord(context)) {
    if (context.autoInject !== undefined)
      requireOptionalBoolean(context as Record<string, unknown>, "/autoInject", "/context", errors);
    if (context.maxDocChars !== undefined)
      requireOptionalNumberInner(context as Record<string, unknown>, "/maxDocChars", "/context", errors);
  }

  requireStringArray(value, "/catalogPaths", errors);
  requireString(value, "/ship/branchPrefix", errors);
  requireBoolean(value, "/ship/review", errors);
  requireBoolean(value, "/ship/push", errors);
  requireBoolean(value, "/ship/createPr", errors);
  requireBoolean(value, "/ship/ci", errors);

  const confirm = getPath(value, "/ship/confirm");
  if (confirm !== "interactive" && confirm !== "never" && confirm !== "headless-auto") {
    errors.push("/ship/confirm: Expected one of interactive, never, headless-auto");
  }

  const ci = value.ci;
  if (ci !== undefined) {
    requireString(value, "/ci/provider", errors);
    requireString(value, "/ci/workflow", errors);
  }

  const frontend = value.frontend;
  if (frontend !== undefined) {
    requireBoolean(value, "/frontend/enabled", errors);
  }

  return errors;
}

function requireString(root: Record<string, unknown>, pointer: string, errors: string[]): void {
  if (typeof getPath(root, pointer) !== "string") errors.push(`${pointer}: Expected string`);
}

function requireBoolean(root: Record<string, unknown>, pointer: string, errors: string[]): void {
  if (typeof getPath(root, pointer) !== "boolean") errors.push(`${pointer}: Expected boolean`);
}

function requireOptionalBoolean(
  root: Record<string, unknown>,
  pointer: string,
  prefix: string,
  errors: string[]
): void {
  const value = root[pointer.slice(1)];
  if (value !== undefined && typeof value !== "boolean") errors.push(`${prefix}${pointer}: Expected boolean`);
}

function requireOptionalNumber(root: Record<string, unknown>, pointer: string, errors: string[]): void {
  const value = getPath(root, pointer);
  if (value !== undefined && typeof value !== "number") errors.push(`${pointer}: Expected number`);
}

function requireOptionalNumberInner(
  root: Record<string, unknown>,
  pointer: string,
  prefix: string,
  errors: string[]
): void {
  const value = root[pointer.slice(1)];
  if (value !== undefined && typeof value !== "number") errors.push(`${prefix}${pointer}: Expected number`);
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

export function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) return (override ?? base) as T;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? deepMerge(result[key], value) : value;
  }
  return result as T;
}
