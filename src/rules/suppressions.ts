import type { RuleHit } from "./types.ts";
import type { MethodDeclaration, SourceFile } from "ts-morph";

export interface Suppression {
  rule: string;
  reason: string;
  type: "construct" | "file";
  sourceFile?: SourceFile;
  methodName?: string;
}

export function scanSuppressions(
  sourceFile: SourceFile,
  forRule: string
): Suppression[] {
  const fullText = sourceFile.getFullText();
  const lines = fullText.split("\n");
  const suppressions: Suppression[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    const match = line.match(/\/\/\s*cdh-ignore\s+(R\d+)\s+(.+)/);
    if (!match) continue;

    const rule = match[1] ?? "";
    const reason = (match[2] ?? "").trim();

    if (!reason) continue;
    if (rule !== forRule) continue;

    if (isConstructLevelRule(rule)) {
      const nextConstruct = findNextConstruct(sourceFile, line, i, lines);
      if (nextConstruct) {
        suppressions.push({ rule, reason, type: "construct", sourceFile, methodName: nextConstruct });
      }
    }

    if (rule === "R10") {
      const isFileLevel = i < 5 && !lines.slice(0, i).every((l) => l.trim() === "");
      const firstFiveNonBlank = lines
        .slice(0, 5)
        .filter((l) => l.trim() !== "");

      if (firstFiveNonBlank.includes(line)) {
        suppressions.push({ rule, reason, type: "file" });
      }
    }
  }

  return suppressions;
}

export function isSupressibleRule(rule: string): boolean {
  return rule === "R2" || rule === "R3" || rule === "R4" || rule === "R10";
}

function isConstructLevelRule(rule: string): boolean {
  return rule === "R2" || rule === "R3" || rule === "R4";
}

function findNextConstruct(
  _sourceFile: SourceFile,
  _line: string,
  lineIndex: number,
  lines: string[]
): string | null {
  for (let j = lineIndex + 1; j < lines.length; j++) {
    const nextLine = (lines[j] ?? "").trim();
    if (nextLine === "" || nextLine.startsWith("//")) continue;

    const methodMatch = nextLine.match(/(\w+)\s*\(/);
    if (methodMatch) return methodMatch[1] ?? null;

    const fieldMatch = nextLine.match(/^(?:public\s+)?(\w+)\s*[:(=;]/);
    if (fieldMatch) return fieldMatch[1] ?? null;

    return null;
  }
  return null;
}

export function applySuppressions(
  hits: RuleHit[],
  suppressions: Suppression[]
): RuleHit[] {
  return hits.map((hit) => {
    if (!isSupressibleRule(hit.rule)) return hit;

    const relevantSuppression = suppressions.find((suppression) => {
      if (suppression.rule !== hit.rule) return false;

      if (suppression.type === "file") return true;

      if (suppression.type === "construct" && suppression.methodName) {
        return hit.message.includes(suppression.methodName);
      }

      return false;
    });

    if (relevantSuppression) {
      return {
        ...hit,
        severity: "warn",
        suppressed: { reason: relevantSuppression.reason }
      };
    }

    return hit;
  });
}

export function checkUnusedSuppressions(
  suppressions: Suppression[],
  hits: RuleHit[]
): Omit<RuleHit, "suppressed">[] {
  const warnings: Omit<RuleHit, "suppressed">[] = [];

  for (const suppression of suppressions) {
    const wasUsed = hits.some((hit) => {
      if (hit.rule !== suppression.rule) return false;
      return hit.suppressed?.reason === suppression.reason;
    });

    if (!wasUsed) {
      warnings.push({
        rule: suppression.rule,
        severity: "warn",
        path: "",
        message: `Unused cdh-ignore ${suppression.rule}: no matching hit found for '${suppression.reason}'. Remove or fix the suppression comment.`
      });
    }
  }

  return warnings;
}

export function parseSuppression(line: string): { rule: string; reason: string } | null {
  const match = line.match(/\/\/\s*cdh-ignore\s+(R\d+)\s+(.+)/);
  if (!match) return null;
  const reason = (match[2] ?? "").trim();
  if (!reason) return null;
  return { rule: match[1] ?? "", reason };
}
