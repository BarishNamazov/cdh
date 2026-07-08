import { describe, expect, test } from "bun:test";
import path from "node:path";
import { defaultConfig } from "./config.ts";
import { assertRepoContractFiles, loadRepoContract, resolveRepoPath } from "./repo-contract.ts";

const validApp = path.resolve(import.meta.dir, "..", "fixtures", "valid-app");

describe("loadRepoContract", () => {
  test("loads the valid-app contract", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);

    expect(contract.helpers.testingModule).toBe("@utils/testing.ts");
    expect(contract.helpers.exports).toContain("track");
    assertRepoContractFiles(validApp, contract);
  });

  test("resolves @ paths to src paths", () => {
    expect(resolveRepoPath(validApp, "@utils/testing.ts")).toBe(path.join(validApp, "src", "utils", "testing.ts"));
  });
});
