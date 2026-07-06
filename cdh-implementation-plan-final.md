# CDH: Concept Design Harness on pi - Final Implementation Plan

Complete, self-contained implementation plan for **CDH**: a pi package that turns any concept-design repo into a gated, multi-agent, catalog-backed, legible development environment, plus a repo initializer. This document is written for the implementing agent. Follow it directly. Where this document says MUST, do not deviate. Where the exact pi API shape is uncertain, WP0 resolves it before architecture code is written.

This final version incorporates the v3 review and one additional readiness pass. The important readiness fixes are integrated in place: staged milestones, pi API probes, a machine-readable repo contract, safe `/ship`, runtime surface coverage, precise test attribution, scoped suppressions, changed-file semantics, pure local CLI verification by default, and a realistic split between core, orchestration, init, frontend, and polish.

---

## 0. Deliverables And Milestones

Deliverables:

1. `@yourorg/pi-concept-harness`: installable pi package containing extensions, tools, gates, verification, journal/reporting, agents, skills, prompt templates, and concept catalog.
2. `cdh` CLI: npm bin shipped in the same package with `cdh init`, `cdh doctor`, `cdh rules`, and `cdh verify`.
3. Concept catalog: versioned, tested, copyable concepts, initially `Authenticating`, `Sessioning`, and `AccessControlling`, using shadcn-style copy-into-repo semantics.
4. Legibility system: run journal, on-disk event log, per-run reports, TUI renderers, status widget, decisions, and best-effort cost tracking.
5. Harness test suite and golden-task evals: harness tested against fixture repos and release-gated by headless evals.

Delivery is staged into three milestones. Do not start M2 work before M1's exit gate passes. Do not start M3 work before M2's core workflows are stable.

### M1 - Core Loop: Prove It

Includes WP0, WP1, WP2, WP3, WP5a, and WP6a.

Goal: prove the harness can load in pi, understand a conforming repo, block bad edits, journal a run, verify headlessly, and copy one catalog concept.

M1 exit gate: runbook section 7 items 1 through 4a pass using `fixtures/valid-app` copied to a temp repo. No orchestrator, prompt-template workflow, ship git mutation, CI, frontend, or init command is required for M1.

### M2 - Orchestration And Shipping

Includes WP4, WP7, WP8, WP5b, WP6b, WP10, and WP11.

Goal: add read tools, orchestrated agents, workflow templates, `/ship`, full catalog and harvest, skills, renderers, status UI, and cost reporting.

### M3 - Init And Polish

Includes WP9a, WP9b, and WP12.

Goal: add `cdh init`, optional frontend scaffolding, doctor checks, evals, and docs.

---

## 0.1 Decisions Already Made

- Pre-WP0 blocking decision: fix the real npm package name and scope before any code. This document uses `@yourorg/pi-concept-harness` as a placeholder. Substitute the final package name globally in the first commit. Bin name stays `cdh`.
- CDH config file: project config at `.pi/cdh.json` merged over global config at `~/.pi/agent/cdh.json`. CDH does not extend pi's own `settings.json` schema with custom keys.
- Journal entry prefix: `cdh:`.
- Repo init is an npm bin, not a pi command, because it must work in an empty directory before project trust exists.
- Catalog copy is shadcn-style: source files are copied into the target repo and owned by it thereafter. There is no runtime dependency on the catalog.
- Framework knowledge is never encoded in harness logic, prompts, or skills. The vendored template snapshot may contain starter `design/background` docs as repo starter files, refreshed from the template source when online. The prohibition is on harness code/prompts quoting, restating, or depending on framework doc content.
- Surface coverage is measured at runtime with the repo template's `track()` testing helper. Static AST detection is advisory only.
- Per-action test obligations are attributed with the repo template's `testAction()` helper. T3 does not depend on guessing current test names from Bun internals.
- Cheap verification runs on every `agent_end`; ship-local verification runs on `/ship` and `cdh verify --tier ship`. Auto-fix retries at most `autofixRetries` times, default 2.
- `RuleEngine` is stateless and owns R1-R4 and R6-R10. R5 protected-path enforcement lives in stateful `GatePolicy` because it depends on session flags.
- Only R1 and R5 block in-loop. R1 blocks through `RuleEngine.checkContent`; R5 blocks through `GatePolicy`. All other rules warn during the turn and fail the ship-local tier.
- Suppressions are intentionally narrow: only R2, R3, R4, and R10 are suppressible. R1, R5, R6, R7, R8, and R9 are never suppressible.
- `/ship` never mutates git without preflight checks and, in interactive mode, explicit confirmation.
- `cdh verify --tier ship` performs local verification by default and never mutates git. It does not run reviewer or CI unless explicitly opted in.
- Pi version is pinned in `package.json`; all pi API usage goes through `src/pi-adapter.ts`.
- Cost tracking is best-effort: token counts when available, dollar costs only when pricing data exists, and `"unknown"` otherwise. No test may require non-zero cost without mocking usage data.
- Frontend scaffolding is M3 and may be deferred to v1.1 without blocking the core harness.

---

## 1. Instructions To The Implementing Agent

1. Before any architecture code, complete WP0's pi API spike. Clone `https://github.com/earendil-works/pi` and read in full: `packages/coding-agent/docs/extensions.md`, `skills.md`, `packages.md`, `prompt-templates.md`, `settings.md`, `sdk.md`, and all files in `examples/extensions/subagent/`.
2. Where pi docs disagree with snippets in this plan, the docs win. Preserve the behavior required by this plan and adjust code to the real API.
3. Language: TypeScript with `strict: true`. Use pinned `ts-morph` for AST work and pinned `typebox` for schemas.
4. Every WP ends with acceptance criteria. A WP is done only when criteria pass via `bun test` in the harness repo and, where stated, against fixture repos.
5. Maintain `PROGRESS.md` at the harness repo root. One line per WP or sub-WP: status, date, and short note. Update it in the same commit that completes the WP or sub-WP.
6. Use conventional commits. Prefer one WP or one coherent sub-WP per PR. WP5, WP6, WP9, and WP12 are expected to split.
7. Do not hardcode framework doc content. If a prompt/tool needs framework behavior, point to repo docs through `read_design_doc` or `design/index.json`.
8. Use `Bun.spawn` with array argv for all harness-managed subprocesses. Do not construct shell strings inside harness code.
9. Harness code must not import target-repo code directly. It may inspect target repos only through config, `repo-contract`, `repo-model`, filesystem reads, subprocesses, and generated artifacts.

### 1.1 Dependency Graph

```text
M1:
  WP0 scaffold + pi API spike + fixture contract
    -> WP1 repo model + rules
    -> WP2 journal + run model
  WP1 + WP2 -> WP3 gates
  WP1 + WP2 + WP3 -> WP5a headless verification
  WP0 + WP2 -> WP6a catalog copy implementation
  WP5a -> WP6a acceptance / T7 proof

M2:
  WP1 + WP2 -> WP4 concept and sync tools
  WP2 + WP0 spike notes -> WP7 orchestrator + agents
  WP5a + WP7 -> WP5b /ship, review, CI
  WP6a -> WP6b full catalog + harvest
  WP4 + WP5a -> WP10 skills
  WP2 + WP5a -> WP11 legibility UI + cost
  WP4 + WP5b + WP6b + WP7 -> WP8 workflow templates

M3:
  WP6a catalog-lib + repo-contract + config -> WP9a cdh init core
  WP9a -> WP9b frontend option
  all prior WPs -> WP12 doctor, evals, docs
```

---

## 2. Repository Layout

Harness package layout:

