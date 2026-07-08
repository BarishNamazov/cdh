import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.resolve(__dirname, "..", "templates");

export interface InitResult {
  created: string[];
  skipped: string[];
  errors: string[];
}

export function initProject(cwd: string): InitResult {
  const created: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  function rel(p: string): string {
    return path.relative(cwd, p);
  }

  function ensureDir(dir: string): void {
    if (!existsSync(dir)) {
      try {
        mkdirSync(dir, { recursive: true });
      } catch (e) {
        errors.push(`Failed to create directory ${rel(dir)}: ${e}`);
      }
    }
  }

  // ---- empty directories ----

  for (const d of ["design/background", "design/journal"]) {
    ensureDir(path.join(cwd, d));
  }

  // ---- copy template tree ----

  const projectName = path.basename(cwd);

  function copyDir(srcDir: string, destDir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(srcDir);
    } catch {
      return;
    }

    for (const entry of entries) {
      const src = path.join(srcDir, entry);
      const dest = path.join(destDir, entry);
      const st = statSync(src);

      if (st.isDirectory()) {
        copyDir(src, dest);
      } else {
        const suffix = path.extname(entry);
        const isSubstitutable = suffix === ".json" || suffix === ".md" || suffix === "" || suffix === ".txt";

        if (existsSync(dest)) {
          skipped.push(rel(dest));
          continue;
        }

        try {
          ensureDir(path.dirname(dest));

          if (isSubstitutable) {
            let content = readFileSync(src, "utf8");
            content = content.replace(/\{\{name\}\}/g, projectName);
            writeFileSync(dest, content, { encoding: "utf8", mode: 0o644 });
          } else {
            copyFileSync(src, dest);
          }

          created.push(rel(dest));
        } catch (e) {
          errors.push(`Failed to write ${rel(dest)}: ${e}`);
        }
      }
    }
  }

  copyDir(TEMPLATES, cwd);

  return { created, skipped, errors };
}
