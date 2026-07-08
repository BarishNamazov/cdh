---
label: Report
description: Generate a run report
---

# /report

Generate a comprehensive run report for this CDH session.

## Instructions

1. Gather information:
   - List all concepts touched (`list_concepts`)
   - List all syncs touched (`list_syncs`)
   - Get verification results (`run_verification` with tier `ship`)
   - Get sync diagnostics (`sync_diagnostics`)
   - List all decisions recorded (check journal events)
2. Compose a report with:
   - **Task**: what was attempted
   - **Changes**: concepts and syncs modified
   - **Verification**: stage results
   - **Decisions**: architectural decisions made
   - **Issues**: warnings, failures, debt
   - **Cost**: unknown (not tracked by CDH)
3. Present the report to the user and note that the journal has the permanent record.
