import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

import { analyzeDrift } from "../src/drift/index.js";
import type { DriftCollector, RuntimePin } from "../src/drift/types.js";

function pin(
  path: string,
  line: number,
  source: string,
  raw: string,
  kind: "pin" | "floor" = "pin",
  release?: string,
  unresolved?: string,
): RuntimePin {
  return {
    path,
    line,
    source,
    raw,
    kind,
    ...(release === undefined ? {} : { release }),
    ...(unresolved === undefined ? {} : { unresolved }),
  };
}

const nodejs: DriftCollector = {
  runtime: "nodejs",
  async collect() {
    return [
      pin("Dockerfile", 1, "Dockerfile FROM", "18", "pin", "18"),
      pin(".nvmrc", 1, ".nvmrc", "20", "pin", "20"),
    ];
  },
};

const python: DriftCollector = {
  runtime: "python",
  async collect() {
    return [
      pin("runtime.txt", 1, "runtime.txt", "3.9", "pin", "3.9"),
      pin("pyproject.toml", 3, "pyproject.toml requires-python", ">=3.11", "floor", "3.11"),
    ];
  },
};

const ruby: DriftCollector = {
  runtime: "ruby",
  async collect() {
    return [pin(".ruby-version", 1, ".ruby-version", "latest", "pin", undefined, "the value is floating, which Evergreen does not resolve offline")];
  },
};

test("a runtime with two pinned releases is drifted and lists its releases ascending", async () => {
  const report = await analyzeDrift(".", [nodejs]);
  const runtime = report.runtimes[0];
  assert.equal(runtime?.runtime, "nodejs");
  assert.equal(runtime?.drifted, true);
  assert.deepEqual(runtime?.releases, ["18", "20"]);
  assert.deepEqual(runtime?.floorConflicts, []);
});

test("a floor above the lowest pin is a floor conflict, not a drift", async () => {
  const report = await analyzeDrift(".", [python]);
  const runtime = report.runtimes[0];
  assert.equal(runtime?.drifted, false);
  assert.deepEqual(runtime?.releases, ["3.9"]);
  assert.equal(runtime?.floorConflicts.length, 1);
  assert.equal(runtime?.floorConflicts[0]?.raw, ">=3.11");
});

test("an unresolved value stays in pins but never becomes a release", async () => {
  const report = await analyzeDrift(".", [ruby]);
  const runtime = report.runtimes[0];
  assert.equal(runtime?.pins.length, 1);
  assert.equal(runtime?.pins[0]?.release, undefined);
  assert.match(runtime?.pins[0]?.unresolved ?? "", /floating/);
  assert.deepEqual(runtime?.releases, []);
  assert.equal(runtime?.drifted, false);
});

test("pins are sorted by location and the report is deterministic", async () => {
  const unordered: DriftCollector = {
    runtime: "go",
    async collect() {
      return [
        pin("b/go.mod", 9, "go.mod toolchain", "1.22", "pin", "1.22"),
        pin("a/Dockerfile", 4, "Dockerfile FROM", "1.21", "pin", "1.21"),
        pin("b/go.mod", 2, "go.mod go", "1.21", "pin", "1.21"),
      ];
    },
  };
  const first = await analyzeDrift(".", [unordered]);
  const second = await analyzeDrift(".", [unordered]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.runtimes[0]?.pins.map((item) => `${item.path}:${item.line}`), ["a/Dockerfile:4", "b/go.mod:2", "b/go.mod:9"]);
});

test("the drift report validates against schemas/drift.v1.schema.json", async () => {
  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const report = await analyzeDrift(".", [nodejs, python, ruby]);
  assert.equal(validate(report), true, JSON.stringify(validate.errors));
});
