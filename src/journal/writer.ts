import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { JournalEntry } from "./types.ts";

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

  writeEntry(entry: JournalEntry): void {
    if (this.degraded) return;

    if (this.tryWrite(`${JSON.stringify(entry)}\n`)) {
      this.seq = Math.max(this.seq, entry.seq);
    }
  }

  nextSequence(): number {
    return this.seq + 1;
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
