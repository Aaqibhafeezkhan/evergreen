import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Ajv2020 } from "ajv/dist/2020.js";

import { createEvergreenMcpServer } from "../src/mcp.js";
import { checkUpgrade, parseUpgradeTarget } from "../src/upgrade/index.js";
import type { UpgradeAnalyzer, UpgradeIssue } from "../src/upgrade/types.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const blockedFixture = resolve("tests/fixtures/upgrade/poetry-lock/blocked");
const readyFixture = resolve("tests/fixtures/upgrade/poetry-lock/ready");

const target = { runtime: "python", version: "3.13" } as const;

function fakeAnalyzer(id: string, runtimes: readonly string[], applies: boolean, issues: UpgradeIssue[]): UpgradeAnalyzer {
  return {
    id,
    runtimes,
    applies: async () => applies,
    analyze: async () => issues,
  };
}

function fakeIssue(analyzer: string, level: UpgradeIssue["level"], path: string, line: number, subject: string): UpgradeIssue {
  return { analyzer, level, subject, path, line, reason: "reason", evidence: { kind: "rule", value: "rule-id" } };
}

async function run(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cli, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

interface RpcResponse {
  id: number;
  result?: Record<string, unknown>;
  error?: { message?: string };
}

async function connectMcp() {
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
    const response = new Promise<RpcResponse>((resolvePromise) => pending.set(id, resolvePromise));
    await clientTransport.send({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) } as never);
    const received = await response;
    pending.delete(id);
    if (received.error) throw new Error(received.error.message ?? "MCP request failed");
    return received.result ?? {};
  };
  await request("initialize", {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "evergreen-upgrade-test", version: "1.0.0" },
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

test("parseUpgradeTarget normalizes aliases and rejects malformed targets", () => {
  assert.deepEqual(parseUpgradeTarget("node@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("py@3.13"), { runtime: "python", version: "3.13" });
  assert.deepEqual(parseUpgradeTarget("golang@1.23"), { runtime: "go", version: "1.23" });
  assert.deepEqual(parseUpgradeTarget("PYTHON@3.13"), { runtime: "python", version: "3.13" });
  assert.equal(parseUpgradeTarget("python"), undefined);
  assert.equal(parseUpgradeTarget("@3.13"), undefined);
  assert.equal(parseUpgradeTarget("python@"), undefined);
});

test("checkUpgrade reports unknown when no analyzer applies, and ignores runtimes it cannot judge", async () => {
  const report = await checkUpgrade("/nonexistent", target, [
    fakeAnalyzer("node", ["nodejs"], true, [fakeIssue("node", "blocker", "a", 1, "a")]),
    fakeAnalyzer("python", ["python"], false, [fakeIssue("python", "blocker", "a", 1, "a")]),
  ]);
  assert.deepEqual(report, {
    schemaVersion: "evergreen.upgrade.v1",
    target,
    verdict: "unknown",
    analyzers: [],
    issues: [],
  });
});

test("checkUpgrade sorts issues and picks the verdict from the levels", async () => {
  const report = await checkUpgrade("/nonexistent", target, [
    fakeAnalyzer("b", ["python"], true, [
      fakeIssue("b", "warning", "z", 2, "b"),
      fakeIssue("b", "blocker", "b", 9, "x"),
    ]),
    fakeAnalyzer("a", ["python"], true, [
      fakeIssue("a", "blocker", "a", 10, "b"),
      fakeIssue("a", "blocker", "a", 9, "a"),
      fakeIssue("a", "unknown", "a", 1, "u"),
    ]),
    fakeAnalyzer("n", ["nodejs"], true, [fakeIssue("n", "blocker", "ignored", 1, "i")]),
  ]);
  assert.deepEqual(report.analyzers, ["a", "b"]);
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(
    report.issues.map((issue) => `${issue.level}:${issue.path}:${issue.line}:${issue.subject}:${issue.analyzer}`),
    ["blocker:a:9:a:a", "blocker:a:10:b:a", "blocker:b:9:x:b", "warning:z:2:b:b", "unknown:a:1:u:a"],
  );
});

test("a warning or unknown alone does not block", async () => {
  const report = await checkUpgrade("/nonexistent", target, [
    fakeAnalyzer("a", ["python"], true, [
      fakeIssue("a", "warning", "a", 1, "w"),
      fakeIssue("a", "unknown", "a", 2, "u"),
    ]),
  ]);
  assert.equal(report.verdict, "ready");
});

test("the CLI and the MCP tool return the same schema-valid report", async () => {
  const empty = await mkdtemp(resolve(tmpdir(), "evergreen-upgrade-"));
  try {
    const cliResult = await run("upgrade-check", "--to", "python@3.13", empty, "--json");
    assert.equal(cliResult.code, 0, cliResult.stderr);
    const cliReport = JSON.parse(cliResult.stdout) as Record<string, unknown>;

    const client = await connectMcp();
    let mcpReport: unknown;
    let description = "";
    try {
      const tools = (await client.request("tools/list")).tools as Array<{ name: string; description: string }>;
      description = tools.find((tool) => tool.name === "check_upgrade")?.description ?? "";
      const result = await client.request("tools/call", {
        name: "check_upgrade",
        arguments: { path: empty, target: "python@3.13" },
      });
      mcpReport = result.structuredContent;
    } finally {
      await client.close();
    }

    assert.deepEqual(mcpReport, cliReport);
    assert.match(description, /not a statement that the upgrade is safe/);

    const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8")) as object;
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
    assert.equal(validate(cliReport), true, JSON.stringify(validate.errors));
    assert.equal(cliReport.verdict, "unknown");
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
});

test("the CLI and the MCP tool agree on a blocked repository", async () => {
  const cliResult = await run("upgrade-check", "--to", "python@3.13", blockedFixture, "--json");
  assert.equal(cliResult.code, 1, cliResult.stderr);
  const cliReport = JSON.parse(cliResult.stdout) as Record<string, unknown>;

  const client = await connectMcp();
  let mcpReport: unknown;
  try {
    const result = await client.request("tools/call", {
      name: "check_upgrade",
      arguments: { path: blockedFixture, target: "python@3.13" },
    });
    mcpReport = result.structuredContent;
  } finally {
    await client.close();
  }

  assert.deepEqual(mcpReport, cliReport);
  assert.equal(cliReport.verdict, "blocked");

  const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(cliReport), true, JSON.stringify(validate.errors));
});

test("the unknown verdict always prints its caveat, and bad input exits 2", async () => {
  const empty = await mkdtemp(resolve(tmpdir(), "evergreen-upgrade-"));
  try {
    const result = await run("upgrade-check", "--to", "python@3.13", empty);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^unknown\n/);
    assert.match(result.stdout, /This is not a statement that the upgrade is safe\./);
  } finally {
    await rm(empty, { recursive: true, force: true });
  }
  assert.equal((await run("upgrade-check", "--to", "python@3.13", blockedFixture)).code, 1);
  assert.equal((await run("upgrade-check", "--to", "python@3.13", readyFixture)).code, 0);
  assert.equal((await run("upgrade-check")).code, 2);
  assert.equal((await run("upgrade-check", "--to", "python")).code, 2);
  assert.equal((await run("upgrade-check", "--to", "python@not-a-version")).code, 2);
  assert.equal((await run("upgrade-check", "--to", "python@3.13", resolve("tests/fixtures/upgrade/poetry-lock/missing"))).code, 2);
});
