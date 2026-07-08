import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { type ClassDeclaration, type MethodDeclaration, Node, Project, SyntaxKind } from "ts-morph";
import type { CdhConfig } from "../config.ts";
import type { RepoContract } from "../repo-contract.ts";
import { walk } from "../utils/fs.ts";
import { type Suppression, applySuppressions, checkUnusedSuppressions, parseSuppression, scanSuppressions } from "./suppressions.ts";
import type { RuleEngine, RuleHit } from "./types.ts";

export function createRuleEngine(cwd: string, config: CdhConfig, contract: RepoContract): RuleEngine {
  const conceptsRoot = path.resolve(cwd, config.paths.concepts);
  const syncsRoot = path.resolve(cwd, config.paths.syncs);
  const specsDir = path.resolve(cwd, contract.specsDir);
  const helperAllowlist = new Set(config.rules.helperMethodAllowlist);
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  let allSuppressions: Suppression[] = [];

  const checkFile = async (filePath: string): Promise<RuleHit[]> => {
    if (!existsSync(filePath)) return [];
    const content = await readFile(filePath, "utf8");
    const hits: RuleHit[] = [];
    if (filePath.endsWith(".sync.test.ts")) {
      hits.push(...(await checkSyncTest(filePath, content)));
    }
    if (isInside(conceptsRoot, filePath) && filePath.endsWith("Concept.ts") && !filePath.endsWith(".test.ts")) {
      hits.push(...checkR1(cwd, config, filePath, content, project));

      const r2hits = checkR2(filePath, content, helperAllowlist, project);
      const r3hits = checkR3(filePath, content, helperAllowlist, project);
      const r4hits = checkR4(filePath, content, project);

      const sf = project.createSourceFile(filePath, content, { overwrite: true });
      const suppressions = [
        ...scanSuppressions(sf, "R2"),
        ...scanSuppressions(sf, "R3"),
        ...scanSuppressions(sf, "R4"),
      ];

      allSuppressions.push(...suppressions);

      hits.push(...applySuppressions(r2hits, suppressions));
      hits.push(...applySuppressions(r3hits, suppressions));
      hits.push(...applySuppressions(r4hits, suppressions));
    }
    return hits;
  };

  const checkSyncTest = async (filePath: string, content: string): Promise<RuleHit[]> => {
    if (!filePath.endsWith(".sync.test.ts")) return [];
    return checkR9(filePath, content, cwd, project);
  };

  return {
    checkContent(filePath, proposed) {
      if (isInside(conceptsRoot, filePath)) return checkR1(cwd, config, filePath, proposed, project);
      return [];
    },
    checkFile,
    async checkRepo() {
      allSuppressions = [];
      const hits: RuleHit[] = [];
      const allFiles: string[] = [];

      if (existsSync(conceptsRoot)) {
        (await walk(conceptsRoot)).forEach((file) => {
          allFiles.push(file);
        });
      }
      if (existsSync(syncsRoot)) {
        (await walk(syncsRoot)).forEach((file) => {
          allFiles.push(file);
        });
      }

      for (const file of allFiles) {
        if (file.endsWith(".ts")) {
          hits.push(...(await checkFile(file)));
        }
      }

      if (existsSync(conceptsRoot)) {
        hits.push(...(await checkR6(conceptsRoot, specsDir, cwd, config)));
        hits.push(...(await checkR7(conceptsRoot)));
        hits.push(...(await checkR8(conceptsRoot, config, contract, cwd, project)));
        hits.push(...(await checkR10(conceptsRoot)));
      }

      if (allSuppressions.length > 0) {
        const unusedWarnings = checkUnusedSuppressions(allSuppressions, hits);
        hits.push(...unusedWarnings);
      }

      return hits;
    },
  };
}

function getConceptClass(filePath: string, sourceText: string, project: Project): ClassDeclaration | null {
  try {
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    return sourceFile.getClasses().find((c) => c.isDefaultExport()) ?? null;
  } catch {
    return null;
  }
}

