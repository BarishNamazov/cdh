---
description: Ship changes through verification, commit, branch, and PR
---

Ship the current changes. This is the CDH ship workflow.

## Instructions

1. Run `run_verification` with tier `ship` first.
2. If all stages pass, confirm the user wants to proceed.
3. Run `cdh ship --confirm` to commit, branch, push, and create PR.
4. Report the PR URL.
