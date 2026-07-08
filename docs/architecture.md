# CDH Architecture

CDH (`@mit-sdg/cdh` v0.1.1) is a pi package + standalone CLI that turns any directory into a **concept-design repo** — a codebase where features are built as independent Concepts composed through declarative Syncs, with automated rule enforcement, verification, journaling, and multi-agent orchestration. It is written in TypeScript (ES2023, Bun runtime), uses `ts-morph` for AST analysis, `@sinclair/typebox` for schema validation, `@mit-sdg/sync-engine` as the sync DSL, and `@earendil-works/pi-*` as the agent platform.

**Key principle**: CDH never imports target-repo code directly. It inspects repos through configuration (`config.ts`), the machine-readable repo contract (`design/index.json`), AST analysis (ts-morph), filesystem reads, and subprocesses.

---

## Repository Layout

```
cdh/
├── package.json          # npm bin "cdh", pi extensions/skills/prompts
├── tsconfig.json         # ES2023, strict, @/* alias -> src/*
├── biome.jsonc           # linter + formatter config
├── bin/
│   ├── cdh.js            # shebang entry point
│   └── cdh.ts            # 880-line CLI (all commands)
├── src/
│   ├── config.ts             # Typebox schema, default config, deep-merge loader
│   ├── repo-contract.ts      # design/index.json validation
│   ├── run-model.ts          # run IDs, parent-join, changed-scope computation
│   ├── gate-policy.ts         # R5 protected-path enforcement + bash screening
│   ├── init.ts                # project scaffolding from templates/
│   ├── catalog-lib.ts         # copy-and-rename catalog concepts
│   ├── rules/
│   │   ├── types.ts           # Severity, RuleHit, RuleEngine interface
│   │   ├── suppressions.ts    # cdh-ignore parser, apply/unused checks
│   │   └── rule-engine.ts     # R1-R10 implementation, createRuleEngine()
│   ├── repo-model/
│   │   ├── concepts.ts        # ts-morph concept class discovery
│   │   └── syncs.ts           # ts-morph sync DSL extraction
│   ├── journal/
│   │   ├── types.ts           # 14 CdhEvent types, JournalEntry
│   │   ├── writer.ts          # JSONL append-only writer with retries
│   │   └── journal.ts         # dual-write Journal class + report generator
│   ├── verify/
│   │   ├── types.ts           # StageResult, StageFn, StageContext
│   │   ├── format.ts          # stage result formatting
│   │   ├── stages.ts          # 7 stage implementations
│   │   └── runner.ts          # runVerification() orchestrator
│   ├── tools/
│   │   ├── describe-concept.ts
│   │   ├── design-doc.ts
│   │   ├── list-concepts.ts
│   │   ├── list-syncs.ts
│   │   ├── spec-sync.ts
│   │   ├── sync-diagnostics.ts
│   │   ├── sync-graph.ts
│   │   └── trace-sync.ts
│   ├── ship/
│   │   ├── index.ts           # snapshot, touched computation, preflight
│   │   └── git-mutation.ts    # commit, branch, push, PR
│   └── utils/
│       └── fs.ts              # walk, walkLimited, siblingIfExists
├── extensions/
│   ├── concept-tools.ts   # 8 read tools (list/describe/trace/graph/diagnostics/docs)
│   ├── gates.ts           # tool_call hook for R5 + bash screening
│   ├── verification.ts    # agent_end hook + run_verification + record_decision tools
│   ├── catalog.ts         # catalog_search/show/copy tools
│   ├── orchestrator.ts    # orchestrate_run tool, 6 agent definitions, subprocess spawning
│   ├── init.ts            # cdh_init tool
│   └── spike-probes.ts    # WP0 pi API validation probes
├── agents/                # 6 agent spec markdown files
├── skills/                # 4 skill trigger files
├── prompts/               # 7 prompt template files
├── catalog/               # built-in concept catalog (registry.json + concepts/)
├── templates/             # project scaffold (init copies this)
└── fixtures/              # test fixtures (valid-app, sync-engine-app, violations/)
```

---

## 1. Configuration (`src/config.ts`)

The configuration system uses Typebox schemas for runtime validation and supports three-layer deep merging: **defaults → global** (`~/.pi/agent/cdh.json`) **→ project** (`.pi/cdh.json`).

