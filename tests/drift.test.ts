import assert from "node:assert/strict";
import { test } from "node:test";

import { analyzeDrift } from "../src/drift/index.js";
import type { DriftCollector, RuntimePin } from "../src/drift/index.js";

function pin(overrides: Partial<RuntimePin> & Pick<RuntimePin, "path" | "line" | "raw" | "kind">): RuntimePin {
  return {
    source: "fixture",
    ...overrides,
  };
}

const alpha: DriftCollector = {
  runtime: "alpha",
  async collect() {
    return [
      pin({ path: "b.txt", line: 2, raw: "20", kind: "pin", release: "20" }),
      pin({ path: "a.txt", line: 1, raw: "18", kind: "pin", release: "18" }),
      pin({ path: "c.txt", line: 1, raw: ">=20", kind: "floor", release: "20" }),
      pin({ path: "d.txt", line: 1, raw: "lts/*", kind: "pin", unresolved: "the alias names no version." }),
    ];
  },
};

const zeta: DriftCollector = {
  runtime: "zeta",
  async collect() {
    return [pin({ path: ".zeta-version", line: 1, raw: "3.11", kind: "pin", release: "3.11" })];
  },
};

const empty: DriftCollector = {
  runtime: "empty",
  async collect() {
    return [];
  },
};

test("reports drift, floor conflicts, and unresolved values, sorted by runtime and location", async () => {
  const report = await analyzeDrift(".", [zeta, alpha, empty]);
  assert.equal(report.schemaVersion, "evergreen.drift.v1");
  assert.deepEqual(report.runtimes.map((runtime) => runtime.runtime), ["alpha", "zeta"]);
  const [first] = report.runtimes;
  assert.deepEqual(first!.pins.map((entry) => entry.path), ["a.txt", "b.txt", "c.txt", "d.txt"]);
  assert.deepEqual(first!.releases, ["18", "20"]);
  assert.equal(first!.drifted, true);
  assert.deepEqual(first!.floorConflicts.map((entry) => entry.path), ["c.txt"]);
  assert.equal(first!.pins[3]!.release, undefined);
  assert.equal(first!.pins[3]!.unresolved, "the alias names no version.");
  assert.equal(report.runtimes[1]!.drifted, false);
  assert.deepEqual(report.runtimes[1]!.floorConflicts, []);
});

test("is deterministic across runs", async () => {
  const once = JSON.stringify(await analyzeDrift(".", [zeta, alpha]));
  const twice = JSON.stringify(await analyzeDrift(".", [zeta, alpha]));
  assert.equal(once, twice);
});

test("a runtime with no pins is omitted, and a floor alone is not drift", async () => {
  const onlyFloor: DriftCollector = {
    runtime: "floor-only",
    async collect() {
      return [pin({ path: "pyproject.toml", line: 1, raw: ">=3.12", kind: "floor", release: "3.12" })];
    },
  };
  const report = await analyzeDrift(".", [empty, onlyFloor]);
  assert.deepEqual(report.runtimes.map((runtime) => runtime.runtime), ["floor-only"]);
  assert.deepEqual(report.runtimes[0]!.releases, []);
  assert.equal(report.runtimes[0]!.drifted, false);
  assert.deepEqual(report.runtimes[0]!.floorConflicts, []);
});
