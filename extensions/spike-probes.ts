import { isToolCallEventType, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface SpikeEntryData {
  probe: string;
  ok: boolean;
}

export default function spikeProbes(pi: ExtensionAPI): void {
  pi.registerCommand("cdh-spike", {
    description: "Run CDH WP0 extension API probes.",
    handler: async (args, ctx) => {
      pi.appendEntry("cdh:spike", { probe: "command", ok: true } satisfies SpikeEntryData);
      ctx.ui.setStatus("cdh-spike", "command ok");
      ctx.ui.setWidget("cdh-spike", [`args: ${args || "<none>"}`]);
    }
  });

  pi.registerCommand("cdh-spike-followup", {
    description: "Queue a CDH WP0 follow-up command probe.",
    handler: async (_args, _ctx) => {
      pi.appendEntry("cdh:spike", { probe: "followup_queued", ok: true } satisfies SpikeEntryData);
      pi.sendUserMessage("/cdh-spike from-followup", { deliverAs: "followUp" });
    }
  });

  pi.registerTool({
    name: "cdh_spike_echo",
    label: "CDH Spike Echo",
    description: "Echoes text for CDH WP0 custom tool probing.",
    parameters: Type.Object({ text: Type.String() }),
    async execute(_toolCallId, params) {
      pi.appendEntry("cdh:spike", { probe: "tool", ok: true } satisfies SpikeEntryData);
      return {
        content: [{ type: "text", text: params.text }],
        details: { echoed: params.text }
      };
    }
  });

  pi.on("session_start", (_event, ctx) => {
    const prior = ctx.sessionManager
      .getEntries()
      .filter((entry) => entry.type === "custom" && entry.customType === "cdh:spike");
    if (prior.length > 0) {
      ctx.ui.setStatus("cdh-spike", `restored ${prior.length}`);
      pi.appendEntry("cdh:spike", { probe: "session_restore", ok: true } satisfies SpikeEntryData);
    }
  });

  pi.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt}\n\nCDH WP0 spike probe loaded.`
  }));

  pi.on("tool_call", (event) => {
    if (isToolCallEventType("bash", event) && event.input.command.includes("cdh-spike-block")) {
      pi.appendEntry("cdh:spike", { probe: "tool_call_block", ok: true } satisfies SpikeEntryData);
      return { block: true, reason: "Blocked by CDH spike probe" };
    }
  });

  pi.on("tool_result", (event) => {
    if (event.toolName !== "cdh_spike_echo") return;
    const details = event.details && typeof event.details === "object" ? event.details : {};
    pi.appendEntry("cdh:spike", { probe: "tool_result", ok: true } satisfies SpikeEntryData);
    return {
      content: [...event.content, { type: "text" as const, text: "CDH spike tool_result observed." }],
      details: { ...details, cdhSpikeObserved: true }
    };
  });

  pi.on("agent_end", (event) => {
    const assistantMessages = event.messages.filter((message) => message.role === "assistant").length;
    pi.appendEntry("cdh:spike", { probe: `agent_end:${assistantMessages}`, ok: true } satisfies SpikeEntryData);
  });
}
