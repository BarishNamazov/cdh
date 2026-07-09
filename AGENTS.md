# CDH Project

This is a concept-design repo using the CDH harness. All features are built as independent Concepts composed through declarative Syncs.

## Subagents

OpenCode can delegate work to specialized CDH subagents via the Task tool:

| Subagent | Role |
|----------|------|
| **scout** | Explore the codebase and report findings (read-only) |
| **spec-writer** | Write concept specification documents |
| **concept-implementer** | Implement concept classes from specifications |
| **sync-implementer** | Implement synchronizations between concepts |
| **test-writer** | Write tests following CDH conventions |
| **reviewer** | Review changes for rule compliance (read-only) |

## Architecture Rules

- R1: No cross-concept imports — concepts are islands
- R2: Actions take single object param, return object
- R3: Queries start with `_` and return arrays
- R4: Class name matches directory
- R5: No writes to `.env` files (enforced by permissions)
- R6: Every concept has a spec with required sections
- R7: Every concept has a colocated test
- R8: Concepts wrapped with `track()` in tests
- R9: Sync tests use `setupSyncTest` with positive + negative cases
- R10: Principle/multi-action tests have `trace()` narration

## Tool Reference

- `workflow_context` — Build deterministic workflow context from static docs and dynamic repo state
- `list_concepts` / `describe_concept` — Inspect concept surfaces
- `list_syncs` / `trace_sync` / `sync_graph` / `sync_diagnostics` — Inspect sync relationships
- `read_design_doc` — Read CDH design convention docs (concept specs, sync patterns, testing)
- `run_verification` — Run compliance checks (quick tier: typecheck+rules, ship tier: full verification)
- `catalog_search` / `catalog_show` / `catalog_copy` — Use the built-in concept catalog
- `record_decision` — Log design decisions to the journal
- `spec_lint` — Check concept spec matches code surface
- `cdh_init` — Scaffold a new concept-design repo

## Configuration

Project config lives in `.opencode/cdh.json`. Run `cdh doctor` to check harness health.
