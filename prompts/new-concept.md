---
label: New Concept
description: Create a new concept from scratch or from the catalog
---

# /new-concept <name-or-feature>

You are creating a new concept for a concept-design project. Follow the concept-workflow skill.

## Instructions

1. Search the catalog for existing concepts matching the feature using `catalog_search`.
2. If a matching catalog concept exists, copy it with `catalog_copy`.
3. Otherwise, create from scratch:
   a. Read design docs: `concept-design-overview`, `concept-spec-conventions`, `implementation-conventions`, `concept-rubric`
   b. Write the spec in `design/concepts/<lowercase-name>.md` following conventions
   c. Implement the concept class in `src/concepts/<Name>/<Name>Concept.ts`
   d. Write colocated tests in `src/concepts/<Name>/<Name>Concept.test.ts`
4. Run `run_verification` with tier `quick` to validate.

Before writing any code, describe your plan to the user.
