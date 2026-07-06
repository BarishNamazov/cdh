import { expect, test } from "bun:test";
import { labelRequestSync } from "./label-request.sync.ts";
import { setupSyncTest } from "../utils/testing.ts";

test("label request sync has a positive setupSyncTest case", () => {
  const sync = setupSyncTest();

  sync.emit(labelRequestSync.then);

  expect(sync.calls).toContain("Labeling.addLabel");
});

test("label request sync does not emit unrelated actions", () => {
  const sync = setupSyncTest();

  expect(sync.calls).not.toContain("Labeling.removeLabel");
});
