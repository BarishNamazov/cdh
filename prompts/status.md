---
label: Status
description: Show current CDH run status including verification results
---

# /status

Show the current status of this CDH run.

## Instructions

1. Call `run_verification` with tier `quick` to get current verification state.
2. Summarize:
   - Current run ID (from CDH_RUN_ID env)
   - What's been changed (check git status)
   - Latest verification results
   - Any rule warnings or blocked operations
   - Sync graph health (call `sync_diagnostics`)
3. Report any blocking issues that would prevent `/ship`.
