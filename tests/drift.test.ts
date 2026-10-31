import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { Ajv2020 } from "ajv/dist/2020.js";

import { renderDriftText } from "../src/drift/command.js";
import { analyzeDrift, compareReleases } from "../src/drift/index.js";
import type { DriftCollector, RuntimePin } from "../src/drift/types.js";

const pin = (
  path: string,
  line: number,
  source: string,
  raw: string,
  kind: "pin" | "floor",
  release?: string,
  unresolved?: string,
): RuntimePin => ({
  path,
  line,
  source,
  raw,
  kind,
  ...(release === undefined ? {} : { release }),
  ...(unresolved === undefined ? {} : { unresolved }),
});

const fake = (runtime: string, pins: RuntimePin[]): DriftCollector => ({ runtime, collect: async () => pins });

test("reports drift when the pins select more than one release", async () => {
  const report = await analyzeDrift("/repo", [
    fake("node", [pin(".nvmrc", 1, ".nvmrc", "18.19.0", "pin", "18"), pin(".github/workflows/ci.yml", 4, "GitHub Actions node-version", "20", "pin", "20")]),
  ]);
  assert.equal(report.schemaVersion, "evergreen.drift.v1");
  assert.deepEqual(report.runtimes.map((runtime) => [runtime.runtime, runtime.releases, runtime.drifted]), [["node", ["18", "20"], true]]);
  assert.deepEqual(report.runtimes[0]?.floorConflicts, []);
});

test("reports a floor above the lowest pinned release", async () => {
  const floor = pin("app.gemspec", 5, "gemspec required_ruby_version", ">= 3.4.0", "floor", "3.4");
  const report = await analyzeDrift("/repo", [
    fake("ruby", [pin(".ruby-version", 1, ".ruby-version", "3.3.0", "pin", "3.3"), floor]),
  ]);
  assert.deepEqual(report.runtimes[0]?.floorConflicts, [floor]);
});

test("keeps unresolved values out of the drift comparison and says why", async () => {
  const unresolved = pin("Dockerfile", 1, "Dockerfile FROM", "ruby", "pin", undefined, "the image reference has no tag");
  const report = await analyzeDrift("/repo", [fake("ruby", [pin(".ruby-version", 1, ".ruby-version", "3.3.0", "pin", "3.3"), unresolved])]);
  assert.deepEqual(report.runtimes[0]?.releases, ["3.3"]);
  assert.equal(report.runtimes[0]?.drifted, false);
  assert.match(renderDriftText(report), /unresolved: the image reference has no tag/);
});

test("sorts every pin by location and is deterministic", async () => {
  const pins = [
    pin("z/.ruby-version", 1, ".ruby-version", "3.4.0", "pin", "3.4"),
    pin(".ruby-version", 1, ".ruby-version", "3.3.0", "pin", "3.3"),
    pin("Gemfile", 1, "Gemfile ruby", "3.3.0", "pin", "3.3"),
  ];
  const first = await analyzeDrift("/repo", [fake("ruby", pins)]);
  const second = await analyzeDrift("/repo", [fake("ruby", [...pins].reverse())]);
  assert.deepEqual(first, second);
  assert.deepEqual(first.runtimes[0]?.pins.map((item) => item.path), [".ruby-version", "Gemfile", "z/.ruby-version"]);
});

test("--json output conforms to the drift schema", async () => {
  const schema = JSON.parse(await readFile(resolve("schemas/drift.v1.schema.json"), "utf8")) as object;
  const validate = new Ajv2020({ allErrors: true, strict: false }).compile(schema);
  const report = await analyzeDrift("/repo", [
    fake("ruby", [pin(".ruby-version", 1, ".ruby-version", "3.3.0", "pin", "3.3"), pin("app.gemspec", 5, "gemspec required_ruby_version", ">= 3.4.0", "floor", "3.4")]),
  ]);
  assert.equal(validate(JSON.parse(JSON.stringify(report))), true, JSON.stringify(validate.errors));
});

test("compares dotted releases numerically", () => {
  assert.ok(compareReleases("3.9", "3.11") < 0);
  assert.ok(compareReleases("3.11", "3.9") > 0);
  assert.equal(compareReleases("3.3", "3.3"), 0);
});
