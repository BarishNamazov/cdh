import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { commitShip, createPullRequest, createShipBranch, pushBranch } from "./git-mutation.ts";
import { runGit } from "./index.ts";

function initGitRepo(dir: string): void {
  mkdirSync(dir, { recursive: true });
  runGit(dir, ["init", "-b", "main"]);
  runGit(dir, ["config", "user.email", "test@test.com"]);
  runGit(dir, ["config", "user.name", "Test"]);
  writeFileSync(path.join(dir, "README.md"), "# test\n");
  runGit(dir, ["add", "README.md"]);
  runGit(dir, ["commit", "-m", "init"]);
}

function getTestDir(): string {
  return path.join(tmpdir(), `cdh-mut-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
}

const testConfig = {
  ship: {
    confirm: "interactive" as const,
    branchPrefix: "cdh-test/",
    review: true,
    push: false,
    createPr: false,
    ci: false,
  },
} as import("../config.ts").CdhConfig;

describe("commitShip", () => {
  test("commits touched files with Cdh-Run trailer", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      writeFileSync(path.join(dir, "new-file.ts"), "console.log(1);");
      const runId = "test-run-001";

      const result = commitShip(dir, runId, ["new-file.ts"], "ship: test");
      expect(result.ok).toBe(true);
      expect(result.commitSha).toBeDefined();

      const log = runGit(dir, ["log", "--oneline", "-1"]);
      expect(log.output).toContain("ship: test");
      expect(log.output).not.toContain("Cdh-Run"); // not in one-line

      const fullLog = runGit(dir, ["log", "-1", "--pretty=format:%B"]);
      expect(fullLog.output).toContain("Cdh-Run: test-run-001");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("fails when no files to commit", () => {
    const dir = getTestDir();
    try {
      const result = commitShip(dir, "run-001", [], "ship: test");
      expect(result.ok).toBe(false);
      expect(result.errors[0]).toBe("No files to commit.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createShipBranch", () => {
  test("creates branch with prefix and runId", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      writeFileSync(path.join(dir, "x.ts"), "1");
      runGit(dir, ["add", "x.ts"]);
      runGit(dir, ["commit", "-m", "x"]);

      const result = createShipBranch(dir, testConfig, "test-run-002");
      expect(result.ok).toBe(true);
      expect(result.branch).toContain("cdh-test/test-run-002");

      const branchResult = runGit(dir, ["branch", "--show-current"]);
      expect(branchResult.output).toContain("cdh-test/test-run-002");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("appends suffix on branch collision", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      writeFileSync(path.join(dir, "a.ts"), "1");
      runGit(dir, ["add", "a.ts"]);
      runGit(dir, ["commit", "-m", "a"]);
      runGit(dir, ["checkout", "-b", "cdh-test/test-run-003"]);
      runGit(dir, ["checkout", "main"]);

      writeFileSync(path.join(dir, "b.ts"), "2");
      runGit(dir, ["add", "b.ts"]);
      runGit(dir, ["commit", "-m", "b"]);

      const result = createShipBranch(dir, testConfig, "test-run-003");
      expect(result.ok).toBe(true);
      expect(result.branch).not.toBe("cdh-test/test-run-003");
      expect(result.branch).toContain("cdh-test/test-run-003-");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("pushBranch", () => {
  test("fails without remote", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      const result = pushBranch(dir, "nonexistent-remote", "cdh-test/branch");
      expect(result.ok).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("createPullRequest", () => {
  test("fails without gh CLI", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      const result = createPullRequest(dir, "test-branch", "Test PR");
      expect(result.ok).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
