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

const sessionManager = SessionManager.create(root, sessionDir, { id: "cdh-wp0-spike" });
const { session } = await createAgentSession({
  cwd: root,
  agentDir,
  authStorage,
  modelRegistry,
  settingsManager,
  resourceLoader,
  sessionManager,
  noTools: "builtin"
});

try {
  await session.prompt("/cdh-spike sdk-proof");

  const entries = sessionManager.getEntries();
  const spikeEntries = entries.filter(isSpikeEntry);
  assert(spikeEntries.some((entry) => entry.data?.probe === "command" && entry.data.ok), "Missing command spike entry");
  assert(sessionManager.getSessionFile(), "Expected a persisted session file");

  console.log(JSON.stringify({ ok: true, sessionFile: sessionManager.getSessionFile(), spikeEntries }, null, 2));
} finally {
  session.dispose();
}
