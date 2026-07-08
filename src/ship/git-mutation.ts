import type { CdhConfig } from "../config.ts";

export interface GitMutationResult {
  ok: boolean;
  branch?: string;
  commitSha?: string;
  prUrl?: string;
  errors: string[];
}

function runGit(cwd: string, args: string[]): { success: boolean; output: string } {
  const proc = Bun.spawnSync(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe"
  });
  return {
    success: proc.exitCode === 0,
    output: new TextDecoder().decode(proc.stdout).trim()
  };
}

export function commitShip(
  cwd: string,
  config: CdhConfig,
  runId: string,
  touchedFiles: string[],
  message: string = "ship: CDH auto-commit"
): GitMutationResult {
  if (touchedFiles.length === 0) {
    return { ok: false, errors: ["No files to commit."] };
  }

  const addResult = runGit(cwd, ["add", "--", ...touchedFiles]);
  if (!addResult.success) {
    return { ok: false, errors: [`Failed to stage files: ${addResult.output}`] };
  }

  const fullMessage = `${message}\n\nCdh-Run: ${runId}`;
  const commitResult = runGit(cwd, ["commit", "-m", fullMessage]);

  if (!commitResult.success) {
    return { ok: false, errors: [`Failed to commit: ${commitResult.output}`] };
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
  let branchName = `${config.ship.branchPrefix}${runId}`;

  const checkResult = runGit(cwd, ["rev-parse", "--verify", branchName]);
  if (checkResult.success) {
    const suffix = Math.random().toString(36).slice(2, 5);
    branchName = `${config.ship.branchPrefix}${runId}-${suffix}`;
  }

  const result = runGit(cwd, ["checkout", "-b", branchName]);
  if (!result.success) {
    return { ok: false, errors: [`Failed to create branch ${branchName}: ${result.output}`] };
  }

  return { ok: true, branch: branchName, errors: [] };
}

export function pushBranch(
  cwd: string,
  remote: string,
  branch: string
): GitMutationResult {
  const result = runGit(cwd, ["push", "-u", remote, branch]);
  if (!result.success) {
    return { ok: false, errors: [`Failed to push ${branch}: ${result.output}`] };
  }

  return { ok: true, branch, errors: [] };
}

export function createPullRequest(
  cwd: string,
  branch: string,
  title: string,
  body: string = ""
): GitMutationResult {
  try {
    const proc = Bun.spawnSync([
      "gh", "pr", "create",
      "--head", branch,
      "--title", title,
      "--body", body || "Automated CDH ship."
    ], {
      cwd,
      stdout: "pipe",
      stderr: "pipe"
    });

    if (proc.exitCode !== 0) {
      const errMsg = new TextDecoder().decode(proc.stderr).trim();
      return { ok: false, errors: [`Failed to create PR: ${errMsg}`] };
    }

    const prUrl = new TextDecoder().decode(proc.stdout).trim();
    return { ok: true, branch, prUrl, errors: [] };
  } catch (err) {
    return { ok: false, errors: [`Failed to create PR: ${err instanceof Error ? err.message : String(err)}`] };
  }
}
