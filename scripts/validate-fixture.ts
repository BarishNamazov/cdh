import { existsSync } from "node:fs";
import path from "node:path";
import { defaultConfig } from "../src/config.ts";
import { assertRepoContractFiles, loadRepoContract } from "../src/repo-contract.ts";

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

const repoRoot = path.resolve(Bun.argv[2] ?? "fixtures/valid-app");
const indexPath = path.join(repoRoot, "design/index.json");

if (!existsSync(indexPath)) {
  fail(`Missing repo contract: ${indexPath}`);
}

const { contract } = await loadRepoContract(repoRoot, defaultConfig).catch((error: unknown) => {
  fail(error instanceof Error ? error.message : String(error));
});

assertRepoContractFiles(repoRoot, contract);

for (const key of requiredDocs) if (!contract.docs[key]) fail(`Missing docs key: ${key}`);

for (const helperName of requiredHelpers) {
  if (!contract.helpers.exports.includes(helperName)) fail(`Missing helper export in contract: ${helperName}`);
}

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
