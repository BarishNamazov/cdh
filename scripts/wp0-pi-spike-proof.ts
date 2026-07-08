import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fauxAssistantMessage, fauxToolCall, registerFauxProvider } from "@earendil-works/pi-ai/compat";
import {
  AuthStorage,
  type CustomEntry,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  type SessionEntry,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

interface SpikeEntryData {
  probe: string;
  ok: boolean;
}

interface SpikeProofSummary {
  ok: true;
  sessionFile: string;
  spikeEntries: Array<ReturnType<typeof serializeSpikeEntry>>;
  registeredTool: "cdh_spike_echo";
  usage: { assistantMessages: number; inputTokens: number; outputTokens: number };
  child?: SpikeProofSummary;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function isSpikeEntry(entry: SessionEntry): entry is CustomEntry<SpikeEntryData> {
  if (entry.type !== "custom" || entry.customType !== "cdh:spike") return false;
  if (!entry.data || typeof entry.data !== "object") return false;
  const data = entry.data as Partial<SpikeEntryData>;
  return typeof data.probe === "string" && typeof data.ok === "boolean";
}

function serializeSpikeEntry(entry: CustomEntry<SpikeEntryData>) {
  return {
    type: entry.type,
    customType: entry.customType,
    data: entry.data,
    id: entry.id,
    parentId: entry.parentId,
    timestamp: entry.timestamp,
  };
}

async function runChildProof(): Promise<SpikeProofSummary> {
  const child = Bun.spawn(["bun", "run", "scripts/wp0-pi-spike-proof.ts", "--child"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...Bun.env, CDH_WP0_CHILD: "1" },
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(`Child proof failed with exit ${exitCode}\nSTDOUT:\n${stdout}\nSTDERR:\n${stderr}`);
  }

  const parsed = JSON.parse(stdout) as Partial<SpikeProofSummary>;
  assert(parsed.ok === true, "Child proof did not report ok");
  assert(parsed.usage?.assistantMessages && parsed.usage.assistantMessages > 0, "Child proof did not capture usage");
  return parsed as SpikeProofSummary;
}

const root = path.resolve(import.meta.dir, "..");
const isChild = Bun.argv.includes("--child");
const proofDir = path.join(root, ".wp0-cache", isChild ? "pi-spike-proof-child" : "pi-spike-proof");
const sessionDir = path.join(proofDir, "sessions");
const agentDir = path.join(proofDir, "agent");

await rm(proofDir, { recursive: true, force: true });
await mkdir(sessionDir, { recursive: true });
await mkdir(agentDir, { recursive: true });

const settingsManager = SettingsManager.inMemory({
  defaultProjectTrust: "always",
  retry: { enabled: false },
});
const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
const modelRegistry = ModelRegistry.create(authStorage, path.join(agentDir, "models.json"));
let observedSystemPromptProbe = false;
let observedFollowupRetrigger = false;

async function createLoadedResourceLoader(): Promise<DefaultResourceLoader> {
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [path.join(root, "extensions", "spike-probes.ts")],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });

  await resourceLoader.reload();
  const loadedExtensions = resourceLoader.getExtensions();
  assert(loadedExtensions.errors.length === 0, `Extension load failed: ${JSON.stringify(loadedExtensions.errors)}`);
  return resourceLoader;
}

const faux = registerFauxProvider({ models: [{ id: "faux-1", reasoning: false }] });
faux.setResponses([
  (context) => {
    observedSystemPromptProbe = context.systemPrompt?.includes("CDH WP0 spike probe loaded.") ?? false;
    observedFollowupRetrigger = JSON.stringify(context.messages).includes("CDH follow-up retrigger probe");
    return fauxAssistantMessage("follow-up retrigger observed");
  },
  fauxAssistantMessage(fauxToolCall("cdh_spike_echo", { text: "from faux" }), { stopReason: "toolUse" }),
  fauxAssistantMessage("echo done"),
  fauxAssistantMessage(fauxToolCall("bash", { command: "cdh-spike-block" }), { stopReason: "toolUse" }),
  fauxAssistantMessage("block done"),
]);
authStorage.setRuntimeApiKey(faux.getModel().provider, "faux-key");

