import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import {
  AuthStorage,
  type CustomEntry,
  createAgentSession,
  DefaultResourceLoader,
  ModelRegistry,
  type SessionEntry,
  SessionManager,
  SettingsManager
} from "@earendil-works/pi-coding-agent";

interface SpikeEntryData {
  probe: string;
  ok: boolean;
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

const root = path.resolve(import.meta.dir, "..");
const proofDir = path.join(root, ".wp0-cache", "pi-spike-proof");
const sessionDir = path.join(proofDir, "sessions");
const agentDir = path.join(proofDir, "agent");

await rm(proofDir, { recursive: true, force: true });
await mkdir(sessionDir, { recursive: true });
await mkdir(agentDir, { recursive: true });

const settingsManager = SettingsManager.inMemory({
  defaultProjectTrust: "always",
  retry: { enabled: false }
});
const authStorage = AuthStorage.create(path.join(agentDir, "auth.json"));
const modelRegistry = ModelRegistry.create(authStorage, path.join(agentDir, "models.json"));

async function createLoadedResourceLoader(): Promise<DefaultResourceLoader> {
  const resourceLoader = new DefaultResourceLoader({
    cwd: root,
    agentDir,
    settingsManager,
    additionalExtensionPaths: [path.join(root, "extensions", "spike-probes.ts")],
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true
  });

  await resourceLoader.reload();
  const loadedExtensions = resourceLoader.getExtensions();
  assert(loadedExtensions.errors.length === 0, `Extension load failed: ${JSON.stringify(loadedExtensions.errors)}`);
  return resourceLoader;
}

async function createProofSession(sessionManager: SessionManager) {
  return createAgentSession({
    cwd: root,
    agentDir,
    authStorage,
    modelRegistry,
    settingsManager,
    resourceLoader: await createLoadedResourceLoader(),
    sessionManager,
    noTools: "builtin"
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

  const entries = sessionManager.getEntries();
  const spikeEntries = entries.filter(isSpikeEntry);
  assert(spikeEntries.some((entry) => entry.data?.probe === "command" && entry.data.ok), "Missing command spike entry");
  assert(
    spikeEntries.some((entry) => entry.data?.probe === "followup_queued" && entry.data.ok),
    "Missing follow-up queued spike entry"
  );
  // Pi defers creating the session file until the first assistant message; this
  // synthetic message gives command-only probes the same durable boundary.
  sessionManager.appendMessage({
    role: "assistant",
    content: [{ type: "text", text: "CDH WP0 spike proof flush." }],
    api: "openai-responses",
    provider: "openai",
    model: "cdh-local-proof",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 }
    },
    stopReason: "stop",
    timestamp: Date.now()
  });
  assert(sessionManager.getSessionFile(), "Expected a persisted session file");

  const sessionFile = sessionManager.getSessionFile();
  assert(sessionFile, "Expected session file before reopen");
  session.dispose();
  disposed = true;

  const reopenedManager = SessionManager.open(sessionFile, sessionDir, root);
  const reopenedSpikeEntries = reopenedManager.getEntries().filter(isSpikeEntry);
  assert(
    reopenedSpikeEntries.some((entry) => entry.data?.probe === "command" && entry.data.ok),
    "Missing command spike entry after direct session reopen"
  );

  console.log(
    JSON.stringify(
      { ok: true, sessionFile, spikeEntries: reopenedSpikeEntries, registeredTool: "cdh_spike_echo" },
      null,
      2
    )
  );
} finally {
  if (!disposed) session.dispose();
}
