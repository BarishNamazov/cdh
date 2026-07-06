import { test } from "bun:test";
import RecordingConcept from "./RecordingConcept.ts";

test("principle: recorded data is retrievable", () => {
  const recording = new RecordingConcept();
  recording.record({ data: "x" });
  recording._getRecordings();
});