```text
pi-concept-harness/
|-- package.json                 # bin: { "cdh": "./bin/cdh.js" }, pi package metadata
|-- PROGRESS.md
|-- bin/cdh.ts                   # init | doctor | rules | verify
|-- src/
|   |-- pi-adapter.ts            # single import surface for pi APIs, shaped by WP0 spike
|   |-- config.ts                # loads and merges config, schema in section 3.5
|   |-- repo-contract.ts         # reads and validates design/index.json, section 3.6
|   |-- run-model.ts             # run IDs, snapshots, touched-file tracking, section 3.7
|   |-- repo-model/              # concepts, syncs, specs, tests discovery
|   |-- rules/                   # stateless RuleEngine, R1-R4 and R6-R10
|   |-- gate-policy.ts           # stateful R5, bash screens, session flags
|   |-- journal/                 # dual writer, event types, reports, health
|   |-- catalog-lib/             # copy/rename routine shared by extension and CLI
|   `-- verify/                  # stage runner and CLI entry
|-- extensions/
|   |-- spike-probes.ts          # WP0 probe extension, kept for regression tests
|   |-- gates.ts
|   |-- verification.ts
|   |-- concept-tools.ts
|   |-- catalog.ts
|   |-- orchestrator/
|   |-- journal-ui.ts
|   `-- doctor.ts
|-- agents/
|-- skills/
|-- prompts/
|-- catalog/
|   |-- registry.json
|   `-- concepts/<Name>/...
|-- templates/base/              # vendored template snapshot, offline fallback only
|-- fixtures/
|   |-- valid-app/               # must satisfy section 3.6
|   `-- violations/R*/
`-- evals/
```

Default target-repo layout created by `cdh init`:

```text
app/
|-- AGENTS.md
|-- .pi/settings.json
|-- .pi/cdh.json
|-- design/
|   |-- background/
|   |-- concepts/<name>.md
|   |-- index.json
|   `-- journal/
`-- src/{concepts,syncs,engine,sdk,utils}
```

Optional frontend layout:

```text
app/frontend/
`-- Next.js app router project with shadcn components
```

All target paths are configurable through `.pi/cdh.json` and `design/index.json`. Harness components must read paths through `config.ts` and `repo-contract.ts`, not by guessing.

---

## 3. Cross-Cutting Contracts

Everything in this section is normative.

### 3.1 Testing Contract

#### T1 - Concept Test Presence

Every concept file `src/concepts/{Name}/{Name}Concept.ts` has a colocated test file `src/concepts/{Name}/{Name}Concept.test.ts`.

#### T2 - Surface Coverage: Runtime-Measured, Hard

Surface definition:

- Count only instance methods declared directly on the concept class.
- Include public and implicit-public methods.
- Exclude constructor, static methods, getters, setters, `private`, `protected`, `#private`, inherited members, and names in config `rules.helperMethodAllowlist`.
- Overloads count once by implementation name.
- Non-`_` names are actions.
- `_`-prefixed names are queries.

Measurement:

- The repo template's testing module MUST export `track<T>(instance: T, options?: TrackOptions): T`.
- `track()` returns a transparent `Proxy` preserving `this`, async returns, thrown errors, and object identity as far as JavaScript proxy semantics allow.
- `track()` records method calls to the file pointed to by env `CDH_SURFACE_OUT`.
- The `surface-coverage` stage runs the repo contract's test script with `CDH_SURFACE_OUT` set to a temp JSONL file, then diffs recorded methods against the repo model's surface enumeration.
- 100 percent action and query coverage is required.
- Tests MUST instantiate concepts as `track(new LabelingConcept(db))` unless an explicit `track(..., { concept: "Labeling" })` override is needed.
- If a concept has a test file but the coverage artifact has no records for it, `surface-coverage` fails with the exact instruction: `Wrap concept instances with track(...) from the testing module named in design/index.json`.
- Static AST call detection may be used only for advisory output in `describe_concept` and turn-level warnings. Label it `heuristic`.

Concept naming in `track()`:

- Default concept name is `instance.constructor.name` with a trailing `Concept` suffix removed.
- If that fails because the instance is already wrapped, minified, subclassed, or otherwise ambiguous, tests MUST pass `track(instance, { concept: "Name" })`.
- Catalog renames work because the class name and test names are renamed before parsing. Provenance headers do not affect concept naming.

Runtime artifact schema:

```ts
export type SurfaceRecord =
  | {
      kind: "method";
      concept: string;
      method: string;
      testFile?: string;
      testName?: string;
      actionUnderTest?: string;
      ts: string;
    }
  | {
      kind: "errorAssertion";
      concept?: string;
      testFile?: string;
      testName?: string;
      actionUnderTest?: string;
      ts: string;
    };
```

The artifact is append-only JSONL. It may be buffered, but it MUST flush on process exit and after each test file when the runner supports file hooks. Because Bun may run files in separate workers, the writer must use open-append-close or an equivalent safe append strategy.

If the test stage fails, `surface-coverage` must not produce a misleading partial result. It fails as `coverage inconclusive because tests failed`, includes the original test failure summary, and skips coverage diffing.

#### T3 - Per-Action Requires And Effects Tests

For every action method:

- There is at least one requires-violation case asserting the repo's error convention through `expectError(result)`.
- There is at least one effects case asserting post-state through the concept's own query methods.

Attribution is structured, not guessed:

- The testing module MUST export `testAction(actionName: string, testName: string, fn: () => unknown | Promise<unknown>): void`.
- Concept action tests MUST use `testAction("register", "rejects duplicate usernames", async () => { ... })` or equivalent.
- `testAction()` wraps Bun's `test()` and establishes a tracking context, preferably with `AsyncLocalStorage` from `node:async_hooks`. WP0 must verify this works under the pinned Bun version. If not, implement an explicit context stack with documented limitations and disable parallelism for concept tests in the template.
- `track()` records `actionUnderTest` from this context.
- `expectError()` records an `errorAssertion` record with the same context.

Ship check:

- Requires case passes for an action when there is at least one `errorAssertion` record with `actionUnderTest === actionName`.
- Effects case passes for an action when there is at least one query method record, meaning a `_`-prefixed method on the same concept, with `actionUnderTest === actionName`.
- If records exist but lack `actionUnderTest`, fail with the instruction: `Use testAction(actionName, testName, fn) for per-action concept tests`.

Config `testing.errorAssertionPatterns` is retained for static advisory checks only. It does not replace `expectError()` for ship-tier T3.

T3 is WARN at turn level and FAIL at ship-local verification. It is not suppressible.

#### T4 - Principle Test

Every concept has a principle test: a test whose name contains `principle`, executing the spec's principle as an action trace.

#### T5 - Sync Test Shape, Hard

Every `src/syncs/**/*.sync.ts` has a sibling `*.sync.test.ts` that:

- Imports at least one exported sync from the sibling.
- Contains at least one positive case using the template's `setupSyncTest` helper.
- Contains at least one negative case whose test name contains `does not` or `negative`.

The gate checks structure only. Booting the engine and asserting behavior are repo-owned and documented by the template.

#### T6 - Legible Tests

Principle tests and multi-action tests narrate intent via `trace()` from the testing module. A `console.log` call is accepted as a fallback marker.

T6 is WARN at turn level and FAIL at ship-local verification. T6 is suppressible through R10 only, using the suppression rules in section 3.3.

#### T7 - Harness Dogfood

Every catalog concept ships with spec, implementation, and tests. When copied into `fixtures/valid-app`, it MUST pass R1-R10 and T1-T6 through `cdh verify --tier ship --no-review --no-ci`.

### 3.2 Legibility Contract

#### L1 - Run Identity

Every user prompt that mutates the repo belongs to a run: `run-YYYYMMDD-HHMMSS-xxxx`, where `xxxx` is four random base36 chars.

Runs are created lazily on first mutating tool call and reused until `agent_end`. `/ship` creates its own run. Subagents inherit the parent run through `CDH_RUN_ID` and `CDH_RUN_DIR`.

