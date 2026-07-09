---
description: Create a new synchronization between concepts
---

You are creating a new synchronization. Use deterministic CDH tools before writing.

## Instructions

1. Call `workflow_context` with workflow `sync` and all known action refs.
2. Trace any additional actions involved with `trace_sync`.
3. Analyze the current sync graph with `sync_graph`.
4. Create `src/syncs/<name>.sync.ts` using the `@mit-sdg/sync-engine` DSL.
5. Create sibling test file.
6. Trace again to verify the graph updated. Run `sync_diagnostics`.
7. Run `run_verification` with tier `ship`.

Before implementing, describe:
- The trigger (when) — which action(s) fire this sync
- The effect (then) — which action(s) are dispatched
- Any where filters or branches needed
- How the test will verify correct firing
