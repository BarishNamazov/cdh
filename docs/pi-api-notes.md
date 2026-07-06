# Pi API Notes

Status: WP0 in progress. Documentation review completed against `@earendil-works/pi-coding-agent` 0.80.3 cloned from `https://github.com/earendil-works/pi` on 2026-07-06. Scripted-session proof is still pending before WP0 can be marked complete.

## Package And Imports

- Extension package: `@earendil-works/pi-coding-agent` version `0.80.3`.
- Typebox package used by pi extension examples: `typebox` version `1.1.38`.
- TUI components for renderers: `@earendil-works/pi-tui` version `0.80.3`.
- CDH pins these as dev dependencies and declares them as peer dependencies because pi bundles core extension packages for runtime.

## Confirmed From Docs

- Extension factory: default export `function (pi: ExtensionAPI) { ... }`; async factories are awaited before startup.
- Register command: `pi.registerCommand("name", { description, handler: async (args, ctx) => { ... } })`.
- Register tool: `pi.registerTool({ name, label, description, parameters: Type.Object(...), async execute(toolCallId, params, signal, onUpdate, ctx) { return { content, details }; } })`.
- Tool call interception: `pi.on("tool_call", handler)` runs before execution. `event.input` is mutable. Returning `{ block: true, reason?: string }` blocks execution.
- Tool result modification: `pi.on("tool_result", handler)` can return partial patches `{ content, details, isError }`.
- Custom entries: `pi.appendEntry(customType, data)` persists non-context custom entries. Re-read through `ctx.sessionManager.getEntries()` where `entry.type === "custom"` and `entry.customType` matches.
- Entry renderer: cloned source docs and source code expose `pi.registerEntryRenderer(customType, (entry, { expanded }, theme) => Component)`, but installed npm package `@earendil-works/pi-coding-agent@0.80.3` does not expose that method in `dist/core/extensions/types.d.ts`. Treat entry rendering as pending runtime verification before relying on it.
- Widget/status UI: `ctx.ui.setStatus(id, text)` and `ctx.ui.setWidget(id, lines)`.
- Follow-up user message: `pi.sendUserMessage(content, { deliverAs: "followUp" })`; when idle, `pi.sendUserMessage(content)` immediately triggers a turn.
- System prompt hook: `pi.on("before_agent_start", (event, ctx) => ({ systemPrompt: event.systemPrompt + "..." }))`.
- Package manifest: `package.json` supports `pi.extensions`, `pi.skills`, `pi.prompts`, and `pi.themes`; paths are relative to package root and may include globs/exclusions.
- Resource filtering in settings: package entries can be objects like `{ "source": "npm:my-package", "extensions": [], "skills": ["skill-name"], "prompts": ["prompts/review.md"] }`; omitted keys load all of that resource type, `[]` loads none.
- Project trust: non-interactive runs need saved trust, `defaultProjectTrust: "always"`, `--approve`, or equivalent to load project-local settings and packages.
- SDK session creation: `createAgentSession`, `createAgentSessionRuntime`, `SessionManager`, `DefaultResourceLoader`, and run modes are exported from `@earendil-works/pi-coding-agent`.
- CLI export exists: `/export [file]` and `--export <in> [out]` export sessions to HTML/JSONL.

## Discrepancies Or Open Items

- The plan references `examples/extensions/subagent/`, but that path is absent from the current pi repo snapshot. Available docs describe SDK/runtime session creation and `scripts/session-transcripts.ts` demonstrates spawning `pi --mode json` subprocesses for subagent-like analysis. M2 WP7 must use the SDK/runtime API or CLI JSON/RPC pattern rather than the missing example path unless a later pi version restores it.
- Programmatic HTML export is implemented internally (`src/core/export-html`) and exposed through `/export`/`--export`, but it is not listed in the public SDK exports in `src/index.ts`. Treat direct programmatic HTML export as unavailable unless a later version exports it; reports should copy the session file and note that users can run `/export` or `pi --export`.
- `pi config` is documented for enabling/disabling resources, but the docs do not spell out command syntax for individual resource toggles. Use package object filtering in `.pi/settings.json` for deterministic enable/disable behavior until CLI syntax is tested.

## Probe Extension

`extensions/spike-probes.ts` now exercises the documented signatures for command registration, custom tool registration, session restoration, system prompt modification, tool call blocking, tool result modification, widget/status UI, and `agent_end` observation. Entry rendering remains pending because installed package types disagree with cloned source docs.

## Scripted Proof Still Required

- Run pi with `-e ./extensions/spike-probes.ts` and verify `/cdh-spike` appends and restores a `cdh:spike` entry.
- Call `cdh_spike_echo` in an agent turn and verify `tool_result` appends `CDH spike tool_result observed.`.
- Run a bash command containing `cdh-spike-block` and verify it is blocked with the spike reason.
- Verify `before_agent_start` adds `CDH WP0 spike probe loaded.` to the turn system prompt.
- Verify `ctx.ui.setStatus` and `ctx.ui.setWidget` render in TUI mode.
- Verify whether `pi.registerEntryRenderer` is available at runtime despite missing npm package types; if unavailable, use custom message renderers or defer entry renderers until a pi version with public types is pinned.
- Verify follow-up user-message retrigger behavior with `pi.sendUserMessage(..., { deliverAs: "followUp" })`; add this to the probe once a deterministic scripted session is available.
- Verify child-session/subagent execution through SDK runtime or CLI JSON/RPC, since the documented subagent example path is missing.
- Verify TUI scripted testing with tmux or SDK/RPC harness; the cloned repo's `AGENTS.md` documents tmux startup with `./pi-test.sh`.
