import { describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { captureSnapshot, computeTouched, runGit, runShipPreflight } from "./index.ts";

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
  const dir = path.join(tmpdir(), `cdh-ship-test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
  return dir;
}

describe("captureSnapshot", () => {
  test("returns null for non-git repos", () => {
    const result = captureSnapshot("/tmp/nonexistent-repo-12345");
    expect(result).toBeNull();
  });

  test("captures HEAD ref and status from real git repo", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      const snapshot = captureSnapshot(dir);
      expect(snapshot).not.toBeNull();
      if (!snapshot) return;
      expect(snapshot.startRef).not.toBe("unborn");
      expect(snapshot.startStatus).toBe("");
      expect(snapshot.preExistingDirty).toEqual([]);
      expect(snapshot.preExistingStaged).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("detects pre-existing dirty files", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      writeFileSync(path.join(dir, "dirty.ts"), "// dirty");
      const snapshot = captureSnapshot(dir);
      expect(snapshot).not.toBeNull();
      if (!snapshot) return;
      expect(snapshot.preExistingDirty).toContain("dirty.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("computeTouched", () => {
  test("identifies new file changes", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      const snapshot = captureSnapshot(dir);
      expect(snapshot).not.toBeNull();
      if (!snapshot) return;

      writeFileSync(path.join(dir, "new-file.ts"), "// new");
      const touched = computeTouched(dir, snapshot);
      expect(touched.touched).toContain("new-file.ts");
      expect(touched.preExistingDirty.length).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("excludes pre-existing dirty files from touched", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      writeFileSync(path.join(dir, "pre-existing.ts"), "// old");
      const snapshot = captureSnapshot(dir);
      expect(snapshot).not.toBeNull();
      if (!snapshot) return;

      writeFileSync(path.join(dir, "new-file.ts"), "// new");
      const touched = computeTouched(dir, snapshot);
      expect(touched.touched).not.toContain("pre-existing.ts");
      expect(touched.touched).toContain("new-file.ts");
      expect(touched.preExistingDirty).toContain("pre-existing.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("runShipPreflight", () => {
  test("passes for clean git repo with changes", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      const snapshot = captureSnapshot(dir)!;
      writeFileSync(path.join(dir, "new.ts"), "// new");
      const touched = computeTouched(dir, snapshot);

      const preflight = runShipPreflight(dir, snapshot, touched);
      expect(preflight.ok).toBe(true);
      expect(preflight.errors).toEqual([]);
      expect(preflight.touched).toContain("new.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("warns on pre-existing dirty files", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      writeFileSync(path.join(dir, "pre-existing.ts"), "// old");
      const snapshot = captureSnapshot(dir)!;
      writeFileSync(path.join(dir, "new.ts"), "// new");
      const touched = computeTouched(dir, snapshot);

      const preflight = runShipPreflight(dir, snapshot, touched);
      expect(preflight.warnings.length).toBeGreaterThan(0);
      expect(preflight.warnings[0]).toContain("Pre-existing dirty");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("errors when no files changed", () => {
    const dir = getTestDir();
    try {
      initGitRepo(dir);
      const snapshot = captureSnapshot(dir)!;
      const touched = computeTouched(dir, snapshot);

      const preflight = runShipPreflight(dir, snapshot, touched);
      expect(preflight.ok).toBe(false);
      expect(preflight.errors).toContain("No files were changed. Nothing to ship.");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
