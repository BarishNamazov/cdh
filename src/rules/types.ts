export type Severity = "block" | "warn" | "fail-ship";

export interface RuleHit {
  rule: string;
  severity: Severity;
  path: string;
  message: string;
  fix?: string;
  suppressed?: { reason: string };
}

export interface RuleEngine {
  checkContent(path: string, proposed: string): RuleHit[];
  checkFile(path: string): Promise<RuleHit[]>;
  checkRepo(scope: "all"): Promise<RuleHit[]>;
}
