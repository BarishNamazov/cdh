---
label: New Sync
description: Create a new synchronization between concepts
---

# /new-sync <behavior>

You are creating a new synchronization. Follow the sync-workflow skill.

## Instructions

1. Trace the actions involved: call `trace_sync` on the when-action and then-action.
2. Analyze the current sync graph with `sync_graph`.
3. Create `src/syncs/<name>.sync.ts` using the `@mit-sdg/sync-engine` DSL.
4. Create sibling test file.
5. Trace again to verify the graph updated. Run `sync_diagnostics`.
6. Run `run_verification` with tier `ship`.

Before implementing, describe:
- The trigger (when) — which action(s) fire this sync
- The effect (then) — which action(s) are dispatched
- Any where filters or branches needed
- How the test will verify correct firing
