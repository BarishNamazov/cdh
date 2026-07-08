# CDH — Concept Design Harness

CDH turns any directory into a **concept-design repo**: a codebase where features are built as
independent concepts composed through synchronizations, with automated rule enforcement,
verification, and multi-agent orchestration — all inside your pi coding agent or from the CLI.

## Quick Start

```bash
# Bootstrap a new concept-design repo
cdh init
bun install

# 3. Start pi — CDH loads automatically
pi
```

That's it. Inside pi you can immediately say _"build a todo app"_ and the agent will create
concept specs, implementations, syncs, and tests — all following concept-design rules.

If you prefer the CLI instead of pi:

```bash
cdh init
bun install
cdh rules       # check compliance
cdh verify      # run verification
cdh ship        # verify + commit + branch + push + PR
```

## How It Works

CDH is both a **pi package** and a **standalone CLI**. When pi starts in a CDH-initialized
repo, it auto-loads CDH extensions that add 14+ agent tools:

```
pi starts → reads .pi/settings.json → loads CDH →
  agent gets: list_concepts, describe_concept, list_syncs, trace_sync,
              sync_graph, sync_diagnostics, read_design_doc, run_verification,
              catalog_search, catalog_copy, cdh_init, orchestrate_run
```

**Single-agent mode** (default): the pi agent uses all CDH tools directly. Say
_"build a todo app with labeling and comments"_ and it will read the design docs,
create specs, implement concepts, wire up syncs with `@mit-sdg/sync-engine`, write
tests, and run verification — all in one session.

**Multi-agent mode**: subagents ship with the CDH package. Use `orchestrate_run` to delegate work to
specialized subagents. Each runs as an isolated pi process with a focused toolset.
This is optional — single-agent mode handles everything.

## Subagents

Six specialized agents ship with the package:

| Agent | Role | Tools | Mode |
|-------|------|-------|------|
| **spec-writer** | Creates concept specs from user intent | read, write, read_design_doc, catalog | read/write |
| **concept-implementer** | Implements concept classes from specs | read, write, edit, bash, describe_concept, run_verification | read/write |
| **sync-implementer** | Wires syncs between concepts | read, write, edit, bash, trace_sync, sync_graph, list_syncs, run_verification | read/write |
| **test-writer** | Writes tests following CDH conventions | read, write, edit, bash, describe_concept, list_syncs | read/write |
| **reviewer** | Rule-compliance review (read-only) | read, list_concepts, list_syncs, trace_sync, sync_graph, sync_diagnostics, run_verification | read-only |
| **scout** | Explores codebase and reports findings | read, list_concepts, describe_concept, list_syncs, trace_sync, sync_graph, catalog | read-only |

**Usage inside pi** — ask the agent to orchestrate:

```
> Build a notification system. Use orchestrate_run in chain mode:
  spec-writer → concept-implementer → sync-implementer → test-writer → reviewer.
```

Or use single-task delegation:

```
> Send a scout to explore the codebase and report on concept dependencies.
```

**Modes:**

- `single` — run one agent on one task
- `chain` — sequential pipeline, each step gets `{previous}` output as context
- `parallel` — fan out up to 4 agents on independent tasks

Agents are isolated: the reviewer cannot edit files, the sync-implementer traces the
sync graph before and after edits, and all agents run verification on their own work.

## CLI Reference

```bash
cdh init                    # Scaffold a concept-design repo with Greeting example

cdh rules                   # Run all rules against the current repo
cdh verify --tier quick     # Quick check (typecheck + rules) — runs on every agent end
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

## Sync Engine DSL

Syncs are declarative `when → where? → then` rules composed with
[@mit-sdg/sync-engine](https://www.npmjs.com/package/@mit-sdg/sync-engine):

```typescript
import { act, on, onError, sync, type Vars, when } from "@mit-sdg/sync-engine";

export const auditSync = sync(({ id }: Vars) =>
  when(Labeling.addLabel, { item: "" }, { id })
    .where((frames) => frames.query(Audit._getEvents, { targetId: id }, {}))
    .then(
      act(Audit.record, { id, event: "CREATED" }).branch(
        on(act(Audit.record, { id, event: "CONFIRMED" })),
        onError({ error }, act(Audit.record, { id, event: "FAILED", error })),
      ),
    ),
);
```

Endpoint syncs:

```typescript
import { createEndpointDsl, syncMap } from "@mit-sdg/sync-engine/sdk";

const dsl = createEndpointDsl(Requesting);
export const auth = dsl.defineEndpoint("/auth/login", ({ Sync, Request, Respond, Actions }) => ({
  login: Sync(({ token }) => ({
    when: Actions(Request({})),
    then: Actions(Respond({ token })),
  })),
}));
```

## Ship Safety

`cdh ship` runs a strict pipeline before touching git:

1. **Preflight** — repo check, merge/rebase detection, exclude pre-existing dirty files
2. **Verify** — all ship-tier stages must pass (journal-health, typecheck, rules, tests, surface-coverage, legibility, sync-diagnostics)
3. **Commit** — stages only changed files, includes `Cdh-Run: <runId>` trailer
4. **Branch** — `cdh/<runId>`, suffix on collision
5. **Push/PR** — controlled by config (`.pi/cdh.json` `ship.push`, `ship.createPr`)

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
├── .pi/settings.json            # { "packages": ["@mit-sdg/cdh"] }
├── .pi/cdh.json                 # CDH config (rules, verify, ship, etc.)
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

Quick tier (`onAgentEnd`): typecheck + rules for changed files.
Ship tier (`onShipLocal`): all stages above.

## Development

```bash
bun install
bun test          # 155 tests
bun run check     # TypeScript typecheck
```
