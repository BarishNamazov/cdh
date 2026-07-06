import { test } from "bun:test";
import TimingConcept from "./TimingConcept.ts";

test("starts and queries timers", () => {
  const timing = new TimingConcept();
  timing.start({ name: "x" });
  timing._getTimers();
});