#### L2 - Dual Journal

Every event is written twice:

- Into the pi session through `pi.appendEntry("cdh:<type>", data)`.
- As one JSON line in `design/journal/runs/<runId>/events.jsonl`.

JSONL writer requirements:

- Open-append-close per event or equivalent safe append.
- Tolerate concurrent parent/subagent writers.
- Never throw into the ordinary agent loop.
- On failure, notify once per run, set `journalDegraded`, and continue.

Failure policy:

- Ordinary turns: journal write failures degrade but do not throw.
- `/ship` and `cdh verify --tier ship`: mandatory `journal-health` stage fails if `journalDegraded` is set or the run dir is unwritable.

#### L3 - Event Vocabulary

Implement exactly these event types in `src/journal/types.ts`:

```ts
type CdhEvent =
  | { type: "task_started"; data: { prompt: string } }
  | { type: "gate_blocked"; data: { rule: string; toolName: string; path: string; reason: string } }
  | { type: "rule_warning"; data: { rule: string; path: string; detail: string } }
  | { type: "suppression"; data: { rule: string; path: string; reason: string } }
  | { type: "verification_started"; data: { tier: string; stages: string[] } }
  | { type: "verification_stage"; data: { stage: string; status: "pass" | "fail" | "warn" | "skip"; durationMs: number; summary: string; detailPath?: string } }
  | { type: "verification_finished"; data: { tier: string; ok: boolean; failures: string[] } }
  | { type: "autofix_attempt"; data: { n: number; of: number; failuresFedBack: string[] } }
  | { type: "agent_spawned"; data: { agent: string; task: string; childSessionFile: string } }
  | { type: "agent_finished"; data: { agent: string; ok: boolean; usage: unknown } }
  | { type: "decision"; data: { title: string; body: string; alternatives?: string[] } }
  | { type: "catalog_copy"; data: { id: string; version: string; as?: string; files: string[] } }
  | { type: "ship_preflight"; data: { status: "pass" | "fail" | "confirm"; detail: string } }
  | { type: "ship_started"; data: Record<string, never> }
  | { type: "ship_finished"; data: { ok: boolean } }
  | { type: "ci_triggered"; data: { ref: string; workflow: string } }
  | { type: "ci_status"; data: { status: string; url?: string } }
  | { type: "cost_snapshot"; data: { model?: string; tokens: { input: number; output: number; cacheRead: number; cacheWrite: number } | "unknown"; costUsd: number | "unknown" } };
```

All persisted entries also carry `{ runId, seq, ts }`.

#### L4 - Run Report

At `agent_end`, if a run exists, and at the end of `/ship`, generate:

- `design/journal/runs/<runId>/report.md`
- One row appended to `design/journal/INDEX.md`

Report template:

```markdown
# Run <runId> - <first line of task>

**Date:** <date> | **Result:** PASS/FAIL | **Cost:** <cost-or-unknown> | **Session:** <copied session file or export note>

## Task

<verbatim prompt>

## What Happened

<chronological narrative generated from events>

## Changes

<git diff --stat vs run-start ref; touched concepts/syncs from repo-model>

## Verification

<table: stage | status | duration | summary; failures include first 20 detail lines>

## Decisions

<every decision event verbatim>

## Follow-Ups

<unresolved warnings, all suppressions, pre-existing dirty files excluded from this run>
```

#### L5 - Git Traceability

Commits created by `/ship` MUST include trailer `Cdh-Run: <runId>`.

At report time, copy the pi session file into the run dir. If the pinned pi exposes a programmatic HTML export API, also write `report.html`; otherwise report notes: `Open the copied session with pi and use /export`.

#### L6 - Live Surface

`journal-ui.ts` registers:

- Entry renderers for all `cdh:*` event types.
- Footer widget showing a compact status line, for example `run <id> | rules ok | tests 41/41 | cov 100% | review pending`.
- `/status`: prints current run summary.
- `/report`: regenerates and prints path to `report.md`.
- `record_decision` custom tool with params `{ title, body, alternatives?: string[] }`.

The system-prompt layer instructs the model to call `record_decision` whenever it makes a non-obvious design choice.

### 3.3 Rules Contract

```ts
export type Severity = "block" | "warn" | "fail-ship";

export interface RuleHit {
  rule: string;
  severity: Severity;
  path: string;
  message: string;
  fix?: string;
  suppressed?: { reason: string };
}

export interface RuleEngine {
  checkContent(path: string, proposed: string): RuleHit[];       // R1 only
  checkFile(path: string): Promise<RuleHit[]>;                   // R1-R4
  checkRepo(scope: ChangedScope | "all"): Promise<RuleHit[]>;   // R1-R4, R6-R10
}

export interface GatePolicy {
  checkMutation(toolName: string, path: string): PolicyHit | null;
  screenBash(command: string): PolicyHit | null;
  allowEngineThisSession(): void;
}
```

Rules:

| ID | Rule | Severity |
|---|---|---|
| R1 | Concept independence: no file under `src/concepts/X/` may import, value or type, from another concept dir, `@concepts`, `src/syncs`, or engine internals beyond configured allowlist. | BLOCK in-loop |
| R2 | Action signature: every action method per T2 surface definition takes exactly one object parameter and returns an object or Promise of object. | WARN, ship-FAIL |
| R3 | Query signature: every `_` method per T2 surface definition returns an array or Promise of array. | WARN, ship-FAIL |
| R4 | Placement/naming: `src/concepts/{Name}/{Name}Concept.ts` default-exports class `{Name}Concept`; syncs live in `src/syncs/**/*.sync.ts` and export `Sync`-typed consts. | WARN, ship-FAIL |
| R5 | Protected paths: no writes to `src/engine/**`, `src/sdk/**`, `.env*` inside pi agent sessions unless `/allow-engine` has been run this session. | BLOCK in-loop through GatePolicy |
| R6 | Spec presence: every concept has a spec at the configured specs dir with sections `purpose`, `principle`, `state`, `actions`. | ship-FAIL |
| R7 | Test presence: T1 and T5 sibling-file existence. | ship-FAIL |
| R8 | Surface coverage: T2 runtime coverage. | ship-FAIL |
| R9 | Sync test shape: T5 positive/negative/import/helper structure. | ship-FAIL |
| R10 | Legible tests: T6. | WARN, ship-FAIL |

Every `RuleHit.message` MUST state the rule ID, what was found, and the smallest change that fixes it.

Suppression rules:

- Only R2, R3, R4, and R10 are suppressible.
- R1, R5, R6, R7, R8, and R9 are never suppressible.
- Syntax: `// cdh-ignore <RULE_ID> <reason>`.
- Reason is required and must be non-empty after trimming.
- Construct-level suppression for R2, R3, R4 applies only to the next AST construct after the comment, skipping blank lines and other comments.
- File-level suppression for R10 must appear in the first five nonblank lines of the file.
- Every honored suppression is journaled as `suppression` and listed in report Follow-Ups.
- Unused or invalid suppressions are reported as warnings but do not suppress anything.

Bash screening:

- `GatePolicy.screenBash` is best-effort, not a security boundary.
- Screen known-bad patterns: `rm -rf` outside cwd, `git push --force`, writes to `.env*` via redirection, and obvious writes to protected paths.
- In interactive mode, a `ctx.ui.confirm` escape hatch may allow the command.
- In headless mode, known-bad patterns block.
- README must document that real isolation for autonomous runs depends on pi containerization or runner sandboxing.

### 3.4 Catalog Contract

Catalog layout:

```text
catalog/
|-- registry.json
`-- concepts/<Name>/
    |-- concept.md
    |-- {Name}Concept.ts
    |-- {Name}Concept.test.ts
    `-- README.md
```

Registry entry:

