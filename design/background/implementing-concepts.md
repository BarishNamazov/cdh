# Concept Implementation

Concepts can be implemented as a single TypeScript class, and must obey the following properties:
1. No import statements can reference another concept in any way, including type declarations.
2. All methods are either actions or queries from the spec: query methods are named beginning with a `_` character.
3. Every action must take a single argument, and output a single argument: both of these are a dictionary/JSON object with primitive values (no custom objects).

Each piece of the concept spec is mapped onto the implementation as follows:

- **concept**: the name of the class is `{Name}Concept`
- **purpose**: the purpose is kept and versioned alongside the code in documentation
- **principle**: the principle helps establish a canonical test and models out desirable behavior
- **state**: the state relations can be mapped directly to database collections
- **actions**: each action is a method of the same name, and takes in a dictionary with the keys described by the action parameters in the specification with the specified types
- **queries**: queries are also methods, but must begin with an underscore `_`
    - **Important:** queries MUST return an **array** of the type specified by the return signature

## Directory Structure

```
src/concepts/<Name>/
├── <Name>Concept.ts       # Implementation
└── <Name>Concept.test.ts  # Tests
```

## Action Signatures

All actions take exactly one object parameter with named fields matching the spec's input arguments, and return an object with named fields matching the spec's output arguments. For example, if a spec declares:

    addLabel (item: Item, user: User, text: String): (id: String)

The TypeScript implementation is:

```typescript
addLabel(input: { item: string; user: string; text: string }): { id: string } {
    // ...
}
```

Even actions that don't return meaningful data must return a dictionary (which may be empty `{}`).

## Error Handling

Only throw errors when they are truly exceptional. Otherwise, all normal errors should be caught, and instead return a record `{ error: "the error message" }` to allow proper future synchronization with useful errors.

## Requirements and Effects

Each action method must:
- Enforce its **requires** conditions before mutating state — return `{ error: "..." }` when they are violated
- Perform its **effects** by updating state
- Return results matching the spec's output signature

It should be possible to confirm any expectations for what the state looks like when described in **effects** or **principle** using the chosen set of **queries**.

## Commenting Convention

Every action should have a JSDoc comment including its signature, requirements, and effects:

```typescript
/**
 * addLabel (item: Item, user: User, text: String): (id: String)
 *
 * **requires** item, user, and text are non-empty; no duplicate label exists
 *
 * **effects** creates and stores a new label; returns its id
 */
addLabel(input: { item: string; user: string; text: string }): { id: string } {
    // ...
}
```

## Generic Parameters: managing IDs

When implementing concepts, use string-based IDs for entity references. This keeps concepts polymorphic and avoids coupling to specific database ID schemes:

```typescript
// Entity IDs are opaque strings — no assumptions about their structure
type Item = string;
type User = string;
```

For database-backed concepts, use a fresh ID utility to generate identifiers. CDH does not mandate a specific database; concepts may use in-memory state, MongoDB, or any storage backend. The important property is that entity IDs are opaque and polymorphic.