async function createProofSession(sessionManager: SessionManager) {
  return createAgentSession({
    cwd: root,
    agentDir,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader: await createLoadedResourceLoader(),
    sessionManager,
    model: faux.getModel(),
    tools: ["cdh_spike_echo", "bash"],
  });
}

const sessionManager = SessionManager.create(root, sessionDir, { id: "cdh-wp0-spike" });
const { session } = await createProofSession(sessionManager);
let disposed = false;

try {
  assert(
    session.agent.state.tools.some((tool) => tool.name === "cdh_spike_echo"),
    "Missing registered cdh_spike_echo tool"
  );

  await session.prompt("/cdh-spike sdk-proof");
  await session.prompt("/cdh-spike-followup");
  await session.agent.waitForIdle();
  await session.prompt("Use the echo tool.");
  await session.agent.waitForIdle();
  await session.prompt("Run the blocked bash probe.");
  await session.agent.waitForIdle();

  const entries = sessionManager.getEntries();
  const spikeEntries = entries.filter(isSpikeEntry);
  assert(
    spikeEntries.some((entry) => entry.data?.probe === "command" && entry.data.ok),
    "Missing command spike entry"
  );
  assert(
    spikeEntries.some((entry) => entry.data?.probe === "ui_status_widget_called" && entry.data.ok),
    "Missing UI status/widget call spike entry"
  );
  assert(
    spikeEntries.some(
      (entry) => entry.data?.probe === "entry_renderer_available" || entry.data?.probe === "entry_renderer_missing"
    ),
    "Missing entry renderer availability spike entry"
  );
  assert(
    spikeEntries.some((entry) => entry.data?.probe === "followup_queued" && entry.data.ok),
    "Missing follow-up queued spike entry"
  );
  assert(observedFollowupRetrigger, "Missing follow-up retrigger model observation");
  assert(
    spikeEntries.some((entry) => entry.data?.probe === "tool" && entry.data.ok),
    "Missing tool spike entry"
  );
  assert(observedSystemPromptProbe, "Missing before_agent_start system prompt probe");
  assert(
    spikeEntries.some((entry) => entry.data?.probe === "tool_result" && entry.data.ok),
    "Missing tool result spike entry"
  );
  assert(
    spikeEntries.some((entry) => entry.data?.probe === "tool_call_block" && entry.data.ok),
    "Missing tool call block spike entry"
  );
  assert(
    entries.some(
      (entry) =>
        entry.type === "message" &&
        entry.message.role === "toolResult" &&
        entry.message.toolName === "cdh_spike_echo" &&
        entry.message.content.some(
          (content) => content.type === "text" && content.text.includes("CDH spike tool_result observed.")
        )
    ),
    "Missing modified cdh_spike_echo tool result message"
  );
  assert(sessionManager.getSessionFile(), "Expected a persisted session file");

  const sessionFile = sessionManager.getSessionFile();
  assert(sessionFile, "Expected session file before reopen");
  session.dispose();
  disposed = true;

  const reopenedManager = SessionManager.open(sessionFile, sessionDir, root);
  const reopenedSpikeEntries = reopenedManager.getEntries().filter(isSpikeEntry);
  const usage = { assistantMessages: 0, inputTokens: 0, outputTokens: 0 };
  for (const entry of reopenedManager.getEntries()) {
    if (entry.type !== "message" || entry.message.role !== "assistant") continue;
    usage.assistantMessages += 1;
    usage.inputTokens += entry.message.usage.input;
    usage.outputTokens += entry.message.usage.output;
  }
  assert(usage.assistantMessages > 0, "Missing faux assistant usage");
  assert(
    reopenedSpikeEntries.some((entry) => entry.data?.probe === "command" && entry.data.ok),
    "Missing command spike entry after direct session reopen"
  );

  const summary: SpikeProofSummary = {
    ok: true,
    sessionFile,
    spikeEntries: reopenedSpikeEntries.map(serializeSpikeEntry),
    registeredTool: "cdh_spike_echo",
    usage,
  };
  if (!isChild) summary.child = await runChildProof();

  console.log(JSON.stringify(summary, null, 2));
} finally {
  if (!disposed) session.dispose();
  faux.unregister();
}
