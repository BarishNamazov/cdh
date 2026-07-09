# CDH — Concept Design Harness

CDH turns any directory into a **concept-design repo**: a codebase where features are built as
independent concepts composed through synchronizations, with automated rule enforcement,
verification, and subagent orchestration — all inside your OpenCode coding agent or from the CLI.

## Quick Start

```bash
# Bootstrap a new concept-design repo
cdh init
bun install

# Start OpenCode — CDH tools load automatically
opencode
```

Inside OpenCode you can immediately say _"build a todo app"_ and the agent will create
concept specs, implementations, syncs, and tests — all following concept-design rules.

If you prefer the CLI:

```bash
cdh init
bun install
cdh rules       # check compliance
cdh verify      # run verification
cdh ship        # verify + commit + branch + push + PR
```

## How It Works

CDH is both an **OpenCode package** and a **standalone CLI**. When OpenCode starts in a
CDH-initialized repo, it auto-loads CDH tools that add 14+ agent tools:

```
opencode starts → loads .opencode/tools/ → loads .opencode/agents/ →
  agent gets: list_concepts, describe_concept, list_syncs, trace_sync,
              sync_graph, sync_diagnostics, read_design_doc, run_verification,
              catalog_search, catalog_copy, cdh_init, record_decision
```

**Single-agent mode** (default): the agent uses all CDH tools directly. Say
_"build a todo app with labeling and comments"_ and it will read the design docs,
create specs, implement concepts, wire up syncs with `@mit-sdg/sync-engine`, write
tests, and run verification — all in one session.

**Subagent mode**: OpenCode's native subagents in `.opencode/agents/` handle specialized tasks.
The primary agent can invoke them via the `task` tool. Each subagent runs with
specific permissions and model configuration.

## Subagents

Six specialized subagents ship with the package:

| Agent | Role | Permissions |
|-------|------|-------------|
| **spec-writer** | Creates concept specs from user intent | edit: allow, bash: deny |
| **concept-implementer** | Implements concept classes from specs | full access |
| **sync-implementer** | Wires syncs between concepts | full access |
| **test-writer** | Writes tests following CDH conventions | full access |
| **reviewer** | Rule-compliance review | read-only |
| **scout** | Explores codebase and reports findings | read-only |

**Usage inside OpenCode** — ask the agent to delegate:

```
> Build a notification system. Use spec-writer → concept-implementer →
  sync-implementer → test-writer → reviewer chain.
```

Or use single-task delegation:

```
> @scout explore the codebase and report on concept dependencies.
```

Reviewer and scout are read-only (permissions enforce it natively).

## CLI Reference

```bash
cdh init                    # Scaffold a concept-design repo with Greeting example

cdh rules                   # Run all rules against the current repo
cdh verify --tier quick     # Quick check (typecheck + rules)
cdh verify --tier ship      # Full verification — runs before cdh ship

cdh ship --confirm          # Preflight → verify → commit → branch → push → PR

cdh concepts                # List all concepts with action/query counts
cdh concept <Name>          # Show concept surface, actions, queries, spec
cdh spec-check <Name>       # Check if spec matches code surface
cdh spec-sync <Name>        # Auto-update a spec to match code (--dry-run to preview)

cdh syncs [--concept <C>]   # List syncs, optionally filtered by concept
cdh trace <Action>          # Show which syncs involve an action (e.g. Labeling.addLabel)
cdh sync-graph --format mermaid|dot|json|report   # Visualize the sync graph
cdh sync-diagnostics                               # Warnings, missing tests, bad patterns

cdh doc <key>               # Read a background doc (e.g. sync-conventions)

cdh catalog search <q>      # Search built-in concept catalog
cdh catalog show <Name>     # Inspect a catalog concept
cdh catalog copy <Name>     # Copy a catalog concept into your repo (--as to rename)

cdh doctor                  # Check harness health and repo contract
```

## Rules

CDH enforces 10 rules. Violations block writes (BLOCK), produce warnings (WARN),
or prevent shipping (FAIL-SHIP):