```json
{
  "id": "authenticating",
  "name": "Authenticating",
  "version": "1.0.0",
  "summary": "Username/password identity with registration and credential checks.",
  "tags": ["identity", "security"],
  "pairsWith": ["sessioning", "accesscontrolling"],
  "files": ["concept.md", "AuthenticatingConcept.ts", "AuthenticatingConcept.test.ts", "README.md"]
}
```

Copy semantics:

- Code and tests copy to `src/concepts/<Name>/`.
- Spec copies to `design/concepts/<lower-name>.md`, using the specs dir from `design/index.json`.
- Copied TS files get a provenance header comment: `// cdh:catalog <id>@<version>`.
- Refuse if target exists unless `overwrite: true`.
- After copy, run `checkFile` on copied files and the copied concept tests.
- Journal `catalog_copy`.
- Return a summary instructing the model to reconcile copied spec and implementation with app needs.

Rename semantics for `catalog_copy { as }`:

Implement once in `src/catalog-lib/rename.ts`, used by extension and CLI. Given source `Authenticating` and `as: "Accounting"`, derive and apply these whole-word replacements across copied files only:

| Transform | From | To | Applies To |
|---|---|---|---|
| PascalCase | `Authenticating` | `Accounting` | Class names, `{Name}Concept`, prose, test descriptions |
| Filenames | `AuthenticatingConcept.ts`, `AuthenticatingConcept.test.ts` | `AccountingConcept.ts`, `AccountingConcept.test.ts` | Copied filenames |
| Directory | `src/concepts/Authenticating/` | `src/concepts/Accounting/` | Target dir |
| camelCase | `authenticating` | `accounting` | Identifier positions only |
| lower/kebab | `authenticating.md`, `authenticating` id mentions | `accounting.md`, `accounting` | Spec paths and README id mentions |

Do not rename:

- Generic type parameter names such as `[User]`.
- Provenance header, which records the original catalog id.
- Domain words that merely contain the source name as a substring.

After rename, parse both TS files with ts-morph. If either fails, abort the copy before writing to the target repo and report the parse error.

Catalog paths:

- `catalogPaths` is `[builtin, ...extras]` for search/read.
- Harvest writes only to the first writable extra path.
- The builtin catalog shipped in the package is read-only.

### 3.5 Config Schema

Project config `.pi/cdh.json` is deep-merged over global config `~/.pi/agent/cdh.json`, which is deep-merged over defaults. `src/config.ts` is the only config reader and validates with typebox.

```jsonc
{
  "paths": {
    "concepts": "src/concepts",
    "syncs": "src/syncs",
    "designIndex": "design/index.json",
    "journal": "design/journal"
  },
  "rules": {
    "importAllowlist": { "syncs": ["@engine"] },
    "helperMethodAllowlist": []
  },
  "testing": {
    "errorAssertionPatterns": ["expectError(", ".error"]
  },
  "verify": {
    "onAgentEnd": ["typecheck", "rules:changed"],
    "onShipLocal": [
      "journal-health",
      "typecheck",
      "rules:all",
      "tests:changed",
      "tests:all",
      "surface-coverage",
      "sync-tests",
      "legibility"
    ],
    "optionalStages": ["smoke"],
    "autofixRetries": 2,
    "lineCoverageInfoThreshold": 85
  },
  "catalogPaths": [],
  "ship": {
    "confirm": "interactive",
    "branchPrefix": "cdh/",
    "review": true,
    "push": true,
    "createPr": true,
    "ci": true
  },
  "ci": {
    "provider": "github",
    "workflow": "ci.yml"
  },
  "frontend": {
    "enabled": false
  }
}
```

`cdh verify --tier ship` uses `verify.onShipLocal` by default. It accepts `--with-review` and `--with-ci` for explicit side-effecting checks. It also accepts `--no-review` and `--no-ci` as compatibility no-ops/defaults for scripts.

### 3.6 Repo And Template Contract

The machine-readable repo contract lives in `design/index.json`. The template ships it. `repo-contract.ts` validates it with typebox. All harness components read it through that module.

```jsonc
{
  "specsDir": "design/concepts",
  "docs": {
    "concept-spec-conventions": "design/background/concept-specifications.md",
    "implementation-conventions": "design/background/implementing-concepts.md",
    "sync-conventions": "design/background/implementing-synchronizations.md",
    "testing-conventions": "design/background/testing-concepts.md"
  },
  "helpers": {
    "testingModule": "@utils/testing.ts",
    "exports": [
      "setupTestDb",
      "trace",
      "track",
      "testAction",
      "expectError",
      "setupSyncTest"
    ]
  },
  "scripts": {
    "test": "bun test",
    "typecheck": "bun run check",
    "start": "bun run start"
  },
  "health": {
    "path": "/api/health"
  }
}
```

`fixtures/valid-app` MUST satisfy this contract fully:

- A real minimal engine boot.
- `@utils/testing.ts` with working `setupTestDb`, `trace`, `track`, `testAction`, `expectError`, and `setupSyncTest`.
- One concept, `Labeling`, with tests using `track()`, `testAction()`, `expectError()`, `trace()`, and a principle test.
- One sync with `setupSyncTest`-based positive and negative tests.
- One Requesting endpoint and one health path.
- Four docs keys resolving to real files.
- `test`, `typecheck`, and `start` scripts runnable.

WP0 is not complete until this contract validates statically. WP5a closes the deferred assertion that `fixtures/valid-app` passes `cdh verify --tier ship --no-review --no-ci`.

### 3.7 Run And Mutation Model

Run creation captures:

- `startRef`: current `HEAD`, or literal `"unborn"` in a repo with no commits.
- `startStatus`: parsed `git status --porcelain=v1 -z`, including staged, modified, deleted, renamed, and untracked files that existed before the run.

Touched set:

- Union of journaled mutating tool paths from this run, across parent and subagents.
- Plus `git diff --name-only <startRef>` and newly untracked files not present in `startStatus`.
- In an unborn repo, degrade to all tracked-candidate files not present in `startStatus`.

Changed scope:

- `repoChangedSince(run)` is true when touched set is non-empty.
- `rules:changed` and `tests:changed` scope to concepts/syncs whose dirs intersect the touched set.
- `tests:changed` is a best-effort quick feedback stage. It can miss global regressions through shared utilities or global wiring. Ship-local verification always includes `tests:all`.

Pre-existing dirty work:

- Files present in `startStatus` are not auto-committed as part of this run.
- They are listed in report Follow-Ups.
- `/ship` preflight requires user choice or aborts headlessly.

Subagents:

- Orchestrator sets `CDH_RUN_ID` and `CDH_RUN_DIR` in child environment.
- Child harness instances join the parent run instead of creating a new one.
- Child events append to the same events JSONL.

### 3.8 Ship And Verification Policy

`cdh verify --tier ship`:

- Runs `verify.onShipLocal` by default.
- Performs zero git mutation.
- Does not run reviewer by default.
- Does not trigger CI by default.
- `--with-review` may invoke reviewer if orchestrator is available.
- `--with-ci` may trigger CI for the current ref only if explicitly supplied or discoverable; it never pushes.
- `--no-review` and `--no-ci` are accepted for script compatibility and are defaults.

`/ship` runs in this order and refuses loudly at first failure:

