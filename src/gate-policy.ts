import type { CdhConfig } from "./config.ts";

export interface PolicyHit {
  rule: string;
  severity: "block" | "warn";
  path?: string;
  message: string;
}

export interface GatePolicy {
  checkMutation(toolName: string, filePath: string): PolicyHit | null;
  screenBash(command: string): PolicyHit | null;
}

const PROTECTED_PATHS = [".env"];

function isProtected(filePath: string): boolean {
  return PROTECTED_PATHS.some((p) => filePath === p || filePath.endsWith(`/${p}`) || filePath.endsWith(`\\${p}`));
}

export function createGatePolicy(cwd: string, _config: CdhConfig): GatePolicy {
  return {
    checkMutation(_toolName: string, filePath: string): PolicyHit | null {
      if (!isProtected(filePath)) return null;

      return {
        rule: "protected-path",
        severity: "block",
        path: filePath,
        message: `Writing to protected path '${filePath}' is blocked. Protected paths: ${PROTECTED_PATHS.join(", ")}.`,
      };
    },

    screenBash(command: string): PolicyHit | null {
      const normalized = command.trim();

      if (/\brm\s+(-[rf]+\s*)+/.test(normalized) && !normalized.includes(cwd)) {
        return {
          rule: "dangerous-command",
          severity: "block",
          message: `Recursive deletion outside working directory is blocked.`,
        };
      }

      if (/\bgit\s+push\s+.*--force/.test(normalized) || normalized.includes("git push -f")) {
        return {
          rule: "dangerous-command",
          severity: "block",
          message: `Force-push is blocked.`,
        };
      }

      if (hasEnvRedirect(normalized)) {
        return {
          rule: "dangerous-command",
          severity: "block",
          message: `Writing to .env files through shell redirection is blocked.`,
        };
      }

      for (const pp of PROTECTED_PATHS) {
        if (normalized.includes(pp)) {
          return {
            rule: "dangerous-command",
            severity: "block",
            message: `Command references protected path '${pp}'.`,
          };
        }
      }

      return null;
    },
  };
}

function hasEnvRedirect(command: string): boolean {
  return /\.env\s*[>|]/.test(command) || /[>|]\s*\.env/.test(command);
}
