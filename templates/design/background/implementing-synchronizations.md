# Implementing Synchronizations

Synchronizations compose independent concepts. Concepts never import or call each other; all cross-concept behavior lives in `src/syncs/**/*.sync.ts`.

CDH targets the current `@mit-sdg/sync-engine` authoring model: syncs are declarative `when -> where? -> then` rules over an append-only action journal.

## Core Authoring API

Use the fluent engine DSL from `@mit-sdg/sync-engine`:

```typescript
import { act, on, onError, seq, sync, type Vars, when } from "@mit-sdg/sync-engine";

export const AuditTodoCreate = sync(({ todoId }: Vars) =>
  when(Todo.create, { id: todoId }, { id: todoId }).then(
    act(Audit.record, {
      id: todoId,
      event: "TODO_CREATED",
      targetId: todoId,
    }),
  ),
);
```

The rule reads as:

- **when**: match one or more completed concept actions in the current causal flow
- **where**: optionally transform/filter/query the matched frames
- **then**: dispatch one or more concept actions per surviving frame

## Action Patterns

`when(action, inputPattern, outputPattern)` matches action records from the journal.

```typescript
when(Enrollments.enroll, { id: enrollmentId }, { enrollment: enrollmentId })
```

The input and output patterns are partial records:

- Literal values match exactly.
- Symbol variables bind values into the current frame.
- Omitted fields are ignored.
- An empty output pattern `{}` matches successful completion, but not an error output.
- A pattern containing `{ error }` matches the error case.

Use the array form to join multiple actions in the same flow:

```typescript
when([
  [Requesting.request, { path: "/courses/archive", course }, { request }],
  [Courses.archive, { id: course }, { course }],
]).then(act(Requesting.respond, { request, ok: true }));
```

## Variables

For small syncs, destructure `Vars`:

```typescript
const AuditProfileCreate = ({ profileId }: Vars) =>
  when(Profiles.createProfile, { id: profileId }, { profile: profileId }).then(...);
```

For larger files or non-trivial `where` logic, prefer typed variables with `declareVars`:

```typescript
import { declareVars, Where } from "@mit-sdg/sync-engine";

const { pipe, read } = Where;
const v = declareVars<{ session: string; user: string; course: string; error: string }>();
const { session, user, course, error } = v;
```

Typed variables make frame reads safe and avoid repeated casts.

## Where Clauses and Frames

A `where` clause is a pure transform over `Frames`. It may filter, join concept queries, derive new bindings, collect results, or enrich frames asynchronously.

```typescript
const OnProfileDeactivated_DropEnrollments = sync(({ profileId, enrollmentId, error }: Vars) =>
  when(Profiles.deactivate, { id: profileId }, { profile: profileId })
    .where((frames) =>
      frames.query(
        Enrollments._getStudentEnrollments,
        { student: profileId },
        { id: enrollmentId },
      ),
    )
    .then(
      act(Enrollments.drop, { id: enrollmentId }).branch(
        on(act(Audit.record, { id: enrollmentId, event: "ENROLLMENT_DROPPED" })),
        onError({ error }, act(Audit.record, { id: enrollmentId, event: "DROP_FAILED", error })),
      ),
    ),
);
```

Common `Frames` helpers:

- `query(fn, input, output)` — inner join over query results
- `queryOptional(fn, input, output)` — left join over query results
- `filter(...)` / `guard(...)` — keep matching frames
- `bind(symbol, valueOrFn)` — attach a value to every frame
- `collectAs(keys, symbol)` — group frame rows into arrays
- `aggregate(base, collect, as)` — collect while preserving the request frame when there are zero rows
- `enrich(asyncFn)` — attach async-derived values
- `tap(fn)` — side-effect passthrough for debugging

Prefer `Where.pipe(...)` when a `where` clause has multiple gates:

```typescript
where: pipe(
  pass(check(amount, validatePositiveAmount)),
  keep(($) => !read($, occurrenceId)),
  derive(payload, ($) => ({ amount: read($, amount), group: read($, group) })),
),
```

## Nested Then Workflows

Use `act(...).as(...)` to bind a step output into the frame for later steps.

Use `seq(...)` when later actions depend on earlier outputs:

```typescript
then(
  seq(
    act(Inventory.reserve, { items }).as({ holdId }),
    act(Payment.charge, { total }).as({ paymentId }),
    act(Order.create, { holdId, paymentId }),
  ),
);
```

Use `par(...)` only when sibling actions are independent and safe to run concurrently.

Use `branch(on(...), onError(...))` when a step has success/error follow-ups:

```typescript
act(Payment.charge, { total })
  .as({ paymentId })
  .branch(
    on(act(Receipt.send, { paymentId })),
    onError({ code: "CARD_DECLINED" }, act(Audit.record, { event: "PAYMENT_FAILED" })),
  );
```

## Endpoint DSL

For HTTP boundaries, use `createEndpointDsl(...)` from `@mit-sdg/sync-engine/sdk` with the app's request boundary concept. Endpoint definitions carry the request/response contract and produce syncs.

```typescript
import { createEndpointDsl, syncMap } from "@mit-sdg/sync-engine/sdk";

const dsl = createEndpointDsl(Requesting);

export const auth = dsl.defineEndpoint("/auth/login", ({ Sync, Request, Respond, Actions }) => ({
  login: Sync(({ username, password, token }) => ({
    when: Actions(Request({ username, password })),
    then: Actions(Authenticating.authenticate, { username, password }, { token }),
  })),
}));

Sync.register(syncMap({ auth }));
```

Request boundary syncs should respond on all success and error paths. Use `Fail(error)` or `Respond(...)` consistently so requests never hang.

## Graph Diagnostics

The current engine includes graph devtools in `@mit-sdg/sync-engine/devtools/graph`:

- `buildSyncGraph(engine, boundary)` — builds endpoint/action graph from registered syncs
- `computeReachability(graph)` — checks whether endpoints can reach `Respond`
- `runDiagnostics(graph, reachability)` — reports advisory smells such as unreachable responses, unhandled errors, orphan actions, high fan-in/out, heavy `where`, deep chains, and sync cycles
- exporters: JSON, Mermaid, Graphviz DOT, and CLI report

CDH tools should prefer this graph source when available instead of relying only on static string scanning.

## Test Requirements

Every `*.sync.ts` file must have a sibling `*.sync.test.ts` file that:

1. Imports at least one exported sync from the sibling file.
2. Uses `setupSyncTest` or an equivalent engine fixture to register/invoke the sync.
3. Includes at least one positive case proving intended firing.
4. Includes at least one negative case whose test name contains `does not` or `negative`.
5. Covers success and error branches when the sync discriminates on outputs.

## Design Rules

1. Concepts never import each other; syncs are the composition layer.
2. `when` and `where` are declarative and side-effect free; side effects live in `then` actions.
3. One sync should have one responsibility. Split audit, notification, response, and cascade concerns unless they are truly one ordered workflow.
4. Use output patterns to distinguish success and error. Do not write one pattern that expects mutually exclusive outputs at once.
5. Prefer typed variables and `Where.read` for non-trivial `where` clauses.
6. Use graph diagnostics before shipping sync-heavy changes.
