---
name: concept-workflow
description: Step-by-step workflow for implementing new concepts in a CDH repo
---

# Concept Implementation Workflow

Follow this workflow when implementing a new or modifying an existing concept.

## Steps

1. **Search catalog first**: Call `catalog_search` to see if a matching concept exists. If found, call `catalog_show` to inspect it.

2. **Read design docs**: Call `read_design_doc` with keys:
   - `concept-design-overview` — overall approach
   - `concept-spec-conventions` — spec formatting
   - `implementation-conventions` — code conventions
   - `concept-rubric` — quality rubric
   - `concept-state-ssf` — state foundations

3. **Inspect existing concepts**: Call `list_concepts` and `describe_concept` on related concepts to understand surface patterns.

4. **Write spec first**: Create the `design/concepts/<name>.md` spec following the conventions. Define actions, queries, state shape, requires, effects, and errors.

5. **Implement the concept class**: Create `src/concepts/<Name>/<Name>Concept.ts`:
   - Default export a class
   - Actions return objects/Promises, accept single object params
   - Queries start with `_` and return arrays
   - No cross-concept imports
   - No hidden state — all state lives in the class instance

6. **Write colocated tests**: Create `src/concepts/<Name>/<Name>Concept.test.ts`:
   - Use `setupTestDb`, `trace`, `track`, `testAction`, `expectError`
   - Cover all actions and queries
   - Include success, error, and edge cases

7. **Verify**: Call `run_verification` with tier `quick`. Fix any failures.

## Rules
- R1: No cross-concept imports in concept files
- R6: Every concept has a spec with required sections
- R7: Every concept has a colocated test file
- R10: Tests use trace() or console.log for narration
