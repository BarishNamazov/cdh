import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { Project, SyntaxKind, Node, type CallExpression } from "ts-morph";
import { type CdhConfig } from "../config.ts";

export type SyncParser = "legacy" | "sync-engine-static" | "graph";

export interface SyncModel {
  file: string;
  exports: string[];
  whenActions: string[];
  thenActions: string[];
  queryRefs: string[];
  endpointPaths: string[];
  hasWhere: boolean;
  hasBranches: boolean;
  testPath?: string;
  parser: SyncParser;
}

const CONCEPT_RE = /^[A-Z]\w*$/;

function isPascalCase(name: string): boolean {
  return CONCEPT_RE.test(name);
}

function extractConceptRefsFromSubtree(node: Node): string[] {
  const refs = new Set<string>();

  if (Node.isPropertyAccessExpression(node)) {
    const obj = node.getExpression();
    if (Node.isIdentifier(obj) && isPascalCase(obj.getText())) {
      refs.add(`${obj.getText()}.${node.getName()}`);
    }
  }

  if (Node.isArrayLiteralExpression(node)) {
    for (const el of node.getElements()) {
      for (const ref of extractConceptRefsFromSubtree(el)) {
        refs.add(ref);
      }
    }
  }

  if (Node.isCallExpression(node)) {
    const name = getCallName(node);
    if (name === "Request" || name === "Respond" || name === "Fail" || name === "Actions") {
      for (const arg of node.getArguments()) {
        for (const ref of extractConceptRefsFromSubtree(arg)) {
          refs.add(ref);
        }
      }
    }
  }

  for (const child of node.getChildren()) {
    for (const ref of extractConceptRefsFromSubtree(child)) {
      refs.add(ref);
    }
  }

  return [...refs].sort();
}

function getCallName(call: CallExpression): string {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return "";
}

function isDslCall(call: CallExpression, names: string[]): boolean {
  const name = getCallName(call);
  return names.includes(name);
}

export async function discoverSyncs(cwd: string, config: CdhConfig): Promise<SyncModel[]> {
  const syncsRoot = path.resolve(cwd, config.paths.syncs);
  if (!existsSync(syncsRoot)) return [];

  const files = (await walk(syncsRoot)).filter(
    (file) => file.endsWith(".sync.ts") && !file.endsWith(".test.ts")
  );

  const project = new Project({ skipAddingFilesFromTsConfig: true });
  return files
    .map((file) => syncFromFile(file, project))
    .filter((sync): sync is SyncModel => sync !== null)
    .sort((a, b) => a.file.localeCompare(b.file));
}

