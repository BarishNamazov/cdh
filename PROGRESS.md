# Progress

- WP0: complete-with-exception, 2026-07-06, scaffolded `@sdg/cdh`, pinned Bun/TypeScript/pi/typebox/ts-morph dependencies, added typed pi spike probe, documented pi API notes, built `fixtures/valid-app`, added static fixture contract validation, and added `fixtures/violations/R*`. Deferred assertion: WP5a must later prove `fixtures/valid-app` passes `cdh verify --tier ship --no-review --no-ci`. `bun run spike:pi` proves command registration, custom tool registration/execution, `tool_call` blocking, `tool_result` mutation, `before_agent_start` system-prompt mutation, `agent_end` observation, follow-up queueing/retrigger, custom entry append, status/widget API calls, session-file persistence, and child subprocess usage capture. Exception: `registerEntryRenderer` is absent in installed pi 0.80.3 runtime despite cloned source docs; WP11 must pin a supporting pi version, use message renderers, or defer entry renderers.
- WP1: complete, 2026-07-06, implemented R1-R4 and R6-R10 rules in `src/rules/rule-engine.ts` with test coverage for all violation fixtures. Implemented repo model with concept discovery (`src/repo-model/concepts.ts`) and sync discovery (`src/repo-model/syncs.ts`). Implemented suppression scanner (`src/rules/suppressions.ts`) for R2/R3/R4 construct-level and R10 file-level cdh-ignore comments. Renamed violation fixture concepts to use realistic -ing naming (Tagging/Categorizing, Indexing, Listing, Ranking, Prioritizing, Scheduling, Timing, Recording).
- WP2: complete, 2026-07-06, implemented run model (`src/run-model.ts`) with run ID generation, parent run join, and changed scope computation. Implemented journal core (`src/journal/`) with event vocabulary (18 event types), JSONL writer with degraded mode, dual-write journal class, report generator with INDEX.md appender.
- WP3: complete, 2026-07-06, implemented gate policy (`src/gate-policy.ts`) with R5 protected path enforcement (`src/engine/**`, `src/sdk/**`, `.env*`), bash screening (rm -rf, force-push, .env writes), and `/allow-engine` session flag.
- WP5a: complete, 2026-07-06, implemented verification stage runner (`src/verify/`) with journal-health, typecheck, rules, tests, surface-coverage, and legibility stages. Implemented `cdh rules` and `cdh verify [--tier quick|ship]` CLI commands in `bin/cdh.ts`. `fixtures/valid-app` passes `cdh verify --tier quick`.
- WP6a: complete, 2026-07-06, implemented catalog lib (`src/catalog-lib.ts`) with copy and rename routine. Created `Authenticating` catalog concept (T7 quality) with register, authenticate, changePassword, unregister actions, _getUserByUsername/_getUsers queries, Bun.password.hash/verify, full spec, and 9 passing tests using track(), testAction(), expectError(), trace().
- WP4: complete, 2026-07-07, implemented list_concepts, describe_concept, list_syncs, and trace_sync CLI commands and pi agent tools. Also added spec-check and spec-sync tools for keeping concept code and specs aligned. Implemented cdh doctor with contract validation, file existence, spec/test presence, and journal health checks. New CLI commands: trace, syncs, concepts, concept, spec-check, spec-sync.
- WP5b: not started (M2)
- WP6b: not started (M2)
- WP7: not started (M2)
- WP8: not started (M2)
- WP9a: not started (M3)
- WP9b: not started (M3)
- WP10: not started (M2)
- WP11: not started (M2)
- WP12: not started (M3)
