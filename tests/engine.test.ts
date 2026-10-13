import assert from "node:assert/strict";
import { test } from "node:test";

import type { Detector } from "../src/domain.js";
import { scanRepository } from "../src/engine.js";
import { renderJson, renderText } from "../src/reporters.js";

test("scan result is deterministic apart from its timestamp", async () => {
  const detector: Detector = {
    name: "fixture",
    async scan() {
      return [
        {
          id: "fixture:two",
          ruleId: "two",
          detector: "fixture",
          title: "Second",
          summary: "Second finding",
          severity: "low",
          location: { path: "b.txt" },
          sources: [{ title: "Official source", url: "https://example.com/two" }],
        },
        {
          id: "fixture:one",
          ruleId: "one",
          detector: "fixture",
          title: "First",
          summary: "First finding",
          severity: "high",
          location: { path: "a.txt", line: 4 },
          sources: [{ title: "Official source", url: "https://example.com/one" }],
        },
      ];
    },
  };

  const result = await scanRepository(".", [detector]);

  assert.deepEqual(
    result.findings.map((finding) => finding.id),
    ["fixture:one", "fixture:two"],
  );
  assert.match(renderText(result), /HIGH First/);
  assert.equal(JSON.parse(renderJson(result)).schemaVersion, "evergreen.scan.v1");
});

test("scan without detectors explains the current state", async () => {
  const result = await scanRepository(".");

  assert.equal(result.findings.length, 0);
  assert.equal(result.diagnostics.length, 1);
});
