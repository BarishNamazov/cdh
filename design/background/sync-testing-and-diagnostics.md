# Sync Testing and Diagnostics

Synchronizations are the only place concepts are composed. Their tests must prove both firing and non-firing behavior.

## Required Test Shape

Every `src/syncs/<name>.sync.ts` file needs a sibling `src/syncs/<name>.sync.test.ts` file that:

- Imports the sync under test.
- Uses `setupSyncTest` or the configured equivalent harness.
- Has at least one positive case proving the sync fires.
- Has at least one negative case whose name includes `does not` or `negative`.
- Covers error branches when a sync branches on outputs.

## Diagnostics Workflow

1. Run `workflow_context` with workflow `sync` or `debug-sync` and relevant `Concept.action` refs.
2. Read `trace_sync` output for each trigger/effect action.
3. Read `sync_graph` to confirm the expected edges exist.
4. Run `sync_diagnostics` and fix warnings before ship verification.

## Common Failures

- Unknown action reference: a sync names an action/query that no concept exposes.
- Missing sibling test: the sync file exists but no `.sync.test.ts` file exists.
- Endpoint does not respond: an endpoint sync lacks a response/fail action on some path.
- Untested branch: a sync uses `branch`, `on`, or `onError`; tests must cover all meaningful paths.

## Good Sync Tests

Good sync tests state the trigger, show the expected effect, and include a negative case that proves nearby non-matching input does not fire the sync.