1. Preflight, journaled as `ship_preflight`: require git repo, no merge/rebase in progress, compute touched set, detect pre-existing dirty/staged files from `startStatus`. Interactive mode shows them and asks `exclude and continue` or `abort`; headless aborts with the list. Never use `git add -A`.
2. Ship-local verification: run `verify.onShipLocal` plus optional `smoke` if configured.
3. Review: if `ship.review` is true, invoke reviewer agent. If orchestrator is absent, fail in `/ship` unless user passes `--no-review`; warn-skip only in non-ship manual verification.
4. Confirmation: if `ship.confirm` is `interactive`, show exact branch name, touched file list, commit message, push target, PR setting, and CI setting; require `ctx.ui.confirm`. If `never`, abort before git mutation after successful verification. If `headless-auto`, proceed without prompt; this must be deliberately set in config.
5. Git mutation: create branch `${ship.branchPrefix}${runId}`; if it exists, append `-2`, `-3`, etc. Run `git add -- <touched files only>`. Commit with task-derived message and `Cdh-Run: <runId>` trailer. Push only if `ship.push` is true. Create PR through `gh pr create` only if `ship.createPr` is true.
6. CI: if `ship.ci` is true and not skipped by `--no-ci`, trigger configured workflow and poll every 15 seconds for at most 10 minutes. Journal `ci_triggered` and `ci_status`.

---

## 4. Work Packages

Each WP has goal, steps, and acceptance. Paths refer to section 2.

### WP0 - Scaffold, Pi API Spike, Fixture Contract

Milestone: M1. Dependencies: none.

Goal: establish the package, prove every required pi primitive, and build the canonical fixture.

Steps:

1. Initialize harness repo with Bun, TypeScript strict mode, pinned pi, pinned ts-morph, pinned typebox, and CI for `bun test` plus typecheck.
2. Create `package.json` with bin and pi package metadata.
3. Create `src/pi-adapter.ts` as the only import surface for pi APIs.
4. Write `extensions/spike-probes.ts` with one tiny probe per pi primitive the plan uses:
   - Register a command.
   - Register a custom tool with typebox schema and call it.
   - Intercept `tool_call` and block one call.
   - Observe and modify a `tool_result`.
   - Append a custom entry and re-read it from the session file.
   - Register an entry renderer.
   - Set widget/status UI.
   - Send a follow-up user message that verifiably re-triggers the agent.
   - Modify system prompt before agent start.
   - Spawn one child pi session using the subagent example pattern and capture usage.
   - Check whether programmatic HTML export exists.
   - Confirm package resource enable/disable syntax.
   - Confirm TUI/scripted-session testing pattern.
5. Record confirmed signatures and behaviors in `docs/pi-api-notes.md`. Later WPs cite this file, not assumptions.
6. If a primitive does not work as assumed, update this plan section in-place and note it in `PROGRESS.md` before proceeding.
7. Build `fixtures/valid-app` to the full section 3.6 contract.
8. Build `fixtures/violations/R*` minimal repos, one per rule.

Acceptance:

- Every probe demonstrably fires in a scripted session.
- `docs/pi-api-notes.md` covers every primitive listed above.
- `fixtures/valid-app` statically satisfies section 3.6 through a script-run check and docs-resolution check.
- Deferred assertion recorded in `PROGRESS.md`: WP5a must later prove `fixtures/valid-app` passes `cdh verify --tier ship --no-review --no-ci`.

### WP1 - Repo Model And Rules Engine

Milestone: M1. Dependencies: WP0.

Goal: discover concepts, syncs, specs, tests, surfaces, and rule hits.

Steps:

1. Implement `src/repo-model/` using ts-morph and repo contract paths.
2. Expose `concepts(): { name, file, actions, queries, specPath?, testPath? }[]`.
3. Expose `syncs(): { file, exports, whenActions: string[], thenActions: string[], testPath? }[]`.
4. Extract sync references tolerantly from property-access pairs in DSL call patterns; do not fully evaluate the DSL.
5. Implement exact T2 surface filter and unit-test exclusions: static method, inherited method, getter, setter, private/protected, `#private`, overload, allowlisted helper.
6. Implement R1-R4 and R6-R10.
7. Implement R8 checker over runtime coverage artifact. Static fallback is advisory only and must be labeled `heuristic`.
8. Implement `cdh-ignore` scanner with suppression rules from section 3.3.
9. Implement `checkRepo(scope: ChangedScope | "all")`.

Acceptance:

- Each `fixtures/violations/R*` repo reports exactly the intended rule or clearly documented dependent prerequisite hits.
- `fixtures/valid-app` reports zero hits.
- Surface-filter unit tests cover every exclusion case.
- R8 unit test names exact uncovered methods and gives the `track()` instruction.
- T3 unit test names exact missing `testAction()` or `expectError()` usage.
- R10 suppression works only as file-level first-five-nonblank-lines suppression and journals reason.

### WP2 - Journal Core And Run Model

Milestone: M1. Dependencies: WP0.

Goal: implement run identity, event persistence, reports, journal health, and touched-file tracking.

Steps:

1. Implement `src/run-model.ts`: run creation, `CDH_RUN_ID` join, start snapshot, touched set, changed scope.
2. Implement `src/journal/types.ts` with event vocabulary from section 3.2.
3. Implement `getOrCreateRun(ctx)` and `emit(type, data)` with dual writes.
4. Implement append-only JSONL writer with concurrent writer tolerance.
5. Implement `journalDegraded` flag and `journal-health` check.
6. Implement report generator and INDEX appender.

Acceptance:

- Synthetic event stream snapshot-tests generated `report.md`.
- Concurrent append test with two writers and 200 events has no lost or torn lines.
- Touched-set tests cover pre-existing dirty exclusion, new untracked inclusion, modified touched files, staged pre-existing files, and unborn repo case.
- Child process with `CDH_RUN_ID` appends to parent events JSONL.
- Simulated journal write failure sets degraded flag and causes `journal-health` failure.

### WP3 - Gates

Milestone: M1. Dependencies: WP1, WP2.

Goal: block R1/R5 violations before writes land and provide soft post-save feedback.

Steps:

1. Implement `src/gate-policy.ts` with R5 protected paths, bash screening, `/allow-engine` session flag.
2. Implement `extensions/gates.ts` using actual APIs recorded in `docs/pi-api-notes.md`.
3. Gate flow: `GatePolicy` first, then `RuleEngine.checkContent` for R1.
4. For edit tools, evaluate post-edit content by applying old/new strings to current file text in memory.
5. If proposed content does not parse, do not block on AST R1 unless cross-concept import is visible textually.
6. On file mutation result, run `checkFile(path)` and append warnings to tool result.
7. Journal `gate_blocked`, `rule_warning`, and `/allow-engine` decision/flag events.

Acceptance:

- Edit introducing a cross-concept import is blocked with the R1 fix message.
- Legal edit that breaks R3 produces appended warning.
- R5 protected-path write is blocked without involving RuleEngine.
- `/allow-engine` permits engine edit for the session and journals both flag flip and edit.
- Bash screen tests document best-effort patterns and do not pretend to be complete.

### WP5a - Headless Verification

Milestone: M1. Dependencies: WP1, WP2, WP3.

Goal: implement verification stages, CLI verification, run_verification tool, and auto-fix loop without git mutation.

Stages:

- `journal-health`
- `typecheck`, using contract `scripts.typecheck`
- `rules:changed` and `rules:all`
- `tests:changed` and `tests:all`, using contract `scripts.test`
- `surface-coverage`, using `CDH_SURFACE_OUT`
- `sync-tests`
- `legibility`
- Optional `smoke`, using contract `scripts.start` and `health.path`

Steps:

1. Implement `src/verify/Stage` and stage runner.
2. Stage runner journals `verification_started`, `verification_stage`, and `verification_finished`.
3. `surface-coverage` depends on successful test stage. If tests failed, fail as inconclusive and include test failure summary.
4. Implement `/verify [tier]` command.
5. Implement `run_verification` custom tool.
6. Implement `cdh verify [--tier quick|ship] [--with-review] [--with-ci] [--no-review] [--no-ci]`.
7. Implement `agent_end` quick-tier hook.
8. Implement auto-fix loop. Retry counter is derived from journal events and cannot be reset by the model. `formatFailuresForModel` is at most about 60 lines and ends with: `Fix these, then call run_verification({tier:"quick"}).`
9. No git mutation anywhere in WP5a.

