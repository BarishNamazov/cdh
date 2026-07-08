import { expect } from "bun:test";
import { expectError, setupTestDb, testAction, trace, track } from "../../utils/testing.ts";
import GreetingConcept from "./GreetingConcept.ts";

testAction("greet", "returns a greeting message", () => {
  trace("A user greets with their name and gets back a greeting.");
  const g = track(new GreetingConcept(), { concept: "Greeting" });

  const result = g.greet({ name: "World" });

  expect(result).toEqual({ message: "Hello, World!" });
  expect(g._getHistory()).toHaveLength(1);
});

testAction("greet", "rejects empty names", () => {
  const g = track(new GreetingConcept(), { concept: "Greeting" });

  expectError(g.greet({ name: "" }));
});

testAction("ungreet", "removes a greeting from history", () => {
  const g = track(new GreetingConcept(), { concept: "Greeting" });
  g.greet({ name: "World" });

  expect(g.ungreet({ name: "World" })).toEqual({ removed: true });
  expect(g._getHistory()).toEqual([]);
});

testAction("ungreet", "reports false for unknown names", () => {
  const g = track(new GreetingConcept(), { concept: "Greeting" });

  expect(g.ungreet({ name: "nobody" })).toEqual({ removed: false });
});
