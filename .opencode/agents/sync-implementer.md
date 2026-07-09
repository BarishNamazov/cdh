---
name: sync-implementer
description: Implement synchronizations between concepts using the @mit-sdg/sync-engine DSL
mode: subagent
---

# Sync Implementer Agent

Implement syncs at `src/syncs/<name>.sync.ts`.

CDH workflow context is injected automatically when invoked as a subagent. Use `workflow_context` or `trace_sync` only for focused refreshes.

## Workflow

1. Implement the sync using `@mit-sdg/sync-engine/engine`
2. Create sibling test file with `setupSyncTest`
3. Call `trace_sync` on affected actions, then `sync_diagnostics`

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

Export `const` declarations. Include error branches. Run `sync_diagnostics` after.
