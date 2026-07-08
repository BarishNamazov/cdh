import { expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";
import type { LabelingState } from "../concepts/Labeling/LabelingConcept.ts";

interface TrackOptions {
  concept?: string;
}

interface TestContext {
  actionUnderTest: string;
  testName: string;
}

const context = new AsyncLocalStorage<TestContext>();

export function setupTestDb(): { labeling: LabelingState; requesting: Record<string, never> } {
  return { labeling: { labels: [] }, requesting: {} };
}

export function trace(message: string): void {
  console.log(`trace: ${message}`);
}

export function testAction(actionName: string, testName: string, fn: () => unknown | Promise<unknown>): void {
  test(testName, async () => {
    await context.run({ actionUnderTest: actionName, testName }, async () => fn());
  });
}

export function expectError(result: unknown): void {
  record({ kind: "errorAssertion", concept: undefined, method: undefined });
  expect(result).toHaveProperty("error");
}

export function track<T extends object>(instance: T, options: TrackOptions = {}): T {
  const concept = options.concept ?? instance.constructor.name.replace(/Concept$/, "");

  return new Proxy(instance, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || typeof value !== "function") {
        return value;
      }

      return (...args: unknown[]) => {
        record({ kind: "method", concept, method: property });
        return Reflect.apply(value, target, args);
      };
    },
  });
}

export function setupSyncTest(): { calls: string[]; emit: (action: string) => void } {
  const calls: string[] = [];
  return {
    calls,
    emit(action: string) {
      calls.push(action);
    },
  };
}

function record(input: { kind: "method" | "errorAssertion"; concept?: string; method?: string }): void {
  const out = process.env.CDH_SURFACE_OUT;
  if (!out) return;

  const active = context.getStore();
  const line = JSON.stringify({
    kind: input.kind,
    concept: input.concept,
    method: input.method,
    testName: active?.testName,
    actionUnderTest: active?.actionUnderTest,
    ts: new Date().toISOString(),
  });
  appendFileSync(out, `${line}\n`, "utf8");
}
