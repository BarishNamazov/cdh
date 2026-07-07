# Concept Testing

Testing concepts involves primarily:
1. Confirming that for each action:
    - **requires** is satisfied: test cases that do not fulfill the requirement should return `{ error: "..." }`
    - **effects** is satisfied: after the action is performed, verify that the state changed according to the effect
2. Ensuring that the **principle** is fully modeled by the actions:
    - Demonstrate that the series of actions described in the **principle**, when performed, result in the specified behavior or updates to state.

## Test File Location

Tests live next to the concept as `src/concepts/{Name}/{Name}Concept.test.ts`.

## Test Setup

Use the `setupTestDb` helper from the testing module (configured in `design/index.json`). Tests run on Bun's built-in test runner (`bun test`).

```typescript
import { afterAll, describe, expect, test } from "bun:test";
import { setupTestDb } from "@utils/testing.ts";
import LabelingConcept from "./LabelingConcept.ts";

const mongo = await setupTestDb();
const labeling = new LabelingConcept(mongo.db);

afterAll(() => mongo.stop());

describe("Labeling", () => {
  test("addLabel adds a label to an item", () => {
    // ... arrange, act, assert
  });
});
```

## Surface Coverage with track()

Every concept under test must be wrapped with `track()` to enable CDH's surface coverage verification:

```typescript
import { track, testAction, expectError } from "@utils/testing.ts";

const labeling = track(new LabelingConcept(db));
```

`track()` returns a transparent proxy that records every method call. The `surface-coverage` stage checks that every action and query is exercised by tests.

## Per-Action Testing with testAction()

```typescript
testAction("addLabel", "rejects empty item", () => {
  const result = labeling.addLabel({ item: "", user: "alice", text: "urgent" });
  expectError(result);
});
```

## Error Assertions with expectError()

Use `expectError(result)` to verify that an action's requires condition is properly enforced. This records an `errorAssertion` for CDH's T3 check.

## Legible Testing with trace()

Principle tests and tests involving multiple actions should narrate intent using `trace()`:

```typescript
test("principle: label, then inspect", () => {
  trace("A user labels an item, then inspects that item's labels.");

  const result = labeling.addLabel({ item: "post-1", user: "alice", text: "urgent" });
  expect(result.id).toBeDefined();

  const labels = labeling._getLabels({ item: "post-1" });
  expect(labels).toHaveLength(1);
  expect(labels[0].text).toBe("urgent");
});
```

CDH's R10 rule requires `trace()` or `console.log` narration in principle tests and tests using `testAction()`.

## Test Shape Requirements

| Requirement | CDH Rule |
|---|---|
| Concept has colocated test file | R7 |
| Test wraps concept with `track()` | R8 |
| Each action has a requires/error case using `expectError()` | T3 |
| Each action has an effects case verified through queries | T3 |
| Principle test with `trace()` narration | R10 |
| Multi-action tests with `trace()` narration | R10 |
