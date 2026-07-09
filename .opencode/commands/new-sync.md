---
description: Implement a new synchronization between concepts
---

Create a new synchronization (sync) file. CDH workflow context is provided.

## Instructions

1. Identify the trigger concept/action (when) and effect concept/action (then).
2. Call `trace_sync` on the when and then actions.
3. Create the sync file at `src/syncs/<name>.sync.ts` using the sync engine DSL.
4. Create a sibling test at `src/syncs/<name>.sync.test.ts` with `setupSyncTest`, positive and negative cases.
5. Run `sync_diagnostics` to validate.
6. Agent-end verification runs automatically.
