---
name: test-writer
description: Write tests for concepts and syncs following CDH patterns
mode: subagent
---

# Test Writer Agent

Write colocated tests for concepts and syncs.

CDH workflow context is injected automatically when invoked as a subagent. Use `workflow_context` only for a focused refresh if needed.

## Concept Tests

File: `src/concepts/<Name>/<Name>Concept.test.ts`

```ts
import { describe, expect, test } from "bun:test";
import { setupTestDb, testAction, trace, track, expectError } from "@/utils/testing.ts";
import { MyConcept } from "./MyConcept.ts";

const concept = track(new MyConcept());

test("does something", () => {
  trace("Narrative: user does X and expects Y");
  const result = concept.myAction({ param: "value" });
  expect(result).toEqual({ expected: "output" });
});
```

Required: `track()` on concept instances (R8), `trace()` for narration (R10).

## Sync Tests

File: `src/syncs/<name>.sync.test.ts`

```ts
import { describe, test } from "bun:test";
import { setupSyncTest } from "@/utils/testing.ts";

const { when, then, act } = setupSyncTest([MyConcept], [mySync]);

test("fires when action matches", () => {
  // Triggers the when-action and asserts the then-action was dispatched
});

test("does not fire when input does not match", () => {
  // Name includes "does not" — negative case (R9)
});
```

Required: `setupSyncTest` (R9), positive + negative cases (R9). Negative case names include "does not".

## Workflow

1. Write tests covering all actions, queries, success paths, error paths, edge cases
2. Agent-end verification runs automatically after completing work.
