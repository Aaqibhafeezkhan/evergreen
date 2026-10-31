import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { redactInventoryReport, redactResource, renderInventoryText } from "../src/inventory/command.js";
import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryImporter } from "../src/inventory/types.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function workspace(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-inventory-"));
  temporaryRoots.push(root);
  for (const [name, contents] of Object.entries(files)) await writeFile(join(root, name), contents);
  return root;
}

interface FakeObject {
  name: string;
  version: string;
  purl?: string;
  skip?: boolean;
}

const fake: InventoryImporter = {
  id: "fake",
  registries: ["npm"],
  detect(document) {
    return typeof document === "object" && document !== null && !Array.isArray(document) && Array.isArray((document as Record<string, unknown>).objects);
  },
  items(document, file) {
    const objects = (document as { objects: FakeObject[] }).objects;
    return objects.flatMap((object, index) =>
      object.skip
        ? []
        : [{
            importer: "fake",
            file,
            pointer: `/objects/${index}/version`,
            resource: object.name,
            purl: object.purl ?? "pkg:npm/request",
            version: object.version,
          }],
    );
  },
};

const neverMatches: InventoryImporter = {
  id: "other",
  registries: ["npm"],
  detect: () => false,
  items: () => [],
};

test("parseExport keeps a non-JSON export as text", () => {
  assert.deepEqual(parseExport('{"objects":[]}'), { objects: [] });
  assert.equal(parseExport("PRETTY_NAME=\"Example Linux\"\n"), "PRETTY_NAME=\"Example Linux\"\n");
});

test("runInventory recognizes each file, checks every item, and sorts by file and pointer", async () => {
  const root = await workspace({
    "b.json": JSON.stringify({ objects: [{ name: "second", version: "2.88.2" }] }),
    "a.json": JSON.stringify({ objects: [{ name: "first", version: "2.88.2" }, { name: "skipped", version: "2.88.2", skip: true }] }),
  });
  const report = await runInventory([join(root, "b.json"), join(root, "a.json")], [fake]);
  assert.equal(report.schemaVersion, "evergreen.inventory.v1");
  assert.deepEqual(report.results.map((result) => result.item.resource), ["first", "second"]);
  assert.deepEqual(report.results.map((result) => result.item.file), [join(root, "a.json"), join(root, "b.json")]);
  assert.equal(report.results[0]!.item.pointer, "/objects/0/version");
  assert.equal(report.results[0]!.check.purl, "pkg:npm/request");
  assert.equal(report.unrecognized.length, 0);
});

test("an unrecognized file is listed and the other files are still reported", async () => {
  const root = await workspace({
    "data.json": JSON.stringify({ objects: [{ name: "kept", version: "2.88.2" }] }),
    "notes.txt": "not an export\n",
  });
  const report = await runInventory([join(root, "data.json"), join(root, "notes.txt")], [fake]);
  assert.equal(report.results.length, 1);
  assert.deepEqual(report.unrecognized, [join(root, "notes.txt")]);
});

test("--format narrows the importer that may claim a file", async () => {
  const root = await workspace({ "data.json": JSON.stringify({ objects: [{ name: "kept", version: "2.88.2" }] }) });
  const file = join(root, "data.json");
  assert.equal((await runInventory([file], [fake, neverMatches], "fake")).results.length, 1);
  assert.deepEqual((await runInventory([file], [fake, neverMatches], "other")).unrecognized, [file]);
});

test("--redact replaces resource names with a deterministic 12-character digest", () => {
  const digest = redactResource("prod-orders");
  assert.match(digest, /^[0-9a-f]{12}$/);
  assert.equal(digest, redactResource("prod-orders"));
  assert.notEqual(digest, redactResource("prod-billing"));
});

test("redactInventoryReport changes only the resource field", async () => {
  const root = await workspace({ "data.json": JSON.stringify({ objects: [{ name: "prod-orders", version: "2.88.2" }] }) });
  const report = await runInventory([join(root, "data.json")], [fake]);
  const redacted = redactInventoryReport(report);
  assert.equal(redacted.results[0]!.item.resource, redactResource("prod-orders"));
  assert.equal(redacted.results[0]!.item.pointer, report.results[0]!.item.pointer);
  assert.deepEqual(redacted.results[0]!.check, report.results[0]!.check);
});

test("the text report groups findings and keeps no-data items in their own section", async () => {
  const root = await workspace({
    "data.json": JSON.stringify({
      objects: [
        { name: "known", version: "2.88.2" },
        { name: "unknown", version: "1.0.0", purl: "pkg:npm/evergreen-inventory-fixture" },
      ],
    }),
  });
  const text = renderInventoryText(await runInventory([join(root, "data.json")], [fake]));
  assert.match(text, /^Evergreen inventory/);
  assert.match(text, /known/);
  assert.match(text, /No data \(Evergreen has no rule for these; that does not mean they are safe\)/);
  assert.match(text, /unknown/);
  assert.match(text, /\/objects\/1\/version/);
});

test("inventory code never imports a socket, HTTP, or child-process module, and never calls fetch", async () => {
  const directory = resolve("src/inventory");
  for (const name of await readdir(directory)) {
    if (!name.endsWith(".ts")) continue;
    const text = await readFile(join(directory, name), "utf8");
    for (const module of ["node:child_process", "node:http", "node:https", "node:net"]) {
      assert.ok(!text.includes(`"${module}"`), `${name} imports ${module}`);
    }
    assert.ok(!/\bfetch\s*\(/.test(text), `${name} calls fetch`);
  }
});

test("a report validates against schemas/inventory.v1.schema.json", async () => {
  const root = await workspace({
    "data.json": JSON.stringify({ objects: [{ name: "known", version: "2.88.2" }] }),
    "notes.txt": "not an export\n",
  });
  const report = await runInventory([join(root, "data.json"), join(root, "notes.txt")], [fake]);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/scan.v1.schema.json"), "utf8")) as object);
  ajv.addSchema(JSON.parse(await readFile(resolve("schemas/check.v1.schema.json"), "utf8")) as object);
  const validate = ajv.compile(JSON.parse(await readFile(resolve("schemas/inventory.v1.schema.json"), "utf8")) as object);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});
