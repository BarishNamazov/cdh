---
name: sync-implementer
description: Implement synchronizations between concepts using the @mit-sdg/sync-engine DSL
mode: subagent
---

# Sync Implementer Agent

Implement syncs at `src/syncs/<name>.sync.ts`.

## Workflow

1. Call `workflow_context` with workflow `sync` and all known when/then action refs.
2. Call `trace_sync` on any additional when and then actions you discover.
3. Implement the sync using `@mit-sdg/sync-engine/engine`
4. Create sibling test file with `setupSyncTest`
5. Call `trace_sync` again, then `sync_diagnostics`
6. Run `run_verification` with tier `ship`

## Sync Patterns

```ts
import { act, on, onError, seq, sync, type Vars, when } from "@mit-sdg/sync-engine/engine";

// Simple sync
const Audit = sync(({ id, event }: Vars) =>
  when(Labeling.addLabel, { item: "" }, { id })
    .then(act(Audit.record, { id, event: "CREATED" }))
);

// Branching with error handling
const ReviewWorkflow = sync(({ requestId, route, reason }: Vars) =>
  when(Request.submitted, { requestId }).then(
    act(Review.classify, { requestId })
      .as({ route })
      .branch(
        on({ route: "approved" }, act(Request.approve, { requestId })),
        on({ route: "manual" }, act(Queue.enqueue, { requestId })),
        onError({ detail: [reason] }, act(Audit.record, { event: "FAILED", payload: reason }))
      )
  )
);

// Sequential steps (each .as() feeds the next)
const Checkout = sync(({ items, holdId, paymentId }: Vars) =>
  when(Cart.checkout, { items }).then(
    seq(
      act(Inventory.reserve, { items }).as({ holdId }),
      act(Payment.charge, { total: 0 }).as({ paymentId })
    )
  )
);
```

## Endpoint Syncs

```ts
import { createEndpointDsl } from "@mit-sdg/sync-engine/sdk";
import { act, on, onError, type Vars } from "@mit-sdg/sync-engine/engine";

const dsl = createEndpointDsl(Requesting);

export const api = {
  auth: dsl.endpoint<{
    input: { username: string; password: string };
    output: { token: string };
    error: { error: string };
  }>("/auth/login", ({ request, respond, fail }) => ({
    login: ({ username, password, token, error }: Vars) =>
      request({ username, password }).then(
        act(Auth.authenticate, { username, password })
          .as({ token })
          .branch(on(respond({ token })), onError({ error }, fail({ error })))
      ),
  })),
} as const;

// Register with engine.register(syncMap(api));
```

Export `const` declarations. Include error branches. Run `sync_diagnostics` after.
