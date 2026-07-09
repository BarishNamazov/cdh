import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
const REGISTRY_PATH = path.join(PROJECT_ROOT, "catalog", "registry.json");
export const CATALOG_BASE = path.join(PROJECT_ROOT, "catalog");
export const BUILTIN_CATALOG = path.join(CATALOG_BASE, "concepts");

export interface RegistryEntry {
  id: string;
  name: string;
  version: string;
  summary: string;
  tags: string[];
  pairsWith?: string[];
  files: string[];
}

interface Registry {
  concepts: RegistryEntry[];
}

let cachedRegistry: Registry | null = null;

export function getRegistry(): Registry | null {
  if (cachedRegistry) return cachedRegistry;
  if (!existsSync(REGISTRY_PATH)) return null;
  try {
    cachedRegistry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
    return cachedRegistry;
  } catch {
    return null;
  }
}

export function findEntry(name: string): RegistryEntry | undefined {
  const registry = getRegistry();
  if (!registry) return undefined;
  return registry.concepts.find((c) => c.name.toLowerCase() === name.toLowerCase());
}
