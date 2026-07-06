import { expect, test } from "bun:test";

const context = { actionUnderTest: "", testName: "" };
const records: Record<string, unknown>[] = [];

function testAction(actionName: string, testName: string, fn: () => unknown | Promise<unknown>): void {
  test(testName, async () => {
    context.actionUnderTest = actionName;
    context.testName = testName;
    await fn();
  });
}

function track<T extends object>(instance: T, options: { concept?: string } = {}): T {
  const concept = options.concept ?? instance.constructor.name.replace(/Concept$/, "");

  return new Proxy(instance, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof property !== "string" || typeof value !== "function") return value;

      return (...args: unknown[]) => {
        records.push({ kind: "method", concept, method: property, actionUnderTest: context.actionUnderTest });
        return Reflect.apply(value, target, args);
      };
    }
  });
}

function expectError(result: unknown): void {
  records.push({ kind: "errorAssertion", actionUnderTest: context.actionUnderTest });
  expect(result).toHaveProperty("error");
}

function trace(message: string): void {
  console.log(`trace: ${message}`);
}

function setupTestDb(): { users: unknown[] } {
  return { users: [] };
}

import AuthenticatingConcept from "./AuthenticatingConcept.ts";

testAction("register", "principle: registered users can authenticate", async () => {
  trace("A user registers with username and password, then authenticates successfully.");
  const auth = track(new AuthenticatingConcept({ users: [] }), { concept: "Authenticating" });

  const result = await auth.register({ username: "alice", password: "secret123" });
  expect(result).toHaveProperty("id");

  const login = await auth.authenticate({ username: "alice", password: "secret123" });
  expect("ok" in login ? login.ok : false).toBe(true);
});

testAction("register", "rejects duplicate usernames", async () => {
  const auth = track(new AuthenticatingConcept({ users: [] }), { concept: "Authenticating" });
  await auth.register({ username: "bob", password: "pass1" });
  const result = await auth.register({ username: "bob", password: "pass2" });
  expectError(result);
});

testAction("register", "rejects empty username", async () => {
  const auth = track(new AuthenticatingConcept({ users: [] }), { concept: "Authenticating" });
  const result = await auth.register({ username: "", password: "pass" });
  expectError(result);
});

testAction("authenticate", "rejects wrong password", async () => {
  const auth = track(new AuthenticatingConcept({ users: [] }), { concept: "Authenticating" });
  await auth.register({ username: "carol", password: "correct" });
  const result = await auth.authenticate({ username: "carol", password: "wrong" });
  expectError(result);
});

testAction("changePassword", "updates password and verifies new one", async () => {
  trace("A user changes their password and can authenticate with the new one.");
  const auth = track(new AuthenticatingConcept({ users: [] }), { concept: "Authenticating" });
  await auth.register({ username: "dave", password: "oldpass" });
  await auth.changePassword({ username: "dave", oldPassword: "oldpass", newPassword: "newpass" });
  const login = await auth.authenticate({ username: "dave", password: "newpass" });
  expect("ok" in login ? login.ok : false).toBe(true);
});

testAction("changePassword", "rejects wrong old password", async () => {
  const auth = track(new AuthenticatingConcept({ users: [] }), { concept: "Authenticating" });
  await auth.register({ username: "eve", password: "realpass" });
  const result = await auth.changePassword({ username: "eve", oldPassword: "wrongold", newPassword: "newpass" });
  expectError(result);
});

testAction("unregister", "deactivates user account", () => {
  const auth = track(new AuthenticatingConcept({ users: [{ id: "u1", username: "frank", passwordHash: "", active: true }] }), { concept: "Authenticating" });
  auth.unregister({ username: "frank" });
  const users = auth._getUsers();
  expect(users).toHaveLength(0);
});

testAction("unregister", "rejects non-existent user", () => {
  const auth = track(new AuthenticatingConcept({ users: [] }), { concept: "Authenticating" });
  const result = auth.unregister({ username: "ghost" });
  expectError(result);
});

test("passwords are stored as hashes, not plaintext", async () => {
  const auth = new AuthenticatingConcept({ users: [] });
  await auth.register({ username: "grace", password: "mypassword" });
  const [user] = auth._getUserByUsername({ username: "grace" });
  expect(user?.passwordHash).not.toBe("mypassword");
  expect(user?.passwordHash).toStartWith("$");
});
