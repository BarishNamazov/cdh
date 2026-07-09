# CDH Architecture

CDH is a harness that turns a directory into a **concept-design repo**. It runs as both a standalone CLI (`cdh`) and an OpenCode integration (tools, subagents, commands, and plugins).

## Core Principle

CDH **never imports target-repo code**. It inspects repos through config, AST analysis (ts-morph), filesystem reads, and subprocesses. All business logic lives in `src/` and is OpenCode-agnostic.

## Layers

```
  .opencode/          ← OpenCode integration (tools, agents, plugins, commands)
      │
  bin/cdh.ts          ← CLI entrypoint (17 commands)
      │
  src/                ← Core business logic (OpenCode-agnostic)
   ├── config.ts      ← config defaults, deep-merge loader, explicit validation
   ├── rules/         ← R1-R10 rule engine
   ├── verify/        ← deterministic verification stage registry
   ├── tools/         ← Introspection functions (concepts, syncs, docs, catalog)
   ├── journal/       ← JSONL event journal + reports
   ├── ship/          ← Git snapshot, commit, branch, push, PR
   ├── repo-model/    ← ts-morph concept/sync discovery
   └── init.ts        ← Project scaffolding
```

## Key Modules

### Config (`src/config.ts`)
Three-layer merge: defaults → `~/.opencode/cdh.json` → `.opencode/cdh.json`. Validated with small explicit validators at load time.

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

### Verification (`src/verify/`)
Verification is a deterministic stage registry. Config selects stage names:
- **quick**: `verify.onAgentEnd`, run by the OpenCode idle plugin and `run_verification` tier `quick`
- **ship**: `verify.onShipLocal`, run by `run_verification` tier `ship` and `cdh ship`

Unknown stage names fail explicitly instead of being ignored.

### Ship (`src/ship/`)
`cdh ship --confirm` runs: preflight → verify(ship) → commit → branch → push → PR. Only stages files touched during the current session. Pre-existing dirty files are excluded.

### Journal (`src/journal/`)
Append-only JSONL event log. Each line is a typed `JournalEntry`: `{ runId, seq, ts, event: { type, data } }`. Records task starts, decisions, verification stages, rule warnings, catalog copies, ship events, and cost snapshots.

### Catalog (`src/catalog-lib.ts`)
Built-in concept library at `catalog/`. `catalog copy` renames and copies concepts into the target repo, updating imports and design/index.json.

## OpenCode Integration (`.opencode/`)

| Surface | Contents |
|---------|----------|
| package plugin | `@mit-sdg/cdh` registers tools, including `workflow_context`, plus agent-end verification |
| `agents/` | 6 subagents (Markdown with `mode: subagent` frontmatter) |
| `commands/` | 7 custom commands (`/new-concept`, `/review`, `/ship`, etc.) |

Subagents are invoked via OpenCode's native Task tool. Reviewer and scout are locked read-only via permission config. All workflow guidance comes from deterministic tools and versioned background docs, not OpenCode skills.

## Technology Stack

| Component | Tech |
|-----------|------|
| Runtime | Bun |
| Language | TypeScript ES2023 (strict) |
| AST analysis | ts-morph 27.x |
| Schema validation | Explicit TypeScript validators |
| Sync engine | @mit-sdg/sync-engine 0.1.x |
| Agent platform | OpenCode (native subagents + permissions) |
| Linting | Biome |
| Testing | Bun test (123 tests) |
