import type { Plugin } from "@opencode-ai/plugin";

export const CdhVerification: Plugin = async (ctx) => {
  return {
    "session.idle": async () => {
      await ctx.$`npx tsx bin/cdh.ts verify`;
    },
    "experimental.session.compacting": async (_input, output) => {
      output.context.push(`## CDH Verification State
Run \`npx tsx bin/cdh.ts verify\` before declaring work complete.
All concepts must pass R1-R10 rules. Syncs must have colocated tests.`);
    },
  };
};