### Schema (`src/config.ts:10-48`)

```typescript
CdhConfig {
  paths: {
    concepts: "src/concepts",
    syncs: "src/syncs",
    designIndex: "design/index.json",
    journal: "design/journal"
  },
  rules: {
    importAllowlist: { syncs: ["@engine"] },
    helperMethodAllowlist: []
  },
  testing: {
    errorAssertionPatterns: ["expectError(", ".error"]
  },
  verify: {
    onAgentEnd: ["typecheck", "rules:changed"],
    onShipLocal: ["journal-health", "typecheck", "rules:all", "tests:changed",
                   "tests:all", "surface-coverage", "sync-tests", "legibility"],
    optionalStages: ["smoke"],
    autofixRetries: 2,
    syncDiagnostics: "warn"  // "warn" | "fail-ship" | "off"
  },
  catalogPaths: [],
  ship: {
    confirm: "interactive",  // "interactive" | "never" | "headless-auto"
    branchPrefix: "cdh/",
    review: true, push: true, createPr: true, ci: true
  }
}
```

### Loading (`src/config.ts:97-111`)

`loadConfig(cwd)` loads the project config file, deep-merges it over global defaults, and validates with `Value.Check(CdhConfigSchema, merged)`. The `deepMerge` function recursively merges objects — scalars replace, arrays replace (not concatenate).

---

## 2. Repo Contract (`src/repo-contract.ts`)

The repo contract at `design/index.json` is the machine-readable description of the repository structure. All harness components read paths through this contract — never by guessing.

```typescript
RepoContract {
  specsDir: "design/concepts",
  docs: {
    "concept-spec-conventions": "design/background/concept-specifications.md",
    "implementation-conventions": "design/background/implementing-concepts.md",
    "sync-conventions": "design/background/implementing-synchronizations.md",
    "testing-conventions": "design/background/testing-concepts.md"
  },
  helpers: {
    testingModule: "@utils/testing.ts",
    exports: ["setupTestDb", "trace", "track", "testAction", "expectError", "setupSyncTest"]
  },
  scripts: {
    test: "bun test",
    typecheck: "bun run check",
    start: "bun run start"
  },
  health: { path: "/api/health" }
}
```

### Key functions

- **`loadRepoContract(cwd, config?)`** — loads and validates `design/index.json` against Typebox schema
- **`resolveRepoPath(cwd, repoPath)`** — resolves `@`-prefixed paths to `src/` paths
- **`checkRepoContractFiles(cwd, contract)`** — verifies all referenced files exist
- **`assertRepoContractFiles(cwd, contract)`** — throws if any files are missing

When verification stages need to run `tsc`, `bun test`, etc. — the exact command comes from `contract.scripts.typecheck`, `contract.scripts.test`, not hardcoded.

---

## 3. Run Model (`src/run-model.ts`)

### Run Identity

Every mutating session belongs to a **run** with a timestamped ID:

```
run-YYYYMMDD-HHMMSS-xxxx   (xxxx = 4 random base36 chars)
```

### Parent Run Joining

Subagents inherit the parent run through environment variables:

- **`CDH_RUN_ID`** — the run ID to join
- **`CDH_RUN_DIR`** — the journal directory for this run

When `joinParentRun(env)` returns true, the Journal class reuses the parent's run ID and directory instead of creating a new run. Child events append to the same `events.jsonl` file.

### Changed Scope (`computeChangedScope`)

Given a list of touched file paths, categorizes them into affected concepts and syncs:

```typescript
ChangedScope {
  concepts: ["Labeling", "Requesting"],  // concept dirs with touched files
  syncs: ["label-request.sync.ts"],       // sync files that were touched
  touchedFiles: [...]                      // all touched file paths
}
```

This is used by `rules:changed` and `tests:changed` to scope checks to only what changed.

---

## 4. Repo Model (`src/repo-model/`)

### Concept Discovery (`src/repo-model/concepts.ts`)

Uses **ts-morph** to parse TypeScript source files and extract concept metadata.

