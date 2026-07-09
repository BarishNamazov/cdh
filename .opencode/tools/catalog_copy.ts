import { tool } from "@opencode-ai/plugin";
import { copyCatalogConcept } from "@/catalog-lib.ts";
import { CATALOG_BASE, findEntry } from "./_catalog.ts";
import { resolveCtx } from "./_shared.ts";

export default tool({
  description: "Copy a catalog concept into the local repo's concepts and specs directories.",
  args: {
    name: tool.schema.string().describe("Catalog concept name to copy"),
    as: tool.schema.string().optional().describe("Rename the copied concept"),
    overwrite: tool.schema.boolean().optional().describe("Overwrite existing concept directory"),
  },
  async execute(args, context) {
    try {
      const { config, contract } = await resolveCtx(context.worktree);
      const entry = findEntry(args.name);
      if (!entry) return `Catalog concept '${args.name}' not found.`;
      const result = copyCatalogConcept(CATALOG_BASE, context.worktree, entry, config, contract, {
        as: args.as,
        overwrite: args.overwrite,
      });
      return `Copied '${result.conceptName}' to ${result.targetDir} (${result.files.length} files).`;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  },
});
