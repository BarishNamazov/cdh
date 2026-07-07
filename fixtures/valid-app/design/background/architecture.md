# Architecture Overview

CDH repositories are structured around two fundamental building blocks:

1. **Concepts**: self-contained, modular increments of functionality
2. **Synchronizations**: rules that orchestrate interactions between concepts

## Directory Structure

```
app/
├── .pi/settings.json            # Pi configuration
├── .pi/cdh.json                 # CDH harness configuration
├── design/
│   ├── index.json               # Repo contract (paths, docs, helpers, scripts)
│   ├── background/              # Convention docs (these files)
│   ├── concepts/<name>.md       # Concept specifications
│   └── journal/                 # Run history (auto-generated)
├── src/
│   ├── concepts/<Name>/         # Concept implementations + tests
│   │   ├── <Name>Concept.ts
│   │   └── <Name>Concept.test.ts
│   ├── syncs/                   # Sync definitions + tests
│   │   ├── *.sync.ts
│   │   └── *.sync.test.ts
│   ├── engine/                  # Server bootstrap (protected by R5)
│   ├── sdk/                     # Client SDK (protected by R5)
│   └── utils/                   # Shared utilities (testing helpers, types)
```

## Concepts

Each concept lives in `src/concepts/<Name>/` and is a single TypeScript class exported as default. Concepts:
- Are fully independent — no cross-concept imports (enforced by R1)
- Have exactly one object parameter per action (enforced by R2)
- Return arrays from queries (enforced by R3)
- Are named to match their directory (enforced by R4)
- Have a spec in `design/concepts/` (enforced by R6)
- Have a colocated test file (enforced by R7)

## Syncs

Syncs live in `src/syncs/` as `.sync.ts` files. Each sync declares `when` (trigger action) and `then` (effect action) references. Syncs are the only place concepts coordinate — concepts never import each other.

## Requesting

The HTTP adapter feeds the `Requesting` concept. `Requesting` is the boundary where HTTP becomes concept actions. When a request hits the server, it becomes a `Requesting.request` action. Public endpoints are explicit synchronizations; concept methods are never exposed directly as HTTP routes.

## Verification Pipeline

CDH verifies repos through stages:

| Stage | Description |
|---|---|
| `journal-health` | Event persistence is working |
| `typecheck` | `tsc --noEmit` passes |
| `rules:all` | All rules (R1-R10) pass |
| `tests:all` | `bun test` passes |
| `surface-coverage` | All concept surfaces exercised |
| `legibility` | Principle/multi-action tests have narration |

Run `cdh verify --tier ship` before shipping. Run `cdh verify --tier quick` during development.
