import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

export interface InitResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

export function initProject(cwd: string): InitResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  function rel(p: string): string {
    return path.relative(cwd, p);
  }

  function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (e) {
        errors.push(`Failed to create directory ${rel(dir)}: ${e}`);
      }
    }
  }

  function writeIfMissing(filePath: string, content: string): void {
    try {
      const dir = path.dirname(filePath);
      ensureDir(dir);
      if (existsSync(filePath)) {
        skipped.push(rel(filePath));
      } else {
        writeFileSync(filePath, content, { encoding: "utf8", mode: 0o644 });
        created.push(rel(filePath));
      }
    } catch (e) {
      errors.push(`Failed to write ${rel(filePath)}: ${e}`);
    }
  }

  // ---- directories ----

  for (const d of [
    "src/concepts",
    "src/syncs",
    "src/utils",
    "design/concepts",
    "design/background",
    "design/journal",
    ".pi",
  ]) {
    ensureDir(path.join(cwd, d));
  }

  // ---- package.json ----

  writeIfMissing(
    path.join(cwd, "package.json"),
    JSON.stringify(
      {
        name: path.basename(cwd),
        version: "0.0.0",
        type: "module",
        private: true,
        scripts: {
          test: "bun test",
          check: "tsc --noEmit",
        },
        dependencies: {
          "@mit-sdg/sync-engine": "*",
        },
        devDependencies: {
          "@types/bun": "latest",
          typescript: "latest",
        },
      },
      null,
      2,
    ) + "\n",
  );

  // ---- tsconfig.json ----

  writeIfMissing(
    path.join(cwd, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2023",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: true,
          allowImportingTsExtensions: true,
          noEmit: true,
          types: ["bun-types"],
          baseUrl: ".",
          paths: {
            "@utils/*": ["src/utils/*"],
            "@concepts/*": ["src/concepts/*"],
          },
        },
        include: ["src/**/*.ts"],
      },
      null,
      2,
    ) + "\n",
  );

  // ---- .gitignore ----

  writeIfMissing(
    path.join(cwd, ".gitignore"),
    `node_modules/
dist/
.env
design/journal/
`,
  );

  // ---- src/utils/testing.ts ----

  writeIfMissing(
    path.join(cwd, "src/utils/testing.ts"),
    `import { expect, test } from "bun:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync } from "node:fs";

interface TestContext {
  actionUnderTest: string;
  testName: string;
}

const context = new AsyncLocalStorage<TestContext>();

export function setupTestDb(): Record<string, unknown> {
  return {};
}

export function trace(message: string): void {
  console.log(\`trace: \${message}\`);
}

export function testAction(
  actionName: string,
  testName: string,
  fn: () => unknown | Promise<unknown>,
): void {
  test(testName, async () => {
    await context.run({ actionUnderTest: actionName, testName }, async () => fn());
  });
}

export function expectError(result: unknown): void {
  record({ kind: "errorAssertion", concept: undefined, method: undefined });
  expect(result).toHaveProperty("error");
}

export function track<T extends object>(
  instance: T,
  options: { concept?: string } = {},
): T {
  const concept =
    options.concept ?? instance.constructor.name.replace(/Concept$/, "");

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

export function setupSyncTest(): {
  calls: string[];
  emit: (action: string) => void;
} {
  const calls: string[] = [];
  return {
    calls,
    emit(action: string) {
      calls.push(action);
    },
  };
}

function record(input: {
  kind: "method" | "errorAssertion";
  concept?: string;
  method?: string;
}): void {
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
  appendFileSync(out, \`\${line}\\n\`, "utf8");
}
`,
  );

  // ---- src/concepts/Greeting/GreetingConcept.ts ----

  writeIfMissing(
    path.join(cwd, "src/concepts/Greeting/GreetingConcept.ts"),
    `export interface GreetingRecord {
  name: string;
  message: string;
  at: string;
}

export interface GreetingState {
  history: GreetingRecord[];
}

export default class GreetingConcept {
  constructor(private readonly state: GreetingState = { history: [] }) {}

  greet(input: { name: string }): { message: string } {
    const name = input.name.trim();
    if (!name) {
      return { error: "name is required" } as unknown as { message: string };
    }

    const message = \`Hello, \${name}!\`;
    this.state.history.push({ name, message, at: new Date().toISOString() });
    return { message };
  }

  ungreet(input: { name: string }): { removed: boolean } {
    const index = this.state.history.findIndex((r) => r.name === input.name);
    if (index === -1) {
      return { removed: false };
    }
    this.state.history.splice(index, 1);
    return { removed: true };
  }

  _getHistory(): GreetingRecord[] {
    return [...this.state.history];
  }
}
`,
  );

  // ---- src/concepts/Greeting/GreetingConcept.test.ts ----

  writeIfMissing(
    path.join(cwd, "src/concepts/Greeting/GreetingConcept.test.ts"),
    `import { expect } from "bun:test";
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
`,
  );

  // ---- src/syncs/greeting-audit.sync.ts ----

  writeIfMissing(
    path.join(cwd, "src/syncs/greeting-audit.sync.ts"),
    `// @ts-nocheck — DSL patterns reference concept namespaces
import Greeting from "../concepts/Greeting/GreetingConcept.ts";
import type { Vars } from "@mit-sdg/sync-engine";
import { act, on, onError, sync, when } from "@mit-sdg/sync-engine";

export const greetingAuditSync = sync(({ name, message, error }: Vars) =>
  when(Greeting.greet, { name }, { message }).then(
    act(Greeting._getHistory).branch(
      on(act(() => {})),
      onError({ error }, act(() => {})),
    ),
  ),
);
`,
  );

  // ---- src/syncs/greeting-audit.sync.test.ts ----

  writeIfMissing(
    path.join(cwd, "src/syncs/greeting-audit.sync.test.ts"),
    `import { expect, test } from "bun:test";
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
`,
  );

  // ---- design/concepts/greeting.md ----

  writeIfMissing(
    path.join(cwd, "design/concepts/greeting.md"),
    `# Greeting

## Purpose

Greet users by name and track a history of greetings.

## Principle

When a user is greeted by name, they receive a personalized message and the greeting is recorded.

## State

- History of greeting records, each with name, message, and timestamp.

## Actions

### greet

Requires: a non-empty name.

Effects: returns a greeting message and appends to history.

### ungreet

Requires: a name previously greeted.

Effects: removes the greeting record from history.

## Queries

### _getHistory

Returns all greeting records in insertion order.
`,
  );

  // ---- design/index.json ----

  writeIfMissing(
    path.join(cwd, "design", "index.json"),
    JSON.stringify(
      {
        specsDir: "design/concepts",
        docs: {},
        helpers: {
          testingModule: "@utils/testing.ts",
          exports: [
            "setupTestDb",
            "trace",
            "track",
            "testAction",
            "expectError",
            "setupSyncTest",
          ],
        },
        scripts: {
          test: "bun test",
          typecheck: "bun run check",
        },
      },
      null,
      2,
    ) + "\n",
  );

  // ---- .pi/cdh.json ----

  writeIfMissing(
    path.join(cwd, ".pi", "cdh.json"),
    JSON.stringify(
      {
        paths: {
          concepts: "src/concepts",
          syncs: "src/syncs",
          designIndex: "design/index.json",
          journal: "design/journal",
        },
        rules: {
          importAllowlist: { syncs: ["@engine"] },
          helperMethodAllowlist: [],
        },
        testing: {
          errorAssertionPatterns: ["expectError(", ".error"],
        },
        verify: {
          onAgentEnd: ["typecheck", "rules:changed"],
          onShipLocal: [
            "journal-health",
            "typecheck",
            "rules:all",
            "tests:changed",
            "tests:all",
            "surface-coverage",
            "sync-tests",
            "legibility",
          ],
          optionalStages: ["smoke"],
          syncDiagnostics: "warn",
        },
        catalogPaths: [],
        ship: {
          confirm: "interactive",
          branchPrefix: "cdh/",
          review: true,
          push: true,
          createPr: true,
          ci: true,
        },
      },
      null,
      2,
    ) + "\n",
  );

  // ---- .pi/settings.json ----

  writeIfMissing(
    path.join(cwd, ".pi", "settings.json"),
    JSON.stringify({ packages: ["@mit-sdg/cdh"] }, null, 2) + "\n",
  );

  return { created, skipped, errors };
}
