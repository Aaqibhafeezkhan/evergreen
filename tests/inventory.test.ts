import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { redactResource, renderInventoryText } from "../src/inventory/command.js";
import { runInventory } from "../src/inventory/index.js";
import type { InventoryImporter, InventoryItem } from "../src/inventory/types.js";

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function item(file: string, pointer: string, resource: string): InventoryItem {
  return { importer: "fake", file, pointer, resource, purl: `pkg:generic/fake/${resource}`, version: "1.0.0" };
}

const fake: InventoryImporter = {
  id: "fake",
  registries: [],
  detect: (document) => isRecord(document) && Array.isArray(document.things),
  items(document, file) {
    if (!isRecord(document) || !Array.isArray(document.things)) return [];
    return document.things.flatMap((thing, index) => (isRecord(thing) && typeof thing.name === "string" ? [item(file, `/things/${index}/version`, thing.name)] : []));
  },
};

const other: InventoryImporter = {
  id: "other",
  registries: [],
  detect: (document) => isRecord(document) && Array.isArray(document.things),
  items: (_document, file) => [item(file, "/things/0/version", "from-other")],
};

async function workspace(files: Record<string, string>): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-inventory-"));
  for (const [name, contents] of Object.entries(files)) await writeFile(join(directory, name), contents);
  return directory;
}

test("each export is read by the importer that recognizes it, and the rest are reported unrecognized", async () => {
  const directory = await workspace({
    "first.json": JSON.stringify({ things: [{ name: "alpha", version: "1.0.0" }] }),
    "second.json": JSON.stringify({ unrelated: true }),
    "notes.txt": "not an export",
  });
  try {
    const report = await runInventory([join(directory, "first.json"), join(directory, "second.json"), join(directory, "notes.txt")], [fake]);
    assert.equal(report.schemaVersion, "evergreen.inventory.v1");
    assert.deepEqual(report.results.map((result) => result.item.resource), ["alpha"]);
    assert.deepEqual(report.unrecognized, [join(directory, "second.json"), join(directory, "notes.txt")]);
    assert.equal(report.results[0]!.item.pointer, "/things/0/version");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("--format runs only the named importer, and an importer that does not know the file leaves it unrecognized", async () => {
  const directory = await workspace({ "first.json": JSON.stringify({ things: [{ name: "alpha", version: "1.0.0" }] }) });
  try {
    const file = join(directory, "first.json");
    assert.deepEqual((await runInventory([file], [fake, other], "other")).results.map((result) => result.item.resource), ["from-other"]);
    assert.deepEqual((await runInventory([file], [fake, other], "fake")).results.map((result) => result.item.resource), ["alpha"]);
    assert.equal((await runInventory([file], [fake, other], "missing")).unrecognized.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("results sort by file and then by pointer, whatever order the files and items come in", async () => {
  const directory = await workspace({
    "a.json": JSON.stringify({ things: [{ name: "second", version: "1.0.0" }, { name: "first", version: "1.0.0" }] }),
    "b.json": JSON.stringify({ things: [{ name: "last", version: "1.0.0" }] }),
  });
  try {
    const report = await runInventory([join(directory, "b.json"), join(directory, "a.json")], [fake]);
    assert.deepEqual(report.results.map((result) => `${result.item.file}:${result.item.pointer}`), [
      `${join(directory, "a.json")}:/things/0/version`,
      `${join(directory, "a.json")}:${"/things/1/version"}`,
      `${join(directory, "b.json")}:/things/0/version`,
    ]);
    assert.deepEqual(report.results.map((result) => result.item.resource), ["second", "first", "last"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("a check runs against the importer's registries: a known runtime is affected, an unknown package is no-data", async () => {
  const directory = await workspace({
    "lambda.json": JSON.stringify({ Functions: [{ FunctionName: "old" }] }),
  });
  try {
    const known: InventoryImporter = {
      id: "known",
      registries: ["serverless"],
      detect: (document) => isRecord(document) && Array.isArray(document.Functions),
      items: (_document, file) => [
        { importer: "known", file, pointer: "/Functions/0/Runtime", resource: "old", purl: "pkg:generic/aws-lambda-runtime/nodejs14.x", version: "nodejs14.x" },
        { importer: "known", file, pointer: "/Functions/0/Runtime", resource: "new", purl: "pkg:generic/aws-lambda-runtime/unknown", version: "unknown" },
      ],
    };
    const report = await runInventory([join(directory, "lambda.json")], [known]);
    assert.deepEqual(report.results.map((result) => result.check.status), ["affected", "no-data"]);
    assert.equal(report.results[0]!.check.findings[0]!.ruleId, "serverless.aws-lambda.nodejs14.x");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("redactResource is a stable 12-character hex digest, and a redacted report hides the resource names", async () => {
  assert.match(redactResource("my-function"), /^[a-f0-9]{12}$/);
  assert.equal(redactResource("my-function"), redactResource("my-function"));
  assert.notEqual(redactResource("my-function"), redactResource("other-function"));

  const directory = await workspace({ "a.json": JSON.stringify({ things: [{ name: "my-function", version: "1.0.0" }] }) });
  try {
    const report = await runInventory([join(directory, "a.json")], [fake]);
    const text = renderInventoryText(report, { redact: true });
    assert.ok(!text.includes("my-function"), text);
    assert.ok(text.includes(redactResource("my-function")), text);
    assert.ok(renderInventoryText(report).includes("my-function"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the report validates against schemas/inventory.v1.schema.json", async () => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as object);
  const validate = ajv.compile(JSON.parse(await readFile(resolve("schemas/inventory.v1.schema.json"), "utf8")) as object);

  const directory = await workspace({
    "a.json": JSON.stringify({ things: [{ name: "alpha", version: "1.0.0" }] }),
    "b.json": JSON.stringify({ unrelated: true }),
  });
  try {
    const report = await runInventory([join(directory, "a.json"), join(directory, "b.json")], [fake]);
    assert.equal(validate(report), true, JSON.stringify(validate.errors));
    assert.equal(validate({ ...report, schemaVersion: "evergreen.inventory.v2" }), false);
    assert.equal(validate({ ...report, extra: true }), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
