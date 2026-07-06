# Authenticating

## purpose
Manages user registration, credential verification, and identity lifecycle.

## principle
Passwords are hashed before storage and never stored in plaintext. Every user has a unique username.

## state
Users are stored with username, password hash, and active status.

## actions
- `register(input: { username: string; password: string })`: Creates a new user with a hashed password. Returns `{ id: string }` or `{ error: string }` if the username is taken or fields are empty.
- `authenticate(input: { username: string; password: string })`: Verifies credentials. Returns `{ ok: true; id: string }` or `{ error: string }` if credentials are invalid.
- `changePassword(input: { username: string; oldPassword: string; newPassword: string })`: Changes the password for an existing user. Returns `{ ok: true }` or `{ error: string }`.
- `unregister(input: { username: string })`: Deactivates a user account. Returns `{ ok: true }` or `{ error: string }`.

## queries
- `_getUserByUsername(input: { username: string })`: Returns the user document or empty array if not found.
- `_getUsers()`: Returns all registered users.
