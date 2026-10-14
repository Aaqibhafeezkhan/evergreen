import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

test("the public validation corpus is pinned, balanced, and audited", async () => {
  const corpus = JSON.parse(
    await readFile(resolve("benchmarks/public-repositories.json"), "utf8"),
  ) as {
    schemaVersion: string;
    repositories: Array<{
      repository: string;
      commit: string;
      ecosystem: string;
      expected: Array<{ ruleId: string; path: string; line?: number }>;
    }>;
  };

  assert.equal(corpus.schemaVersion, "evergreen.public-validation.v1");
  assert.equal(corpus.repositories.length, 20);
  assert.equal(new Set(corpus.repositories.map((item) => item.repository)).size, 20);
  assert.ok(corpus.repositories.every((item) => /^[a-f0-9]{40}$/.test(item.commit)));
  assert.equal(
    corpus.repositories.filter((item) => item.ecosystem.startsWith("node")).length,
    10,
  );
  assert.equal(
    corpus.repositories.reduce((total, item) => total + item.expected.length, 0),
    27,
  );
});
