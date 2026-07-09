---
description: Generate a verification and compliance report
---

Generate a CDH compliance report for the current workspace. CDH workflow context is provided.

## Instructions

1. Call `list_concepts` to inventory all concepts and their spec/test status.
2. Call `list_syncs` for all syncs, then `sync_diagnostics`.
3. Call `run_verification` with tier `quick`.
4. Report file counts, rule status, and any blocking issues.
