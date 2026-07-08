import { expect } from "bun:test";
import { expectError, setupTestDb, testAction, trace, track } from "../../utils/testing.ts";
import RequestingConcept from "./RequestingConcept.ts";

testAction("createLabelRequested", "creates a request with an id", () => {
  trace("A user requests a label and gets back a request id.");
  const requesting = track(new RequestingConcept(setupTestDb().requesting), { concept: "Requesting" });

  const result = requesting.createLabelRequested({ item: "item-1", user: "user-1", text: "favorite" });

  expect(result.requestId).toBeTruthy();
  expect(typeof result.requestId).toBe("string");
});
