# CDH Architecture

CDH is a harness that turns a directory into a **concept-design repo**. It runs as both a standalone CLI (`cdh`) and an OpenCode integration (tools, subagents, plugins).

## Core Principle

CDH **never imports target-repo code**. It inspects repos through config, AST analysis (ts-morph), filesystem reads, and subprocesses. All business logic lives in `src/` and is OpenCode-agnostic.

## Layers

```
  .opencode/          ← OpenCode integration (tools, agents, plugins, skills, commands)
      │
  bin/cdh.ts          ← CLI entrypoint (16 commands)
      │
  src/                ← Core business logic (OpenCode-agnostic)
   ├── config.ts      ← TypeBox schema, deep-merge loader
   ├── rules/         ← R1-R10 rule engine
   ├── verify/        ← 7-stage verification pipeline
   ├── tools/         ← Introspection functions (concepts, syncs, docs, catalog)
   ├── journal/       ← JSONL event journal + reports
   ├── ship/          ← Git snapshot, commit, branch, push, PR
   ├── repo-model/    ← ts-morph concept/sync discovery
   └── init.ts        ← Project scaffolding
```

## Key Modules

### Config (`src/config.ts`)
Three-layer merge: defaults → `~/.opencode/cdh.json` → `.opencode/cdh.json`. Validated with TypeBox at load time.

### Rules (`src/rules/rule-engine.ts`)
| R# | Rule | Severity |
|----|------|----------|
| R1 | No cross-concept imports | BLOCK |
| R2 | Actions: single-obj param, return object | WARN |
| R3 | Queries start with `_`, return arrays | WARN |
| R4 | Class name matches directory | WARN |
| R5 | No writes to `.env` files | BLOCK |
| R6 | Every concept has a spec | FAIL-SHIP |
| R7 | Every concept has colocated test | FAIL-SHIP |
| R8 | Concepts wrapped with `track()` in tests | FAIL-SHIP |
| R9 | Sync tests use `setupSyncTest` + positive/negative | FAIL-SHIP |
| R10 | Multi-action tests call `trace()` | FAIL-SHIP |

### Verification (`src/verify/runner.ts`)
Two tiers:
- **quick**: typecheck + rules for changed files (runs on every agent turn via plugin)
- **ship**: journal-health, typecheck, rules:all, tests:all, surface-coverage, legibility, sync-diagnostics (runs before `cdh ship`)

### Ship (`src/ship/`)
`cdh ship --confirm` runs: preflight → verify(ship) → commit → branch → push → PR. Only stages files touched during the current session. Pre-existing dirty files are excluded.

### Journal (`src/journal/`)
Append-only JSONL event log. Records: task_started, decision, verification_stage, agent_*, gate_blocked, rule_warning, suppression. Used for audit trails and run reports.

### Catalog (`src/catalog-lib.ts`)
Built-in concept library at `catalog/`. `catalog copy` renames and copies concepts into the target repo, updating imports and design/index.json.

## OpenCode Integration (`.opencode/`)

| Directory | Contents |
|-----------|----------|
| `tools/` | 14 custom tools (TypeBox→Zod, use `@/` path alias) |
| `agents/` | 6 subagents (Markdown with `mode: subagent` frontmatter) |
| `plugins/` | Verification plugin (session.idle → auto-verify) |
| `commands/` | 7 custom commands (`/new-concept`, `/review`, `/ship`, etc.) |
| `skills/` | 4 skills (concept-workflow, sync-workflow, debugging-syncs, frontend-shadcn) |

Subagents are invoked via OpenCode's native Task tool. Reviewer and scout are locked read-only via permission config. All subagents reference tools from `.opencode/tools/` and skills from `.opencode/skills/`.

## Technology Stack

| Component | Tech |
|-----------|------|
| Runtime | Bun |
| Language | TypeScript ES2023 (strict) |
| AST analysis | ts-morph 27.x |
| Schema validation | @sinclair/typebox 0.34.x |
| Sync engine | @mit-sdg/sync-engine 0.1.x |
| Agent platform | OpenCode (native subagents + permissions) |
| Linting | Biome |
| Testing | Bun test (123 tests) |