| Rule | What | Severity |
|------|------|----------|
| R1  | Concepts never import other concepts | BLOCK |
| R2  | Actions take one object param, return one object | WARN |
| R3  | Queries return arrays | WARN |
| R4  | Class name matches directory | WARN |
| R5  | `.env` files blocked from writes | BLOCK |
| R6  | Every concept has a spec with required sections | FAIL-SHIP |
| R7  | Every concept has a colocated `.test.ts` file | FAIL-SHIP |
| R8  | Concepts are wrapped with `track()` in tests | FAIL-SHIP |
| R9  | Sync tests use `setupSyncTest`, have positive + negative cases | FAIL-SHIP |
| R10 | Principle and multi-action tests have `trace()` narration | FAIL-SHIP |

## Ship Safety

`cdh ship` runs a strict pipeline before touching git:

1. **Preflight** — repo check, merge/rebase detection, exclude pre-existing dirty files
2. **Verify** — all ship-tier stages must pass (journal-health, typecheck, rules, tests, surface-coverage, legibility, sync-diagnostics)
3. **Commit** — stages only changed files, includes `Cdh-Run: <runId>` trailer
4. **Branch** — `cdh/<runId>`, suffix on collision
5. **Push/PR** — controlled by config (`.opencode/cdh.json` `ship.push`, `ship.createPr`)

## Catalog

Copy pre-built concepts into your repo:

```bash
cdh catalog search identity     # find concepts
cdh catalog show authenticating # inspect one
cdh catalog copy authenticating # install it (--as Auth to rename)
```

Built-in: **Authenticating** — username/password identity with `Bun.password` hashing.

## Project Structure

```
my-app/
├── opencode.json                  # OpenCode config (permissions, instructions)
├── .opencode/
│   ├── cdh.json                   # CDH config (rules, verify, ship, etc.)
│   ├── agents/                    # CDH subagents
│   │   ├── spec-writer.md
│   │   ├── concept-implementer.md
│   │   ├── sync-implementer.md
│   │   ├── test-writer.md
│   │   ├── reviewer.md
│   │   └── scout.md
│   ├── tools/                     # CDH custom tools
│   ├── plugins/                   # CDH plugins
│   ├── commands/                  # Custom commands
│   └── skills/                    # Reusable skill workflows
├── .gitignore
├── package.json
├── tsconfig.json
├── design/
│   ├── index.json               # Repo contract (doc refs, helpers, scripts)
│   ├── concepts/                # Concept specs (*.md)
│   │   └── greeting.md
│   ├── background/              # Convention docs (agents read these)
│   │   ├── concept-design-overview.md
│   │   ├── concept-specifications.md
│   │   ├── implementing-concepts.md
│   │   ├── implementing-synchronizations.md
│   │   └── testing-concepts.md
│   └── journal/                 # Run history (auto-generated)
└── src/
    ├── concepts/<Name>/         # Concept class + tests
    │   ├── GreetingConcept.ts
    │   └── GreetingConcept.test.ts
    ├── syncs/                   # Sync definitions + tests
    │   ├── greeting-audit.sync.ts
    │   └── greeting-audit.sync.test.ts
    ├── engine/                  # Server bootstrap
    │   └── server.ts
    └── utils/
        └── testing.ts           # CDH test harness
```

## Verification Stages

| Stage | Tier |
|-------|------|
| `journal-health` — event persistence working | ship |
| `typecheck` — `tsc --noEmit` passes | quick, ship |
| `rules:all` — all 10 rules pass | ship |
| `tests:all` — `bun test` passes | ship |
| `surface-coverage` — all surface methods exercised | ship |
| `legibility` — principle tests have narration | ship |
| `sync-diagnostics` — sync graph health | ship |

Quick tier: typecheck + rules for changed files.
Ship tier: all stages above.

## Development

```bash
bun install
bun test          # 123 tests
bun run check     # TypeScript typecheck
```
