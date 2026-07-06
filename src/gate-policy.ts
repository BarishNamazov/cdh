import path from "node:path";
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
  allowEngineThisSession(): void;
  isEngineAllowed(): boolean;
}

export function createGatePolicy(cwd: string, config: CdhConfig): GatePolicy {
  let engineAllowed = false;

  const protectedPaths = [
    "src/engine/",
    "src/sdk/",
    ".env"
  ];

  function isProtected(filePath: string): boolean {
    return protectedPaths.some((p) => {
      if (p.endsWith("/")) return filePath.startsWith(p) || filePath.includes(`/${p}`);
      return filePath === p || filePath.startsWith(p) || filePath.endsWith(p);
    });
  }

  return {
    checkMutation(_toolName: string, filePath: string): PolicyHit | null {
      if (!isProtected(filePath)) return null;
      if (engineAllowed) return null;

      return {
        rule: "R5",
        severity: "block",
        path: filePath,
        message: `R5 protected path: writing to '${filePath}' is blocked. Protected paths include ${protectedPaths.join(", ")}. Run /allow-engine to permit engine/sdk edits for this session.`
      };
    },

    screenBash(command: string): PolicyHit | null {
      const normalized = command.trim();

      if (normalized.includes("rm -rf") && !normalized.includes(cwd)) {
        return {
          rule: "R5",
          severity: "block",
          message: `R5 bash screening: 'rm -rf' outside working directory is blocked. Command: ${normalized.slice(0, 80)}`
        };
      }

      if (normalized.includes("git push --force") || normalized.includes("git push -f")) {
        return {
          rule: "R5",
          severity: "block",
          message: `R5 bash screening: force-push is blocked. Command: ${normalized.slice(0, 80)}`
        };
      }

      if (/>\s*\.env/i.test(normalized) || /\.env\b.*(\||tee|write)/i.test(normalized)) {
        return {
          rule: "R5",
          severity: "block",
          message: `R5 bash screening: writing to .env files is blocked. Command: ${normalized.slice(0, 80)}`
        };
      }

      for (const pp of protectedPaths) {
        const dirEnd = pp.endsWith("/") ? pp : `${pp}/`;
        if (normalized.includes(dirEnd) && !engineAllowed) {
          return {
            rule: "R5",
            severity: "block",
            path: pp,
            message: `R5 bash screening: command references protected path '${pp}'. Run /allow-engine first or use a different approach.`
          };
        }
      }

      return null;
    },

    allowEngineThisSession(): void {
      engineAllowed = true;
    },

    isEngineAllowed(): boolean {
      return engineAllowed;
    }
  };
}
