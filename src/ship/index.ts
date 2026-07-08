import { existsSync } from "node:fs";
import path from "node:path";

export interface ShipRunSnapshot {
  startRef: string;
  startStatus: string;
  preExistingDirty: string[];
  preExistingStaged: string[];
}

export interface TouchedResult {
  touched: string[];
  preExistingDirty: string[];
}

export function runGit(cwd: string, args: string[]): { success: boolean; output: string } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  return {
    success: proc.exitCode === 0,
    output: new TextDecoder().decode(proc.stdout).trim(),
  };
}

function isGitRepo(cwd: string): boolean {
  return existsSync(path.join(cwd, ".git"));
}

export function captureSnapshot(cwd: string): ShipRunSnapshot | null {
  if (!isGitRepo(cwd)) return null;

  const refResult = runGit(cwd, ["rev-parse", "HEAD"]);
  const startRef = refResult.success ? refResult.output : "unborn";
  const statusResult = runGit(cwd, ["status", "--porcelain"]);
  const startStatus = statusResult.output;

  const preExistingDirty: string[] = [];
  const preExistingStaged: string[] = [];

  for (const line of startStatus.split("\n")) {
    if (line.length < 4) continue;
    const status = line.slice(0, 2);
    const filePath = line.slice(3);

    const isUntracked = status === "??";
    if (isUntracked) {
      preExistingDirty.push(filePath);
      continue;
    }

    const indexStatus = status[0]!;
    const worktreeStatus = status[1]!;
    const isStaged = indexStatus !== " " && indexStatus !== "?";
    const isModified = worktreeStatus !== " " && worktreeStatus !== "?";

    if (isStaged) {
      preExistingStaged.push(filePath);
    }
    if (isModified && !isStaged) {
      preExistingDirty.push(filePath);
    }
  }

  return { startRef, startStatus, preExistingDirty, preExistingStaged };
}

export function computeTouched(cwd: string, snapshot: ShipRunSnapshot): TouchedResult {
  const statusResult = runGit(cwd, ["status", "--porcelain"]);
  const _touched: string[] = [];
  const preExistingDirty: string[] = [];
  const touchedSet = new Set<string>();

  const snapshotFiles = new Set([...snapshot.preExistingDirty, ...snapshot.preExistingStaged]);

  for (const line of statusResult.output.split("\n")) {
    if (line.length < 4) continue;
    const filePath = line.slice(3);
    const status = line.slice(0, 2);
    const isUntracked = status === "??";

    if (snapshotFiles.has(filePath)) {
      if (!isUntracked) preExistingDirty.push(filePath);
      continue;
    }

    touchedSet.add(filePath);
  }

  const untracked = runGit(cwd, ["ls-files", "--others", "--exclude-standard"]);
  for (const file of untracked.output.split("\n").filter(Boolean)) {
    if (!snapshotFiles.has(file)) {
      touchedSet.add(file);
    }
  }

  return {
    touched: [...touchedSet],
    preExistingDirty: [...new Set([...snapshot.preExistingDirty, ...snapshot.preExistingStaged])],
  };
}

function isMergeInProgress(cwd: string): boolean {
  return existsSync(path.join(cwd, ".git", "MERGE_HEAD"));
}

function isRebaseInProgress(cwd: string): boolean {
  return existsSync(path.join(cwd, ".git", "rebase-merge")) || existsSync(path.join(cwd, ".git", "rebase-apply"));
}

interface ShipPreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  touched: string[];
  preExistingDirty: string[];
}

export function runShipPreflight(cwd: string, _snapshot: ShipRunSnapshot, touched: TouchedResult): ShipPreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isGitRepo(cwd)) {
    errors.push("Not a git repository.");
  }

  if (isMergeInProgress(cwd)) {
    errors.push("Merge in progress. Resolve or abort the merge before shipping.");
  }

  if (isRebaseInProgress(cwd)) {
    errors.push("Rebase in progress. Resolve or abort the rebase before shipping.");
  }

  if (touched.preExistingDirty.length > 0) {
    const display = touched.preExistingDirty.slice(0, 10);
    const suffix = touched.preExistingDirty.length > 10 ? ` and ${touched.preExistingDirty.length - 10} more` : "";
    warnings.push(`Pre-existing dirty/staged files excluded: ${display.join(", ")}${suffix}`);
  }

  if (touched.touched.length === 0) {
    errors.push("No files were changed. Nothing to ship.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    touched: touched.touched,
    preExistingDirty: touched.preExistingDirty,
  };
}
