import assert from "node:assert/strict";
import { test } from "node:test";

import type { ScanResult } from "../src/domain.js";
import { createMigrationPacket } from "../src/migration-packet.js";

const result: ScanResult = {
  schemaVersion: "evergreen.scan.v1",
  root: "/repo",
  scannedAt: "2026-10-14T07:00:00.000Z",
  diagnostics: [],
  findings: [
    {
      id: "npm.request:package.json:3",
      ruleId: "npm.request",
      detector: "npm",
      title: "Deprecated request package",
      summary: "request is deprecated.",
      severity: "high",
      location: { path: "package.json", line: 3 },
      replacement: "Native fetch",
      deadline: "2020-02-11",
      sources: [{ title: "Official notice", url: "https://example.com/request" }],
      usages: [
        {
          kind: "import",
          language: "typescript",
          symbol: "request",
          location: { path: "src/client.ts", line: 1, column: 28 },
          excerpt: 'import request from "request";',
        },
        {
          kind: "call",
          language: "typescript",
          symbol: "request.get",
          location: { path: "src/client.ts", line: 2, column: 1 },
          excerpt: "request.get(url);",
        },
      ],
      impact: { usageCount: 2, affectedFiles: 1, level: "low" },
    },
  ],
};

test("creates a deterministic, agent-ready migration packet", () => {
  const packet = createMigrationPacket(result, "npm.request:package.json:3");

  assert.equal(packet.schemaVersion, "evergreen.context.v1");
  assert.equal(packet.generatedAt, result.scannedAt);
  assert.deepEqual(packet.affectedFiles, ["package.json", "src/client.ts"]);
  assert.equal(packet.usages.length, 2);
  assert.match(packet.constraints.join("\n"), /Target replacement: Native fetch/);
  assert.deepEqual(packet.steps.map((step) => step.id), [
    "review-evidence",
    "update-declaration",
    "migrate-usages",
    "verify-migration",
  ]);
  assert.deepEqual(packet.verification.map((item) => item.command), [
    "npm test",
    "npm run build --if-present",
    "npx evergreen-deprecation scan .",
  ]);
  assert.deepEqual(createMigrationPacket(result, packet.finding.id), packet);
});

test("rejects a missing finding", () => {
  assert.throws(() => createMigrationPacket(result, "missing"), /Finding not found: missing/);
});
