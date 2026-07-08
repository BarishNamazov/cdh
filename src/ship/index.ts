import { execSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { CdhConfig } from "../config.ts";

export interface RunSnapshot {
  startRef: string;
  startStatus: string;
  preExistingDirty: string[];
  preExistingStaged: string[];
}

export interface TouchedResult {
  touched: string[];
  preExistingDirty: string[];
  committed: boolean;
}

function runGit(cwd: string, args: string[]): string {
  try {
    return execSync(`git ${args.join(" ")}`, { cwd, encoding: "utf8", stdio: "pipe" }).trim();
  } catch {
    return "";
  }
}

function isGitRepo(cwd: string): boolean {
  return existsSync(path.join(cwd, ".git"));
}

export function captureSnapshot(cwd: string): RunSnapshot | null {
  if (!isGitRepo(cwd)) return null;

  const startRef = runGit(cwd, ["rev-parse", "HEAD"]) || "unborn";
  const startStatus = runGit(cwd, ["status", "--porcelain"]);

  const preExistingDirty: string[] = [];
  const preExistingStaged: string[] = [];

  for (const line of startStatus.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const status = trimmed.slice(0, 2);
    const filePath = trimmed.slice(3);

    const isUntracked = status[0] === "?" && status[1] === "?";
    if (isUntracked) {
      preExistingDirty.push(filePath);
      continue;
    }

    const isStaged = status[0] !== " ";
    const isModified = status[1] !== " ";

    if (isStaged) {
      preExistingStaged.push(filePath);
    }
    if (isModified && !isStaged) {
      preExistingDirty.push(filePath);
    }
    if (isModified && isStaged) {
      preExistingStaged.push(filePath);
    }
  }

  return { startRef, startStatus, preExistingDirty, preExistingStaged };
}

export function computeTouched(cwd: string, snapshot: RunSnapshot): TouchedResult {
  const currentStatus = runGit(cwd, ["status", "--porcelain"]);

  const touched: string[] = [];
  const preExistingDirty: string[] = [];

  const snapshotFiles = new Set([
    ...snapshot.preExistingDirty,
    ...snapshot.preExistingStaged
  ]);

  for (const line of currentStatus.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const filePath = trimmed.slice(3);
    const status = trimmed.slice(0, 2);
    const isUntracked = status[0] === "?" && status[1] === "?";

    if (snapshotFiles.has(filePath)) {
      if (!isUntracked) preExistingDirty.push(filePath);
      continue;
    }

    touched.push(filePath);
  }

  const newUntracked = runGit(cwd, ["ls-files", "--others", "--exclude-standard"])
    .split("\n")
    .filter(Boolean)
    .filter((f) => !snapshotFiles.has(f));

  for (const file of newUntracked) {
    if (!touched.includes(file)) {
      touched.push(file);
    }
  }

  return { touched, preExistingDirty, committed: false };
}

export function isMergeInProgress(cwd: string): boolean {
  return existsSync(path.join(cwd, ".git", "MERGE_HEAD"));
}

export function isRebaseInProgress(cwd: string): boolean {
  return existsSync(path.join(cwd, ".git", "rebase-merge")) ||
    existsSync(path.join(cwd, ".git", "rebase-apply"));
}

export interface ShipPreflightResult {
  ok: boolean;
  errors: string[];
  warnings: string[];
  touched: string[];
  preExistingDirty: string[];
}

export function runShipPreflight(
  cwd: string,
  snapshot: RunSnapshot,
  _touched: TouchedResult
): ShipPreflightResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isGitRepo(cwd)) {
    errors.push("Not a git repository. Ship requires a git repository.");
  }

  if (isMergeInProgress(cwd)) {
    errors.push("Merge in progress. Resolve or abort the merge before shipping.");
  }

  if (isRebaseInProgress(cwd)) {
    errors.push("Rebase in progress. Resolve or abort the rebase before shipping.");
  }

  if (snapshot.preExistingDirty.length > 0 || snapshot.preExistingStaged.length > 0) {
    const dirty = snapshot.preExistingDirty;
    const staged = snapshot.preExistingStaged;
    const msg = `Pre-existing dirty/staged files detected: ${[...dirty, ...staged].join(", ")}`;

    warnings.push(msg);
  }

  if (_touched.touched.length === 0) {
    errors.push("No files were changed. Nothing to ship.");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    touched: _touched.touched,
    preExistingDirty: [...snapshot.preExistingDirty, ...snapshot.preExistingStaged]
  };
}
