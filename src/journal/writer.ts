import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

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

    try {
      appendFileSync(this.filePath, line, "utf8");
      this.seq++;
    } catch {
      this.markDegraded();
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

    try {
      appendFileSync(this.filePath, `${JSON.stringify(entry)}\n`, "utf8");
      this.seq++;
    } catch {
      this.markDegraded();
    }
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
