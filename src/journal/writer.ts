import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 50;

export class JsonlWriter {
  private degraded = false;
  private seq = 0;

  constructor(private readonly filePath: string) {
    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.seq = this.countExistingLines();
  }

  write(data: Record<string, unknown>): void {
    if (this.degraded) return;

    const line = JSON.stringify(data);
    if (!line.endsWith("\n")) {
      throw new Error("JSONL line must end with newline");
    }

    if (this.tryWrite(line)) {
      this.seq++;
    }
  }

  writeEvent(eventType: string, data: Record<string, unknown>, runId: string): void {
    if (this.degraded) return;

    const entry = {
      runId,
      seq: this.seq + 1,
      ts: new Date().toISOString(),
      type: eventType,
      ...data,
    };

    if (this.tryWrite(`${JSON.stringify(entry)}\n`)) {
      this.seq++;
    }
  }

  private tryWrite(line: string): boolean {
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        appendFileSync(this.filePath, line, "utf8");
        return true;
      } catch {
        if (attempt < MAX_RETRIES) {
          Bun.sleepSync(RETRY_DELAY_MS * attempt);
        }
      }
    }
    this.markDegraded();
    return false;
  }

  isDegraded(): boolean {
    return this.degraded;
  }

  markDegraded(): void {
    this.degraded = true;
  }

  getSequence(): number {
    return this.seq;
  }

  private countExistingLines(): number {
    try {
      if (!existsSync(this.filePath)) return 0;
      const content = readFileSync(this.filePath, "utf8");
      if (!content.trim()) return 0;
      return content.split("\n").filter((line) => line.trim()).length;
    } catch {
      return 0;
    }
  }
}
