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

# Init a new concept-design repo
cdh init

# Check harness and repo health
cdh doctor
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

## Catalog

Copy pre-built, T7-quality concepts into your repo:

```bash
# Copy a concept
cdh catalog copy authenticating

# Copy and rename
cdh catalog copy authenticating --as Accounting

# Search available concepts
cdh catalog search auth
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
