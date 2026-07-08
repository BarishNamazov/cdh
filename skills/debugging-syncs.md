---
label: Debugging Syncs
trigger: debug sync, sync error, sync not firing, sync broken
tools: trace_sync, sync_graph, sync_diagnostics, list_syncs
---

# Debugging Synchronizations

Use this workflow to debug sync issues — syncs not firing, firing unexpectedly, or producing wrong results.

## Diagnosis Steps

1. **Run diagnostics**: Call `sync_diagnostics`. Look for:
   - Missing tests
   - Untested branches
   - Orphan actions (not referenced by any sync)
   - Unreachable responses in endpoint syncs

2. **Trace the action**: Call `trace_sync Action.Here` on the suspected action.
   - Check `asTrigger` — which syncs fire when this action completes
   - Check `asEffect` — which syncs produce this action
   - Check `asQuery` — which syncs query this action in `where` clauses

3. **Inspect the sync graph**: Call `sync_graph` with `format: mermaid` to visualize.
   - Look for missing edges — syncs that should connect but don't
   - Look for broken chains — then-actions that should trigger cascading syncs

4. **Check sync file patterns**: Call `list_syncs` and verify:
   - `When` actions match expected triggers
   - `Then` actions match expected effects
   - `Queries` reference correct `_query` methods
   - `Endpoints` have correct paths

5. **Review sync code**: Read the `.sync.ts` file directly. Check:
   - `when()` patterns match the actual action signatures
   - `where()` filters are correct
   - `branch(on(...), onError(...))` handles both paths
   - Endpoint syncs respond on all paths

6. **Check concept surface**: Call `describe_concept` on involved concepts. Verify:
   - Action/query names are correct
   - Return types match what syncs expect
   - No missing actions or queries

## Common Issues

- **Sync not firing**: when pattern doesn't match action output, or sync is not registered
- **Cascade broken**: seq() step output not bound with .as(), or missing then-action
- **Error not handled**: Missing onError branch
