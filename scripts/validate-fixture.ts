import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const RepoContractSchema = Type.Object({
  specsDir: Type.String(),
  docs: Type.Record(Type.String(), Type.String()),
  helpers: Type.Object({
    testingModule: Type.String(),
    exports: Type.Array(Type.String())
  }),
  scripts: Type.Object({
    test: Type.String(),
    typecheck: Type.String(),
    start: Type.String()
  }),
  health: Type.Object({
    path: Type.String()
  })
});

const requiredHelpers = ["setupTestDb", "trace", "track", "testAction", "expectError", "setupSyncTest"];
const requiredDocs = [
  "concept-spec-conventions",
  "implementation-conventions",
  "sync-conventions",
  "testing-conventions"
];

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function resolveRepoPath(repoRoot: string, repoPath: string): string {
  return path.resolve(repoRoot, repoPath.replace(/^@/, "src/"));
}

const repoRoot = path.resolve(Bun.argv[2] ?? "fixtures/valid-app");
const indexPath = path.join(repoRoot, "design/index.json");

if (!existsSync(indexPath)) {
  fail(`Missing repo contract: ${indexPath}`);
}

const contract = JSON.parse(await readFile(indexPath, "utf8"));
if (!Value.Check(RepoContractSchema, contract)) {
  fail(`Invalid repo contract: ${JSON.stringify([...Value.Errors(RepoContractSchema, contract)], null, 2)}`);
}

for (const key of requiredDocs) {
  const docPath = contract.docs[key];
  if (!docPath) fail(`Missing docs key: ${key}`);
  if (!existsSync(path.resolve(repoRoot, docPath))) fail(`Missing doc for ${key}: ${docPath}`);
}

for (const helperName of requiredHelpers) {
  if (!contract.helpers.exports.includes(helperName)) fail(`Missing helper export in contract: ${helperName}`);
}

const testingModulePath = resolveRepoPath(repoRoot, contract.helpers.testingModule);
if (!existsSync(testingModulePath)) fail(`Missing testing module: ${contract.helpers.testingModule}`);

const requiredFiles = [
  "src/concepts/Labeling/LabelingConcept.ts",
  "src/concepts/Labeling/LabelingConcept.test.ts",
  "src/syncs/label-request.sync.ts",
  "src/syncs/label-request.sync.test.ts",
  contract.specsDir + "/labeling.md"
];

for (const relativePath of requiredFiles) {
  if (!existsSync(path.resolve(repoRoot, relativePath))) fail(`Missing required fixture file: ${relativePath}`);
}

console.log(`Fixture contract valid: ${repoRoot}`);