function syncFromFile(file: string, project: Project): SyncModel | null {
  const sourceFile = project.addSourceFileAtPathIfExists(file);
  if (!sourceFile) return null;

  const exportNames = sourceFile.getVariableDeclarations()
    .filter((v) => v.isExported())
    .map((v) => v.getName());

  const text = sourceFile.getFullText();

  const whenActions = new Set<string>();
  const thenActions = new Set<string>();
  const queryRefs = new Set<string>();
  const endpointPaths = new Set<string>();
  let hasWhere = false;
  let hasBranches = false;

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = getCallName(call);

    if (name === "when") {
      for (const ref of extractConceptRefsFromExpression(call.getExpression())) {
        whenActions.add(ref);
      }
      for (const arg of call.getArguments()) {
        for (const ref of extractConceptRefsFromSubtree(arg)) {
          whenActions.add(ref);
        }
      }
    }

    if (name === "act") {
      for (const arg of call.getArguments()) {
        for (const ref of extractConceptRefsFromSubtree(arg)) {
          thenActions.add(ref);
        }
      }
    }

    if (name === "query") {
      if (call.getArguments().length > 0) {
        const firstArg = call.getArguments()[0];
        for (const ref of extractConceptRefsFromSubtree(firstArg!)) {
          queryRefs.add(ref);
        }
      }
    }

    if (name === "Actions") {
      for (const arg of call.getArguments()) {
        for (const ref of extractConceptRefsFromSubtree(arg)) {
          thenActions.add(ref);
        }
      }
    }

    if (name === "defineEndpoint") {
      if (call.getArguments().length > 0) {
        const firstArg = call.getArguments()[0];
        if (Node.isStringLiteral(firstArg!)) {
          endpointPaths.add(firstArg!.getLiteralText());
        }
      }
      for (const child of call.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        for (const ref of extractConceptRefsFromExpression(child)) {
          whenActions.add(ref);
        }
      }
    }

    for (const arg of call.getArguments()) {
      if (Node.isStringLiteral(arg)) {
        const lit = arg.getLiteralText();
        if (lit.startsWith("/") || lit.startsWith("@/")) {
          endpointPaths.add(lit);
        }
      }
    }
  }

  const whereRe = text.match(/\.where\s*\(/g);
  if (whereRe && whereRe.length > 0) hasWhere = true;

  const branchRe = text.match(/\.branch\s*\(/g);
  const onRe = text.match(/[^.]\bon\s*\(/g);
  const onErrorRe = text.match(/[^.]\bonError\s*\(/g);
  if ((branchRe && branchRe.length > 0) || (onRe && onRe.length > 0) || (onErrorRe && onErrorRe.length > 0)) {
    hasBranches = true;
  }

  const hasDslPatterns =
    whenActions.size > 0 ||
    thenActions.size > 0 ||
    queryRefs.size > 0 ||
    endpointPaths.size > 0;

  if (!hasDslPatterns) {
    const legacyWhen = extractLegacyRefs(text, "when");
    const legacyThen = extractLegacyRefs(text, "then");

    if (legacyWhen.length > 0 || legacyThen.length > 0) {
      for (const ref of legacyWhen) whenActions.add(ref);
      for (const ref of legacyThen) thenActions.add(ref);

      const testPath = siblingIfExists(file.replace(/\.ts$/, ".test.ts"));

      return {
        file,
        exports: exportNames,
        whenActions: [...whenActions].sort(),
        thenActions: [...thenActions].sort(),
        queryRefs: [],
        endpointPaths: [],
        hasWhere: false,
        hasBranches: false,
        testPath,
        parser: "legacy"
      };
    }
  }

  const parser: SyncParser = hasDslPatterns ? "sync-engine-static" : "legacy";
  const testPath = siblingIfExists(file.replace(/\.ts$/, ".test.ts"));

  return {
    file,
    exports: exportNames,
    whenActions: [...whenActions].sort(),
    thenActions: [...thenActions].sort(),
    queryRefs: [...queryRefs].sort(),
    endpointPaths: [...endpointPaths].sort(),
    hasWhere,
    hasBranches,
    testPath,
    parser
  };
}

function extractConceptRefsFromExpression(expr: Node): string[] {
  const refs = new Set<string>();

  if (Node.isPropertyAccessExpression(expr)) {
    const obj = expr.getExpression();
    if (Node.isIdentifier(obj) && isPascalCase(obj.getText())) {
      refs.add(`${obj.getText()}.${expr.getName()}`);
    }
  }

  for (const child of expr.getChildren()) {
    for (const ref of extractConceptRefsFromExpression(child)) {
      refs.add(ref);
    }
  }

  return [...refs].sort();
}

function extractLegacyRefs(text: string, pattern: string): string[] {
  const refs = new Set<string>();
  const regex = new RegExp(`${pattern}\\s*:\\s*(?:Sync\\(|[^,{]*?)([A-Z]\\w+)\\.(\\w+)`, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const concept = match[1];
    const action = match[2];
    if (concept && action) {
      refs.add(`${concept}.${action}`);
    }
  }
  return [...refs].sort();
}

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const entryPath = path.join(dir, entry.name);
      return entry.isDirectory() ? walk(entryPath) : [entryPath];
    })
  );
  return nested.flat();
}

function siblingIfExists(file: string): string | undefined {
  return existsSync(file) ? file : undefined;
}
