# Implementing Synchronizations

Syncs are defined in `src/syncs/**/*.sync.ts` files. Each sync is an exported const that declares *when* actions trigger *then* actions.

## Basic Sync Structure

```typescript
export interface SyncDefinition {
  name: string;
  when: string;
  then: string;
}

export const labelRequestSync: SyncDefinition = {
  name: "label-request",
  when: "Requesting.createLabelRequested",
  then: "Labeling.addLabel"
};
```

## Sync Test Requirements

Every sync file must have a sibling `*.sync.test.ts` file that:
1. Imports at least one exported sync from the sibling
2. Contains at least one **positive** case using `setupSyncTest`
3. Contains at least one **negative** case whose test name contains "does not" or "negative"

```typescript
test("label request sync has a positive setupSyncTest case", () => {
  const sync = setupSyncTest();
  sync.emit(labelRequestSync.then);
  expect(sync.calls).toContain("Labeling.addLabel");
});

test("label request sync does not emit unrelated actions", () => {
  const sync = setupSyncTest();
  expect(sync.calls).not.toContain("Labeling.removeLabel");
});
```

## Action Reference Format

In a sync definition, actions are referenced as `ConceptName.actionName`:

```
when: "Requesting.createLabelRequested"   → when the Requesting concept fires createLabelRequested
then: "Labeling.addLabel"                 → then fire the Labeling concept's addLabel action
```

This format enables CDH's `trace` command to map the full sync graph:

```bash
cdh trace Labeling.addLabel     # show all syncs involving this action
cdh syncs --concept Labeling    # list syncs referencing this concept
```

## Pattern Matching

Sync `when` clauses match by action name only — the action reference `Labeling.addLabel` will match any invocation of `addLabel` on the Labeling concept. Concept action parameters are matched positionally through the engine's frame binding system. This lets you omit parameters you don't care about and alias the ones you need.

## Where Clauses (Advanced)

For syncs that need to query concept state before firing, use a `where` clause. The where clause receives a set of *frames* (bindings from the when clause) and can query concept state to enrich, filter, or fan-out those frames before they reach the then clause. See the advanced sync reference for frame semantics.
