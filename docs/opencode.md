# CDH → OpenCode Migration Plan

This document evaluates migrating CDH from **pi** (`@earendil-works/pi-*`) to **OpenCode**
(`opencode-ai`) and lays out a concrete implementation plan.

---

## Summary

Moving CDH to OpenCode is a **net positive**: the port drops ~500 lines of subagent
orchestration/spawning code while gaining native subagent session navigation, a web UI,
a desktop app, an IDE extension, and a more mature permission system. The core business
logic (`src/`) has zero pi dependencies and stays unchanged.

**Estimated effort:** 3–5 days.

---

## What stays (core business logic — zero changes needed)

Every file in `src/` is pi-agnostic and ports as-is:

| Layer | Files | Purpose |
|---|---|---|
| Config | `config.ts` | TypeBox schema, `.pi/cdh.json` loader (rename path only) |
| Repo contract | `repo-contract.ts` | `design/index.json` validation |
| Rules | `rules/*.ts` | R1–R10 rule engine, suppressions |
| Concepts | `repo-model/concepts.ts` | ts-morph concept class discovery |
| Syncs | `repo-model/syncs.ts` | ts-morph sync DSL extraction |
| Journal | `journal/*.ts` | JSONL event journal, report generator |
| Verify | `verify/*.ts` | 7-stage verification pipeline |
| Tools | `tools/*.ts` | describe-concept, list-syncs, trace-sync, etc. |
| Ship | `ship/*.ts` | Git snapshot, commit, branch, push, PR |
| Catalog | `catalog-lib.ts` | Catalog copy-and-rename logic |
| Init | `init.ts` | Project scaffolding (pip-free) |
| CLI | `bin/cdh.ts` | All 16 CLI commands (pip-free already) |

---

## What changes: the extension layer

### 1. Custom tools (17 tools → `.opencode/tools/`)

**pi pattern:**
```typescript
import { Type } from "typebox";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.registerTool({
    name: "list_concepts",
    description: "List all concepts in the project",
    parameters: Type.Object({ ... }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const result = listConcepts(ctx.cwd);
      return { content: [{ type: "text", text: result }], details: {} };
    },
  });
}
```

**OpenCode pattern:**
```typescript
import { tool } from "@opencode-ai/plugin";
import { z } from "zod";

export default tool({
  description: "List all concepts in the project",
  args: {
    filter: z.string().optional().describe("Optional name filter"),
  },
  async execute(args, context) {
    const result = listConcepts(context.worktree);
    return result;
  },
});
```

**Migration table:**

| pi extension file | Tools | OpenCode file |
|---|---|---|
| `extensions/concept-tools.ts` | `list_concepts`, `describe_concept`, `list_syncs`, `trace_sync`, `read_design_doc`, `spec_lint`, `sync_graph`, `sync_diagnostics` | `.opencode/tools/concept-tools.ts` (multi-export) or 8 individual files |
| `extensions/verification.ts` | `run_verification`, `record_decision` | `.opencode/tools/verification.ts` |
| `extensions/catalog.ts` | `catalog_search`, `catalog_show`, `catalog_copy` | `.opencode/tools/catalog.ts` |
| `extensions/init.ts` | `cdh_init` | `.opencode/tools/init.ts` |

Diffs: TypeBox → Zod, `ctx.cwd` → `context.worktree`, `{ content, details }` → plain string return.

### 2. Subagents (drops `orchestrator.ts` entirely)

OpenCode has **native subagents** with markdown configs, child sessions, permission
system, and session tree navigation. This replaces the entire `orchestrator.ts` (480
lines: `spawn("pi", ...)` + JSONL parsing + orchestration logic).

**Current CDH agents → OpenCode subagents:**

```markdown
# .opencode/agents/spec-writer.md
---
mode: subagent
description: Writes design specs for new Concepts following R1-R4 rules
permission:
  edit: allow
  bash: allow
---
You are a CDH spec writer. Your responsibilities:
- Produce a design doc at design/{concept-name}/design.md
- Follow architecture rules R1-R4
- Register the concept in design/index.json
- Available tools: list_concepts, describe_concept, read_design_doc, spec_lint
```

All 6 CDH agents (spec-writer, concept-implementer, sync-implementer, test-writer,
reviewer, scout) become `.opencode/agents/*.md` files. The frontmatter format is
identical (YAML between `---` fences). The `permission` field lets you lock down
the reviewer and scout to read-only natively — no code needed.

**What this gets you that `orchestrator.ts` couldn't:**

- **Session tree navigation:** `session_child_first` / `session_parent` keybinds
  let you zoom into any subagent's child session, browse its output, and return.
  This is the "zoom into subagent" feature you wanted.
- **Parallel invocation:** The primary agent can invoke multiple subagents
  concurrently via the `task` tool — equivalent to CDH's `parallel` mode, but
  with proper session isolation.
- **Permission-gated agents:** reviewer/scout have `edit: deny` by default.
  No code required.
