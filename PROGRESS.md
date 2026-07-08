# Progress

## M1 (complete)

- WP0: complete-with-exception, 2026-07-06, scaffolded `@mit-sdg/cdh`, pinned Bun/TypeScript/pi/typebox/ts-morph dependencies, added typed pi spike probe, documented pi API notes, built `fixtures/valid-app`, added static fixture contract validation, and added `fixtures/violations/R*`. Deferred assertion: WP5a must later prove `fixtures/valid-app` passes `cdh verify --tier ship --no-review --no-ci`. `bun run spike:pi` proves command registration, custom tool registration/execution, `tool_call` blocking, `tool_result` mutation, `before_agent_start` system-prompt mutation, `agent_end` observation, follow-up queueing/retrigger, custom entry append, status/widget API calls, session-file persistence, and child subprocess usage capture. Exception: `registerEntryRenderer` is absent in installed pi 0.80.3 runtime.
- WP1: complete, 2026-07-06, implemented R1-R4 and R6-R10 rules in `src/rules/rule-engine.ts` with test coverage for all violation fixtures. Implemented repo model with concept discovery and sync discovery. Implemented suppression scanner for R2/R3/R4 construct-level and R10 file-level cdh-ignore comments.
- WP2: complete, 2026-07-06, implemented run model with run ID generation, parent run join, and changed scope computation. Implemented journal core with 18 event types, JSONL writer with degraded mode, dual-write journal class, report generator with INDEX.md appender.
- WP3: complete, 2026-07-06, implemented gate policy with protected path enforcement (`.env`), bash screening (rm -rf, force-push, .env writes).
- WP5a: complete, 2026-07-06, implemented verification stage runner with journal-health, typecheck, rules, tests, surface-coverage, legibility, and sync-diagnostics stages. `fixtures/valid-app` passes `cdh verify --tier ship`.
- WP6a: complete, 2026-07-06, implemented catalog lib with copy and rename routine. Created `Authenticating` catalog concept (T7 quality) with register, authenticate, changePassword, unregister actions, full spec, and 9 passing tests.
- WP4: complete, 2026-07-07, implemented list_concepts, describe_concept, list_syncs, trace_sync CLI commands and pi agent tools. Added spec-check, spec-sync, doc, and doctor CLI commands.

## M2 — Workstream A: Sync-Engine Alignment (complete)

- A1: `fixtures/sync-engine-app` fixture with DSL sync files (when/act/query/where/branches/endpoint patterns)
- A2: Rewrote `discoverSyncs()` with ts-morph AST extraction for sync-engine DSL patterns. SyncModel includes whenActions, thenActions, queryRefs, endpointPaths, hasWhere, hasBranches. Legacy string-based parser removed.
- A3: `cdh sync-graph` CLI (report, JSON, Mermaid, DOT). `cdh sync-diagnostics` CLI. Agent tools `sync_graph` and `sync_diagnostics`.
- A4: Verification stage for sync-diagnostics (configurable severity: warn/fail-ship/off).

## M2 — Workstream B: Pi Extension Integration (complete)

- B1: Split extensions by concern: concept-tools, gates, verification, catalog.
- B2: Gate extension intercepts `tool_call` events for write/edit/bash tools, enforces protected path policy.
- B3: `run_verification` pi tool (quick/ship). `agent_end` hook runs quick verification, journals failures.
- B4: `catalog_search`, `catalog_show`, `catalog_copy` pi tools with registry caching.

## M2 — Workstream C: Orchestrator and Agent Specs (complete)

- C1-C2: `orchestrate_run` pi tool with built-in agent registry (spec-writer, concept-implementer, sync-implementer, test-writer, reviewer, scout). Modes: single, chain (sequential with artifact passing), parallel (up to 3 concurrent). Agents run as isolated `pi --print` subprocesses with focused toolsets.
- C3: Agent specs polished to concise self-contained descriptions. Frontend-implementer deferred to M3.

## M2 — Workstream D: Skills and Prompts (complete)

- D1: Skills: concept-workflow, sync-workflow, debugging-syncs, frontend-shadcn.
- D2: Prompt templates: /new-concept, /new-sync, /implement-feature, /review, /ship, /status, /report.

## M2 — Workstream E: Ship (complete)

- E1: Git snapshot captures startRef and startStatus. Touched files computation excludes pre-existing dirty/staged files.
- E2: Ship preflight checks git repo, merge/rebase state, dirty file warnings, empty change set.
- E3: Ship-tier verification reuses existing runner (journal-health, typecheck, rules, tests, surface-coverage, legibility, sync-diagnostics).
- E4-E6: Git mutation — commit (touched-only staging, Cdh-Run trailer), branch (prefix+suffix on collision), push, PR (via gh CLI). Controlled by config: ship.confirm, ship.push, ship.createPr.

## M2 — Workstream G: Legibility UI (complete)

- G1-G2: `record_decision` pi tool journals title/body/alternatives. /status and /report prompt templates.
- G3: Cost snapshots deferred to M3 (pi usage not exposed).

## M2 — Workstream H: Documentation (complete)

- H1: README updated with @mit-sdg/sync-engine DSL, ship safety, agent tools table, orchestrator docs, skills/prompts reference.
- H2-H3: Runbook and detailed progress tracking deferred to M3.

## Deferred to M3

- WP5b: Review stage (reviewer agent invocation during ship).
- WP6b: Catalog expansion — Sessioning, AccessControlling concepts, harvest workflow.
- WP11: Entry renderers — blocked on pi 0.80.3 limitation; needs pi version upgrade or message-renderer strategy.
- WP12: Frontend implementer agent, cost snapshots.
- Runbook, progress automation (H2-H3).
