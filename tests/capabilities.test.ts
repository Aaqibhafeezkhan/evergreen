import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { getCapabilityManifest } from "../src/capabilities.js";

const execute = promisify(execFile);
const cli = resolve("dist/src/cli.js");

async function validator() {
  const schema = JSON.parse(await readFile(resolve("schemas/capabilities.v1.schema.json"), "utf8"));
  return new Ajv2020({ allErrors: true }).compile(schema);
}

test("capability manifest and committed example validate against the public schema", async () => {
  const validate = await validator();
  const manifest = getCapabilityManifest();
  const example = JSON.parse(await readFile(resolve("examples/capabilities.json"), "utf8"));

  assert.ok(validate(manifest), JSON.stringify(validate.errors));
  assert.ok(validate(example), JSON.stringify(validate.errors));
  assert.deepEqual(example, manifest);
});

test("every surface uses shared capability identifiers and unsupported behavior is explicit", () => {
  const manifest = getCapabilityManifest();
  const identifiers = new Set(manifest.capabilities.map((capability) => capability.id));
  const ecosystemIdentifiers = new Set(manifest.ecosystems.map((ecosystem) => ecosystem.id));
  assert.equal(identifiers.size, manifest.capabilities.length);
  assert.equal(ecosystemIdentifiers.size, manifest.ecosystems.length);
  for (const surface of manifest.surfaces) {
    assert.ok(surface.capabilityIds.every((identifier) => identifiers.has(identifier)));
  }
  for (const capability of manifest.capabilities) {
    assert.ok(capability.ecosystems.every((identifier) => ecosystemIdentifiers.has(identifier)));
  }
  assert.deepEqual(
    new Set(manifest.surfaces.map((surface) => surface.kind)),
    new Set(["cli", "mcp", "skill", "plugin", "ci"]),
  );
  assert.equal(manifest.compatibility.unlistedCapabilities, "unsupported");
  assert.equal(manifest.compatibility.unlistedEcosystems, "unsupported");
  assert.ok(manifest.capabilities.some((capability) => capability.status === "unsupported"));
});

test("CLI exposes the stable capability manifest as deterministic JSON", async () => {
  const first = await execute(process.execPath, [cli, "capabilities", "--json"]);
  const second = await execute(process.execPath, [cli, "capabilities", "--json"]);
  const output = JSON.parse(first.stdout);
  const validate = await validator();

  assert.equal(first.stdout, second.stdout);
  assert.ok(validate(output), JSON.stringify(validate.errors));
  assert.deepEqual(output, getCapabilityManifest());
});
