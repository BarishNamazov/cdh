import { existsSync } from "node:fs";
import path from "node:path";
import { type CallExpression, Node, Project, SyntaxKind } from "ts-morph";
import type { CdhConfig } from "../config.ts";
import { siblingIfExists, walkLimited } from "../utils/fs.ts";

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
}

const CONCEPT_RE = /^[A-Z]\w*$/;

function isPascalConcept(name: string): boolean {
  return CONCEPT_RE.test(name);
}

function extractCallName(call: CallExpression): string {
  const expr = call.getExpression();
  if (Node.isIdentifier(expr)) return expr.getText();
  if (Node.isPropertyAccessExpression(expr)) return expr.getName();
  return "";
}

function extractConceptRefs(node: Node): string[] {
  const refs = new Set<string>();

  if (Node.isPropertyAccessExpression(node)) {
    const obj = node.getExpression();
    if (Node.isIdentifier(obj) && isPascalConcept(obj.getText())) {
      refs.add(`${obj.getText()}.${node.getName()}`);
    }
  }

  if (Node.isArrayLiteralExpression(node)) {
    for (const el of node.getElements()) {
      for (const ref of extractConceptRefs(el)) {
        refs.add(ref);
      }
    }
  }

  if (Node.isCallExpression(node)) {
    const name = extractCallName(node);
    if (name === "Request" || name === "Respond" || name === "Fail" || name === "Actions") {
      for (const arg of node.getArguments()) {
        for (const ref of extractConceptRefs(arg)) {
          refs.add(ref);
        }
      }
    }
  }

  for (const child of node.getChildren()) {
    for (const ref of extractConceptRefs(child)) {
      refs.add(ref);
    }
  }

  return [...refs].sort();
}

export async function discoverSyncs(cwd: string, config: CdhConfig): Promise<SyncModel[]> {
  const syncsRoot = path.resolve(cwd, config.paths.syncs);
  if (!existsSync(syncsRoot)) return [];

  const files = (await walkLimited(syncsRoot)).filter((f) => f.endsWith(".sync.ts") && !f.endsWith(".test.ts"));

  const results: SyncModel[] = [];

  for (const file of files) {
    const project = new Project({ skipAddingFilesFromTsConfig: true });
    const model = syncFromFile(project, file);
    project.removeSourceFile(project.getSourceFiles()[0]!);
    if (model) results.push(model);
  }

  return results.sort((a, b) => a.file.localeCompare(b.file));
}

function syncFromFile(project: Project, file: string): SyncModel | null {
  const sourceFile = project.addSourceFileAtPathIfExists(file);
  if (!sourceFile) return null;

  const exportNames = sourceFile
    .getVariableDeclarations()
    .filter((v) => v.isExported())
    .map((v) => v.getName());

  const whenActions = new Set<string>();
  const thenActions = new Set<string>();
  const queryRefs = new Set<string>();
  const endpointPaths = new Set<string>();
  let hasWhere = false;
  let hasBranches = false;

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const name = extractCallName(call);
    const args = call.getArguments();

    if (name === "when") {
      for (const arg of args) {
        for (const ref of extractConceptRefs(arg)) {
          whenActions.add(ref);
        }
      }
    }

    if (name === "act") {
      for (const arg of args) {
        for (const ref of extractConceptRefs(arg)) {
          thenActions.add(ref);
        }
      }
    }

    if (name === "query" && args.length > 0) {
      const firstArg = args[0]!;
      for (const ref of extractConceptRefs(firstArg)) {
        queryRefs.add(ref);
      }
    }

    if (name === "Actions") {
      for (const arg of args) {
        for (const ref of extractConceptRefs(arg)) {
          thenActions.add(ref);
        }
      }
    }

    if (name === "defineEndpoint" && args.length > 0) {
      const firstArg = args[0];
      if (Node.isStringLiteral(firstArg!)) {
        endpointPaths.add(firstArg?.getLiteralText());
      }
    }

    if (name === "where") hasWhere = true;
    if (name === "branch" || name === "on") hasBranches = true;
    if (name === "onError") hasBranches = true;
  }

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
  };
}
