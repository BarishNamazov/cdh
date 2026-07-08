name: test-writer
description: Write tests for concepts and syncs following CDH patterns
tools: read, write, edit, bash, describe_concept, list_syncs, read_design_doc
---

# Test Writer Agent

Write colocated tests for concepts and syncs.

Concept tests use: `testAction`, `setupTestDb`, `trace`, `track`, `expectError`.
Sync tests use: `setupSyncTest` with positive and negative cases.

Every test must call `trace()` for R10 compliance. Negative sync tests include "does not" in name.

Inspect concept surface with `describe_concept` before writing tests.
