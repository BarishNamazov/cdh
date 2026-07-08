import path from "node:path";
import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { discoverSyncs } from "./syncs.ts";
import { buildSyncGraph, formatGraphReport, formatGraphJson, formatGraphMermaid, formatGraphDot } from "../tools/sync-graph.ts";
import { runSyncDiagnostics, formatDiagnostics, formatDiagnosticsJson } from "../tools/sync-diagnostics.ts";

const validApp = path.resolve(import.meta.dir, "..", "..", "fixtures", "valid-app");
const syncEngineApp = path.resolve(import.meta.dir, "..", "..", "fixtures", "sync-engine-app");

describe("discoverSyncs - valid-app", () => {
  test("discovers sync in valid-app fixture", async () => {
    const syncs = await discoverSyncs(validApp, defaultConfig);
    expect(syncs).toHaveLength(1);

    const sync = syncs[0]!;
    expect(sync.file.endsWith("label-request.sync.ts")).toBe(true);
    expect(sync.exports).toContain("labelRequestSync");
    expect(sync.testPath).toBeTruthy();
  });
});

describe("discoverSyncs - sync-engine DSL fixture", () => {
  test("discovers all DSL syncs", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    expect(syncs.length).toBe(3);
  });

  test("extracts when/then from basic DSL sync", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    const labelSync = syncs.find((s) => s.file.endsWith("label-request.sync.ts"));
    expect(labelSync).toBeDefined();
    expect(labelSync!.whenActions).toContain("Requesting.createLabelRequested");
    expect(labelSync!.thenActions).toContain("Labeling.addLabel");
    expect(labelSync!.hasWhere).toBe(false);
    expect(labelSync!.hasBranches).toBe(false);
  });

  test("extracts query refs and branches from cascade sync", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    const auditSync = syncs.find((s) => s.file.endsWith("audit-cascade.sync.ts"));
    expect(auditSync).toBeDefined();
    expect(auditSync!.queryRefs.some((qr) => qr.includes("Audit._getEvents"))).toBe(true);
    expect(auditSync!.hasWhere).toBe(true);
    expect(auditSync!.hasBranches).toBe(true);
    expect(auditSync!.thenActions.length).toBeGreaterThan(0);
  });

  test("extracts endpoint paths", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    const authSync = syncs.find((s) => s.file.endsWith("auth-endpoint.sync.ts"));
    expect(authSync).toBeDefined();
    expect(authSync!.endpointPaths).toContain("/auth/login");
  });
});

describe("sync-graph", () => {
  test("builds graph for valid-app", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    expect(graph.nodes.length).toBeGreaterThan(0);
    expect(graph.edges.length).toBeGreaterThan(0);
  });

  test("formats graph as report", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    const report = formatGraphReport(graph);
    expect(report).toContain("Sync Graph Report");
  });

  test("formats graph as JSON", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    const json = formatGraphJson(graph);
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed.nodes)).toBe(true);
    expect(Array.isArray(parsed.edges)).toBe(true);
  });

  test("formats graph as Mermaid", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    expect(formatGraphMermaid(graph)).toContain("graph LR");
  });

  test("formats graph as DOT", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    expect(formatGraphDot(graph)).toContain("digraph SyncGraph");
  });
});

describe("sync-diagnostics", () => {
  test("runs on valid-app", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const report = await runSyncDiagnostics(validApp, defaultConfig, contract);
    expect(report.syncs).toBeGreaterThan(0);
    expect(Array.isArray(report.diagnostics)).toBe(true);
  });

  test("formats diagnostics as report", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const report = await runSyncDiagnostics(validApp, defaultConfig, contract);
    const formatted = formatDiagnostics(report);
    expect(formatted).toContain("Sync Diagnostics Report");
  });

  test("formats diagnostics as JSON", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const report = await runSyncDiagnostics(validApp, defaultConfig, contract);
    const json = formatDiagnosticsJson(report);
    const parsed = JSON.parse(json);
    expect(parsed.syncs).toBeGreaterThan(0);
    expect(Array.isArray(parsed.diagnostics)).toBe(true);
  });
});
