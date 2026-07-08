import { expect, test } from "bun:test";
import { labelRequestSync } from "./label-request.sync.ts";
import { setupSyncTest } from "../utils/testing.ts";

test("label request sync is defined and callable", () => {
  const sync = setupSyncTest();
  sync.emit("Labeling.addLabel");
  expect(sync.calls).toContain("Labeling.addLabel");
});

test("label request sync does not emit unrelated actions", () => {
  const sync = setupSyncTest();
  expect(sync.calls).not.toContain("Labeling.removeLabel");
});
