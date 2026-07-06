# Authenticating

Username/password identity concept. Part of the CDH catalog (`authenticating@1.0.0`).

## Installation

Copy into your concept-design repo:

```bash
cdh catalog copy authenticating
```

Or rename it:

```bash
cdh catalog copy authenticating --as Accounting
```

## Actions

| Action | Description |
|---|---|
| `register` | Creates a new user with a hashed password |
| `authenticate` | Verifies credentials |
| `changePassword` | Changes the password |
| `unregister` | Deactivates a user account |

## Queries

| Query | Description |
|---|---|
| `_getUserByUsername` | Finds a user by username |
| `_getUsers` | Lists all active users |

## Pairs With

- **Sessioning**: Create sessions after authentication
- **AccessControlling**: Assign roles and capabilities to authenticated users
