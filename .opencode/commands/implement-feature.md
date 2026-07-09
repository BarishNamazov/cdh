---
description: Implement a feature end-to-end with concepts, syncs, and verification
---

Implement a feature across concepts, syncs, and tests. This is a full-cycle workflow.

## Instructions

1. Call `workflow_context` with workflow `concept` or `sync` depending on the main change, then read extra docs only if needed.
2. Identify affected concepts with `list_concepts` and `describe_concept`.
3. Check the sync graph with `sync_graph` and `trace_sync` on affected actions.
4. Implement changes:
   a. Update concept specs if surface changes
   b. Implement concept changes
   c. Implement new syncs or update existing syncs
   d. Write/update tests for all changes
5. Run `run_verification` with tier `ship` to validate.
6. If ship passes, suggest running `cdh ship` to commit.

Prefer small, incremental changes. Commit after each concept or sync is updated and verified.
