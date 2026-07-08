import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const StringArray = Type.Array(Type.String());

export const CdhConfigSchema = Type.Object({
  paths: Type.Object({
    concepts: Type.String(),
    syncs: Type.String(),
    designIndex: Type.String(),
    journal: Type.String(),
  }),
  rules: Type.Object({
    importAllowlist: Type.Object({ syncs: StringArray }),
    helperMethodAllowlist: StringArray,
  }),
  testing: Type.Object({
    errorAssertionPatterns: StringArray,
  }),
  verify: Type.Object({
    onAgentEnd: StringArray,
    onShipLocal: StringArray,
    optionalStages: StringArray,
    autofixRetries: Type.Optional(Type.Number()),
    lineCoverageInfoThreshold: Type.Optional(Type.Number()),
    syncDiagnostics: Type.String(),
  }),
  catalogPaths: StringArray,
  ship: Type.Object({
    confirm: Type.Union([Type.Literal("interactive"), Type.Literal("never"), Type.Literal("headless-auto")]),
    branchPrefix: Type.String(),
    review: Type.Boolean(),
    push: Type.Boolean(),
    createPr: Type.Boolean(),
    ci: Type.Boolean(),
  }),
  ci: Type.Optional(
    Type.Object({
      provider: Type.String(),
      workflow: Type.String(),
    })
  ),
  frontend: Type.Optional(
    Type.Object({
      enabled: Type.Boolean(),
    })
  ),
});

export type CdhConfig = Static<typeof CdhConfigSchema>;

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
      "tests:changed",
      "tests:all",
      "surface-coverage",
      "sync-tests",
      "legibility",
    ],
    optionalStages: ["smoke"],
    syncDiagnostics: "warn",
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
  const globalPath = options.globalPath ?? path.join(homedir(), ".pi", "agent", "cdh.json");
  const projectPath = options.projectPath ?? path.join(cwd, ".pi", "cdh.json");
  const merged = deepMerge(
    deepMerge(defaultConfig, await readJsonIfExists(globalPath)),
    await readJsonIfExists(projectPath)
  );

  if (!Value.Check(CdhConfigSchema, merged)) {
    const errors = [...Value.Errors(CdhConfigSchema, merged)].map((error) => `${error.path}: ${error.message}`);
    throw new Error(`Invalid CDH config:\n${errors.join("\n")}`);
  }

  return merged;
}

async function readJsonIfExists(filePath: string): Promise<unknown> {
  if (!existsSync(filePath)) return {};
  return JSON.parse(await readFile(filePath, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge<T>(base: T, override: unknown): T {
  if (!isRecord(base) || !isRecord(override)) return (override ?? base) as T;

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(override)) {
    result[key] = key in result ? deepMerge(result[key], value) : value;
  }
  return result as T;
}
