import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig, type CdhConfig } from "../src/config.ts";
import { loadRepoContract, type RepoContract } from "../src/repo-contract.ts";
import { traceSyncAction, formatTraceResult } from "../src/tools/trace-sync.ts";
import { listSyncs, formatSyncs } from "../src/tools/list-syncs.ts";
import { listConcepts, formatConcepts } from "../src/tools/list-concepts.ts";
import { describeConcept, formatConceptDetail } from "../src/tools/describe-concept.ts";
import { readDesignDoc, formatDesignDoc } from "../src/tools/design-doc.ts";
import { checkSpecSync, formatSpecDiff } from "../src/tools/spec-sync.ts";

async function resolveCtx(cwd: string): Promise<{ config: CdhConfig; contract: RepoContract }> {
  const config = await loadConfig(cwd);
  const { contract } = await loadRepoContract(cwd, config);
  return { config, contract };
}

export default function conceptTools(pi: ExtensionAPI): void {
  pi.registerTool({
    name: "list_concepts",
    label: "List Concepts",
    description: "List all concepts in the repo with action/query counts, spec status, and test status.",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const { config, contract } = await resolveCtx(cwd);
      const concepts = await listConcepts(cwd, config, contract);
      return {
        content: [{ type: "text", text: formatConcepts(concepts, cwd) }],
        details: { concepts }
      };
    }
  });

  pi.registerTool({
    name: "describe_concept",
    label: "Describe Concept",
    description: "Show detailed surface (actions, queries, signatures) and spec for a concept.",
    parameters: Type.Object({ name: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const { config, contract } = await resolveCtx(cwd);
      const result = await describeConcept(cwd, config, contract, params.name);

      if (!result) {
        return { content: [{ type: "text", text: `Concept '${params.name}' not found.` }], details: { found: false } };
      }

      return {
        content: [{ type: "text", text: formatConceptDetail(result, cwd) }],
        details: { concept: result }
      };
    }
  });

  pi.registerTool({
    name: "list_syncs",
    label: "List Syncs",
    description: "List all syncs with their when/then action references. Optionally filter by concept.",
    parameters: Type.Object({ concept: Type.Optional(Type.String()) }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const { config, contract } = await resolveCtx(cwd);
      const syncs = await listSyncs(cwd, config, contract, params.concept);
      return {
        content: [{ type: "text", text: formatSyncs(syncs, cwd, params.concept) }],
        details: { syncs }
      };
    }
  });

  pi.registerTool({
    name: "trace_sync",
    label: "Trace Sync",
    description: "Given a concept action (e.g. 'Labeling.addLabel'), list all syncs whose when/then reference it. Flags orphaned actions.",
    parameters: Type.Object({ action: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const { config, contract } = await resolveCtx(cwd);

      try {
        const result = await traceSyncAction(cwd, config, contract, params.action);
        return {
          content: [{ type: "text", text: formatTraceResult(result) }],
          details: { trace: result }
        };
      } catch (err) {
        return {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          details: { error: true }
        };
      }
    }
  });

  pi.registerTool({
    name: "read_design_doc",
    label: "Read Design Doc",
    description: "Read a design document by its key (e.g. 'testing-conventions', 'concept-spec-conventions'). Lists available keys on error.",
    parameters: Type.Object({ key: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const { config, contract } = await resolveCtx(cwd);
      const result = readDesignDoc(cwd, contract, params.key);
      return {
        content: [{ type: "text", text: formatDesignDoc(result) }],
        details: result
      };
    }
  });

  pi.registerTool({
    name: "spec_lint",
    label: "Spec Lint",
    description: "Check a concept's spec file for required sections and alignment with code surface (actions/queries).",
    parameters: Type.Object({ name: Type.String() }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const cwd = ctx.cwd ?? process.cwd();
      const { config, contract } = await resolveCtx(cwd);
      const diff = await checkSpecSync(cwd, config, contract, params.name);

      if (!diff) {
        return {
          content: [{ type: "text", text: `Concept '${params.name}' not found or has no spec file.` }],
          details: { found: false }
        };
      }

      return {
        content: [{ type: "text", text: formatSpecDiff(diff) }],
        details: { diff }
      };
    }
  });
}
