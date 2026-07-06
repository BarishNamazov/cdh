export interface RunSnapshot {
  startRef: string;
  startStatus: string;
  preExistingFiles: string[];
}

export interface ChangedScope {
  concepts: string[];
  syncs: string[];
  touchedFiles: string[];
}

export function generateRunId(): string {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const time = now.toTimeString().slice(0, 8).replace(/:/g, "");
  const random = Math.random().toString(36).slice(2, 6);
  return `run-${date}-${time}-${random}`;
}

export function getOrCreateRunId(env: Record<string, string | undefined>): string {
  const existing = env["CDH_RUN_ID"];
  if (existing) return existing;
  return generateRunId();
}

export function joinParentRun(env: Record<string, string | undefined>): boolean {
  return Boolean(env["CDH_RUN_ID"]);
}

export function setRunEnv(env: Record<string, string | undefined>, runId: string, runDir: string): Record<string, string> {
  return {
    ...env,
    CDH_RUN_ID: runId,
    CDH_RUN_DIR: runDir
  };
}

export function computeChangedScope(
  conceptsRoot: string,
  syncsRoot: string,
  touchedFiles: string[]
): ChangedScope {
  const concepts: string[] = [];
  const syncs: string[] = [];

  for (const file of touchedFiles) {
    if (file.startsWith(conceptsRoot)) {
      const parts = file.slice(conceptsRoot.length + 1).split("/");
      if (parts[0] && !concepts.includes(parts[0])) {
        concepts.push(parts[0]);
      }
    }
    if (file.startsWith(syncsRoot)) {
      const name = file.slice(syncsRoot.length + 1);
      if (!syncs.includes(name)) {
        syncs.push(name);
      }
    }
  }

  return { concepts, syncs, touchedFiles };
}
