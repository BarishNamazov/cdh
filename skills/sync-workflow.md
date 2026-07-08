---
label: Sync Implementation Workflow
name: sync-workflow
description: Workflow for wiring synchronizations between concepts with the sync engine DSL
trigger: sync, new sync, implement sync, synchronization
tools: list_syncs, trace_sync, sync_graph, sync_diagnostics, read_design_doc
---

# Sync Implementation Workflow

Follow this workflow when implementing new synchronizations between concepts.

## Steps

1. **Read sync conventions**: Call `read_design_doc` with key `sync-conventions`.

2. **Inspect existing syncs**: Call `list_syncs` and `trace_sync` on the actions involved. Understand the sync graph before adding edges.

3. **Analyze the graph**: Call `sync_graph` to see current relationships. Identify trigger (when) and effect (then) actions.

4. **Implement the sync**: Create `src/syncs/<name>.sync.ts`:
   - Use the `@mit-sdg/sync-engine` DSL: `sync()`, `when()`, `act()`, `where()`, `branch()`, `on()`, `onError()`
   - For endpoints: use `createEndpointDsl()` and `defineEndpoint()`
   - Export const declarations
   - Include success and error branches with `on()`/`onError()`

5. **Write sync tests**: Create sibling `*.sync.test.ts`:
   - Use `setupSyncTest`
   - Positive case: proves the sync fires
   - Negative case: name includes "does not" — proves non-firing
   - Cover success and error branches

6. **Trace before and after**: Call `trace_sync` on the when/then actions to verify the trace updated correctly.

7. **Run diagnostics**: Call `sync_diagnostics`. Fix warnings (missing tests, untested branches, etc.).

8. **Verify**: Call `run_verification` with tier `ship`.

## Rules
- R1: Sync files may import from multiple concepts (this is their purpose)
- R9: Sync tests must use setupSyncTest, have positive + negative cases
