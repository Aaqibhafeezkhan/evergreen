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
  assert.notEqual(
    findingFingerprint(finding),
    findingFingerprint({
      ...finding,
      usages: [
        {
          kind: "call",
          language: "typescript",
          symbol: "example.run",
          location: { path: "src/index.ts", line: 2, column: 1 },
          excerpt: "example.run();",
        },
      ],
    }),
  );
  const usageFinding = {
    ...finding,
    usages: [
      {
        kind: "call" as const,
        language: "typescript" as const,
        symbol: "example.run",
        location: { path: "src/index.ts", line: 2, column: 1 },
        excerpt: "example.run();",
      },
    ],
  };
  assert.equal(
    findingFingerprint(usageFinding),
    findingFingerprint({
      ...usageFinding,
      usages: [{ ...usageFinding.usages[0]!, location: { path: "src/index.ts", line: 20 } }],
    }),
  );
});

test("a baseline suppresses matching findings and reports the count", () => {
  const filtered = applyBaseline(result, createBaseline(result));

  assert.deepEqual(filtered.findings, []);
  assert.deepEqual(filtered.diagnostics, ["Suppressed 1 finding from the baseline."]);
});