```typescript
ConceptModel {
  name: "Labeling",
  file: "/abs/path/to/Labeling/LabelingConcept.ts",
  actions: [{ name: "addLabel", parameters: ["{ item: string }"], returnType: "Promise<LabelResult>" }, ...],
  queries: [{ name: "_getLabels", parameters: [], returnType: "Promise<Label[]>" }, ...],
  specPath?: "/abs/path/to/design/concepts/labeling.md",
  testPath?: "/abs/path/to/Labeling/LabelingConcept.test.ts"
}
```

**Surface method enumeration** (`enumerateSurfaceMethods`): filters out helpers, `#`-private, `static`, `private`/`protected`, getters/setters, and overloads (keeps the implementation). Methods with `_` prefix are queries; others are actions.

### Sync Discovery (`src/repo-model/syncs.ts`)

Uses ts-morph to walk CallExpression nodes in `.sync.ts` files and extract sync-engine DSL patterns.

```typescript
SyncModel {
  file: "/abs/path/to/syncs/label-request.sync.ts",
  exports: ["labelRequestSync"],
  whenActions: ["Labeling.addLabel"],
  thenActions: ["Requesting.process"],
  queryRefs: ["Labeling._getLabels"],
  endpointPaths: ["/api/auth/login"],
  hasWhere: true,
  hasBranches: true,
  testPath?: "/abs/path/to/syncs/label-request.sync.test.ts"
}
```

**Extraction logic** (`src/repo-model/syncs.ts:88-164`): walks CallExpression nodes looking for `when()`, `act()`, `query()`, `Actions()`, `defineEndpoint()`, `where`, `branch`, `on`, `onError`. Concept references are extracted by matching `PascalConcept.method` patterns in property access expressions.

---

## 5. Rule Engine (`src/rules/`)

### Types (`src/rules/types.ts`)

```typescript
type Severity = "block" | "warn" | "fail-ship";

interface RuleHit {
  rule: string;          // "R1" through "R10"
  severity: Severity;
  path: string;          // relative file path
  message: string;       // human-readable description
  fix?: string;          // suggested fix
  suppressed?: { reason: string };
}

interface RuleEngine {
  checkContent(path, proposed): RuleHit[];       // pre-write R1 check
  checkFile(path): Promise<RuleHit[]>;           // post-write file check
  checkRepo(scope): Promise<RuleHit[]>;          // full repo scan
}
```

### All 10 Rules (`src/rules/rule-engine.ts`)

| Rule | Severity | What | Suppressible? |
|------|----------|------|:---:|
| R1 | **block** | Concepts don't import other concepts, engine, or syncs | No |
| R2 | warn | Actions take one object param, return object/Promise\<object\> | Yes (construct-level) |
| R3 | warn | Queries return array/Promise\<array\> | Yes (construct-level) |
| R4 | warn | Class name matches directory (e.g. `LabelingConcept` in `Labeling/`) | Yes (construct-level) |
| R5 | **block** | No writes to `.env*` files (enforced by GatePolicy, not RuleEngine) | No |
| R6 | fail-ship | Every concept has a spec with `## purpose`, `## principle`, `## state`, `## actions` | No |
| R7 | fail-ship | Every concept file has a colocated `.test.ts` file | No |
| R8 | fail-ship | Concept tests use `track()` for surface coverage (static advisory check) | No |
| R9 | fail-ship | Sync tests use `setupSyncTest`, have positive + negative cases | No |
| R10 | fail-ship | Principle/testAction tests have `trace()` or `console.log` narration | Yes (file-level) |

**R1 implementation** (`src/rules/rule-engine.ts:130-181`): Parses import statements via ts-morph. Detects imports of `@concepts`, `@engine`, `src/syncs`, or any path inside another concept directory. Used both for `checkContent` (pre-write, blocked in-loop) and `checkFile` (post-write).

**R6 implementation** (`src/rules/rule-engine.ts:314-346`): Checks that a spec file exists at `<specsDir>/<lowercase-name>.md` and contains required sections (`## purpose`, `## principle`, `## state`, `## actions`).

**R8 implementation** (`src/rules/rule-engine.ts:373-409`): Static heuristic check that concept test files contain `track(`. The runtime coverage measurement happens in `surfaceCoverageStage` (`src/verify/stages.ts:132-180`).

**R9 implementation** (`src/rules/rule-engine.ts:413-473`): Uses ts-morph to find `test()`/`describe()`/`it()` calls in sync test files, checks for `setupSyncTest` import, and verifies at least one test name does NOT contain "does not"/"negative" (positive case) and at least one does (negative case).

