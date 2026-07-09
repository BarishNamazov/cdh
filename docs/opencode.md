# OpenCode Integration

CDH integrates with OpenCode through project-scaffolded agents, tools, commands, and a verification plugin. The integration is deterministic: workflow context is assembled by TypeScript tools from repo state and versioned docs.

## Install

```bash
bun add @mit-sdg/cdh @mit-sdg/sync-engine
bunx --package @mit-sdg/cdh cdh init
bun install
opencode
```

`cdh init` creates:

- `opencode.json` with safe default permissions and CDH instructions.
- `opencode.json` loads CDH as an npm plugin: `"plugin": ["@mit-sdg/cdh"]`.
- `.opencode/cdh.json` with CDH paths, rules, verification stages, and ship settings.
- `.opencode/agents/*.md` and `.opencode/commands/*.md` for guided OpenCode usage.

Restart OpenCode after running `cdh init`; OpenCode loads config, tools, agents, and plugins at startup.

## Deterministic Context

Use `workflow_context` instead of workflow skills.

Examples:

```text
workflow_context({ workflow: "concept", concept: "Labeling" })
workflow_context({ workflow: "sync", actions: ["Requesting.request", "Labeling.addLabel"] })
workflow_context({ workflow: "review" })
```

The tool injects:

- Static background docs from the installed CDH package.
- Concept summaries and focused concept specs/surfaces.
- Sync lists, action traces, graph reports, and diagnostics for sync workflows.
- Verification stage config from `.opencode/cdh.json`.

For the same repo and inputs, the returned context is the same. Agents can still reason and edit, but context selection is not delegated to a skill-selection LLM step.

## Agent-End Verification

The `@mit-sdg/cdh` OpenCode plugin listens for `session.idle` and runs `runVerification` directly from package TypeScript. It does not shell out to `tsx` or ask an LLM whether to verify.

The quick stages come from:

```json
{
  "verify": {
    "onAgentEnd": ["typecheck", "rules:changed"]
  }
}
```

Unknown stage names fail explicitly. Full ship checks come from `verify.onShipLocal` and are run by `run_verification` tier `ship` or `cdh ship`.

## Tools

Core tools:

- `workflow_context`: deterministic workflow prompt context.
- `list_concepts`, `describe_concept`, `spec_lint`: concept inspection.
- `list_syncs`, `trace_sync`, `sync_graph`, `sync_diagnostics`: sync inspection.
- `read_design_doc`: focused background docs.
- `run_verification`: quick or ship verification.
- `record_decision`: append a journal decision event.
- `catalog_search`, `catalog_show`, `catalog_copy`: built-in catalog access.
- `cdh_init`: scaffold CDH in the current worktree.

## Updating Existing Projects

Run `cdh init` again after upgrading CDH. Existing files are skipped, so review skipped paths and copy any desired updated `.opencode` files manually if your project customized them.

After editing `opencode.json`, `.opencode/agents`, or `.opencode/commands`, quit and restart OpenCode.
