import path from "node:path";
import { describe, expect, test } from "bun:test";
import { defaultConfig } from "../config.ts";
import { loadRepoContract } from "../repo-contract.ts";
import { discoverSyncs } from "./syncs.ts";
import { buildSyncGraph, formatGraphReport, formatGraphJson, formatGraphMermaid, formatGraphDot } from "../tools/sync-graph.ts";
import { runSyncDiagnostics, formatDiagnostics, formatDiagnosticsJson } from "../tools/sync-diagnostics.ts";

const validApp = path.resolve(import.meta.dir, "..", "..", "fixtures", "valid-app");
const syncEngineApp = path.resolve(import.meta.dir, "..", "..", "fixtures", "sync-engine-app");

describe("discoverSyncs - legacy fixture", () => {
  test("discovers legacy syncs in valid-app", async () => {
    const syncs = await discoverSyncs(validApp, defaultConfig);
    expect(syncs).toHaveLength(1);

    const sync = syncs[0]!;
    expect(sync.file.endsWith("label-request.sync.ts")).toBe(true);
    expect(sync.exports).toContain("labelRequestSync");
    expect(sync.whenActions).toContain("Requesting.createLabelRequested");
    expect(sync.thenActions).toContain("Labeling.addLabel");
    expect(sync.queryRefs).toEqual([]);
    expect(sync.endpointPaths).toEqual([]);
    expect(sync.hasWhere).toBe(false);
    expect(sync.hasBranches).toBe(false);
    expect(sync.parser).toBe("legacy");
    expect(sync.testPath).toBeTruthy();
  });
});

describe("discoverSyncs - sync-engine DSL fixture", () => {
  test("discovers DSL syncs in sync-engine-app", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);

    expect(syncs.length).toBe(3);

    const labelSync = syncs.find((s) => s.file.endsWith("label-request.sync.ts"));
    expect(labelSync).toBeDefined();
    expect(labelSync!.exports).toContain("labelRequestSync");
    expect(labelSync!.whenActions).toContain("Requesting.createLabelRequested");
    expect(labelSync!.thenActions).toContain("Labeling.addLabel");
    expect(labelSync!.parser).toBe("sync-engine-static");

    const auditSync = syncs.find((s) => s.file.endsWith("audit-cascade.sync.ts"));
    expect(auditSync).toBeDefined();
    expect(auditSync!.exports).toContain("AuditLabelCreate");
    expect(auditSync!.whenActions).toContain("Labeling.addLabel");
    expect(auditSync!.thenActions.length).toBeGreaterThan(0);
    expect(auditSync!.queryRefs.length).toBeGreaterThan(0);
    expect(auditSync!.hasWhere).toBe(true);
    expect(auditSync!.hasBranches).toBe(true);
    expect(auditSync!.parser).toBe("sync-engine-static");

    const authSync = syncs.find((s) => s.file.endsWith("auth-endpoint.sync.ts"));
    expect(authSync).toBeDefined();
    expect(authSync!.exports).toContain("auth");
    expect(authSync!.endpointPaths.length).toBeGreaterThan(0);
    expect(authSync!.parser).toBe("sync-engine-static");
  });

  test("detects query refs in audit cascade sync", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    const auditSync = syncs.find((s) => s.file.endsWith("audit-cascade.sync.ts"));
    expect(auditSync).toBeDefined();
    expect(auditSync!.queryRefs.some((qr) => qr.includes("Audit._getEvents"))).toBe(true);
  });

  test("detects endpoint paths", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    const authSync = syncs.find((s) => s.file.endsWith("auth-endpoint.sync.ts"));
    expect(authSync).toBeDefined();
    expect(authSync!.endpointPaths).toContain("/auth/login");
  });

  test("detects branches via on/onError", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    const auditSync = syncs.find((s) => s.file.endsWith("audit-cascade.sync.ts"));
    expect(auditSync).toBeDefined();
    expect(auditSync!.hasBranches).toBe(true);
  });

  test("legacy sync has no where or branches", async () => {
    const syncs = await discoverSyncs(syncEngineApp, defaultConfig);
    const labelSync = syncs.find((s) => s.file.endsWith("label-request.sync.ts"));
    expect(labelSync).toBeDefined();
    expect(labelSync!.hasWhere).toBe(false);
    expect(labelSync!.hasBranches).toBe(false);
  });
});

describe("sync-graph", () => {
  test("builds graph for legacy fixture", async () => {
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
    expect(report).toContain("Syncs:");
  });

  test("formats graph as JSON", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    const json = formatGraphJson(graph);
    const parsed = JSON.parse(json);

    expect(parsed.nodes).toBeInstanceOf(Array);
    expect(parsed.edges).toBeInstanceOf(Array);
  });

  test("formats graph as Mermaid", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    const mermaid = formatGraphMermaid(graph);

    expect(mermaid).toContain("graph LR");
  });

  test("formats graph as DOT", async () => {
    const { contract } = await loadRepoContract(validApp, defaultConfig);
    const graph = await buildSyncGraph(validApp, defaultConfig, contract);
    const dot = formatGraphDot(graph);

    expect(dot).toContain("digraph SyncGraph");
    expect(dot).toContain("rankdir=LR");
  });
});

describe("sync-diagnostics", () => {
  test("runs diagnostics on valid-app", async () => {
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
    expect(formatted).toContain("Syncs analyzed:");
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
