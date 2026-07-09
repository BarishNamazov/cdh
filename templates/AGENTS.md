# CDH Project

This repo uses the CDH harness. Build features as independent Concepts composed through declarative Syncs.

## Deterministic Workflow

- Start concept, sync, test, review, and debug work by calling `workflow_context` with the matching workflow.
- Use `read_design_doc` for a specific background document after `workflow_context` if more detail is needed.
- Run `run_verification` with tier `quick` before handing work back, and tier `ship` before shippable changes.
- Record important architecture decisions with `record_decision`.

## Rules

- R1: No cross-concept imports; concepts are islands.
- R2: Actions take one object param and return an object.
- R3: Queries start with `_` and return arrays.
- R4: Class name matches directory.
- R5: No writes to `.env` files.
- R6: Every concept has a spec.
- R7: Every concept has a colocated test.
- R8: Concept tests wrap instances with `track()`.
- R9: Sync tests use `setupSyncTest` with positive and negative cases.
- R10: Principle and multi-action tests have `trace()` narration.

## Tool Reference

- `workflow_context` builds deterministic static and dynamic workflow context.
- `list_concepts` and `describe_concept` inspect concept surfaces.
- `list_syncs`, `trace_sync`, `sync_graph`, and `sync_diagnostics` inspect synchronization relationships.
- `read_design_doc` reads versioned CDH background docs.
- `run_verification` runs deterministic verification stages from `.opencode/cdh.json`.
- `catalog_search`, `catalog_show`, and `catalog_copy` use the built-in concept catalog.