function getSurfaceMethods(klass: ClassDeclaration, helperAllowlist: Set<string>): MethodDeclaration[] {
  const implementationByName = new Map<string, MethodDeclaration>();
  for (const method of klass.getMethods()) {
    const name = method.getName();
    if (helperAllowlist.has(name)) continue;
    if (name.startsWith("#")) continue;
    if (method.hasModifier(SyntaxKind.StaticKeyword)) continue;
    if (method.hasModifier(SyntaxKind.PrivateKeyword) || method.hasModifier(SyntaxKind.ProtectedKeyword)) continue;
    const existing = implementationByName.get(name);
    if (!existing || (!existing.getBody() && method.getBody())) implementationByName.set(name, method);
  }
  return [...implementationByName.values()].filter((m) => Boolean(m.getBody()));
}

function getConceptName(filePath: string, klass: ClassDeclaration): string {
  const className = klass.getName() ?? path.basename(filePath, ".ts");
  return className.replace(/Concept$/, "");
}

// ── R1: Concept independence ──

function checkR1(cwd: string, config: CdhConfig, filePath: string, proposed: string, project: Project): RuleHit[] {
  const absolutePath = path.resolve(cwd, filePath);
  const conceptsRoot = path.resolve(cwd, config.paths.concepts);
  const owningConceptDir = getOwningConceptDir(conceptsRoot, absolutePath);
  if (!owningConceptDir) return [];
  const imports = getImportSpecifiers(absolutePath, proposed, project);
  return imports.flatMap((specifier) => {
    const reason = r1ImportReason(cwd, config, conceptsRoot, owningConceptDir, absolutePath, specifier);
    if (!reason) return [];
    return [r1Hit(path.relative(cwd, absolutePath), specifier, reason)];
  });
}