### Suppressions (`src/rules/suppressions.ts`)

Syntax: `// cdh-ignore <RULE_ID> <reason>`

- **Construct-level** (R2, R3, R4): Applies to the next AST construct after the comment, skipping blank lines and comments.
- **File-level** (R10): Must appear in the first 5 non-blank lines of the file.
- R1, R5, R6, R7, R8, R9 are **never** suppressible.
- Unused suppressions generate warnings (`checkUnusedSuppressions`).

Suppressed hits have their severity downgraded to `"warn"` and a `suppressed: { reason }` field added.

---

## 6. Gate Policy (`src/gate-policy.ts`)

A separate layer from the Rule Engine that enforces **in-loop blocking** without ts-morph parsing.

### Protected Paths

Currently only `.env` and `.env*` files are protected. `checkMutation(toolName, filePath)` returns a block hit if the path matches any protected pattern.

### Bash Screening

`screenBash(command)` checks for:
- `rm -rf` outside the working directory
- `git push --force` / `git push -f`
- Shell redirection to/from `.env` files
- Any reference to protected paths in the command text

This is best-effort, not a security boundary. Real isolation depends on pi containerization or runner sandboxing.

---

## 7. Journal System (`src/journal/`)

### Event Vocabulary (`src/journal/types.ts:1-42`)

18 event types supported:

| Event | Data |
|-------|------|
| `task_started` | `{ prompt }` |
| `gate_blocked` | `{ rule, toolName, path, reason }` |
| `rule_warning` | `{ rule, path, detail }` |
| `suppression` | `{ rule, path, reason }` |
| `verification_started` | `{ tier, stages[] }` |
| `verification_stage` | `{ stage, status, durationMs, summary, detailPath? }` |
| `verification_finished` | `{ tier, ok, failures[] }` |
| `autofix_attempt` | `{ n, of, failuresFedBack[] }` |
| `agent_spawned` | `{ agent, task, childSessionFile }` |
| `agent_finished` | `{ agent, ok, usage }` |
| `decision` | `{ title, body, alternatives? }` |
| `catalog_copy` | `{ id, version, as?, files[] }` |
| `ship_preflight` | `{ status, detail }` |
| `ship_started` | `{}` |
| `ship_finished` | `{ ok }` |
| `ci_triggered` | `{ ref, workflow }` |
| `ci_status` | `{ status, url? }` |
| `cost_snapshot` | `{ model?, tokens, costUsd }` |

Event persistence entries also carry `{ runId, seq, ts }`.

### Writer (`src/journal/writer.ts`)

`JsonlWriter` is an append-only JSONL writer with retry logic (3 retries, 50ms delay). On persistent failure, it sets `degraded = true` and stops writing. The sequence counter counts existing lines on construction to support concurrent subagent writers.

### Journal Class (`src/journal/journal.ts`)

The `Journal` class provides dual-write (in-memory events + file persistence) with a single `emit(type, data)` method plus typed helpers (`emitGateBlocked`, `emitVerificationStarted`, `emitDecision`, etc.).

**Key behaviors**:
- `initRun(env, taskPrompt?)` — joins parent run if `CDH_RUN_ID` exists, otherwise creates new run
- `isDegraded()` — returns true if JSONL writer is degraded
- `generateReport(taskPrompt)` — produces markdown report with verification table, decisions, warnings, and follow-ups; appends to `design/journal/INDEX.md`

---

## 8. Verification System (`src/verify/`)

### Stage Runner (`src/verify/runner.ts`)

`runVerification(options)` is the central verification orchestrator. It selects stages based on tier, runs them sequentially, and emits journal events.

```
Quick tier (2 stages):
  1. typecheck       → tsc --noEmit
  2. rules:all        → block-severity only

Ship tier (7 stages):
  1. journal-health   → check journal not degraded
  2. typecheck        → tsc --noEmit
  3. rules:all        → block + fail-ship severity
  4. tests:all        → bun test
  5. surface-coverage → run tests with CDH_SURFACE_OUT, verify track() calls
  6. legibility       → check R10 (trace narration)
  7. sync-diagnostics → check for unknown actions, missing tests, orphans, etc.
```

### Stage Context

