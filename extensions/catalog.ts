import type { ExtensionAPI, ToolCallEvent } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { loadConfig } from "../src/config.ts";

const BUILTIN_CATALOG = path.resolve(import.meta.dir, "..", "catalog", "concepts");

export default function catalog(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "catalog_search",
    label: "Catalog Search",
    description: "Search the CDH catalog for reusable concept implementations. Returns name, version, summary, and tags.",
    parameters: Type.Object({
      query: Type.Optional(Type.String()),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const config = await loadConfig(cwd);
      const registryPath = path.resolve(import.meta.dir, "..", "catalog", "registry.json");

      let concepts: Array<{ id: string; name: string; version: string; summary: string; tags: string[] }> = [];

      if (existsSync(registryPath)) {
        const registry = JSON.parse(readFileSync(registryPath, "utf8"));
        concepts = registry.concepts ?? [];
      }

      const filtered = params.query
        ? concepts.filter(
            (c) =>
              c.name.toLowerCase().includes(params.query!.toLowerCase()) ||
              c.summary.toLowerCase().includes(params.query!.toLowerCase()) ||
              c.tags.some((t) => t.toLowerCase().includes(params.query!.toLowerCase()))
          )
        : concepts;

      const lines: string[] = [`Catalog concepts (${filtered.length}):`, ""];
      for (const c of filtered) {
        lines.push(`  ${c.name} (${c.version}): ${c.summary}`);
        lines.push(`    Tags: ${c.tags.join(", ")}`);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { results: filtered }
      };
    }
  });

  pi.registerTool({
    name: "catalog_show",
    label: "Catalog Show",
    description: "Show details for a catalog concept including its spec and source files.",
    parameters: Type.Object({
      name: Type.String(),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const config = await loadConfig(cwd);

      const registryPath = path.resolve(import.meta.dir, "..", "catalog", "registry.json");
      let entry = null;

      if (existsSync(registryPath)) {
        const registry = JSON.parse(readFileSync(registryPath, "utf8"));
        entry = (registry.concepts ?? []).find(
          (c: { name: string }) => c.name.toLowerCase() === params.name.toLowerCase()
        );
      }

      if (!entry) {
        return {
          content: [{ type: "text", text: `Catalog concept '${params.name}' not found.` }],
          details: { found: false }
        };
      }

      const conceptDir = path.join(BUILTIN_CATALOG, entry.name);
      const specPath = path.join(conceptDir, "concept.md");
      const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : null;
      const sourcePath = path.join(conceptDir, `${entry.name}Concept.ts`);
      const source = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : null;

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

      if (source) {
        lines.push("## Source");
        lines.push(source);
      }

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: { entry, spec, source }
      };
    }
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

      const registryPath = path.resolve(import.meta.dir, "..", "catalog", "registry.json");
      let entry = null;

      if (existsSync(registryPath)) {
        const registry = JSON.parse(readFileSync(registryPath, "utf8"));
        entry = (registry.concepts ?? []).find(
          (c: { name: string }) => c.name.toLowerCase() === params.name.toLowerCase()
        );
      }

      if (!entry) {
        return {
          content: [{ type: "text", text: `Catalog concept '${params.name}' not found.` }],
          details: { found: false }
        };
      }

      const { copyCatalogConcept } = await import("../src/catalog-lib.ts");
      const { loadRepoContract } = await import("../src/repo-contract.ts");
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
          content: [{ type: "text", text: `Copied '${result.conceptName}' to ${result.targetDir} (${result.files.length} files).` }],
          details: { result }
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          details: { error: true }
        };
      }
    }
  });
}
