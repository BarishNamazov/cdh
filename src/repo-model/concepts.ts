import { existsSync } from "node:fs";
import path from "node:path";
import { ClassDeclaration, MethodDeclaration, Project, SyntaxKind } from "ts-morph";
import { type CdhConfig } from "../config.ts";
import { type RepoContract } from "../repo-contract.ts";
import { walk, siblingIfExists } from "../utils/fs.ts";

export interface ConceptMethod {
  name: string;
  parameters: string[];
  returnType: string;
}

export interface ConceptModel {
  name: string;
  file: string;
  actions: ConceptMethod[];
  queries: ConceptMethod[];
  specPath?: string;
  testPath?: string;
}

export async function discoverConcepts(cwd: string, config: CdhConfig, contract: RepoContract): Promise<ConceptModel[]> {
  const conceptsRoot = path.resolve(cwd, config.paths.concepts);
  if (!existsSync(conceptsRoot)) return [];

  const files = (await walk(conceptsRoot)).filter((file) => file.endsWith("Concept.ts") && !file.endsWith(".test.ts"));
  const project = new Project({ skipAddingFilesFromTsConfig: true });

  return files
    .map((file) => conceptFromFile(cwd, file, project, config, contract))
    .filter((concept): concept is ConceptModel => concept !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function conceptFromFile(
  cwd: string,
  file: string,
  project: Project,
  config: CdhConfig,
  contract: RepoContract
): ConceptModel | null {
  const sourceFile = project.addSourceFileAtPathIfExists(file);
  if (!sourceFile) return null;

  const defaultClass = sourceFile.getClasses().find((candidate) => candidate.isDefaultExport());
  if (!defaultClass) return null;
  return conceptFromClass(cwd, file, defaultClass, config, contract);
}

function conceptFromClass(
  cwd: string,
  file: string,
  classDeclaration: ClassDeclaration,
  config: CdhConfig,
  contract: RepoContract
): ConceptModel {
  const className = classDeclaration.getName() ?? path.basename(file, ".ts");
  const name = className.replace(/Concept$/, "");
  const methods = enumerateSurfaceMethods(classDeclaration.getMethods(), config.rules.helperMethodAllowlist);
  const actions = methods.filter((method) => !method.name.startsWith("_"));
  const queries = methods.filter((method) => method.name.startsWith("_"));
  const testPath = siblingIfExists(file.replace(/\.ts$/, ".test.ts"));
  const specPath = siblingIfExists(path.resolve(cwd, contract.specsDir, `${name.toLowerCase()}.md`));

  return { name, file, actions, queries, specPath, testPath };
}

export function enumerateSurfaceMethods(methods: MethodDeclaration[], helperAllowlist: string[] | Set<string>): ConceptMethod[] {
  const allowSet = helperAllowlist instanceof Set ? helperAllowlist : new Set(helperAllowlist);
  const implementationByName = new Map<string, MethodDeclaration>();

  for (const method of methods) {
    const name = method.getName();
    if (allowSet.has(name)) continue;
    if (name.startsWith("#")) continue;
    if (method.hasModifier(SyntaxKind.StaticKeyword)) continue;
    if (method.hasModifier(SyntaxKind.PrivateKeyword) || method.hasModifier(SyntaxKind.ProtectedKeyword)) continue;

    const existing = implementationByName.get(name);
    if (!existing || (!existing.getBody() && method.getBody())) implementationByName.set(name, method);
  }

  return [...implementationByName.entries()]
    .filter(([, method]) => Boolean(method.getBody()))
    .map(([name, method]) => ({
      name,
      parameters: method.getParameters().map((parameter) => parameter.getTypeNode()?.getText() ?? parameter.getType().getText()),
      returnType: method.getReturnTypeNode()?.getText() ?? method.getReturnType().getText()
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
