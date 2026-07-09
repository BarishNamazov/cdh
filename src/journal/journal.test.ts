import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { defaultConfig } from "../config.ts";
import { Journal } from "./journal.ts";
import type { JournalEntry } from "./types.ts";

describe("Journal", () => {
  test("persists the same typed event shape it keeps in memory", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cdh-journal-"));
    await mkdir(path.join(cwd, defaultConfig.paths.journal), { recursive: true });

    const env: Record<string, string | undefined> = {};
    const journal = new Journal(cwd, defaultConfig);
    journal.initRun(env, "implement a feature");
    journal.emitDecision("Use sync", "Cross-concept behavior belongs in a sync.");

    const runId = journal.getRunId();
    expect(runId).toBeTruthy();

    const eventsPath = path.join(cwd, defaultConfig.paths.journal, "runs", runId!, "events.jsonl");
    const persisted = (await readFile(eventsPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as JournalEntry);

    expect(persisted.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(persisted[0].event).toEqual({ type: "task_started", data: { prompt: "implement a feature" } });
    expect(persisted[1].event).toEqual({
      type: "decision",
      data: { title: "Use sync", body: "Cross-concept behavior belongs in a sync." },
    });
    expect(journal.getEvents()).toEqual(persisted);
  });

  test("joins an existing run and continues sequence numbers", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "cdh-journal-join-"));
    const runDir = path.join(cwd, defaultConfig.paths.journal, "runs", "run-test");
    await mkdir(runDir, { recursive: true });

    const env: Record<string, string | undefined> = { CDH_RUN_ID: "run-test", CDH_RUN_DIR: runDir };
    const first = new Journal(cwd, defaultConfig);
    first.initRun(env);
    first.emitDecision("First", "Initial decision.");

    const second = new Journal(cwd, defaultConfig);
    second.initRun(env);
    second.emitDecision("Second", "Follow-up decision.");

    const eventsPath = path.join(runDir, "events.jsonl");
    const persisted = (await readFile(eventsPath, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as JournalEntry);

    expect(persisted.map((entry) => entry.seq)).toEqual([1, 2]);
    expect(persisted.map((entry) => entry.event.type)).toEqual(["decision", "decision"]);
  });
});