```typescript
StageContext { cwd, config, contract, ruleEngine, journal, tier }
```

### Individual Stages (`src/verify/stages.ts`)

| Stage | Function | Implementation |
|-------|----------|----------------|
| `journal-health` | `journalHealthStage()` | Returns fail if `journal.isDegraded()` |
| `typecheck` | `typecheckStage()` | Runs `contract.scripts.typecheck` via `Bun.spawn(["sh", "-c", command])`, 120s timeout |
| `rules:{scope}` | `rulesStage(ctx, scope)` | Calls `ruleEngine.checkRepo(scope)`. Quick tier: only blocks fail. Ship tier: blocks + fail-ship fail. |
| `tests:{scope}` | `testStage(ctx, scope)` | Runs `contract.scripts.test` via shell, 300s timeout |
| `surface-coverage` | `surfaceCoverageStage()` | Runs tests with `CDH_SURFACE_OUT` env to a temp file. If tests fail, reports inconclusive (not misleading). Reads the JSONL artifact and counts recorded method calls. |
| `legibility` | `legibilityStage()` | Calls `ruleEngine.checkRepo("all")`, filters for R10 hits |
| `sync-diagnostics` | `syncDiagnosticsStage()` | Runs `runSyncDiagnostics()`. Severity controlled by `config.verify.syncDiagnostics`: `"warn"` → status=warn, `"fail-ship"` → status=fail, `"off"` → status=skip |

---

## 9. Pi Extensions (`extensions/`)

CDH exposes **6 extensions** loaded by pi at startup (configured in `package.json` `pi.extensions`).

### Extension Init Order (as loaded by pi)

```
concept-tools.ts → gates.ts → verification.ts → catalog.ts → orchestrator.ts → init.ts
```

### `extensions/concept-tools.ts` — Read Tools

Registers **8 tools** wrapping the introspection functions in `src/tools/`:
- `list_concepts` — table of concepts with action/query counts, spec/test status
- `describe_concept { name }` — method signatures, spec path, test path
- `list_syncs { concept? }` — syncs filtered by concept reference
- `trace_sync { action }` — all syncs where the action appears as when/then/query
- `read_design_doc { key }` — resolves doc key through `design/index.json`
- `spec_lint { name }` — R6 section check + spec-code alignment
- `sync_graph { format? }` — build and display sync graph (report/json/mermaid)
- `sync_diagnostics { format? }` — unknown actions, missing tests, orphans, etc.

### `extensions/gates.ts` — Write/Command Gating

Hooks `pi.on("tool_call")` to intercept **write**, **edit**, and **bash** tool calls before execution.

- **write/edit**: Checks `filePath` against `GatePolicy.checkMutation()` — blocks `.env` writes
- **bash**: Checks `command` against `GatePolicy.screenBash()` — blocks dangerous commands

Returns `{ block: true, reason }` to prevent execution.

### `extensions/verification.ts` — Deterministic + On-Demand Verification

**Deterministic verification** (`agent_end` hook, line 72): After every agent session finishes, runs `runVerification({ tier: "quick" })`. Failures are logged as journal decisions but do not prevent the next agent run.

**On-demand verification** (`run_verification` tool, line 35): Agents can call this tool with `tier: "quick"` or `tier: "ship"` at any point.

**Decision recording** (`record_decision` tool, line 13): Agents record architectural decisions with title, body, and alternatives.

### `extensions/catalog.ts` — Catalog Tools

- `catalog_search { query? }` — fuzzy search by name, summary, or tags
- `catalog_show { name }` — show spec and metadata for a catalog concept
- `catalog_copy { name, as?, overwrite? }` — copy a catalog concept into the repo with optional rename

Registry is cached in memory. The builtin catalog lives at `catalog/concepts/`.

### `extensions/orchestrator.ts` — Multi-Agent Orchestration

Registers `orchestrate_run` tool with three modes:

- **`single`**: Run one agent on one task
- **`chain`**: Sequential pipeline — each step receives `{previous}` output placeholder
- **`parallel`**: Fan out up to 4 concurrent agents on independent tasks

#### Agent Registry (built-in, line 126)

