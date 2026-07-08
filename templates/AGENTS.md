# CDH Project

This is a concept-design repo using the CDH harness. All features are built as independent Concepts composed through declarative Syncs.

## Orchestration (Preferred Workflow)

For any non-trivial task, delegate work to specialized subagents using `orchestrate_run`. This keeps the main session clean and gives each sub-step focused context.

### Available Agents

| Agent | Role |
|-------|------|
| **scout** | Explore the codebase and report findings (read-only) |
| **spec-writer** | Write concept specification documents |
| **concept-implementer** | Implement concept classes from specifications |
| **sync-implementer** | Implement synchronizations between concepts |
| **test-writer** | Write tests following CDH conventions |
| **reviewer** | Review changes for rule compliance (read-only) |

### Modes

- **chain** — Sequential pipeline. Each step receives `{previous}` output as context. Best for feature builds (spec → implement → sync → test → review).
- **single** — Run one agent on one isolated task. Best for codebase exploration or focused reviews.
- **parallel** — Fan out up to 4 agents on independent tasks.

### Example

```
orchestrate_run in chain mode with spec-writer → concept-implementer → sync-implementer → test-writer → reviewer
```

## Architecture Rules

- R1: No cross-concept imports — concepts are islands
- R2: Actions take single object param, return object
- R3: Queries start with `_` and return arrays
- R6: Every concept has a spec with required sections
- R7: Every concept has a colocated test
- R8: Concepts wrapped with `track()` in tests
- R9: Sync tests use `setupSyncTest` with positive + negative cases
- R10: Principle/multi-action tests have `trace()` narration

## Tool Reference

- `list_concepts` / `describe_concept` — Inspect concept surfaces
- `list_syncs` / `trace_sync` / `sync_graph` / `sync_diagnostics` — Inspect sync relationships
- `read_design_doc` — Read design convention docs from `design/background/`
- `run_verification` — Run compliance checks (quick tier on agent_end, ship tier before commit)
- `catalog_search` / `catalog_show` / `catalog_copy` — Use the built-in concept catalog
- `record_decision` — Log design decisions to the journal
