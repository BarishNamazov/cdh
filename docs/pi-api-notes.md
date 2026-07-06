# Pi API Notes

Status: WP0 complete enough to unblock WP1, with one documented pi API exception. Documentation review completed against `@earendil-works/pi-coding-agent` 0.80.3 cloned from `https://github.com/earendil-works/pi` on 2026-07-06. A persistent SDK scripted-session proof now confirms command registration, custom tool registration and execution, `tool_call` blocking, `tool_result` mutation, `before_agent_start` system prompt mutation, `agent_end` observation, follow-up queueing and retrigger, custom entry append, status/widget API calls, session-file persistence, and child-session subprocess usage capture. Runtime confirms `registerEntryRenderer` is missing in the installed 0.80.3 npm package despite appearing in cloned source docs; use `registerMessageRenderer` or defer entry renderers until a pi version exposes `registerEntryRenderer` publicly.

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
- Entry renderer: cloned source docs and source code expose `pi.registerEntryRenderer(customType, (entry, { expanded }, theme) => Component)`, but installed npm package `@earendil-works/pi-coding-agent@0.80.3` does not expose that method in `dist/core/extensions/types.d.ts`, and `bun run spike:pi` confirms it is absent at runtime. Later WP11 renderer work must either pin a pi version that exposes `registerEntryRenderer`, use `registerMessageRenderer` for context-bearing custom messages, or explicitly defer entry renderers.
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

## Scripted Proof Confirmed

- `bun run spike:pi` uses `createAgentSession`, `DefaultResourceLoader.additionalExtensionPaths`, and `SessionManager.create(cwd, sessionDir)` to load `extensions/spike-probes.ts`.
- The proof verifies the registered SDK tool list includes `cdh_spike_echo`.
- The proof sends `/cdh-spike sdk-proof`, which executes without model credentials because the extension command handles the prompt before an LLM call.
- The proof sends `/cdh-spike-followup`, which queues `CDH follow-up retrigger probe` through `pi.sendUserMessage(..., { deliverAs: "followUp" })`; the faux provider verifies that queued prompt retriggers the agent loop.
- The proof registers a faux provider/model from `@earendil-works/pi-ai/compat`, drives a real tool turn for `cdh_spike_echo`, and verifies the custom tool's result is modified by the `tool_result` hook.
- The proof drives a faux `bash` tool call containing `cdh-spike-block` and verifies the `tool_call` hook blocks it and journals `tool_call_block`.
- The faux provider response factory verifies the provider context includes `CDH WP0 spike probe loaded.`, proving `before_agent_start` system-prompt mutation.
- The proof verifies `agent_end` appends `cdh:spike` entries.
- The proof verifies `ctx.ui.setStatus` and `ctx.ui.setWidget` are callable in the SDK context by journaling `ui_status_widget_called`. Visual TUI rendering still belongs to later UI tests.
- Pi's SessionManager intentionally defers session-file creation until the first assistant message. The faux model turns create that durable boundary; the proof then reopens the concrete session file under `.wp0-cache/pi-spike-proof/sessions/` and verifies `cdh:spike` entries persisted.
- The parent proof spawns a child process with `Bun.spawn(["bun", "run", "scripts/wp0-pi-spike-proof.ts", "--child"], ...)`, parses the child's JSON summary, and verifies assistant usage was captured from the child session. This replaces the missing `examples/extensions/subagent/` path for WP0's child-session proof.

## Deferred Or Version-Blocked Items

- Visual TUI rendering for status/widget should be covered when M2/M11 UI renderers are implemented.
- Entry renderers are blocked on pi exposing `registerEntryRenderer` in the installed npm runtime, or on changing WP11 to use message renderers.
- Verify TUI scripted testing with tmux or SDK/RPC harness; the cloned repo's `AGENTS.md` documents tmux startup with `./pi-test.sh`.
