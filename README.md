# CDH — Concept Design Harness

CDH is a pi package and CLI that turns any concept-design repo into a gated, multi-agent, catalog-backed, legible development environment.

## Quick Start

```bash
# Install (requires Bun)
bun add @sdg/cdh

# Or clone and link locally
git clone https://github.com/anomalyco/cdh.git
cd cdh && bun link
```

## CLI Commands

```bash
# Run all rules against the current repo
cdh rules

# Quick verification (typecheck + rules) — runs on every agent end
cdh verify --tier quick

# Full ship verification (all stages) — runs before /ship
cdh verify --tier ship

# Ship changes: preflight, verify, commit, branch, push, PR
cdh ship --confirm --no-review --no-ci

# Init a new concept-design repo
cdh init

# Check harness and repo health
cdh doctor

# Trace which syncs involve a specific concept action
cdh trace Labeling.addLabel

# List all syncs (optionally filter by concept)
cdh syncs --concept Labeling

# Build and display sync graph
cdh sync-graph --format report|json|mermaid|dot

# Run sync diagnostics (warnings, missing tests, etc.)
cdh sync-diagnostics --format report|json

# List all concepts with action/query counts
cdh concepts

# Show detailed surface for a concept (includes spec)
cdh concept Labeling

# Check if a concept's spec matches its code surface
cdh spec-check Labeling

# Auto-update a spec to match code (--dry-run to preview)
cdh spec-sync Labeling --dry-run

# Read a design convention document
cdh doc testing-conventions
```

## What It Checks

| Rule | Description | Severity |
|------|-------------|----------|
| R1 | Concept independence — no cross-concept imports | BLOCK |
| R2 | Action signature — one object param, returns object | WARN |
| R3 | Query signature — returns array | WARN |
| R4 | Placement/naming — class matches directory | WARN |
| R5 | Protected paths — `src/engine/**`, `src/sdk/**`, `.env*` | BLOCK |
| R6 | Spec presence — required sections in specs | FAIL-SHIP |
| R7 | Test presence — colocated `.test.ts` files | FAIL-SHIP |
| R8 | Surface coverage — concepts wrapped with `track()` | FAIL-SHIP |
| R9 | Sync test shape — `setupSyncTest` positive/negative | FAIL-SHIP |
| R10 | Legible tests — `trace()` or `console.log` narration | FAIL-SHIP |

## Verification Stages (ship tier)

- `journal-health` — event persistence is working
- `typecheck` — `tsc --noEmit` passes
- `rules:all` — all rules pass
- `tests:all` — `bun test` passes
- `surface-coverage` — all surface methods are exercised
- `legibility` — principle/multi-action tests have narration
- `sync-diagnostics` — sync graph warnings (configurable: warn|fail-ship|off)

## Sync Engine DSL

CDH uses the sync-engine DSL for static analysis of sync files:

```typescript
export const auditSync = sync(({ id }: Vars) =>
  when(Labeling.addLabel, { item: "" }, { id })
    .where((frames) => frames.query(Audit._getEvents, { targetId: id }, {}))
    .then(act(Audit.record, { id, event: "CREATED" }))
);

export const auth = dsl.defineEndpoint("/auth/login", ({ Sync, Request, Respond, Actions }) => ({
  login: Sync(({ token }) => ({
    when: Actions(Request({})),
    then: Actions(Respond({ token }))
  }))
}));
```

## Ship Safety

`cdh ship` enforces a conservative workflow:

1. **Preflight** — git repo check, merge/rebase detection, dirty file exclusion
2. **Verification** — all ship-tier stages must pass
3. **Commit** — only touched files, includes `Cdh-Run: <runId>` trailer
4. **Branch** — `${branchPrefix}${runId}`, suffix on collision
5. **Push/PR** — optional, controlled by config

Pre-existing dirty/staged files are excluded. Use `--no-review --no-ci` to skip review and CI stages.

## Agent Tools (pi)

| Tool | Description |
|------|-------------|
| `list_concepts` | List all concepts with surface details |
| `describe_concept` | Show detailed surface for a concept |
| `list_syncs` | List all syncs with when/then/query refs |
| `trace_sync` | Trace an action through the sync graph |
| `sync_graph` | Build and display the sync graph |
| `sync_diagnostics` | Run diagnostics on syncs |
| `read_design_doc` | Read design convention documents |
| `spec_lint` | Check spec alignment with code |
| `run_verification` | Run verification stages (quick\|ship) |
| `record_decision` | Record architectural decisions |
| `catalog_search` | Search the concept catalog |
| `catalog_show` | Inspect a catalog concept |
| `catalog_copy` | Copy a catalog concept into the repo |
| `orchestrate_run` | Orchestrate subagents (single/chain/parallel) |

## Orchestration

`orchestrate_run` delegates work to specialized subagents. Each agent runs as an isolated pi process with its own session and focused toolset.

**Available agents:**
- **spec-writer** — writes concept specs in CDH format
- **concept-implementer** — implements concept classes from specs
- **sync-implementer** — implements syncs using the DSL, traces before/after
- **test-writer** — writes tests following CDH conventions
- **reviewer** — reviews for rule compliance (read-only)
- **scout** — explores and reports (read-only)

**Modes:**
- `single` — one agent, one task
- `chain` — sequential steps, each receiving prior outputs as context
- `parallel` — up to 3 concurrent agents on independent tasks

Agents are isolated: reviewer is read-only, sync-implementer traces sync graph before and after edits, and all agents run verification on their work.

## Skills and Prompts

Skills guide agents through common workflows:
- **concept-workflow** — implementing concepts from spec
- **sync-workflow** — implementing syncs with graph analysis
- **debugging-syncs** — diagnosing sync issues
- **frontend-shadcn** — building frontend components

Prompt templates for common tasks:
- `/new-concept` — create a concept from scratch or catalog
- `/new-sync` — create a synchronization
- `/implement-feature` — full-cycle feature implementation
- `/review` — code review with rule compliance check
- `/ship` — ship changes with verification
- `/status` — current run status
- `/report` — comprehensive run report

## Catalog

Copy pre-built, T7-quality concepts into your repo:

```bash
# Copy a concept
cdh catalog copy authenticating

# Copy and rename
cdh catalog copy authenticating --as Accounting
```

Available concepts:
- **Authenticating** — username/password identity with `Bun.password` hashing

## Project Structure

A conforming repo looks like:

```
app/
├── .pi/settings.json        # "packages": ["@sdg/cdh"]
├── .pi/cdh.json             # CDH config
├── design/
│   ├── index.json           # Machine-readable repo contract
│   ├── concepts/*.md        # Concept specs
│   ├── background/          # Convention docs
│   └── journal/             # Run history (auto-generated)
└── src/
    ├── concepts/<Name>/     # Concept implementation + tests
    ├── syncs/               # Sync definitions + tests
    ├── engine/              # Server bootstrap
    └── utils/               # Test helpers
```

## Development

```bash
bun install
bun test          # Run all tests
bun run check     # TypeScript typecheck
bun run build     # Build declarations for npm
```
