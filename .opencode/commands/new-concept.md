---
description: Create a new concept from scratch or from the catalog
---

You are creating a new concept for a concept-design project. CDH workflow context is provided. Use deterministic CDH tools for focused lookups when needed.

## Instructions

1. Search the catalog for existing concepts matching the feature using `catalog_search`.
2. If a matching catalog concept exists, copy it with `catalog_copy`.
3. Otherwise, create from scratch:
   a. Read design docs only if needed: `concept-design-overview`, `concept-spec-conventions`, `implementation-conventions`
   b. Write the spec in `design/concepts/<lowercase-name>.md` following conventions
   c. Implement the concept class in `src/concepts/<Name>/<Name>Concept.ts`
   d. Write colocated tests in `src/concepts/<Name>/<Name>Concept.test.ts`
4. Agent-end verification runs automatically after implementation is complete.