| Agent | Tools | Mode |
|-------|-------|------|
| spec-writer | read, write, read_design_doc, catalog_search, catalog_show, record_decision | read/write |
| concept-implementer | read, write, edit, bash, describe_concept, list_concepts, read_design_doc, run_verification, record_decision | read/write |
| sync-implementer | read, write, edit, bash, trace_sync, sync_graph, list_syncs, sync_diagnostics, read_design_doc, run_verification, record_decision | read/write |
| test-writer | read, write, edit, bash, describe_concept, list_syncs, read_design_doc | read/write |
| reviewer | read, list_concepts, list_syncs, trace_sync, sync_graph, sync_diagnostics, read_design_doc, run_verification | read-only |
| scout | read, list_concepts, describe_concept, list_syncs, trace_sync, sync_graph, sync_diagnostics, read_design_doc, catalog_search, catalog_show | read-only |

#### Agent Discovery

Agents can also be installed to `~/.pi/agent/agents/cdh-*.md` via `cdh setup`. The orchestrator discovers these at runtime by parsing YAML frontmatter from markdown files.

#### Subprocess Model

Agents run as isolated `pi --print --mode json --no-session` subprocesses with restricted `--tools` lists. Usage is tracked by parsing JSONL output for token counts, cost, model info. Journal entries (`agent_spawned`, `agent_finished`) include these stats.

### `extensions/init.ts` — Project Scaffolding

Registers `cdh_init` tool that calls `initProject(cwd)` from `src/init.ts`. Copies the `templates/` directory tree into the current working directory, substituting `{{name}}` in `.json`, `.md`, `.txt` files. Idempotent — skips existing files.

---

## 10. CLI (`bin/cdh.ts`)

The `cdh` CLI provides 16 commands. Each command loads config and repo contract, then delegates to core modules.

### Commands

| Command | Purpose |
|---------|---------|
| `cdh init` | Scaffold a new concept-design repo |
| `cdh setup` | Install agent specs to `~/.pi/agent/agents/` |
| `cdh doctor` | Check repo health (contract, dirs, specs, tests, journal) |
| `cdh rules` | Run all rules (R1-R10), report hits |
| `cdh verify --tier quick\|ship` | Run verification stages |
| `cdh ship --confirm\|--execute` | Preflight → verify → commit → branch → push → PR |
| `cdh trace <Concept.action>` | Show syncs involving an action |
| `cdh syncs [--concept <name>]` | List syncs |
| `cdh sync-graph --format report\|json\|mermaid\|dot` | Build and display sync graph |
| `cdh sync-diagnostics --format report\|json` | Run sync diagnostics |
| `cdh concepts` | List concepts with counts |
| `cdh concept <name>` | Show concept surface detail |
| `cdh spec-check <name>` | Check spec vs code surface |
| `cdh spec-sync <name> [--dry-run]` | Auto-sync spec to match code |
| `cdh doc <key>` | Read design document |
| `cdh catalog search\|show\|copy` | Catalog operations |

### Ship Pipeline (`cdh ship`, `bin/cdh.ts:650-777`)

1. **Preflight**: Capture git snapshot, compute touched files, check for merge/rebase in progress, exclude pre-existing dirty/staged files, validate non-empty change set
2. **Verify**: Run ship-tier verification (all 7 stages)
3. **Commit**: Stage only touched files (`git add -- <files>`), commit with `Cdh-Run: <runId>` trailer
4. **Branch**: Create `cdh/<runId>` (with suffix on collision)
5. **Push**: Push to origin (if `config.ship.push`)
6. **PR**: Create via `gh pr create` (if `config.ship.createPr`)

Without `--confirm` or `--execute`, ship only performs preflight and verification, printing what would happen.

---

## 11. Shipping System (`src/ship/`)

### Ship Snapshot (`src/ship/index.ts`)

`captureSnapshot(cwd)` records:
- `startRef`: Current HEAD hash (or `"unborn"` for repos with no commits)
- `preExistingDirty`: Files that were already modified (but unstaged) before the run
- `preExistingStaged`: Files that were already staged before the run

`computeTouched(cwd, snapshot)` diffs current git status against the snapshot, excluding pre-existing files. This ensures only files changed by the current agent run are shipped.

### Git Mutation (`src/ship/git-mutation.ts`)

- `commitShip()` — stages only touched files, commits with `Cdh-Run: <runId>` trailer
- `createShipBranch()` — creates `cdh/<runId>`, appends `-2`, `-3` on collision
- `pushBranch()` — pushes to `origin` with `-u`
- `createPullRequest()` — uses `gh pr create` CLI

