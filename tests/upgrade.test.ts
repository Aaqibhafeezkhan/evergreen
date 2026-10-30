import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { InMemoryTransport } from "@modelcontextprotocol/server";
import { Ajv2020 } from "ajv/dist/2020.js";

import { createEvergreenMcpServer } from "../src/mcp.js";
import { checkUpgrade, parseUpgradeTarget } from "../src/upgrade/index.js";
import type { UpgradeAnalyzer, UpgradeIssue } from "../src/upgrade/types.js";

const execute = promisify(execFile);
const cliPath = resolve("dist/src/cli.js");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function temporaryRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-upgrade-"));
  temporaryRoots.push(root);
  return root;
}

async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execute(process.execPath, [cliPath, ...args]);
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failure = error as { code: number; stdout: string; stderr: string };
    return { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
  }
}

function analyzer(input: Pick<UpgradeAnalyzer, "id"> & Partial<UpgradeAnalyzer>): UpgradeAnalyzer {
  return {
    id: input.id,
    runtimes: input.runtimes ?? ["go"],
    applies: input.applies ?? (async () => true),
    analyze: input.analyze ?? (async () => []),
  };
}

function issue(input: Pick<UpgradeIssue, "level" | "subject" | "path" | "reason"> & Partial<UpgradeIssue>): UpgradeIssue {
  return {
    analyzer: input.analyzer ?? "fake",
    level: input.level,
    subject: input.subject,
    path: input.path,
    ...(input.line === undefined ? {} : { line: input.line }),
    reason: input.reason,
    evidence: input.evidence ?? { kind: "manifest", value: input.reason },
  };
}

async function connectTestClient() {
  const server = createEvergreenMcpServer();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const pending = new Map<number, (response: { result?: Record<string, unknown>; error?: { message?: string } }) => void>();
  let nextId = 1;
  clientTransport.onmessage = (message) => {
    const response = message as { id?: number; result?: Record<string, unknown>; error?: { message?: string } };
    if (typeof response.id === "number") pending.get(response.id)?.(response);
  };
  await clientTransport.start();
  await server.connect(serverTransport);

  const request = async (method: string, params?: Record<string, unknown>) => {
    const id = nextId;
    nextId += 1;
    const response = new Promise<{ result?: Record<string, unknown>; error?: { message?: string } }>((settle) => pending.set(id, settle));
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

test("parseUpgradeTarget reads the runtime, version, and aliases", () => {
  assert.deepEqual(parseUpgradeTarget("go@1.23"), { runtime: "go", version: "1.23" });
  assert.deepEqual(parseUpgradeTarget("golang@1.23"), { runtime: "go", version: "1.23" });
  assert.deepEqual(parseUpgradeTarget("Node@22"), { runtime: "nodejs", version: "22" });
  assert.deepEqual(parseUpgradeTarget("py@3.13"), { runtime: "python", version: "3.13" });
  assert.deepEqual(parseUpgradeTarget("python@3.13.1"), { runtime: "python", version: "3.13.1" });
  assert.equal(parseUpgradeTarget("go"), undefined);
  assert.equal(parseUpgradeTarget("@1.23"), undefined);
  assert.equal(parseUpgradeTarget("go@"), undefined);
});

test("checkUpgrade runs applicable analyzers and orders issues deterministically", async () => {
  const first = analyzer({
    id: "alpha",
    analyze: async () => [
      issue({ level: "warning", subject: "b", path: "go.mod", line: 4, reason: "warning", analyzer: "alpha" }),
      issue({ level: "blocker", subject: "z", path: "go.mod", line: 9, reason: "blocker", analyzer: "alpha" }),
      issue({ level: "unknown", subject: "a", path: "go.mod", reason: "unknown", analyzer: "alpha" }),
    ],
  });
  const second = analyzer({
    id: "beta",
    analyze: async () => [issue({ level: "blocker", subject: "a", path: "go.mod", line: 2, reason: "blocker", analyzer: "beta" })],
  });
  const skipped = analyzer({ id: "skipped", runtimes: ["nodejs"] });
  const report = await checkUpgrade("/repo", { runtime: "go", version: "1.23" }, [first, second, skipped]);
  assert.equal(report.schemaVersion, "evergreen.upgrade.v1");
  assert.equal(report.verdict, "blocked");
  assert.deepEqual(report.analyzers, ["alpha", "beta"]);
  assert.deepEqual(
    report.issues.map((item) => [item.level, item.path, item.line ?? 0, item.subject, item.analyzer]),
    [
      ["blocker", "go.mod", 2, "a", "beta"],
      ["blocker", "go.mod", 9, "z", "alpha"],
      ["warning", "go.mod", 4, "b", "alpha"],
      ["unknown", "go.mod", 0, "a", "alpha"],
    ],
  );
});

test("checkUpgrade reports unknown when no analyzer applies, and ready when one runs clean", async () => {
  const none = await checkUpgrade("/repo", { runtime: "go", version: "1.23" }, [
    analyzer({ id: "nope", applies: async () => false }),
    analyzer({ id: "elsewhere", runtimes: ["nodejs"] }),
  ]);
  assert.deepEqual(none, {
    schemaVersion: "evergreen.upgrade.v1",
    target: { runtime: "go", version: "1.23" },
    verdict: "unknown",
    analyzers: [],
    issues: [],
  });

  const ready = await checkUpgrade("/repo", { runtime: "go", version: "1.23" }, [analyzer({ id: "clean" })]);
  assert.equal(ready.verdict, "ready");
  assert.deepEqual(ready.analyzers, ["clean"]);
  assert.deepEqual(ready.issues, []);
});

test("the CLI and the check_upgrade MCP tool return the same schema-valid report", async () => {
  const root = await temporaryRoot();
  const cliResult = await cli("upgrade-check", "--to", "go@1.23", root, "--json");
  assert.equal(cliResult.code, 0);
  const fromCli = JSON.parse(cliResult.stdout) as unknown;

  const client = await connectTestClient();
  let fromMcp: unknown;
  try {
    const result = await client.request("tools/call", {
      name: "check_upgrade",
      arguments: { repository_path: root, target: "go@1.23" },
    });
    fromMcp = result.structuredContent;
  } finally {
    await client.close();
  }

  assert.deepEqual(fromCli, fromMcp);
  const schema = JSON.parse(await readFile(resolve("schemas/upgrade.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  assert.equal(validate(fromCli), true, JSON.stringify(validate.errors));
  assert.equal(validate(fromMcp), true, JSON.stringify(validate.errors));
});

test("the unknown verdict prints the caveat, and bad input exits 2", async () => {
  const root = await temporaryRoot();
  const text = await cli("upgrade-check", "--to", "go@1.23", root);
  assert.equal(text.code, 0);
  assert.match(text.stdout, /^Verdict: unknown/);
  assert.match(text.stdout, /Evergreen found no evidence for this runtime in this repository\. This is not a statement that the upgrade is safe\./);

  assert.equal((await cli("upgrade-check")).code, 2);
  assert.equal((await cli("upgrade-check", "--to")).code, 2);
  assert.equal((await cli("upgrade-check", "--to", "go")).code, 2);
  assert.equal((await cli("upgrade-check", "--to", "go@1.23", "--nope")).code, 2);
});
