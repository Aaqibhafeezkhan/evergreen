import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { promisify } from "node:util";

import { Ajv2020 } from "ajv/dist/2020.js";

import { parseExport, runInventory } from "../src/inventory/index.js";
import type { InventoryImporter } from "../src/inventory/types.js";
import { redactReport, redactResource, renderInventoryText } from "../src/inventory/command.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

function arrayImporter(id: string): InventoryImporter {
  return {
    id,
    registries: ["npm"],
    detect: (document) => Array.isArray(document),
    items: (document, file) =>
      (document as Array<{ name?: unknown; version?: unknown }>).flatMap((entry, index) =>
        typeof entry?.name === "string" && typeof entry.version === "string"
          ? [{ importer: id, file, pointer: `/${index}/version`, resource: entry.name, purl: "pkg:npm/request", version: entry.version }]
          : [],
      ),
  };
}

async function withDirectory<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "evergreen-inventory-"));
  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("the first importer that recognizes a file lists its items, and --format picks one", async () => {
  await withDirectory(async (directory) => {
    const file = join(directory, "exports.json");
    await writeFile(file, JSON.stringify([{ name: "one", version: "2.88.2" }]));

    const first = arrayImporter("first");
    const second = arrayImporter("second");
    assert.deepEqual((await runInventory([file], [first, second])).results.map((result) => result.item.importer), ["first"]);
    assert.deepEqual((await runInventory([file], [first, second], "second")).results.map((result) => result.item.importer), ["second"]);

    const nothing: InventoryImporter = { ...first, detect: () => false };
    const report = await runInventory([file], [nothing]);
    assert.deepEqual(report.results, []);
    assert.deepEqual(report.unrecognized, [file]);
  });
});

test("results sort by file and pointer, and the JSON Pointer resolves to the version", async () => {
  await withDirectory(async (directory) => {
    const first = join(directory, "a.json");
    const second = join(directory, "b.json");
    await writeFile(first, JSON.stringify([{ name: "billing", version: "2.88.2" }, { name: "audit", version: "2.88.2" }]));
    await writeFile(second, JSON.stringify([{ name: "reports", version: "2.88.2" }]));

    const report = await runInventory([second, first], [arrayImporter("fake")]);
    assert.deepEqual(report.results.map((result) => result.item.file), [first, first, second]);
    assert.deepEqual(report.results.map((result) => result.item.pointer), ["/0/version", "/1/version", "/0/version"]);
    for (const result of report.results) {
      const document = parseExport(await readFile(result.item.file, "utf8")) as Array<{ version: string }>;
      const index = Number(result.item.pointer.split("/")[1]);
      assert.equal(document[index]!.version, result.item.version);
    }
    assert.ok(report.results.every((result) => result.check.status === "affected"));
  });
});

test("text output puts affected results first, lists no-data last, and names skipped files", async () => {
  await withDirectory(async (directory) => {
    const file = join(directory, "exports.json");
    await writeFile(file, JSON.stringify([{ name: "one", version: "2.88.2" }]));
    const report = await runInventory([file], [arrayImporter("fake")]);
    const text = renderInventoryText(report, [join(directory, "missing.json")]);
    assert.match(text, /one  2\.88\.2  affected  npm\.package\.request\.deprecated  \/0\/version/);
    assert.match(text, /Unreadable: .*missing\.json/);
  });
});

test("redaction replaces a resource with the first 12 hex characters of its SHA-256", async () => {
  const expected = createHash("sha256").update("billing-report").digest("hex").slice(0, 12);
  assert.equal(redactResource("billing-report"), expected);
  assert.match(redactResource("billing-report"), /^[0-9a-f]{12}$/);
  assert.notEqual(redactResource("billing-report"), redactResource("billing-report-2"));

  await withDirectory(async (directory) => {
    const file = join(directory, "exports.json");
    await writeFile(file, JSON.stringify([{ name: "billing-report", version: "2.88.2" }]));
    const report = await runInventory([file], [arrayImporter("fake")]);
    const redacted = redactReport(report);
    assert.equal(redacted.results[0]!.item.resource, expected);
    assert.equal(redacted.results[0]!.item.pointer, "/0/version");
    assert.equal(redacted.results[0]!.check.status, "affected");
    assert.ok(!renderInventoryText(redacted).includes("billing-report"));
  });
});

test("the report matches schemas/inventory.v1.schema.json and rejects undeclared properties", async () => {
  await withDirectory(async (directory) => {
    const file = join(directory, "exports.json");
    await writeFile(file, JSON.stringify([{ name: "billing-report", version: "2.88.2" }]));
    const report = await runInventory([file], [arrayImporter("fake")]);

    const ajv = new Ajv2020({ allErrors: true, strict: false });
    for (const name of ["scan.v1.schema.json", "check.v1.schema.json"]) {
      ajv.addSchema(JSON.parse(await readFile(resolve(`schemas/${name}`), "utf8")) as object);
    }
    const validate = ajv.compile(JSON.parse(await readFile(resolve("schemas/inventory.v1.schema.json"), "utf8")) as object);
    assert.equal(validate(report), true, JSON.stringify(validate.errors));

    const undeclared = structuredClone(report) as unknown as { results: Array<Record<string, unknown>> };
    undeclared.results[0]!.deployment = "disallowed";
    assert.equal(validate(undeclared), false);
  });
});

test("the CLI lists files it cannot recognize or read and exits 2", async () => {
  await withDirectory(async (directory) => {
    const unknown = join(directory, "unknown.json");
    await writeFile(unknown, JSON.stringify([{ hello: "world" }]));
    let result: { code: number; stdout: string; stderr: string };
    try {
      const { stdout, stderr } = await execute(process.execPath, [cli, "inventory", unknown, join(directory, "missing.json")]);
      result = { code: 0, stdout, stderr };
    } catch (error) {
      const failure = error as { code: number; stdout: string; stderr: string };
      result = { code: failure.code, stdout: failure.stdout, stderr: failure.stderr };
    }
    assert.equal(result.code, 2);
    assert.match(result.stdout, /Unrecognized: .*unknown\.json/);
    assert.match(result.stdout, /Unreadable: .*missing\.json/);
  });
});
