import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "../src/config.ts";
import { createGatePolicy } from "../src/gate-policy.ts";

export default function gates(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "allow_engine",
    label: "Allow Engine Edits",
    description: "Temporarily allow edits to src/engine/ and src/sdk/ for the current session.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const config = await loadConfig(cwd);
      const policy = createGatePolicy(cwd, config);
      policy.allowEngineThisSession();
      return {
        content: [{ type: "text", text: "R5 gate lifted for engine/sdk paths this session." }],
        details: { allowed: true }
      };
    }
  });

  pi.on("tool_call", async (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    const config = await loadConfig(cwd);
    const policy = createGatePolicy(cwd, config);

    if (event.toolName === "edit" || event.toolName === "write") {
      const input = event.input as { filePath?: string };
      if (input.filePath) {
        const hit = policy.checkMutation(event.toolName, input.filePath);
        if (hit) {
          return { block: true, reason: hit.message };
        }
      }
    }

    if (event.toolName === "bash") {
      const input = event.input as { command?: string };
      if (input.command) {
        const hit = policy.screenBash(input.command);
        if (hit) {
          return { block: true, reason: hit.message };
        }
      }
    }
  });

  pi.on("user_bash", async (event, ctx) => {
    const cwd = ctx.cwd ?? process.cwd();
    const config = await loadConfig(cwd);
    const policy = createGatePolicy(cwd, config);
    const hit = policy.screenBash(event.command);
    if (hit) {
      return { result: { code: 1, stdout: "", stderr: hit.message } as any };
    }
  });
}
