import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";
import { InMemoryTransport } from "@modelcontextprotocol/server";

import { checkUpgrade, parseUpgradeTarget } from "../src/upgrade/index.js";
import { UNKNOWN_VERDICT_SENTENCE } from "../src/upgrade/command.js";
import type { UpgradeAnalyzer, UpgradeIssue, UpgradeReport } from "../src/upgrade/types.js";
import { createEvergreenMcpServer } from "../src/mcp.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function emptyRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-"));
  temporaryRoots.push(root);
  return root;
}

interface RpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

async function connect() {
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
  const request = async (method: string, params?: Record<string, unknown>) => {
    const id = nextId;
    nextId += 1;
    const response = new Promise<RpcResponse>((resolve) => pending.set(id, resolve));
    await clientTransport.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) } as never);
    const received = await response;
    pending.delete(id);
    if (received.error) throw new Error(received.error.message ?? "MCP request failed");
    return received.result ?? {};
  };
  await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "evergreen-test", version: "1.0.0" },
  });
  await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" } as never);
  return {
    request,
    async close() {
      await clientTransport.close();
      await server.close();
    },
  };
}

function analyzer(id: string, applies: boolean, issues: UpgradeIssue[]): UpgradeAnalyzer {
  return {
    id,
    runtimes: ["nodejs"],
    applies: async () => applies,
    analyze: async () => issues,
  };
}

const issue = (overrides: Partial<UpgradeIssue>): UpgradeIssue => ({
  analyzer: "fake",
  level: "blocker",
  subject: "pkg@1.0.0",
  path: "file.json",
  reason: "reason",
  evidence: { kind: "lockfile", value: "value" },
  ...overrides,
});

test("a target is parsed with aliases and rejected without both sides", () => {
  assert.deepEqual(parseUpgradeTarget("nodejs@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("node@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("py@3.13"), { runtime: "python", version: "3.13" });
  assert.deepEqual(parseUpgradeTarget("golang@1.23"), { runtime: "go", version: "1.23" });
  assert.deepEqual(parseUpgradeTarget("python@3.13"), { runtime: "python", version: "3.13" });
  for (const text of ["nodejs", "@22", "nodejs@", ""]) assert.equal(parseUpgradeTarget(text), undefined, text);
});

test("the verdict is unknown when no analyzer applies, ready without blockers, and blocked with one", async () => {
  const root = await emptyRepository();
  assert.equal((await checkUpgrade(root, { runtime: "nodejs", version: "22" }, [])).verdict, "unknown");

  const skipped = await checkUpgrade(root, { runtime: "nodejs", version: "22" }, [analyzer("skipped", false, [])]);
  assert.equal(skipped.verdict, "unknown");
  assert.deepEqual(skipped.analyzers, []);

  const ready = await checkUpgrade(root, { runtime: "nodejs", version: "22" }, [analyzer("ready", true, [issue({ level: "warning" })])]);
  assert.equal(ready.verdict, "ready");
  assert.deepEqual(ready.analyzers, ["ready"]);

  const blocked = await checkUpgrade(root, { runtime: "nodejs", version: "22" }, [analyzer("blocked", true, [issue({ level: "blocker" })])]);
  assert.equal(blocked.verdict, "blocked");
});

test("an analyzer that judges another runtime is not run", async () => {
  const root = await emptyRepository();
  const report = await checkUpgrade(root, { runtime: "python", version: "3.13" }, [analyzer("node", true, [issue({})])]);
  assert.equal(report.verdict, "unknown");
  assert.deepEqual(report.analyzers, []);
});

test("issues sort by level, path, line, subject, then analyzer", async () => {
  const root = await emptyRepository();
  const report = await checkUpgrade(root, { runtime: "nodejs", version: "22" }, [
    analyzer("fake", true, [
      issue({ level: "unknown", subject: "z", path: "b.json", line: 1 }),
      issue({ level: "warning", subject: "w", path: "a.json", line: 9 }),
      issue({ level: "warning", subject: "w", path: "a.json", line: 2 }),
      issue({ level: "blocker", subject: "b", path: "a.json", line: 2 }),
      issue({ analyzer: "other", level: "blocker", subject: "b", path: "a.json", line: 2 }),
    ]),
  ]);
  assert.deepEqual(
    report.issues.map((entry) => `${entry.level} ${entry.path}:${entry.line} ${entry.subject} ${entry.analyzer}`),
    [
      "blocker a.json:2 b fake",
      "blocker a.json:2 b other",
      "warning a.json:2 w fake",
      "warning a.json:9 w fake",
      "unknown b.json:1 z fake",
    ],
  );
});

async function callUpgrade(path: string): Promise<UpgradeReport> {
  const client = await connect();
  try {
    const call = await client.request("tools/call", { name: "check_upgrade", arguments: { path, target: "nodejs@22" } });
    assert.notEqual(call.isError, true);
    return call.structuredContent as unknown as UpgradeReport;
  } finally {
    await client.close();
  }
}

test("the CLI and the MCP tool return the same report, valid against the published schema", async () => {
  const root = await emptyRepository();
  const { stdout } = await execute(process.execPath, [cli, "upgrade-check", "--to", "nodejs@22", root, "--json"]);
  const fromCli = JSON.parse(stdout) as UpgradeReport;
  const fromMcp = await callUpgrade(root);

  assert.deepEqual(fromMcp, fromCli);
  const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8"));
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.ok(validate(fromCli), JSON.stringify(validate.errors));
  assert.ok(validate(fromMcp), JSON.stringify(validate.errors));
  assert.equal(fromCli.verdict, "unknown");
});

test("the unknown verdict says it is not a statement that the upgrade is safe, in the CLI and the MCP description", async () => {
  const root = await emptyRepository();
  const { stdout } = await execute(process.execPath, [cli, "upgrade-check", "--to", "nodejs@22", root]);
  assert.ok(stdout.includes(UNKNOWN_VERDICT_SENTENCE), stdout);

  const client = await connect();
  try {
    const listed = await client.request("tools/list");
    const tool = (listed.tools as Array<{ name: string; description: string }>).find((entry) => entry.name === "check_upgrade");
    assert.ok(tool);
    assert.ok(tool.description.includes("This is not a statement that the upgrade is safe."));
  } finally {
    await client.close();
  }
});

test("exit codes are 0 for ready and unknown and 2 for bad input", async () => {
  const root = await emptyRepository();
  const unknown = await execute(process.execPath, [cli, "upgrade-check", "--to", "nodejs@22", root]);
  assert.equal(unknown.stdout.includes("Unknown for nodejs 22."), true);

  for (const args of [["upgrade-check"], ["upgrade-check", "--to", "nodejs"], ["upgrade-check", "--to", "nodejs@22", root, "extra"], ["upgrade-check", "--to", "nodejs@22", join(root, "missing")]]) {
    await assert.rejects(execute(process.execPath, [cli, ...args]), (error: { code?: number }) => error.code === 2, args.join(" "));
  }
});
