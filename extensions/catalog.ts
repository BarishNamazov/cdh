import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { copyCatalogConcept } from "../src/catalog-lib.ts";
import { loadConfig } from "../src/config.ts";
import { loadRepoContract } from "../src/repo-contract.ts";

const BUILTIN_CATALOG = path.resolve(import.meta.dir, "..", "catalog", "concepts");
const REGISTRY_PATH = path.resolve(import.meta.dir, "..", "catalog", "registry.json");

interface RegistryEntry {
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

function getRegistry(): Registry | null {
  if (cachedRegistry) return cachedRegistry;
  if (!existsSync(REGISTRY_PATH)) return null;
  cachedRegistry = JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  return cachedRegistry;
}

function findEntry(name: string): RegistryEntry | undefined {
  const registry = getRegistry();
  if (!registry) return undefined;
  return registry.concepts.find((c) => c.name.toLowerCase() === name.toLowerCase());
}

export default function catalog(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "catalog_search",
    label: "Catalog Search",
    description:
      "Search the CDH catalog for reusable concept implementations. Returns name, version, summary, and tags.",
    parameters: Type.Object({
      query: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params) {
      const registry = getRegistry();
      const concepts = registry?.concepts ?? [];
      const q = params.query;

      const filtered = q
        ? concepts.filter(
            (c) =>
              c.name.toLowerCase().includes(q.toLowerCase()) ||
              c.summary.toLowerCase().includes(q.toLowerCase()) ||
              c.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()))
          )
        : concepts;

      const lines: string[] = [`Catalog concepts (${filtered.length}):`, ""];
      for (const c of filtered) {
        lines.push(`  ${c.name} (${c.version}): ${c.summary}`);
        if (c.tags.length > 0) lines.push(`    Tags: ${c.tags.join(", ")}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { results: filtered },
      };
    },
  });

  pi.registerTool({
    name: "catalog_show",
    label: "Catalog Show",
    description: "Show details for a catalog concept including its spec and source files.",
    parameters: Type.Object({
      name: Type.String(),
    }),
    async execute(_toolCallId, params) {
      const entry = findEntry(params.name);
      const details = { found: entry !== null, entry: entry ?? undefined };

      if (!entry) {
        return {
          content: [{ type: "text", text: `Catalog concept '${params.name}' not found.` }],
          details,
        };
      }

      const conceptDir = path.join(BUILTIN_CATALOG, entry.name);
      const specPath = path.join(conceptDir, "concept.md");
      const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : null;

      const lines: string[] = [
        `# ${entry.name} (${entry.version})`,
        entry.summary,
        `Tags: ${entry.tags.join(", ")}`,
        "",
      ];

      if (spec) {
        lines.push("## Spec");
        lines.push(spec);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details,
      };
    },
  });

  pi.registerTool({
    name: "catalog_copy",
    label: "Catalog Copy",
    description: "Copy a catalog concept into the local repo's concepts and specs directories.",
    parameters: Type.Object({
      name: Type.String(),
      as: Type.Optional(Type.String()),
      overwrite: Type.Optional(Type.Boolean()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const config = await loadConfig(cwd);

      const entry = findEntry(params.name);
      if (!entry) {
        return {
          content: [{ type: "text", text: `Catalog concept '${params.name}' not found.` }],
          details: { found: false },
        };
      }

      const { contract } = await loadRepoContract(cwd, config);

      try {
        const result = copyCatalogConcept(
          path.resolve(import.meta.dir, "..", "catalog"),
          cwd,
          entry,
          config,
          contract,
          { as: params.as, overwrite: params.overwrite }
        );

        return {
          content: [
            {
              type: "text",
              text: `Copied '${result.conceptName}' to ${result.targetDir} (${result.files.length} files).`,
            },
          ],
          details: { result },
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          details: { error: true },
        };
      }
    },
  });
}
