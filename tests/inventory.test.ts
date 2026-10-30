import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";

import { inventoryCommand, redactResource, renderInventoryText } from "../src/inventory/command.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryImporter } from "../src/inventory/types.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");
const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function directory(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-inventory-"));
  temporaryRoots.push(root);
  return root;
}

const fakeImporter: InventoryImporter = {
  id: "fake",
  registries: [],
  detect(document) {
    return typeof document === "object" && document !== null && (document as { kind?: unknown }).kind === "fake";
  },
  items(document, file) {
    const entries = (document as { entries: Array<{ resource: string; purl: string; version?: string }> }).entries;
    return entries.map((entry, index) => ({
      importer: "fake",
      file,
      pointer: `/entries/${index}/version`,
      resource: entry.resource,
      purl: entry.purl,
      ...(entry.version === undefined ? {} : { version: entry.version }),
    }));
  },
};

const nodeImporter: InventoryImporter = {
  ...fakeImporter,
  id: "fake-node",
  registries: ["nodejs"],
};

async function exportFile(name: string, value: unknown): Promise<string> {
  const root = await directory();
  const path = join(root, name);
  await writeFile(path, typeof value === "string" ? value : JSON.stringify(value));
  return path;
}

test("an export is parsed as JSON, and as text when it is not JSON", () => {
  assert.deepEqual(parseExport('{"a":1}'), { a: 1 });
  assert.equal(parseExport("ID=ubuntu\nVERSION_ID=20.04\n"), "ID=ubuntu\nVERSION_ID=20.04\n");
});

test("runInventory lets the first importer that recognizes a file list its items and reports the rest", async () => {
  const recognized = await exportFile("a.json", { kind: "fake", entries: [{ resource: "one", purl: "pkg:npm/request", version: "2.88.2" }] });
  const unrecognized = await exportFile("b.txt", "this is not an export");
  const report = await runInventory([recognized, unrecognized], [fakeImporter]);
  assert.equal(report.schemaVersion, "evergreen.inventory.v1");
  assert.deepEqual(report.results.map((result) => [result.item.file, result.item.resource, result.item.pointer]), [[recognized, "one", "/entries/0/version"]]);
  assert.equal(report.results[0]!.check.status, "no-data");
  assert.deepEqual(report.unrecognized, [unrecognized]);
});

test("--format selects one importer, and an export it does not recognize stays unrecognized", async () => {
  const recognized = await exportFile("a.json", { kind: "fake", entries: [{ resource: "one", purl: "pkg:npm/request" }] });
  const other = { ...fakeImporter, id: "other", detect: () => false };
  assert.equal((await runInventory([recognized], [fakeImporter, other])).results.length, 1);
  assert.equal((await runInventory([recognized], [fakeImporter, other], "fake")).results.length, 1);
  assert.deepEqual((await runInventory([recognized], [fakeImporter, other], "other")).unrecognized, [recognized]);
});

test("results sort by file and then by pointer", async () => {
  const root = await directory();
  const first = join(root, "a.json");
  const second = join(root, "b.json");
  await writeFile(second, JSON.stringify({ kind: "fake", entries: [{ resource: "b0", purl: "pkg:npm/request" }, { resource: "b1", purl: "pkg:npm/request" }] }));
  await writeFile(first, JSON.stringify({ kind: "fake", entries: [{ resource: "a0", purl: "pkg:npm/request" }] }));
  const report = await runInventory([second, first], [fakeImporter]);
  assert.deepEqual(report.results.map((result) => result.item.resource), ["a0", "b0", "b1"]);
});

test("redactResource is a stable 12-hex-character digest, and different names differ", () => {
  const redacted = redactResource("web-1");
  assert.match(redacted, /^[0-9a-f]{12}$/);
  assert.equal(redactResource("web-1"), redacted);
  assert.notEqual(redactResource("web-2"), redacted);
});

