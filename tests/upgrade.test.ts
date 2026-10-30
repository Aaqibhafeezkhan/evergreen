import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { checkUpgrade, parseUpgradeTarget } from "../src/upgrade/index.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeReport } from "../src/upgrade/types.js";
import { createEvergreenMcpServer } from "../src/mcp.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const roots: string[] = [];

after(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

function issue(overrides: Partial<UpgradeIssue> = {}): UpgradeIssue {
  return {
    analyzer: "fake",
    level: "blocker",
    subject: "subject",
    path: "a.txt",
    line: 1,
    reason: "reason",
    evidence: { kind: "rule", value: "rule.id" },
    ...overrides,
  };
}

function analyzer(id: string, issues: UpgradeIssue[], runtimes: readonly string[] = ["python"]): UpgradeAnalyzer {
  return {
    id,
    runtimes,
    applies: async () => true,
    analyze: async (_root, _target) => issues,
  };
}

test("parseUpgradeTarget reads runtime@version, aliases, and rejects text without both sides", () => {
  assert.deepEqual(parseUpgradeTarget("nodejs@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("python@3.13"), { runtime: "python", version: "3.13" });
  assert.deepEqual(parseUpgradeTarget("py@3.13"), { runtime: "python", version: "3.13" });
  assert.deepEqual(parseUpgradeTarget("Node@22"), { runtime: "nodejs", version: "22" });
  assert.equal(parseUpgradeTarget("nodejs"), undefined);
  assert.equal(parseUpgradeTarget("@22"), undefined);
  assert.equal(parseUpgradeTarget("nodejs@"), undefined);
});

test("checkUpgrade skips analyzers for other runtimes and reports unknown when none ran", async () => {
  const report = await checkUpgrade("/repo", { runtime: "python", version: "3.13" }, [
    analyzer("other", [issue()], ["nodejs"]),
  ]);
  assert.deepEqual(report, {
    schemaVersion: "evergreen.upgrade.v1",
    target: { runtime: "python", version: "3.13" },
    verdict: "unknown",
    analyzers: [],
    issues: [],
  });
});

test("checkUpgrade is ready when an analyzer ran without a blocker, blocked when one did, and sorts deterministically", async () => {
  const ready = await checkUpgrade("/repo", { runtime: "python", version: "3.13" }, [
    analyzer("a", [issue({ level: "warning" })]),
  ]);
  assert.equal(ready.verdict, "ready");
  assert.deepEqual(ready.analyzers, ["a"]);

  const blocked = await checkUpgrade("/repo", { runtime: "python", version: "3.13" }, [
    analyzer("b", [issue({ level: "unknown", path: "z.py", subject: "z" })]),
    analyzer("a", [
      issue({ level: "warning", path: "b.py", line: 2, subject: "w" }),
      issue({ level: "blocker", path: "b.py", line: 9, subject: "l" }),
      issue({ level: "blocker", path: "a.py", line: 3, subject: "n" }),
      issue({ level: "blocker", path: "a.py", line: 3, subject: "m" }),
    ]),
  ]);
  assert.equal(blocked.verdict, "blocked");
  assert.deepEqual(blocked.analyzers, ["a", "b"]);
  assert.deepEqual(
    blocked.issues.map((entry) => [entry.level, entry.path, entry.line, entry.subject]),
    [
      ["blocker", "a.py", 3, "m"],
      ["blocker", "a.py", 3, "n"],
      ["blocker", "b.py", 9, "l"],
      ["warning", "b.py", 2, "w"],
      ["unknown", "z.py", 1, "z"],
    ],
  );
});

test("CLI --json and the check_upgrade MCP tool return the same report, valid against the published schema", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-"));
  roots.push(root);
  await writeFile(join(root, "pyproject.toml"), '[project]\nname = "fixture"\nrequires-python = ">=3.13"\n');

  const child = await execute(process.execPath, [cli, "upgrade-check", "--to", "python@3.13", root, "--json"]);
  const report = JSON.parse(child.stdout) as UpgradeReport;

  const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.ok(validate(report), JSON.stringify(validate.errors));

  const server = createEvergreenMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (response: { result?: Record<string, unknown>; error?: { message?: string } }) => void>();
  let nextId = 1;
  clientTransport.onmessage = (message) => {
    const response = message as { id?: number };
    if (typeof response.id === "number") pending.get(response.id)?.(response as never);
  };
  await clientTransport.start();
  await server.connect(serverTransport);
  const request = async (method: string, params?: Record<string, unknown>) => {
    const id = nextId;
    nextId += 1;
    const received = new Promise<{ result?: Record<string, unknown>; error?: { message?: string } }>((done) => pending.set(id, done));
    await clientTransport.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) } as never);
    const response = await received;
    pending.delete(id);
    if (response.error) throw new Error(response.error.message ?? "MCP request failed");
    return response.result ?? {};
  };
  try {
    await request("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "evergreen-test", version: "1.0.0" } });
    await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
    const call = await request("tools/call", { name: "check_upgrade", arguments: { path: root, target: "python@3.13" } });
    assert.notEqual(call.isError, true);
    assert.deepEqual(call.structuredContent, report, "the MCP tool must return what the CLI prints");
    assert.ok(validate(call.structuredContent), JSON.stringify(validate.errors));
  } finally {
    await clientTransport.close();
    await server.close();
  }
});
