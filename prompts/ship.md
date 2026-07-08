---
label: Ship
description: Ship changes with verification, commit, and optional PR
---

# /ship

Ship the current changes. Run preflight, verification, and commit.

## Instructions

1. Call `run_verification` with tier `ship`.
2. If verification fails, fix issues and re-verify.
3. Check for pre-existing dirty files that shouldn't be included.
4. If all clear, confirm the ship:
   a. Describe what will be committed (list touched files)
   b. Ask user to confirm
   c. On confirmation, suggest `cdh ship --confirm`

## What gets shipped
- Only files touched during this session
- Pre-existing dirty/staged files are excluded
- Commit includes `Cdh-Run: <runId>` trailer
- Branch created with configured prefix

## Options
- `--no-review`: Skip review stage
- `--no-ci`: Skip CI trigger
