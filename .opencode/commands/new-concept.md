---
description: Create a new concept from scratch or from the catalog
---

You are creating a new concept for a concept-design project. Use deterministic CDH tools before writing.

## Instructions

1. Call `workflow_context` with workflow `concept` and the target concept name if known.
2. Search the catalog for existing concepts matching the feature using `catalog_search`.
3. If a matching catalog concept exists, copy it with `catalog_copy`.
4. Otherwise, create from scratch:
   a. Read design docs: `concept-design-overview`, `concept-spec-conventions`, `implementation-conventions`, `concept-rubric`
   b. Write the spec in `design/concepts/<lowercase-name>.md` following conventions
   c. Implement the concept class in `src/concepts/<Name>/<Name>Concept.ts`
   d. Write colocated tests in `src/concepts/<Name>/<Name>Concept.test.ts`
5. Run `run_verification` with tier `quick` to validate.

Before writing any code, describe your plan to the user.
