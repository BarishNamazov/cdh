## Purpose

Requesting manages incoming requests from external consumers, allowing them to create requests that syncs can react to.

## Principle

Requesting acts as the entry point for external triggers. It validates input shapes and emits request events that synchronizations observe, without coupling to any specific handler.

## State

```typescript
interface RequestingState {
  requests: RequestRecord[];
}

interface RequestRecord {
  id: string;
  item: string;
  user: string;
  text: string;
}
```

## Actions

### createLabelRequested
- Input: `{ item: string, user: string, text: string }`
- Output: `{ requestId: string }`
- Creates a new label request

## Queries

None.

## Requires

None.

## Effects

- createLabelRequested emits a request that triggers Labeling.addLabel via syncs.

## Errors

None.
