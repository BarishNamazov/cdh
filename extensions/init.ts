import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { type InitResult, initProject } from "../src/init.ts";

export default function initExtension(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "cdh_init",
    label: "Init CDH Project",
    description:
      "Scaffold a minimal, working concept-design repo in the current directory. " +
      "Creates package.json, tsconfig.json, .gitignore, a Greeting concept with spec, " +
      "sync, tests, and utility helpers. Idempotent — skips existing files.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const result: InitResult = initProject(cwd);

      const lines: string[] = [`CDH project initialized in ${cwd}`, "", "Created:"];

      for (const file of result.created) {
        lines.push(`  + ${file}`);
      }

      if (result.skipped.length > 0) {
        lines.push("");
        lines.push("Skipped (already exist):");
        for (const file of result.skipped) {
          lines.push(`  · ${file}`);
        }
      }

      if (result.errors.length > 0) {
        lines.push("");
        lines.push("Errors:");
        for (const err of result.errors) {
          lines.push(`  ! ${err}`);
        }
        return {
          content: [{ type: "text", text: lines.join("\n") }],
          details: result,
          isError: true,
        };
      }

      lines.push("");
      lines.push("Next steps:");
      lines.push("  1. bun install");
      lines.push("  2. bun test          # verify the scaffold");
      lines.push("  3. cdh rules         # check compliance");

      return {
        content: [{ type: "text", text: lines.join("\n") }],
        details: result,
      };
    },
  });
}
