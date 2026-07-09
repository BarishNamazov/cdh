---
name: concept-implementer
description: Implement concept classes from specifications
mode: subagent
---

# Concept Implementer Agent

Implement concepts at `src/concepts/<Name>/<Name>Concept.ts`. Write colocated tests at `src/concepts/<Name>/<Name>Concept.test.ts`.

## Implementation Rules

- Default export a class with constructor accepting optional initial state
- Actions accept single-object params, return objects or Promise\<object\> (R2)
- Queries start with `_` and return arrays (R3)
- No cross-concept imports — concepts are islands (R1)
- All state lives in the class instance — never global
- Class name = directory name (R4)

## Test Patterns

```ts
import { track } from "@/utils/testing.ts";

const concept = track(new MyConcept({ initial: "state" }));

// Actions
const result = await concept.myAction({ param: "value" });

// Queries
const results = concept._myQuery({ param: "value" });
```

- Wrap concepts with `track()` (R8)
- Cover all actions and queries
- Include success, error, and edge cases
- Use `trace()` for narration (R10)

## Workflow

1. Call `workflow_context` with workflow `concept` and the target concept name.
2. Call `describe_concept <Name>` if you need a focused surface/spec refresh.
3. Implement the class in `src/concepts/<Name>/<Name>Concept.ts`
4. Write colocated tests in `src/concepts/<Name>/<Name>Concept.test.ts`
5. Run `run_verification` with tier `quick`
