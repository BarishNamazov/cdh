import { describe, expect, test } from "bun:test";
import { createGatePolicy } from "./gate-policy.ts";
import { defaultConfig } from "./config.ts";

const cwd = "/home/user/project";

function policy() {
  return createGatePolicy(cwd, defaultConfig);
}

describe("GatePolicy R5", () => {
  test("blocks writes to src/engine/", () => {
    const gp = policy();
    const hit = gp.checkMutation("edit", "src/engine/server.ts");
    expect(hit).not.toBeNull();
    expect(hit?.rule).toBe("R5");
    expect(hit?.severity).toBe("block");
  });

  test("blocks writes to src/sdk/", () => {
    const gp = policy();
    const hit = gp.checkMutation("write", "src/sdk/client.ts");
    expect(hit).not.toBeNull();
    expect(hit?.rule).toBe("R5");
  });

  test("blocks writes to .env files", () => {
    const gp = policy();
    const hit = gp.checkMutation("write", ".env.local");
    expect(hit).not.toBeNull();
    expect(hit?.message).toContain(".env");
  });

  test("allows normal concept file writes", () => {
    const gp = policy();
    expect(gp.checkMutation("write", "src/concepts/Labeling/LabelingConcept.ts")).toBeNull();
  });

  test("allows engine writes after /allow-engine", () => {
    const gp = policy();
    gp.allowEngineThisSession();
    expect(gp.isEngineAllowed()).toBe(true);
    expect(gp.checkMutation("edit", "src/engine/server.ts")).toBeNull();
  });

  test("screenBash blocks rm -rf outside cwd", () => {
    const gp = policy();
    const hit = gp.screenBash("rm -rf /var/cache");
    expect(hit).not.toBeNull();
    expect(hit?.message).toContain("rm -rf");
  });

  test("screenBash blocks git push --force", () => {
    const gp = policy();
    const hit = gp.screenBash("git push --force origin main");
    expect(hit).not.toBeNull();
    expect(hit?.message).toContain("force-push");
  });

  test("screenBash blocks .env redirection", () => {
    const gp = policy();
    const hit = gp.screenBash("echo 'SECRET=xyz' > .env");
    expect(hit).not.toBeNull();
  });

  test("screenBash allows safe commands", () => {
    const gp = policy();
    expect(gp.screenBash("bun test")).toBeNull();
    expect(gp.screenBash("bun run check")).toBeNull();
    expect(gp.screenBash("git status")).toBeNull();
  });
});