---

## 12. Catalog System (`src/catalog-lib.ts`, `extensions/catalog.ts`)

### Registry (`catalog/registry.json`)

```json
{
  "concepts": [{
    "id": "authenticating",
    "name": "Authenticating",
    "version": "1.0.0",
    "summary": "Username/password identity with registration and credential checks.",
    "tags": ["identity", "security"],
    "pairsWith": ["sessioning", "accesscontrolling"],
    "files": ["concept.md", "AuthenticatingConcept.ts", "AuthenticatingConcept.test.ts", "README.md"]
  }]
}
```

### Copy and Rename (`src/catalog-lib.ts`)

`copyCatalogConcept(sourceDir, targetCwd, entry, config, contract, options?)` copies catalog files into the target repo:

- `.ts` files → `src/concepts/<Name>/`
- `concept.md` → `design/concepts/<lowercase-name>.md` (from `contract.specsDir`)
- `README.md` → `src/concepts/<Name>/README.md`

Each file gets a provenance header: `// cdh:catalog <id>@<version>`

**Renaming** (`as` option): Applies case-aware replacements:
- `PascalCase` → new Pascal case (class names, prose)
- `camelCase` → new camel case (identifiers)
- `lowercase` → new lower case (filenames, spec paths)
- Does NOT rename generic type params or substrings

---

## 13. Project Init (`src/init.ts`, `extensions/init.ts`)

`initProject(cwd)` recursively copies the `templates/` directory into the target directory. Template variables:
- `{{name}}` in `.json`, `.md`, `.txt` files is replaced with the directory name

The template includes:
- `package.json` with `@mit-sdg/cdh`, `@mit-sdg/sync-engine` dependencies
- `tsconfig.json` with `@utils`, `@concepts`, `@engine` path aliases
- `design/index.json` — repo contract
- 5 background docs in `design/background/`
- `GreetingConcept` — example concept with spec, implementation, tests
- `greeting-audit.sync.ts` — example sync with DSL patterns (when/act/where/branch/on/onError)
- `src/utils/testing.ts` — test harness with `setupTestDb`, `trace`, `testAction`, `expectError`, `track`, `setupSyncTest`

Skips existing files (idempotent).

---

## 14. Test Harness (`templates/src/utils/testing.ts`)

The template's testing module implements the **surface coverage contract**:

- **`track(instance, options?)`**: Returns a transparent Proxy that records method calls. If `CDH_SURFACE_OUT` env is set, appends JSONL records to that file. Default concept name from `instance.constructor.name` minus `"Concept"` suffix.
- **`testAction(actionName, testName, fn)`**: Wraps `bun:test`'s `test()` with `AsyncLocalStorage` context for action-under-test tracking.
- **`expectError(result)`**: Asserts `result.error` exists, records an `errorAssertion` record.
- **`trace(...args)`**: `console.log` wrapper for narrated output.
- **`setupSyncTest()`**: Returns `{ calls[], emit() }` mock for sync test verification.
- **`setupTestDb()`**: In-memory database setup helper.

**Surface record schema** (appended to `CDH_SURFACE_OUT` JSONL):
```typescript
{ kind: "method", concept, method, testFile?, testName?, actionUnderTest?, ts }
{ kind: "errorAssertion", concept?, testFile?, testName?, actionUnderTest?, ts }
```

---

## 15. Complete Data Flow

### Agent Session (pi)

```
User prompt → pi starts → loads CDH extensions →
  ┌──────────────────────────────────────────────┐
  │ Agent uses tools:                             │
  │   read/write/edit/bash                        │
  │   list_concepts, describe_concept, trace_sync │
  │   sync_graph, sync_diagnostics                │
  │   run_verification (agent-initiated)          │
  │   catalog_search/show/copy                    │
  │   orchestrate_run (spawn subagents)           │
  │   record_decision                             │
  │                                               │
  │ Gates intercept tool_call:                    │
  │   → R5: block .env writes                     │
  │   → bash: block dangerous commands            │
  │   → R1: check cross-concept imports           │
  └──────────────────────────────────────────────┘
  │
  ▼
agent_end fires → deterministic quick verification:
  typecheck (tsc --noEmit) + rules:all (blocks only)
  → results journaled, failures become decisions
```

