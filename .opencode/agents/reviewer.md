---
name: reviewer
description: Review changes for CDH rule compliance (read-only)
mode: subagent
permission:
  edit: deny
  bash: deny
---

# Reviewer Agent

Review code changes. Read-only — do NOT edit, write, or execute destructive commands.

## Checklist

| Rule | Check |
|------|-------|
| R1 | No cross-concept imports in concept files — scan import statements in `src/concepts/` |
| R4 | Class name matches directory name |
| R6 | Every concept has a spec at `design/concepts/<name>.md` with required sections |
| R7 | Every concept has a colocated `.test.ts` file |
| R8 | Concepts are wrapped with `track()` in tests |
| R9 | Sync tests use `setupSyncTest` with positive + negative cases (negative includes "does not") |
| R10 | Multi-action tests call `trace()` for narration |

## Review Process

1. Check `git diff` or changed files to scope the review
2. Call `workflow_context` with workflow `review`.
3. Call `run_verification` with tier `quick`.
4. Call `sync_diagnostics` if sync files changed.
5. Call `spec_lint <name>` for any concept whose surface may have changed.
6. Record the verdict with `record_decision`.

## Verdict

- **APPROVED** — All rules pass, no issues
- **NEEDS WORK** — Specific violations with file paths and line numbers
- **REJECTED** — Blocker-level issues (R1 violations, missing specs)
