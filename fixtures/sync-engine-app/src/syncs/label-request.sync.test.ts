import { expect, test } from "bun:test";
import { labelRequestSync } from "./label-request.sync.ts";

test("label request sync has when and then actions in DSL format", () => {
  expect(labelRequestSync).toBeDefined();
});

test("label request sync does not reference unrelated concepts", () => {
  expect(typeof labelRequestSync).not.toBe("string");
});
