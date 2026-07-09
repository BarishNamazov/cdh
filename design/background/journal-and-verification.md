# Journal and Verification

The CDH journal is an append-only audit trail for a run. Verification is deterministic TypeScript code that records its stages into that journal.

## Run Model

- A root run gets `CDH_RUN_ID` and `CDH_RUN_DIR`.
- Child tools and subagents join the same run when those environment variables already exist.
- Events are written to `design/journal/runs/<runId>/events.jsonl`.

## Event Shape

Each line is one JSON object:

```json
{
  "runId": "run-YYYYMMDD-HHMMSS-abcd",
  "seq": 1,
  "ts": "2026-07-09T00:00:00.000Z",
  "event": {
    "type": "verification_stage",
    "data": {
      "stage": "typecheck",
      "status": "pass",
      "durationMs": 120,
      "summary": "TypeScript typecheck passed."
    }
  }
}
```

`seq` is monotonically increasing within a run. The persisted shape intentionally matches the in-memory `JournalEntry` type.

## Verification Stages

Stages are selected from `.opencode/cdh.json`:

- `verify.onAgentEnd`: quick deterministic checks run by the OpenCode idle plugin.
- `verify.onShipLocal`: full local checks run by `cdh ship` and `run_verification` tier `ship`.

Known stage names are `journal-health`, `typecheck`, `rules:changed`, `rules:all`, `tests:changed`, `tests:all`, `surface-coverage`, `sync-tests`, `legibility`, and `sync-diagnostics`. Unknown stage names fail explicitly.

## Completion Rule

Agents may say work is complete only after `run_verification` reports no failed stages for the appropriate tier. Warnings must be reported, not hidden.