Acceptance:

- Deleting `track()` from a concept test makes ship-local `surface-coverage` fail with exact method names and the `track()` instruction.
- Omitting `testAction()` or `expectError()` makes T3 fail with exact action names and fix instruction.
- Failed tests make `surface-coverage` inconclusive rather than misleading.
- Breaking typecheck triggers auto-fix exactly `autofixRetries` times, then escalates.
- `fixtures/valid-app` passes `cdh verify --tier ship --no-review --no-ci`, closing WP0's deferred assertion.

### WP6a - Catalog Copy, One Concept

Milestone: M1. Implementation dependencies: WP0, WP2. Acceptance dependency: WP5a.

Goal: implement catalog search/show/copy and one production-quality catalog concept.

Steps:

1. Implement `src/catalog-lib/` copy and rename routine from section 3.4.
2. Implement extension tools `catalog_search`, `catalog_show`, and `catalog_copy`.
3. `catalog_show` returns `concept.md` and `README.md`, not implementation code.
4. Author `Authenticating` to T7 quality:
   - State: users with username and password hash.
   - Actions: `register`, `authenticate`, `changePassword`, `unregister`.
   - Queries: `_getUserByUsername`, `_getUsers`.
   - Hashing uses Bun's built-in password API. Tests assert stored hash is not plaintext.
   - Tests use `track()`, `testAction()`, `expectError()`, and `trace()`.

Acceptance:

- T7 green for `Authenticating` in `fixtures/valid-app`.
- `catalog_copy` with `as: "Accounting"` compiles, tests pass, spec lands at `design/concepts/accounting.md`, provenance header is preserved, and generic params are untouched.
- Overwrite refusal test passes.
- Post-rename parse failure aborts cleanly before writing target files.

M1 exit gate: runbook section 7 items 1 through 4a are green.

### WP4 - Concept And Sync Tools

Milestone: M2. Dependencies: WP1, WP2.

Goal: expose cheap read tools for models and workflows.

Tools:

- `list_concepts {}`: table of name, action count, query count, spec?, tests?, coverage status if available.
- `describe_concept { name }`: method signatures, spec path, test path, uncovered surface. Static uncovered surface is labeled `heuristic` unless backed by runtime artifact.
- `list_syncs { concept? }`: syncs and referenced actions.
- `trace_sync { action: "Post.delete" }`: syncs whose when/then reference the action; flags orphaned actions and unknown referenced actions.
- `read_design_doc { key }`: resolves through `design/index.json`; errors list available keys.
- `spec_lint { name }`: R6 section check plus per-action requires/effects presence in spec.

Acceptance:

- Golden-output tests for every tool against `fixtures/valid-app`.
- Outputs have human-readable `content` and structured `details`.

### WP7 - Orchestrator And Agents

Milestone: M2. Dependencies: WP2 and WP0 spike notes.

Goal: fork pi subagent example into a CDH orchestrator with run inheritance and agent specs.

Steps:

1. Fork `examples/extensions/subagent/` into `extensions/orchestrator/`.
2. Preserve single, parallel, and chain modes with streaming.
3. Child sessions load the harness package and use trust flags recorded in `docs/pi-api-notes.md`.
4. Set `CDH_RUN_ID` and `CDH_RUN_DIR` in child env.
5. Journal `agent_spawned` and `agent_finished`, including usage when available.
6. Chain agents through artifacts on disk, not just `{previous}` prose.
7. Cap parallel implementers at 3.
8. Write the seven agent specs from section 5.

Acceptance:

- From `fixtures/valid-app`, scout lists all concept actions and journals spawn/finish.
- Two-agent chain passes a file path artifact and second agent reads it.
- Parallel run of two implementers on distinct concepts completes.
- Child events appear in parent run events JSONL.

### WP5b - /ship, Review, CI

Milestone: M2. Dependencies: WP5a, WP7.

Goal: implement safe shipping with review, git mutation, push/PR, and CI.

Steps:

1. Implement section 3.8 exactly.
2. Add reviewer stage using reviewer agent.
3. Add CI stage with GitHub provider: `gh workflow run` or PR checks according to config, poll every 15 seconds, cap at 10 minutes.
4. Implement L5 session copy and commit trailer.

Acceptance:

- Headless preflight aborts on pre-existing dirty file and lists it.
- Interactive path shows exact file list and requires confirmation.
- Commit contains only touched files and `Cdh-Run:` trailer.
- `ship.confirm: "never"` performs zero git mutation after successful verification.
- Existing branch collision appends suffix.
- `--no-ci` skips CI and report says so.

### WP6b - Full Catalog And Harvest

Milestone: M2. Dependencies: WP6a.

Goal: complete catalog and add harvest workflow.

Steps:

1. Author `Sessioning` to T7 quality:
   - Polymorphic `[User]`.
   - Start, end, expire sessions.
   - `_getUser { session }`.
   - TTL state and expiry checked in requires.
2. Author `AccessControlling` to T7 quality:
   - Polymorphic `[User, Resource]`.
   - Grant/revoke role or permission.
   - `check` action.
   - `_getPermissions` query.
   - Opaque IDs only.
3. Implement `/catalog-harvest <Concept>` prompt template and supporting command:
   - Full ship-local verify.
   - Reviewer with harvest rubric: polymorphic, app-specific naming removed, state minimal, tests honest.
   - Copy to first writable extra `catalogPaths` entry.
   - Update registry and bump version.
   - Journal event.

Acceptance:

- T7 green for all three concepts in CI.
- Harvest e2e against a temp extra catalog path.

### WP8 - Workflow Prompt Templates

Milestone: M2. Dependencies: WP4, WP5b, WP6b, WP7.

Goal: author workflow templates that orchestrate agents and tools.

Templates:

- `/new-concept <name-or-feature>`: catalog search first; if a hit fits, show it and stop for confirmation; otherwise spec-writer, human checkpoint, concept-implementer, test-writer, quick verify, summary.
- `/new-sync <behavior>`: scout maps concepts/actions, trace each relevant action, sync-implementer, test-writer, quick verify.
- `/implement-feature <desc>`: spec-writer decomposes into `design/plans/<slug>.md`, checkpoint, parallel concept implementers up to 3 on disjoint dirs, sequential sync implementer, test sweep, quick verify.
- `/review [scope]`: reviewer on current diff; verdict printed and journaled.
- `/ship`: documentation template explaining and invoking the command.

Acceptance:

- Scripted `/new-concept Upvote` in fixture copy runs to green quick tier with spec, implementation, tests, and journal narrative naming each step.

### WP10 - Skills

Milestone: M2. Dependencies: WP4 and WP5a names stable.

Goal: add concise skills that orchestrate tools and repo docs without restating framework docs.

Skills:

- `concept-workflow`: read spec/doc keys, inspect prior art, implement, fix gate feedback, hand to tests, run verification.
- `sync-workflow`: trace before and after; T5 checklist.
- `debugging-syncs`: symptom-to-tool/doc playbook.
- `frontend-shadcn`: description begins exactly `Use ONLY if frontend/ exists in this repo.`

Acceptance:

- Skill lint: frontmatter valid, descriptions precise, each skill under 150 lines.
- Frontend skill self-gates.
- Fixture smoke: agent loads `concept-workflow` when asked to implement a concept.

### WP11 - Legibility UI And Cost

Milestone: M2. Dependencies: WP2, enriched by WP5a.

Goal: implement renderers, widget, commands, decision tool, and best-effort cost tracking.

Steps:

1. Implement entry renderers for all event types.
2. Implement widget updates during verification.
3. Implement `/status`, `/report`, and `record_decision`.
4. Aggregate usage fields exposed by pinned pi and orchestrator child sessions.
5. Emit `cost_snapshot` with `"unknown"` where data is missing.
6. Append cumulative records to `design/journal/costs.jsonl`.

