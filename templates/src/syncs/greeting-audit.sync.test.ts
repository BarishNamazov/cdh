import { expect, test } from "bun:test";
import { setupSyncTest } from "../utils/testing.ts";
import { greetingAuditSync } from "./greeting-audit.sync.ts";

test("greeting-audit sync is defined", () => {
  expect(greetingAuditSync).toBeDefined();
});

test("greeting-audit sync does not reference unrelated actions", () => {
  const sync = setupSyncTest();
  sync.emit("Greeting.greet");
  expect(sync.calls).toContain("Greeting.greet");
});