test("the report matches inventory.v1.schema.json", async () => {
  const file = await exportFile("a.json", { kind: "fake", entries: [{ resource: "one", purl: "pkg:npm/request", version: "2.88.2" }] });
  const report = await runInventory([file], [fakeImporter]);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as object);
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  const validate = ajv.compile(JSON.parse(await readFile(resolve("schemas/inventory.v1.schema.json"), "utf8")) as object);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});

test("the command prints affected results first, groups by file, and redacts on request", async () => {
  const file = await exportFile("a.json", {
    kind: "fake",
    entries: [
      { resource: "web-1", purl: "pkg:generic/nodejs", version: "16.0.0" },
      { resource: "web-2", purl: "pkg:npm/request", version: "2.88.2" },
    ],
  });
  const chunks: string[] = [];
  const code = await inventoryCommand([file, "--fail-on", "high"], { importers: [nodeImporter], write: (text) => chunks.push(text) });
  assert.equal(code, 1);
  const text = chunks.join("");
  assert.match(text, /Affected \(1\)/);
  assert.match(text, /No lifecycle rule \(1\)/);
  assert.ok(text.indexOf("web-1") < text.indexOf("web-2"), "affected results come before no-data");
  assert.match(text, /resource {2}version {2}status {2}rule {2}pointer/);

  const redacted: string[] = [];
  assert.equal(await inventoryCommand([file, "--redact", "--json"], { importers: [nodeImporter], write: (text) => redacted.push(text), failOn: "none" }), 0);
  const report = JSON.parse(redacted.join(""));
  assert.deepEqual(report.results.map((result: { item: { resource: string } }) => result.item.resource), [redactResource("web-1"), redactResource("web-2")]);
  assert.doesNotMatch(redacted.join(""), /web-1|web-2/);
});

test("an unreadable file is listed and exits 2 after the readable files are reported", async () => {
  const missing = join(await directory(), "gone.json");
  const text = renderInventoryText({ schemaVersion: "evergreen.inventory.v1", results: [], unrecognized: [missing] });
  assert.match(text, /Unrecognized or unreadable files/);
  assert.match(text, new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

  const chunks: string[] = [];
  const code = await inventoryCommand([missing], { importers: [fakeImporter], write: (text) => chunks.push(text), failOn: "none" });
  assert.equal(code, 2);
  assert.match(chunks.join(""), new RegExp(missing.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("the command rejects a missing file, an unknown flag, an unknown importer, and an unknown severity", async () => {
  const errors: string[] = [];
  const options = { importers: [fakeImporter], write: () => undefined, writeError: (text: string) => errors.push(text) };
  assert.equal(await inventoryCommand([], options), 2);
  assert.match(errors.join(""), /Missing export file/);
  errors.length = 0;
  assert.equal(await inventoryCommand(["--nope"], options), 2);
  assert.match(errors.join(""), /Unknown option/);
  errors.length = 0;
  assert.equal(await inventoryCommand(["a.json", "--format", "nope"], options), 2);
  assert.match(errors.join(""), /Unknown importer/);
  errors.length = 0;
  assert.equal(await inventoryCommand(["a.json", "--fail-on", "urgent"], options), 2);
  assert.match(errors.join(""), /Unknown severity/);
});

test("the CLI exposes inventory in --help and exits 2 for a file it does not recognize", async () => {
  const { stdout: help } = await execute(process.execPath, [cli, "--help"]);
  assert.match(help, /evergreen inventory <file>\.\.\./);
  assert.match(help, /evergreen inventory lambda\.json/);

  const file = await exportFile("plain.json", { hello: "world" });
  try {
    await execute(process.execPath, [cli, "inventory", file]);
    assert.fail("expected a non-zero exit");
  } catch (error) {
    const failure = error as { code: number; stdout: string };
    assert.equal(failure.code, 2);
    assert.match(failure.stdout, /Unrecognized or unreadable files/);
  }
});
