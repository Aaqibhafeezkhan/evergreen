import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";

import { InMemoryTransport } from "@modelcontextprotocol/server";

import { createEvergreenMcpServer } from "../src/mcp.js";
import { renderUpgradeReport } from "../src/upgrade/command.js";
import { checkUpgrade, parseUpgradeTarget } from "../src/upgrade/index.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeReport } from "../src/upgrade/types.js";

const cli = resolve("dist/src/cli.js");

interface RpcResponse {
  id?: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

function analyzer(overrides: Partial<UpgradeAnalyzer> & Pick<UpgradeAnalyzer, "id">): UpgradeAnalyzer {
  return {
    runtimes: ["nodejs"],
    applies: async () => true,
    analyze: async () => [],
    ...overrides,
  };
}

function issue(overrides: Pick<UpgradeIssue, "level" | "subject" | "path"> & Partial<UpgradeIssue>): UpgradeIssue {
  return {
    analyzer: "fake",
    reason: "reason",
    evidence: { kind: "lockfile", value: "value" },
    ...overrides,
  };
}

test("parses a target and expands the runtime aliases", () => {
  assert.deepEqual(parseUpgradeTarget("nodejs@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("node@20"), { runtime: "nodejs", version: "20" });
  assert.deepEqual(parseUpgradeTarget("py@3.13"), { runtime: "python", version: "3.13" });
  assert.deepEqual(parseUpgradeTarget("golang@1.23"), { runtime: "go", version: "1.23" });
  assert.deepEqual(parseUpgradeTarget("Dart@3.5"), { runtime: "dart", version: "3.5" });
  for (const invalid of ["dart", "@3.5", "dart@", ""]) assert.equal(parseUpgradeTarget(invalid), undefined, invalid);
});

test("reports unknown without an applicable analyzer, ready with none, and blocked with one", async () => {
  const target = { runtime: "nodejs", version: "22" };
  const none = await checkUpgrade(".", target, [analyzer({ id: "none", applies: async () => false })]);
  assert.equal(none.verdict, "unknown");
  assert.deepEqual(none.analyzers, []);

  const ready = await checkUpgrade(".", target, [analyzer({ id: "ok" })]);
  assert.equal(ready.verdict, "ready");
  assert.deepEqual(ready.analyzers, ["ok"]);

  const blocked = await checkUpgrade(".", target, [analyzer({ id: "bad", analyze: async () => [issue({ level: "blocker", subject: "x", path: "x" })] })]);
  assert.equal(blocked.verdict, "blocked");
});

test("sorts issues by level, path, line, subject, and analyzer", async () => {
  const issues = [
    issue({ level: "unknown", subject: "b", path: "b.txt", analyzer: "z" }),
    issue({ level: "warning", subject: "z", path: "a.txt", analyzer: "a" }),
    issue({ level: "blocker", subject: "b", path: "b.txt", line: 5, analyzer: "b" }),
    issue({ level: "blocker", subject: "a", path: "b.txt", line: 5, analyzer: "a" }),
    issue({ level: "blocker", subject: "a", path: "a.txt", line: 9, analyzer: "a" }),
    issue({ level: "blocker", subject: "a", path: "a.txt", line: 2, analyzer: "b" }),
  ];
  const report = await checkUpgrade(".", { runtime: "nodejs", version: "22" }, [analyzer({ id: "fake", analyze: async () => [...issues] })]);
  assert.deepEqual(
    report.issues.map((entry) => `${entry.level} ${entry.path}:${entry.line ?? "-"} ${entry.subject} ${entry.analyzer}`),
    [
      "blocker a.txt:2 a b",
      "blocker a.txt:9 a a",
      "blocker b.txt:5 a a",
      "blocker b.txt:5 b b",
      "warning a.txt:- z a",
      "unknown b.txt:- b z",
    ],
  );
});

test("runs only the analyzers that handle the runtime, and lists them sorted", async () => {
  const report = await checkUpgrade(".", { runtime: "nodejs", version: "22" }, [
    analyzer({ id: "b" }),
    analyzer({ id: "a" }),
    analyzer({ id: "other", runtimes: ["python"] }),
  ]);
  assert.deepEqual(report.analyzers, ["a", "b"]);
  assert.equal(report.schemaVersion, "evergreen.upgrade.v1");
});

test("renders the verdict, the counts, each issue, and the unknown caveat", () => {
  const report: UpgradeReport = {
    schemaVersion: "evergreen.upgrade.v1",
    target: { runtime: "dart", version: "3.5" },
    verdict: "blocked",
    analyzers: ["fake"],
    issues: [
      issue({ level: "blocker", subject: "resolved package set", path: "pubspec.lock", line: 11, reason: "requires Dart >=3.6.0 <4.0.0.", evidence: { kind: "lockfile", value: ">=3.6.0 <4.0.0" } }),
      issue({ level: "blocker", subject: "environment.sdk", path: "pubspec.yaml", reason: "requires Dart >=3.6.0 <4.0.0." }),
      issue({ level: "warning", subject: "package", path: "pubspec.lock", reason: "deprecated." }),
      issue({ level: "unknown", subject: "set", path: "pubspec.lock", reason: "missing." }),
    ],
  };
  assert.equal(
    renderUpgradeReport(report),
    [
      "blocked: dart@3.5 (2 blockers, 1 warning, 1 unknown)",
      "pubspec.lock:11  resolved package set  requires Dart >=3.6.0 <4.0.0.  [lockfile >=3.6.0 <4.0.0]",
      "pubspec.yaml  environment.sdk  requires Dart >=3.6.0 <4.0.0.  [lockfile value]",
      "pubspec.lock  package  deprecated.  [lockfile value]",
      "pubspec.lock  set  missing.  [lockfile value]",
    ].join("\n"),
  );
  assert.equal(
    renderUpgradeReport({ ...report, verdict: "unknown", issues: [] }),
    "unknown: dart@3.5\nEvergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.",
  );
});

async function callCheckUpgrade(path: string, target: string): Promise<unknown> {
  const server = createEvergreenMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (response: RpcResponse) => void>();
  let nextId = 1;
  clientTransport.onmessage = (message) => {
    const response = message as RpcResponse;
    if (typeof response.id === "number") pending.get(response.id)?.(response);
  };
  await clientTransport.start();
  await server.connect(serverTransport);
  const request = async (method: string, params: Record<string, unknown>) => {
    const id = nextId;
    nextId += 1;
    const response = new Promise<RpcResponse>((resolvePromise) => pending.set(id, resolvePromise));
    await clientTransport.send({ jsonrpc: "2.0", id, method, params } as never);
    const received = await response;
    pending.delete(id);
    if (received.error) throw new Error(received.error.message ?? "MCP request failed");
    return received.result ?? {};
  };
  try {
    await request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "evergreen-test", version: "1.0.0" } });
    await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
    const result = await request("tools/call", { name: "check_upgrade", arguments: { path, target } });
    return result.structuredContent;
  } finally {
    await clientTransport.close();
    await server.close();
  }
}

