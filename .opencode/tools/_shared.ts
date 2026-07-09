import { type CdhConfig, loadConfig } from "@/config.ts";
import { loadRepoContract, type RepoContract } from "@/repo-contract.ts";

export async function resolveCtx(cwd: string): Promise<{ config: CdhConfig; contract: RepoContract }> {
  const config = await loadConfig(cwd);
  const { contract } = await loadRepoContract(cwd, config);
  return { config, contract };
}

export async function resolveConfig(cwd: string): Promise<CdhConfig> {
  return loadConfig(cwd);
}

export const ENV_CAST = process.env as Record<string, string | undefined>;