Acceptance:

- Renderer snapshots per event type.
- Report shows mocked token/cost usage correctly.
- Report gracefully shows `unknown` when usage unavailable.
- Widget line sequence covered by scripted TUI tests.

### WP9a - cdh init Core

Milestone: M3. Dependencies: catalog-lib from WP6, repo-contract, config.

Goal: initialize concept-design repos from an empty directory.

Flags:

- `--name`
- `--with auth,sessions,access`
- `--template <git-url>`
- `--no-git`
- `--yes`
- `--force` for non-empty dir, with confirmation unless `--yes`

Flow:

1. Preflight: refuse non-empty dir unless `--force`; check Bun version.
2. Fetch template: `git clone --depth 1 <templateSource>`, strip `.git`; on failure, use `templates/base/` and print a loud re-sync notice.
3. Validate fetched template against section 3.6; fail loudly if it drifted.
4. Stamp app name into package and README.
5. Write `.pi/settings.json` installing the harness package.
6. Write `.pi/cdh.json` defaults.
7. Ensure `design/journal/` skeleton and empty `INDEX.md`.
8. For `--with`, call shared catalog-lib copy routine.
9. Run `bun install` and contract `scripts.test`.
10. If not `--no-git`, initialize git and create first commit.
11. Print next steps: `pi`, `/new-concept ...`, `/doctor`.

Acceptance:

- `cdh init t1 --yes` yields green tests and valid contract.
- `--with auth` copies Authenticating and tests pass.
- Network-mocked fallback template path works and prints re-sync notice.

### WP9b - Frontend Option

Milestone: M3. Dependencies: WP9a. Skippable to v1.1.

Goal: optionally scaffold Next.js + shadcn frontend.

Flow for `--frontend`:

1. `bunx create-next-app@latest frontend --ts --app --tailwind --eslint --src-dir --no-import-alias`.
2. `bunx shadcn@latest init -d` and add `button card input form`.
3. Add `frontend/src/lib/api.ts`, a thin fetch client for Requesting endpoints, base URL from `NEXT_PUBLIC_API_URL`.
4. Add one example page calling health/example endpoint.
5. Set `frontend.enabled = true`.
6. When frontend is off, disable `frontend-shadcn` skill using package resource enable/disable syntax recorded in `docs/pi-api-notes.md`.

Acceptance:

- `cdh init t2 --frontend --with auth --yes` yields green `bun run --cwd frontend build`.
- Non-frontend repo has no `frontend/` and frontend skill disabled.

### WP12 - Doctor, Evals, Docs

Milestone: M3. Dependencies: all prior work.

Goal: add diagnostics, release evals, and documentation.

Doctor checks:

- Bun version.
- MongoDB reachability or memory-server availability.
- `gh` auth when GitHub CI enabled.
- `.env` vs `.env.example` drift.
- Pi version vs pinned.
- `design/index.json` contract validity and doc-key resolution.
- Testing helper exports.
- Catalog registry integrity.
- Orphaned journal runs.

Doctor output: table with PASS/WARN/FAIL and one-line fix.

Golden evals:

- `implement-upvote`
- `add-cascade-delete-sync`
- `fix-broken-where-clause`
- `catalog-copy-and-adapt-auth`

Eval runner:

- Fresh fixture copy per task.
- Drive pi headlessly through SDK if available; otherwise JSON mode from spike notes.
- Grade by `cdh verify --tier ship --no-review --no-ci` exit code plus task-specific assertions.
- Store per-eval report.
- `evals/run.ts --all` prints scoreboard.
- Run on demand and on harness release, not per commit.

Docs:

- README: install, config, commands, tools, agents, skills, workflows.
- `docs/extending.md`: add a rule, add a catalog concept, add an agent.
- Checked-in runbook for section 7.

Acceptance:

- Doctor flags deliberately broken fixture correctly.
- All four evals pass in finished harness.
- Docs lint/build clean.

---

## 5. Agent Specs

Write these specs into `agents/`. Adjust model IDs to current availability at implementation time: use strong-reasoning, strong-coding, mid, and fast tiers.

### spec-writer

```markdown
---
name: spec-writer
description: Writes or refines a concept specification in design/concepts/ from a feature request. Checks the catalog for reusable concepts first.
tools: read, grep, ls, write, catalog_search, catalog_show, list_concepts, describe_concept, read_design_doc, spec_lint, record_decision
model: <strong-reasoning>
---
You write concept specifications. You never write implementation code.

Process, in order:
1. Read the current spec conventions via read_design_doc (list keys if unsure). Follow them exactly.
2. catalog_search for existing concepts covering the need; also list_concepts for in-repo ones. If a catalog concept fits, say so and stop. Recommend catalog_copy instead of a new spec. Record this as a decision.
3. Otherwise draft the spec at design/concepts/<name>.md with: purpose (one sentence of user value), principle (a concrete action trace), state (minimal; nothing the behavior does not need), actions (each with requires and effects), queries.
4. Keep the concept polymorphic: arguments are opaque IDs; no assumptions about other concepts. Completeness: the concept must fulfill its purpose without calling anything else.
5. Run spec_lint on your file and fix every finding.

Output: the spec file path and a 5-line summary of key design choices. Also record_decision them.
```

### concept-implementer

```markdown
---
name: concept-implementer
description: Implements exactly one concept from its spec in design/concepts/. Does not write syncs or touch other concepts.
tools: read, grep, ls, write, edit, bash, describe_concept, read_design_doc, run_verification, record_decision
model: <strong-coding>
---
Input: a spec file path. Implement only that concept at src/concepts/<Name>/<Name>Concept.ts.

1. Read the spec and the repo's implementation conventions through read_design_doc before writing anything.
2. Map spec state to collections and actions/queries to methods exactly as conventions dictate. Every action enforces its requires and performs its effects.
3. You will be blocked if you import another concept. That is by design; restructure instead.
4. After writing, run run_verification({tier:"quick"}) and fix findings until clean. Do not write tests unless repo conventions require small inline examples.

Output: file path plus a note of any spec ambiguity you resolved. Record non-obvious choices with record_decision.
```

### sync-implementer

```markdown
---
name: sync-implementer
description: Writes or modifies synchronizations under src/syncs. Owns global wiring correctness across concepts.
tools: read, grep, ls, write, edit, bash, list_syncs, trace_sync, list_concepts, describe_concept, read_design_doc, run_verification, record_decision
model: <strong-coding>
---
1. Read the sync conventions with read_design_doc first. Follow the DSL exactly as documented in-repo.
2. Before writing, trace_sync every action you plan to consume or emit. Avoid double-firing and orphaned actions. State what you found.
3. Write syncs in src/syncs/**/*.sync.ts, one exported const per sync, named for what it does.
4. After writing, trace_sync again to confirm intended wiring, then run_verification({tier:"quick"}).

Never modify concept files. If a sync seems to need one, report why instead and record_decision.
```

### test-writer

```markdown
---
name: test-writer
description: Writes legible tests for concepts and syncs to the repo's testing conventions. Ensures full surface coverage.
tools: read, grep, ls, write, edit, bash, describe_concept, list_syncs, read_design_doc, run_verification
model: <mid>
---
1. Read the testing conventions with read_design_doc first.
2. For a concept: describe_concept to enumerate its full surface. Instantiate every concept under test with track(...) from the testing module named in design/index.json. Write <Name>Concept.test.ts with testAction(actionName, testName, fn) for every action case. Per action, include requires-violation case(s) asserted with expectError(...), and effects case(s) asserted via the concept's own queries. Per query, include a correctness case. Include one principle test executing the spec's principle trace with trace() narration.
3. For a sync: write sibling *.sync.test.ts with a positive case using setupSyncTest and a negative case whose name contains "does not" or "negative". Assert then-effects through concept queries.
4. Run run_verification({tier:"quick"}) and iterate until surface-coverage and sync-tests stages pass.

Tests must read as documentation: narrate intent, not just assert.
```