test("the CLI and the MCP tool return the same report, and it validates against the schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-"));
  try {
    const run = spawnSync(process.execPath, [cli, "upgrade-check", "--to", "nodejs@22", root, "--json"], { encoding: "utf8" });
    assert.equal(run.status, 0, run.stderr);
    const report = JSON.parse(run.stdout) as Record<string, unknown>;
    assert.deepEqual(report, { schemaVersion: "evergreen.upgrade.v1", target: { runtime: "nodejs", version: "22" }, verdict: "unknown", analyzers: [], issues: [] });
    const fromMcp = await callCheckUpgrade(root, "nodejs@22");
    assert.deepEqual(fromMcp, report);

    const { Ajv2020 } = await import("ajv/dist/2020.js");
    const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8")) as Record<string, unknown>;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    assert.equal(validate(report), true, JSON.stringify(validate.errors));
    assert.equal(validate(fromMcp), true, JSON.stringify(validate.errors));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("exits 0 for unknown and 2 for bad input", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-"));
  const upgrade = (...args: string[]) => spawnSync(process.execPath, [cli, "upgrade-check", ...args], { encoding: "utf8" });
  try {
    const unknown = upgrade("--to", "dart@3.5", root);
    assert.equal(unknown.status, 0, unknown.stderr);
    assert.match(unknown.stdout, /^unknown: dart@3\.5/);
    assert.match(
      unknown.stdout,
      /Evergreen found no evidence for this runtime in this repository\. This is not a statement that the upgrade is safe\./,
    );

    assert.equal(upgrade().status, 2);
    assert.equal(upgrade("--to").status, 2);
    assert.equal(upgrade("--nope").status, 2);
    assert.equal(upgrade("--to", "dart").status, 2);
    assert.equal(upgrade("--to", "dart@latest").status, 2);
    assert.equal(upgrade("--to", "dart@3.5", "one", "two").status, 2);
    assert.equal(upgrade("--to", "dart@3.5", join(root, "does-not-exist")).status, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
