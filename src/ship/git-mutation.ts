import { execSync } from "node:child_process";
import path from "node:path";
import type { CdhConfig } from "../config.ts";

export interface GitMutationResult {
  ok: boolean;
  branch?: string;
  commitSha?: string;
  prUrl?: string;
  errors: string[];
}

function runGit(cwd: string, args: string[]): { success: boolean; output: string } {
  try {
    const out = execSync(`git ${args.join(" ")}`, {
      cwd,
      encoding: "utf8",
      stdio: "pipe",
      timeout: 30_000
    }).trim();
    return { success: true, output: out };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return { success: false, output: msg };
  }
}

export function commitShip(
  cwd: string,
  config: CdhConfig,
  runId: string,
  touchedFiles: string[],
  message: string = "ship: CDH auto-commit"
): GitMutationResult {
  const errors: string[] = [];

  for (const file of touchedFiles) {
    const result = runGit(cwd, ["add", "--", file]);
    if (!result.success) {
      errors.push(`Failed to stage ${file}: ${result.output}`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const fullMessage = `${message}\n\nCdh-Run: ${runId}`;
  const commitResult = runGit(cwd, ["commit", "-m", fullMessage]);

  if (!commitResult.success) {
    errors.push(`Failed to commit: ${commitResult.output}`);
    return { ok: false, errors };
  }

  const shaResult = runGit(cwd, ["rev-parse", "HEAD"]);
  const commitSha = shaResult.success ? shaResult.output : undefined;

  return { ok: true, commitSha, errors: [] };
}

export function createShipBranch(
  cwd: string,
  config: CdhConfig,
  runId: string
): GitMutationResult {
  const errors: string[] = [];
  let branchName = `${config.ship.branchPrefix}${runId}`;

  const checkResult = runGit(cwd, ["rev-parse", "--verify", branchName]);
  if (checkResult.success) {
    const suffix = Math.random().toString(36).slice(2, 5);
    branchName = `${config.ship.branchPrefix}${runId}-${suffix}`;
  }

  const result = runGit(cwd, ["checkout", "-b", branchName]);
  if (!result.success) {
    errors.push(`Failed to create branch ${branchName}: ${result.output}`);
    return { ok: false, errors };
  }

  return { ok: true, branch: branchName, errors: [] };
}

export function pushBranch(
  cwd: string,
  branch: string
): GitMutationResult {
  const errors: string[] = [];

  const result = runGit(cwd, ["push", "-u", "origin", branch]);
  if (!result.success) {
    errors.push(`Failed to push ${branch}: ${result.output}`);
    return { ok: false, errors };
  }

  return { ok: true, branch, errors: [] };
}

export function createPullRequest(
  cwd: string,
  branch: string,
  title: string,
  body: string = ""
): GitMutationResult {
  const errors: string[] = [];

  try {
    const prBody = body || `Automated CDH ship.`;
    const result = execSync(
      `gh pr create --head "${branch}" --title "${title}" --body "${prBody}"`,
      {
        cwd,
        encoding: "utf8",
        stdio: "pipe",
        timeout: 30_000
      }
    ).trim();

    return { ok: true, branch, prUrl: result, errors: [] };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`Failed to create PR: ${msg}`);
    return { ok: false, errors };
  }
}