### reviewer

```markdown
---
name: reviewer
description: Adversarial review of a diff against specs and structural rules. Read-only. Returns a structured verdict.
tools: read, grep, ls, bash, list_concepts, describe_concept, list_syncs, trace_sync, read_design_doc, spec_lint
model: <strong-reasoning>
---
Input: a diff path or instruction to read git diff, plus context. When invoked by /ship, the task includes design/journal/runs/<runId>/events.jsonl; read it and consider gate hits, suppressions, and decisions. You cannot edit files.

Review for: spec conformance, concept independence and polymorphism, state minimality, sync wiring sanity, test honesty, and test legibility. Trace touched actions with trace_sync where useful.

Verdict format exactly:
VERDICT: APPROVE | REQUEST_CHANGES
ISSUES:
- [severity: blocker|major|minor] <file>: <issue> - <smallest concrete fix>
NOTES: <observations worth recording>

Bash is for read-only commands only: git diff/log and test commands if needed.
```

### scout

```markdown
---
name: scout
description: Fast read-only reconnaissance. Returns compressed, cited context for other agents.
tools: read, grep, ls, list_concepts, list_syncs, trace_sync, read_design_doc
model: <fast>
---
Answer the recon question with maximum compression: bullet facts, each with file path and line where useful. No speculation, no recommendations unless asked. Cap output at about 40 lines.
```

### frontend-implementer

```markdown
---
name: frontend-implementer
description: Implements frontend pages/components in frontend/ (Next.js + shadcn). Only used when frontend/ exists.
tools: read, grep, ls, write, edit, bash, list_syncs, read_design_doc, record_decision
model: <strong-coding>
---
Precondition: frontend/ exists. Otherwise refuse and say why.

1. Load the frontend-shadcn skill guidance. All backend interaction goes through frontend/src/lib/api.ts against Requesting endpoints. Never import from src/concepts or src/engine.
2. Use existing shadcn components before adding new ones. Keep pages in the app router structure.
3. Verify with bun run --cwd frontend build and lint before finishing.
```

---

## 6. Prompt Templates

Author prompt templates in pi prompt-template format after reading `docs/prompt-templates.md`. Required templates and exact flow constraints:

### /new-concept `<name-or-feature>`

1. Run `catalog_search` first.
2. If a catalog concept fits, run `catalog_show`, present it, ask whether to `catalog_copy`, and stop for confirmation.
3. If no catalog fit, spawn `spec-writer`.
4. Human checkpoint: show spec and wait for approval. In headless mode, write spec, print path, and stop.
5. Spawn `concept-implementer`.
6. Spawn `test-writer`.
7. Run `run_verification { tier: "quick" }`.
8. Summarize files, decisions, and next step `/ship`.

### /new-sync `<behavior>`

1. Scout maps involved concepts/actions.
2. Run `trace_sync` on every action to consume or emit.
3. Spawn `sync-implementer`.
4. Spawn `test-writer` for T5-shaped tests.
5. Run quick verification.

### /implement-feature `<desc>`

1. `spec-writer` decomposes into concepts and syncs.
2. Write `design/plans/<slug>.md` listing planned files and dependencies.
3. Human checkpoint.
4. Parallel `concept-implementer`s, at most 3, only for disjoint concept dirs.
5. Sequential `sync-implementer`.
6. `test-writer` sweep.
7. Quick verification.
8. Suggest `/ship`.

### /review `[scope]`

Run reviewer on current diff or supplied scope. Print verdict and journal a decision or review event.

### /ship

Template documents the command and invokes it. Actual behavior lives in WP5b.

---

## 7. End-To-End Acceptance Runbook

1. M1 form: copy `fixtures/valid-app` to a temp repo, start pi with harness loaded, run `/doctor` only if implemented or the static contract check otherwise. M3 form: `cdh init demo --yes`, tests green, contract validates, `/doctor` all PASS.
2. M1 form: manually prompt the base agent to create Upvote spec, implementation, and tests without orchestrator or templates. Required behavior: quick tier green, report.md with narrative, decisions, cost-or-unknown, and INDEX row. M2 form: use `/new-concept Upvote - users upvote items, one vote per user per item, ranked by count`.
3. Edit importing Sessioning inside UpvoteConcept. Expected: blocked with R1 fix message, `gate_blocked` journaled.
4. Remove `track()` from one concept test instantiation. Expected: `cdh verify --tier ship --no-review --no-ci` fails at `surface-coverage` with `track()` instruction. This is M1 exit item 4a. Restore. Remove `testAction()` or `expectError()` from one action test. Expected: T3 fails with exact action and helper instruction. Break typecheck. Expected: auto-fix loop fires exactly `autofixRetries` times then escalates.
5. M2: `/ship` with a planted pre-existing dirty file. Expected: preflight lists it and asks. After exclusion, commit contains only touched files and `Cdh-Run:` trailer. `--no-ci` respected. Review verdict appears in report.
6. M2: `/new-sync` cascade-delete behavior. Expected: T5-shaped tests and `trace_sync` shows it.
7. M3: `cdh init web --frontend --with auth --yes`. Expected: frontend builds, frontend skill active. Non-frontend repo has skill disabled.
8. M3: `/catalog-harvest Upvote` to writable extra path. Expected: registry updated and T7-style checks pass.
9. M3: `evals/run.ts --all`. Expected: 4/4 pass.

---

## 8. Tricky Spots And Required Handling

- Edit interception: evaluate post-edit content in memory. If unparseable, block only on textually visible cross-concept imports; otherwise allow save and rely on warning/verification.
- Runtime tracking: `track()` must be transparent for `this`, async returns, thrown errors, and nested calls. It must record only method calls; classification into action/query is done by verifier.
- Test attribution: do not guess Bun's current test name. Use `testAction()` context. WP0 must prove the chosen context implementation works with pinned Bun.
- Surface coverage after test failure: never report partial coverage as authoritative. Fail as inconclusive and include test failure summary.
- Changed tests: `tests:changed` is quick feedback only. Ship-local always runs `tests:all`.
- Feedback-loop safety: retry counter comes from journal events and is never reset by model output.
- Subagent trust: child sessions use trust flags recorded in `docs/pi-api-notes.md`. README documents `defaultProjectTrust` for CI runners.
- `/ship` safety: never use `git add -A`; add touched files only. Never silently include pre-existing dirty files.
- Bash gate: best-effort only. Do not present it as sandboxing.
- Journal failures: nonblocking during normal turns, ship-failing during ship-local verification.
- Windows and portability: use `Bun.spawn` argv arrays and `node:path`. Avoid shell-specific path logic in harness code.
- Frontend: preserve existing project design if present. Do not import backend concepts/engine into frontend.

---

## 9. Final Readiness Checklist

The plan is ready to implement only when these statements are true:

- The final npm package name is chosen.
- WP0 API probes cover every pi primitive used later.
- `docs/pi-api-notes.md` exists before WP1 implementation starts.
- `fixtures/valid-app` satisfies section 3.6 and uses `track()`, `testAction()`, and `expectError()`.
- R1 and R5 are the only in-loop blockers.
- R6-R9 are not suppressible.
- `cdh verify --tier ship` is local verification by default and never mutates git.
- `/ship` has preflight, confirmation, touched-files-only add, trailer, and CI skip path.
- M1 can be completed without orchestrator, frontend, init, PR creation, or CI.
- M2 can add orchestration and shipping without changing M1 contracts.
- M3 can add init/frontend/doctor/evals without changing M1/M2 contracts.