- **Model per agent:** Each subagent can use a different model (e.g., Haiku
  for scout, Sonnet for implementer).

### 3. Gate policy (drops `gates.ts`)

**pi pattern (38 lines of hooks):**
```typescript
pi.on("tool_call", async (event, ctx) => {
  if (event.toolName === "write" && event.input.filePath.includes(".env"))
    return { block: true, reason: "Protected path" };
});
```

**OpenCode pattern (config only, zero code):**
```json
{
  "permission": {
    "edit": {
      ".env": "deny",
      ".env.*": "deny",
      "node_modules/**": "deny",
      "*": "allow"
    },
    "bash": {
      "rm -rf *": "deny",
      "sudo *": "ask",
      "*": "allow"
    }
  }
}
```

`gates.ts` is deleted. Permission config replaces it entirely with glob-pattern
matching.

### 4. Verification hook (replaces `verification.ts` hooks)

The `pi.on("agent_end")` hook that auto-runs verification becomes an OpenCode
plugin hook:

```typescript
// .opencode/plugins/cdh-verification.ts
import type { Plugin } from "@opencode-ai/plugin";

export const CdhVerification: Plugin = async (ctx) => {
  return {
    "session.idle": async (event) => {
      await ctx.$.cwd(ctx.directory)`npx tsx bin/cdh.ts verify`;
    },
  };
};
```

Or use the compaction hook to inject verification context:

```typescript
"experimental.session.compacting": async (input, output) => {
  output.context.push(`## CDH Verification State
Run \`npx tsx bin/cdh.ts verify\` before declaring work complete.`);
};
```

### 5. Configuration paths

| pi path | OpenCode path | Notes |
|---|---|---|
| `.pi/settings.json` | `opencode.json` | Package refs → plugins/tools config |
| `.pi/cdh.json` | `.opencode/cdh.json` | Just rename, same JSON |
| `extensions/*.ts` | `.opencode/tools/*.ts` + `.opencode/plugins/*.ts` | Split into tools and plugins |
| `agents/*.md` | `.opencode/agents/*.md` | Same format, richer options |
| `skills/*.md` | `.opencode/skills/*/SKILL.md` | Needs SKILL.md rename + wrapper dir |
| `prompts/*.md` | `.opencode/commands/*.md` | Needs frontmatter wrapper |
| `templates/AGENTS.md` | `AGENTS.md` (project root) | Same content, picked up natively |

### 6. Skills

CDH's 4 skills use pi's `/skill:name` invocation pattern. OpenCode skills are
loaded on-demand via a `skill` tool call — the agent decides when to load them
rather than having them expanded into every system prompt.

```markdown
# .opencode/skills/concept-workflow/SKILL.md
---
name: concept-workflow
description: Step-by-step guide for implementing a new CDH concept
---
## Steps
1. Read the concept's design doc via `read_design_doc`
2. Implement the class following R1-R4 rules
3. Register in `design/index.json`
4. Run verification with `run_verification`
```

### 7. Commands

CDH's 7 prompt templates become OpenCode commands with shell injection:

```markdown
# .opencode/commands/new-concept.md
---
description: Scaffold a new CDH concept
agent: build
---
Scaffold a new concept named $ARGUMENTS:
!`npx tsx bin/cdh.ts list-concepts`

Follow the concept-workflow skill. Create:
1. design/$ARGUMENTS/design.md
2. src/concepts/$ARGUMENTS.ts (implementing the Concept interface)
3. Register in design/index.json
```

---

## What you gain

| Feature | pi | OpenCode |
|---|---|---|
| Subagent session tree | Not possible | Built-in (`session_child_*` keybinds) |
| Web UI | Needs pi-web (3rd party) | Built-in (`opencode serve`) |
| Desktop app | None | macOS + Windows + Linux |
| IDE extension | None | VS Code (opencode extension) |
| Permission system | Custom hooks (code) | Declarative config (zero code) |
| Skills loading | Always in prompt (wastes tokens) | On-demand via `skill` tool |
| Plugin ecosystem | Minimal | npm-installable, community contributions |
| MCP support | None | Built-in |
| Remote config | None | `.well-known/opencode` endpoint |
| Config merge | Manual | Multi-layer merge (remote → global → project) |
| Commands with shell | Prompt templates only | `!`command``, `@file`, `$ARGUMENTS` |
| Per-agent models | Manual spawn flags | Native `model` field per agent |
| Managed/MDM config | None | Full support |

---

## What you lose

| Feature | Impact | Mitigation |
|---|---|---|
| Concatenated AGENTS.md walking | pi concatenates all AGENTS.md up the tree; OpenCode takes first match only | Use `instructions: ["**/AGENTS.md"]` in opencode.json |
| `SYSTEM.md` / `APPEND_SYSTEM.md` | pi's custom system prompt files | Use agent-specific `prompt` field or global instructions |
| TypeBox schemas | CDH tools use TypeBox | Migrate to Zod (syntax-only change, ~30 min for all 17 tools) |
| `parseFrontmatter` from pi-coding-agent | Used in orchestrator.ts to parse agent markdown | Agent markdown is now natively parsed by opencode; no code needed |
| pi CLI flags (`--print --mode json --no-session`) | Used for subagent spawning | Replaced entirely by native subagent system |

