# Deterministic Agent Workflows

CDH agents should not rely on skills or memory to decide what context matters. They should request deterministic context from tools, then make edits.

## Standard Flow

1. Call `workflow_context` with the workflow kind: `concept`, `sync`, `test`, `review`, `debug-sync`, or `frontend`.
2. Use the returned static docs and dynamic repo state as the starting prompt context.
3. Read focused files only when the context points to them.
4. Make the smallest correct changes.
5. Run `run_verification` with the workflow's recommended tier.

## Why This Exists

OpenCode skills are selected by an LLM and can change the prompt path between runs. `workflow_context` is deterministic: the workflow kind, repo contract, concept specs, sync traces, graph diagnostics, and verification config produce the same context for the same inputs.

## Workflow Inputs

- `concept`: include when creating or modifying a specific concept.
- `actions`: include `Concept.action` refs when implementing or debugging syncs.
- `includeDocs`: set to false only when the caller already has the relevant docs in context.

## Required Agent Behavior

- Do not import one concept from another concept.
- Do not invent sync graph state; use `trace_sync`, `sync_graph`, or `workflow_context`.
- Do not declare work complete until deterministic verification has run.
- Record non-obvious design decisions with `record_decision`.
