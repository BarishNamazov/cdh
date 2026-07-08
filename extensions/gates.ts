import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "../src/config.ts";
import { createGatePolicy } from "../src/gate-policy.ts";

export default function gates(pi: ExtensionAPI): void {
  let policy: ReturnType<typeof createGatePolicy> | null = null;

  async function getPolicy(cwd: string) {
    if (!policy) {
      const config = await loadConfig(cwd);
      policy = createGatePolicy(cwd, config);
    }
    return policy;
  }

  pi.on("tool_call", async (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    const p = await getPolicy(cwd);

    if (event.toolName === "edit" || event.toolName === "write") {
      const input = event.input as { filePath?: string };
      if (input.filePath) {
        const hit = p.checkMutation(event.toolName, input.filePath);
        if (hit) return { block: true, reason: hit.message };
      }
    }

    if (event.toolName === "bash") {
      const input = event.input as { command?: string };
      if (input.command) {
        const hit = p.screenBash(input.command);
        if (hit) return { block: true, reason: hit.message };
      }
    }
  });
}
