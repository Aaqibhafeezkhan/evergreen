import assert from "node:assert/strict";
import { test } from "node:test";

import { applyBaseline, createBaseline, findingFingerprint } from "../src/baseline.js";
import type { Finding, ScanResult } from "../src/domain.js";

const finding: Finding = {
  id: "example:file:1",
  ruleId: "example",
  detector: "fixture",
  title: "Example",
  summary: "A stable finding summary",
  severity: "high",
  location: { path: "package.json", line: 1 },
  sources: [{ title: "Source", url: "https://example.com" }],
};

const result: ScanResult = {
  schemaVersion: "evergreen.scan.v1",
  root: "/fixture",
  scannedAt: "2026-10-13T00:00:00.000Z",
  findings: [finding],
  diagnostics: [],
};

test("fingerprints ignore line movement but include material finding content", () => {
  assert.equal(
    findingFingerprint(finding),
    findingFingerprint({ ...finding, location: { ...finding.location, line: 99 } }),
  );
  assert.notEqual(
    findingFingerprint(finding),
    findingFingerprint({ ...finding, summary: "The dependency version changed" }),
  );
});

test("a baseline suppresses matching findings and reports the count", () => {
  const filtered = applyBaseline(result, createBaseline(result));

  assert.deepEqual(filtered.findings, []);
  assert.deepEqual(filtered.diagnostics, ["Suppressed 1 finding from the baseline."]);
});