---

## Implementation steps

### Phase 1: Configuration (day 1)

1. Create `opencode.json` in project root
2. Move `.pi/cdh.json` → `.opencode/cdh.json`, update load path in `src/config.ts`
3. Add `instructions` array to pull in design docs and conventions
4. Configure `permission` block to replicate gate-policy.ts rules
5. Verify with `opencode` CLI that config loads

### Phase 2: Agents (day 1)

1. Port 6 agent markdown files from `agents/*.md` → `.opencode/agents/*.md`
2. Add `mode: subagent`, `description`, `permission` to each frontmatter
3. Test agent invocation via `/task` or `@agent-name`

### Phase 3: Tools (day 2)

1. Port 17 tools from `extensions/*.ts` → `.opencode/tools/*.ts`
2. Convert TypeBox schemas → Zod schemas
3. Replace `ctx.cwd` → `context.worktree`
4. Replace `{ content, details }` return → string return
5. Test each tool from an opencode session

### Phase 4: Plugins (day 2)

1. Create `.opencode/plugins/cdh-verification.ts` for auto-verification
2. Wire up `session.idle` or `tool.execute.after` hooks
3. Remove `extensions/verification.ts` hooks (keep `run_verification` tool)

### Phase 5: Skills & commands (day 3)

1. Port 4 skills → `.opencode/skills/*/SKILL.md`
2. Port 7 prompt templates → `.opencode/commands/*.md`
3. Test `/skill:concept-workflow` → `skill` tool invocation
4. Test `/new-concept` command with shell output injection

### Phase 6: Removal (day 3)

1. Remove `package.json` `"pi"` section
2. Remove `extensions/orchestrator.ts` (480 lines)
3. Remove `extensions/gates.ts` (38 lines)
4. Remove `.pi/` directory
5. Remove `@earendil-works/pi-*` dependencies from `package.json`
6. Remove `@sinclair/typebox` (replaced by Zod)
7. Remove `spike-probes.ts` and `wp0-pi-spike-proof.ts` (pi-specific tests)

### Phase 7: Documentation (day 4)

1. Write new `AGENTS.md` at project root for opencode context
2. Update README install instructions (pi → opencode)
3. Add `opencode.json` schema reference
4. Update contributing guide

### Phase 8: Testing (days 4–5)

1. End-to-end: scaffold a concept-design repo, implement a concept + sync
2. Verify all 7 verification stages pass
3. Test subagent orchestration (spec-writer → implementer → reviewer chain)
4. Test session tree navigation (zoom into child sessions)
5. Test permission gating (blocked `.env` writes, dangerous bash)
6. Test web UI (`opencode serve`)
7. Run `bin/cdh.ts` CLI commands independently

---

## File changes summary

| Action | Files | LOC delta |
|---|---|---|
| **New** | `opencode.json`, `.opencode/cdh.json` | ~40 lines |
| **New** | `.opencode/tools/*.ts` (17 tools) | ~400 lines (ported) |
| **New** | `.opencode/agents/*.md` (6 agents) | ~200 lines (ported) |
| **New** | `.opencode/plugins/cdh-verification.ts` | ~30 lines |
| **New** | `.opencode/skills/*/SKILL.md` (4 skills) | ~80 lines (ported) |
| **New** | `.opencode/commands/*.md` (7 commands) | ~100 lines (ported) |
| **Delete** | `extensions/orchestrator.ts` | −480 lines |
| **Delete** | `extensions/gates.ts` | −38 lines |
| **Delete** | `extensions/concept-tools.ts` | −202 lines |
| **Delete** | `extensions/verification.ts` | −103 lines |
| **Delete** | `extensions/catalog.ts` | −167 lines |
| **Delete** | `extensions/init.ts` | −57 lines |
| **Delete** | `extensions/spike-probes.ts` | −84 lines |
| **Modify** | `src/config.ts` (path rename only) | ~2 lines |
| **Modify** | `package.json` (remove pi deps, add zod) | ~10 lines |
| **Net** | | **~−750 lines** (more deleted than added) |

---

## References

- [OpenCode docs](https://opencode.ai/docs)
- [OpenCode agents](https://opencode.ai/docs/agents)
- [OpenCode plugins](https://opencode.ai/docs/plugins)
- [OpenCode custom tools](https://opencode.ai/docs/custom-tools)
- [OpenCode permissions](https://opencode.ai/docs/permissions)
- [OpenCode skills](https://opencode.ai/docs/skills)
- [OpenCode commands](https://opencode.ai/docs/commands)