### Multi-Agent Orchestration

```
orchestrate_run({ mode: "chain", tasks: [...], agent: "concept-implementer" })
  │
  ├─► spawn pi --print --mode json --no-session --tools ...
  │   (child inherits CDH_RUN_ID, CDH_RUN_DIR from parent env)
  │   (events append to same events.jsonl)
  │
  ├─► spawn pi (step 2, receives {previous} output)...
  │
  └─► journal: agent_spawned, agent_finished (with usage stats)
```

### CLI Verification

```
cdh verify --tier ship
  │
  ├─► load config (defaults → global → project)
  ├─► load repo contract (design/index.json)
  ├─► create rule engine (ts-morph project)
  ├─► init journal (new run)
  │
  └─► runVerification({ tier: "ship" })
       │
       ├─► journal-health    → journal.isDegraded()
       ├─► typecheck         → Bun.spawn("tsc --noEmit")
       ├─► rules:all         → ruleEngine.checkRepo("all")
       ├─► tests:all         → Bun.spawn("bun test")
       ├─► surface-coverage  → Bun.spawn("bun test", CDH_SURFACE_OUT=tmpfile)
       ├─► legibility        → ruleEngine.checkRepo → filter R10
       └─► sync-diagnostics  → runSyncDiagnostics()
```

### Ship Flow

```
cdh ship --confirm
  │
  ├─► captureSnapshot (HEAD ref + pre-existing dirty files)
  ├─► computeTouched   (exclude pre-existing, find new changes)
  ├─► runShipPreflight (git repo check, merge/rebase check, dirty warnings)
  │
  ├─► runVerification({ tier: "ship" })  — all 7 stages
  │
  ├─► commitShip       (git add -- touched only, Cdh-Run trailer)
  ├─► createShipBranch (cdh/<runId>, suffix on collision)
  ├─► pushBranch       (git push -u origin <branch>)
  └─► createPullRequest (gh pr create)
```

---

## 16. Cross-Module Dependency Map

```
config.ts ──────────────────► loaded by every module
  │
repo-contract.ts ───────────► validates design/index.json, used by all tools
  │
run-model.ts ───────────────► used by journal, orchestrator, verification
  │
repo-model/concepts.ts ─────► describe-concept, list-concepts, rules, sync-diag, sync-graph, trace-sync, spec-sync
repo-model/syncs.ts ────────► list-syncs, trace-sync, sync-graph, sync-diag
  │
rules/rule-engine.ts ───────► verification stages, CLI rules, gates extension
  │
journal/journal.ts ─────────► verification runner, orchestrator, pi extensions
  │
verify/runner.ts ───────────► CLI verify/ship, pi verification extension
verify/stages.ts ───────────► imports sync-diagnostics, uses rule-engine, journal
  │
ship/index.ts ──────────────► CLI ship command
ship/git-mutation.ts ───────► CLI ship --confirm
  │
catalog-lib.ts ─────────────► CLI catalog copy, pi catalog extension
init.ts ────────────────────► CLI init, pi init extension
  │
extensions/ ────────────────► loaded by pi, each imports from src/ modules
```

---

## 17. Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Bun |
| Language | TypeScript (ES2023, strict) |
| AST analysis | ts-morph 27.0.2 |
| Schema validation | @sinclair/typebox 0.34.49 |
| Sync engine | @mit-sdg/sync-engine |
| Agent platform | @earendil-works/pi-coding-agent 0.80.3 |
| Linting | Biome |
| Testing | Bun test (155 tests) |

---

## 18. Test Architecture

Tests use Bun's built-in test runner. Key patterns:

- **Rule tests**: Each violation fixture (`fixtures/violations/R{1-10}-*/`) is a minimal repo designed to trigger exactly one rule. Tests verify the expected hit count and message.
- **Fixture validation**: `fixtures/valid-app` is a conforming repo that passes all rules and ship verification.
- **Ship tests**: Use real git repos in temporary directories.
- **Catalog tests**: Copy concepts into temporary directories, verify file contents and renaming.
- **E2E tests**: Run CLI commands against `fixtures/valid-app` and verify output.
- **Verification tests**: Mock journal and rule engine, test stage behavior and event emission.