function getImportSpecifiers(filePath: string, sourceText: string, project: Project): string[] {
  try {
    const sourceFile = project.createSourceFile(filePath, sourceText, { overwrite: true });
    return sourceFile.getImportDeclarations().map((d) => d.getModuleSpecifierValue());
  } catch {
    return [...sourceText.matchAll(/import\s+(?:[^"']+\s+from\s+)?["']([^"']+)["']/g)].map((m) => m[1] ?? "");
  }
}

function r1ImportReason(
  cwd: string,
  config: CdhConfig,
  conceptsRoot: string,
  owningConceptDir: string,
  filePath: string,
  specifier: string
): string | null {
  if (specifier === "@concepts" || specifier.startsWith("@concepts/")) return "imports through @concepts";
  if (specifier === "@engine" || specifier.startsWith("@engine/")) return "imports engine internals";
  if (specifier.includes("src/syncs") || specifier.startsWith("@syncs/")) return "imports synchronizations";
  const resolved = resolveImport(cwd, filePath, specifier);
  if (!resolved) return null;
  const syncsRoot = path.resolve(cwd, config.paths.syncs);
  if (isInside(syncsRoot, resolved)) return "imports synchronizations";
  if (isInside(path.resolve(cwd, "src/engine"), resolved)) return "imports engine internals";
  if (isInside(conceptsRoot, resolved) && !isInside(owningConceptDir, resolved))
    return "imports another concept directory";
  return null;
}

function r1Hit(filePath: string, specifier: string, reason: string): RuleHit {
  return {
    rule: "R1",
    severity: "block",
    path: filePath,
    message: `R1 concept independence: ${reason} via '${specifier}'. Move cross-concept behavior into a sync or pass opaque data through actions.`,
    fix: "Remove the concept-to-concept import; coordinate concepts from src/syncs instead.",
  };
}

// ── R2: Action signature ──

function checkR2(filePath: string, sourceText: string, helperAllowlist: Set<string>, project: Project): RuleHit[] {
  const klass = getConceptClass(filePath, sourceText, project);
  if (!klass) return [];
  const relativePath = path.relative(process.cwd(), filePath);
  const conceptName = getConceptName(filePath, klass);

  return getSurfaceMethods(klass, helperAllowlist)
    .filter((m) => !m.getName().startsWith("_"))
    .flatMap((m) => {
      const name = m.getName();
      const params = m.getParameters();
      const returnType = m.getReturnType();
      const issues: string[] = [];

      if (params.length !== 1) {
        issues.push(`takes ${params.length} parameter${params.length !== 1 ? "s" : ""} instead of exactly one object`);
      } else {
        const paramType = returnTypeTextFallback(params[0]);
        if (paramType && !isObjectType(paramType) && paramType !== "unknown") {
          issues.push(`parameter type '${paramType}' is not an object`);
        }
      }

      const returnText = returnType.getText();
      if (!isObjectOrPromiseType(returnText)) {
        issues.push(`returns '${returnText || "void"}' instead of an object or Promise<object>`);
      }

      if (issues.length === 0) return [];

      return [
        {
          rule: "R2",
          severity: "warn",
          path: relativePath,
          message: `R2 action signature: ${conceptName}.${name} ${issues.join("; ")}. Actions must take exactly one object parameter and return an object or Promise<object>.`,
          fix: `Update ${conceptName}.${name} signature to take a single input object and return an object.`,
        },
      ];
    });
}

function returnTypeTextFallback(param: unknown): string | undefined {
  if (param && typeof param === "object" && "getTypeNode" in param) {
    const node = (param as { getTypeNode(): { getText(): string } | undefined }).getTypeNode();
    if (node) return node.getText();
  }
  if (param && typeof param === "object" && "getType" in param) {
    return (param as { getType(): { getText(): string } }).getType().getText();
  }
  return undefined;
}

function isObjectType(typeText: string): boolean {
  const trimmed = typeText.trim();
  return trimmed.startsWith("{") || trimmed === "object" || trimmed.includes("Record<");
}

function isObjectOrPromiseType(typeText: string): boolean {
  const trimmed = typeText.trim();
  return (
    trimmed.startsWith("{") || trimmed.startsWith("Promise<{") || trimmed === "object" || trimmed.includes("Record<")
  );
}

// ── R3: Query signature ──

function checkR3(filePath: string, sourceText: string, helperAllowlist: Set<string>, project: Project): RuleHit[] {
  const klass = getConceptClass(filePath, sourceText, project);
  if (!klass) return [];
  const relativePath = path.relative(process.cwd(), filePath);
  const conceptName = getConceptName(filePath, klass);

  return getSurfaceMethods(klass, helperAllowlist)
    .filter((m) => m.getName().startsWith("_"))
    .flatMap((m) => {
      const name = m.getName();
      const returnType = m.getReturnType();
      const returnText = returnType.getText();

      const isArray = returnText.endsWith("[]") || returnText.startsWith("Array<") || returnText.startsWith("Promise<");

      if (isArray) return [];

      return [
        {
          rule: "R3",
          severity: "warn",
          path: relativePath,
          message: `R3 query signature: ${conceptName}.${name} returns '${returnText}' instead of an array or Promise<array>. Queries must return an array.`,
          fix: `Update ${conceptName}.${name} to return an array.`,
        },
      ];
    });
}

// ── R4: Placement and naming ──

function checkR4(filePath: string, sourceText: string, project: Project): RuleHit[] {
  const klass = getConceptClass(filePath, sourceText, project);
  if (!klass) return [];
  const relativePath = path.relative(process.cwd(), filePath);
  const conceptName = getConceptName(filePath, klass);
  const className = klass.getName() ?? "";

  const dirName = path.basename(path.dirname(filePath));
  const expectedClass = `${dirName}Concept`;

  if (className !== expectedClass) {
    return [
      {
        rule: "R4",
        severity: "warn",
        path: relativePath,
        message: `R4 placement/naming: class '${className}' in ${dirName}/ must be named '${expectedClass}' to match its directory.`,
        fix: `Rename the default export class to '${expectedClass}'.`,
      },
    ];
  }

  if (!conceptName || conceptName !== dirName) {
    return [];
  }

  return [];
}

// ── R6: Spec presence ──

async function checkR6(conceptsRoot: string, specsDir: string, cwd: string, _config: CdhConfig): Promise<RuleHit[]> {
  const conceptDirs = await getSubdirs(conceptsRoot);
  const requiredSections = ["purpose", "principle", "state", "actions"];

  const hits: RuleHit[] = [];
  for (const dir of conceptDirs) {
    const specPath = path.join(specsDir, `${dir.toLowerCase()}.md`);
    if (!existsSync(specPath)) {
      hits.push({
        rule: "R6",
        severity: "fail-ship",
        path: path.relative(cwd, specPath),
        message: `R6 spec presence: concept '${dir}' is missing its spec at '${specPath}'.`,
        fix: `Create ${specPath} with required sections: ${requiredSections.join(", ")}.`,
      });
      continue;
    }

    const content = await readFile(specPath, "utf8");
    const lowerContent = content.toLowerCase();
    const missing = requiredSections.filter((section) => !lowerContent.includes(`## ${section}`));
    if (missing.length > 0) {
      hits.push({
        rule: "R6",
        severity: "fail-ship",
        path: path.relative(cwd, specPath),
        message: `R6 spec presence: spec for '${dir}' is missing required sections: ${missing.join(", ")}.`,
        fix: `Add ## ${missing.join(", ## ")} sections to ${path.relative(cwd, specPath)}.`,
      });
    }
  }
  return hits;
}

// ── R7: Test presence ──

async function checkR7(conceptsRoot: string): Promise<RuleHit[]> {
  const files = await walk(conceptsRoot);
  const conceptFiles = files.filter((f) => f.endsWith("Concept.ts") && !f.endsWith(".test.ts"));
  const hits: RuleHit[] = [];

  for (const conceptFile of conceptFiles) {
    const testFile = conceptFile.replace(/\.ts$/, ".test.ts");
    if (!existsSync(testFile)) {
      const dirName = path.basename(path.dirname(conceptFile));
      hits.push({
        rule: "R7",
        severity: "fail-ship",
        path: path.relative(process.cwd(), conceptFile),
        message: `R7 test presence: concept '${dirName}' has no colocated test file. Expected '${testFile}'.`,
        fix: `Create ${testFile} with testAction() and expectError() calls.`,
      });
    }
  }
  return hits;
}

// ── R8: Surface coverage (static advisory check) ──

async function checkR8(
  conceptsRoot: string,
  config: CdhConfig,
  _contract: RepoContract,
  cwd: string,
  project: Project
): Promise<RuleHit[]> {
  const conceptFiles = (await walk(conceptsRoot)).filter((f) => f.endsWith("Concept.ts") && !f.endsWith(".test.ts"));
  const hits: RuleHit[] = [];

  for (const conceptFile of conceptFiles) {
    const testFile = conceptFile.replace(/\.ts$/, ".test.ts");
    if (!existsSync(testFile)) continue;

    const testContent = await readFile(testFile, "utf8");
    const conceptContent = await readFile(conceptFile, "utf8");
    const klass = getConceptClass(conceptFile, conceptContent, project);
    if (!klass) continue;

    const surfaceMethods = getSurfaceMethods(klass, new Set(config.rules.helperMethodAllowlist));
    const dirName = path.basename(path.dirname(conceptFile));

    const hasTrack = testContent.includes("track(");

    if (!hasTrack && surfaceMethods.length > 0) {
      const uncovered = surfaceMethods.map((m) => m.getName());
      hits.push({
        rule: "R8",
        severity: "fail-ship",
        path: path.relative(cwd, testFile),
        message: `R8 surface coverage (heuristic): ${dirName} tests do not use track(). Uncovered methods: ${uncovered.join(", ")}.`,
        fix: "Wrap concept instances with track(...) from the testing module named in design/index.json.",
      });
    }
  }
  return hits;
}

// ── R9: Sync test shape ──

async function checkR9(filePath: string, content: string, cwd: string, project: Project): Promise<RuleHit[]> {
  const relativePath = path.relative(cwd, filePath);
  const hits: RuleHit[] = [];
  const hasSetupSyncTest = content.includes("setupSyncTest");

  const sf = project.createSourceFile(filePath, content, { overwrite: true });
  const testCalls = sf.getDescendantsOfKind(SyntaxKind.CallExpression).filter((c) => {
    const expr = c.getExpression();
    return (
      Node.isIdentifier(expr) && (expr.getText() === "test" || expr.getText() === "describe" || expr.getText() === "it")
    );
  });
  const hasPositive = testCalls.some((c) => {
    const firstArg = c.getArguments()[0];
    if (Node.isStringLiteral(firstArg)) {
      const name = firstArg.getLiteralText().toLowerCase();
      return !name.includes("does not") && !name.includes("negative");
    }
    return false;
  });
  const hasNegative = testCalls.some((c) => {
    const firstArg = c.getArguments()[0];
    if (Node.isStringLiteral(firstArg)) {
      const name = firstArg.getLiteralText().toLowerCase();
      return name.includes("does not") || name.includes("negative");
    }
    return false;
  });

  if (!hasSetupSyncTest) {
    hits.push({
      rule: "R9",
      severity: "fail-ship",
      path: relativePath,
      message: `R9 sync test shape: '${relativePath}' does not use setupSyncTest helper.`,
      fix: "Use setupSyncTest() from the testing module named in design/index.json.",
    });
  }

  if (!hasPositive) {
    hits.push({
      rule: "R9",
      severity: "fail-ship",
      path: relativePath,
      message: `R9 sync test shape: '${relativePath}' has no positive test case.`,
      fix: "Add at least one positive case using setupSyncTest.",
    });
  }

  if (!hasNegative) {
    hits.push({
      rule: "R9",
      severity: "fail-ship",
      path: relativePath,
      message: `R9 sync test shape: '${relativePath}' has no negative test case. Add a test with 'does not' or 'negative' in the name.`,
      fix: "Add at least one negative case using setupSyncTest.",
    });
  }

  return hits;
}

// ── R10: Legible tests ──

async function checkR10(conceptsRoot: string): Promise<RuleHit[]> {
  const files = await walk(conceptsRoot);
  const testFiles = files.filter((f) => f.endsWith(".test.ts"));
  const hits: RuleHit[] = [];

  for (const testFile of testFiles) {
    const content = await readFile(testFile, "utf8");
    const hasTrace = content.includes("trace(") || content.includes("console.log");
    const hasPrinciple = content.toLowerCase().includes("principle");
    const hasTestAction = content.includes("testAction(");

    const needsNarration = hasPrinciple || hasTestAction;
    if (!needsNarration) continue;

    const isSuppressed = isR10Suppressed(content);

    if (!hasTrace) {
      hits.push({
        rule: "R10",
        severity: isSuppressed ? "warn" : "fail-ship",
        path: path.relative(process.cwd(), testFile),
        message: `R10 legible tests: '${path.basename(testFile)}' has principle/testAction tests but no trace() or console.log narration.`,
        fix: "Add trace() calls (from the testing module) or console.log to narrate test intent.",
        suppressed: isSuppressed ? { reason: "R10 suppressed via cdh-ignore" } : undefined,
      });
    }
  }
  return hits;
}

function isR10Suppressed(content: string): boolean {
  const lines = content.split("\n");
  const firstFiveNonBlank = lines.slice(0, 5).filter((l) => l.trim() !== "");
  return firstFiveNonBlank.some((line) => {
    const parsed = parseSuppression(line);
    return parsed !== null && parsed.rule === "R10";
  });
}

// ── Shared utilities ──

function resolveImport(cwd: string, filePath: string, specifier: string): string | null {
  if (specifier.startsWith(".")) return path.resolve(path.dirname(filePath), specifier);
  if (specifier.startsWith("src/")) return path.resolve(cwd, specifier);
  return null;
}

function getOwningConceptDir(conceptsRoot: string, filePath: string): string | null {
  if (!isInside(conceptsRoot, filePath)) return null;
  const relative = path.relative(conceptsRoot, filePath).split(path.sep);
  if (relative.length < 2) return null;
  return path.join(conceptsRoot, relative[0] ?? "");
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function getSubdirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name);
}
