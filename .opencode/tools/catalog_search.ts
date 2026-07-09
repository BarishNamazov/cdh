import { tool } from "@opencode-ai/plugin";
import { getRegistry } from "./_catalog.ts";

export default tool({
  description: "Search the CDH catalog for reusable concept implementations.",
  args: { query: tool.schema.string().optional().describe("Search query (matches name, summary, or tags)") },
  async execute(args) {
    const concepts = getRegistry()?.concepts ?? [];
    const q = args.query;
    const filtered = q
      ? concepts.filter(
          (c) =>
            c.name.toLowerCase().includes(q.toLowerCase()) ||
            c.summary.toLowerCase().includes(q.toLowerCase()) ||
            c.tags.some((t) => t.toLowerCase().includes(q.toLowerCase()))
        )
      : concepts;

    const lines = [`Catalog concepts (${filtered.length}):`, ""];
    for (const c of filtered) {
      lines.push(`  ${c.name} (${c.version}): ${c.summary}`);
      if (c.tags.length > 0) lines.push(`    Tags: ${c.tags.join(", ")}`);
    }
    return lines.join("\n");
  },
});
