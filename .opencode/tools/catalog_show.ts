import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { tool } from "@opencode-ai/plugin";
import { BUILTIN_CATALOG, findEntry } from "./_catalog.ts";

export default tool({
  description: "Show details for a catalog concept including its spec.",
  args: { name: tool.schema.string().describe("Catalog concept name") },
  async execute(args) {
    const entry = findEntry(args.name);
    if (!entry) return `Catalog concept '${args.name}' not found.`;
    const specPath = path.join(BUILTIN_CATALOG, entry.name, "concept.md");
    const spec = existsSync(specPath) ? readFileSync(specPath, "utf8") : null;
    const lines = [`# ${entry.name} (${entry.version})`, entry.summary, `Tags: ${entry.tags.join(", ")}`, ""];
    if (spec) lines.push("## Spec", spec);
    return lines.join("\n");
  },
});
