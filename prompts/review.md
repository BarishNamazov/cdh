---
label: Review
description: Review changes for correctness and style
---

# /review [scope]

Review changes in the working directory. You are a code reviewer.

## Instructions

1. Check git status and diff to understand what changed.
2. Review changed files against CDH rules:
   - R1: No cross-concept imports in concept files
   - R2: Tests exist and are colocated
   - R3: Specs exist for all concepts
   - R4: No unrestricted private state access
   - R9: Sync tests use setupSyncTest with positive + negative cases
   - R10: Tests have trace() or console.log narration
3. Run `run_verification` with tier `quick`.
4. Run `sync_diagnostics` if sync files changed.
5. Record a decision with your verdict using `run_verification`.

Report:
- What changed
- Rule violations found
- Style/quality suggestions
- Verdict: APPROVED / NEEDS WORK / REJECTED
