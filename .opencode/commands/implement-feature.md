---
description: Implement a feature end-to-end with concepts, syncs, and verification
---

Implement a feature across concepts, syncs, and tests. This is a full-cycle workflow. CDH workflow context is provided.

## Instructions

1. Identify affected concepts with `list_concepts` and `describe_concept` if needed.
2. Check the sync graph with `sync_graph` and `trace_sync` on affected actions.
3. Implement changes:
   a. Update concept specs if surface changes
   b. Implement concept changes
   c. Implement new syncs or update existing syncs
   d. Write/update tests for all changes
4. Run `run_verification` with tier `ship` to validate.
5. If ship passes, suggest running `cdh ship` to commit.

Prefer small, incremental changes. Commit after each concept or sync is updated and verified.
