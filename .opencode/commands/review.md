---
description: Review changes for correctness and style
---

Review changes in the working directory. You are a code reviewer.

## Instructions

1. Check git status and diff to understand what changed.
2. Call `workflow_context` with workflow `review`.
3. Review changed files against CDH rules:
   - R1: No cross-concept imports in concept files
   - R6: Specs exist with required sections
   - R7: Concepts have colocated tests
   - R9: Sync tests use setupSyncTest with positive + negative cases
   - R10: Tests have trace() or console.log narration
4. Run `run_verification` with tier `quick`.
5. Run `sync_diagnostics` if sync files changed.
6. Record a decision with your verdict using `record_decision`.

Report:
- What changed
- Rule violations found
- Style/quality suggestions
- Verdict: APPROVED / NEEDS WORK / REJECTED
