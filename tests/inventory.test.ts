import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { redactResource, renderInventoryText } from "../src/inventory/command.js";
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

const fake: InventoryImporter = {
  id: "fake",
  registries: [],
  detect: (document) =>
    typeof document === "object" && document !== null && !Array.isArray(document) &&
    Array.isArray((document as { items?: unknown }).items),
  items: (document, file) =>
    ((document as { items: string[] }).items).map((name, index) => ({
      importer: "fake",
      file,
      pointer: `/items/${index}`,
      resource: name,
      purl: `pkg:generic/${name}`,
    })),
};

test("runInventory picks the first importer that detects a file and lists the rest as unrecognized", async () => {
  const root = await workspace({
    "a.json": JSON.stringify({ items: ["beta", "alpha"] }),
    "b.json": JSON.stringify({ other: true }),
  });
  const report = await runInventory([join(root, "a.json"), join(root, "b.json")], [fake]);

  assert.equal(report.schemaVersion, "evergreen.inventory.v1");
  assert.deepEqual(report.results.map((result) => result.item.resource), ["beta", "alpha"]);
  assert.deepEqual(report.results.map((result) => result.item.pointer), ["/items/0", "/items/1"]);
  assert.ok(report.results.every((result) => result.check.status === "no-data"));
  assert.deepEqual(report.unrecognized, [join(root, "b.json")]);
});

test("--format restricts detection to one importer", async () => {
  const root = await workspace({ "a.json": JSON.stringify({ items: ["alpha"] }) });
  const file = join(root, "a.json");
  assert.equal((await runInventory([file], [fake], "fake")).results.length, 1);
  assert.deepEqual((await runInventory([file], [fake], "other")).unrecognized, [file]);
});

test("a non-JSON export stays text, so a text importer can read it", () => {
  assert.equal(parseExport("NAME=debian\nVERSION_ID=11\n"), "NAME=debian\nVERSION_ID=11\n");
  assert.deepEqual(parseExport('{"a":1}'), { a: 1 });
});

test("text output groups judged results by file, dims no-data, and lists unrecognized files", async () => {
  const root = await workspace({ "a.json": JSON.stringify({ items: ["alpha"] }), "note.txt": "not an export\n" });
  const report = await runInventory([join(root, "a.json"), join(root, "note.txt")], [fake]);
  const text = renderInventoryText(report, { color: false });

  assert.match(text, new RegExp(join(root, "a.json")));
  assert.match(text, /no-data \(no lifecycle rule matched\):/);
  assert.match(text, /Unrecognized files:/);
  assert.match(text, /note\.txt/);
});

test("redactResource replaces a name with 12 hex characters of its SHA-256", () => {
  const redacted = redactResource("web");
  assert.match(redacted, /^[0-9a-f]{12}$/);
  assert.notEqual(redacted, "web");
  assert.equal(redacted, redactResource("web"));
  assert.notEqual(redacted, redactResource("cache"));
});

test("an inventory report matches inventory.v1.schema.json and rejects undeclared properties", async () => {
  const root = await workspace({ "a.json": JSON.stringify({ items: ["alpha"] }) });
  const report = await runInventory([join(root, "a.json")], [fake]);

  const read = async (name: string) => JSON.parse(await readFile(resolve(`schemas/${name}`), "utf8")) as object;
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  ajv.addSchema(await read("scan.v1.schema.json"));
  ajv.addSchema(await read("check.v1.schema.json"));
  const validate = ajv.compile(await read("inventory.v1.schema.json"));

  assert.equal(validate(report), true, JSON.stringify(validate.errors));

  const mutated = JSON.parse(JSON.stringify(report)) as Record<string, unknown>;
  mutated.undeclaredInventoryProperty = "disallowed";
  assert.equal(validate(mutated), false);
  assert.ok(validate.errors?.some((error) => error.keyword === "additionalProperties"));

  const itemMutated = JSON.parse(JSON.stringify(report)) as { results: Array<{ item: Record<string, unknown> }> };
  itemMutated.results[0]!.item.undeclaredItemProperty = "disallowed";
  assert.equal(validate(itemMutated), false);
});
