import { expect } from "bun:test";
import { expectError, setupTestDb, testAction, trace, track } from "../../utils/testing.ts";
import LabelingConcept from "./LabelingConcept.ts";

testAction("addLabel", "principle: added labels are visible for the item", () => {
  trace("A user labels an item, then inspects that item's labels.");
  const labeling = track(new LabelingConcept(setupTestDb().labeling), { concept: "Labeling" });

  const result = labeling.addLabel({ item: "item-1", user: "user-1", text: "favorite" });

  expect(labeling._getLabels({ item: "item-1" })).toEqual([
    { id: result.id, item: "item-1", user: "user-1", text: "favorite" },
  ]);
});

testAction("addLabel", "rejects duplicate labels", () => {
  const labeling = track(new LabelingConcept(setupTestDb().labeling), { concept: "Labeling" });

  labeling.addLabel({ item: "item-1", user: "user-1", text: "favorite" });

  expectError(labeling.addLabel({ item: "item-1", user: "user-1", text: "favorite" }));
});

testAction("removeLabel", "removes an existing label", () => {
  const labeling = track(new LabelingConcept(setupTestDb().labeling), { concept: "Labeling" });
  const result = labeling.addLabel({ item: "item-1", user: "user-1", text: "favorite" });

  expect(labeling.removeLabel({ id: result.id })).toEqual({ removed: true });
  expect(labeling._getLabels({ item: "item-1" })).toEqual([]);
});

testAction("removeLabel", "rejects a missing label", () => {
  const labeling = track(new LabelingConcept(setupTestDb().labeling), { concept: "Labeling" });

  expectError(labeling.removeLabel({ id: "missing" }));
});
