import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";
import { Ajv2020 } from "ajv/dist/2020.js";

async function corpusAndValidator() {
  const corpus = JSON.parse(await readFile(resolve("benchmarks/public-repositories.json"), "utf8"));
  const schema = JSON.parse(await readFile(resolve("schemas/public-validation.v1.schema.json"), "utf8"));
  return { corpus, validate: new Ajv2020({ allErrors: true }).compile(schema) };
}

test("the public validation corpus matches its versioned JSON Schema", async () => {
  const { corpus, validate } = await corpusAndValidator();
  assert.ok(validate(corpus), JSON.stringify(validate.errors));
});

test("the corpus schema rejects malformed commits and findings", async (t) => {
  const { corpus, validate } = await corpusAndValidator();
  for (const [name, mutate] of [
    ["short commit", (value: typeof corpus) => { value.repositories[0].commit = "abcdef"; }],
    ["non-hex commit", (value: typeof corpus) => { value.repositories[0].commit = "g".repeat(40); }],
    ["missing rule ID", (value: typeof corpus) => { delete value.repositories[0].expected[0].ruleId; }],
    ["empty rule ID", (value: typeof corpus) => { value.repositories[0].expected[0].ruleId = ""; }],
    ["zero line", (value: typeof corpus) => { value.repositories[0].expected[0].line = 0; }],
    ["fractional line", (value: typeof corpus) => { value.repositories[0].expected[0].line = 1.5; }],
    ["unknown ecosystem", (value: typeof corpus) => { value.repositories[0].ecosystem = "unknown"; }],
    ["invalid repository", (value: typeof corpus) => { value.repositories[0].repository = "express"; }],
    ["too few repositories", (value: typeof corpus) => { value.repositories.pop(); }],
    ["too many repositories", (value: typeof corpus) => { value.repositories.push(structuredClone(value.repositories[0])); }],
  ] as const) {
    await t.test(name, () => {
      const invalid = structuredClone(corpus);
      mutate(invalid);
      assert.equal(validate(invalid), false);
      assert.ok(validate.errors?.length);
    });
  }
});

test("repository uniqueness remains a semantic check", async () => {
  const { corpus, validate } = await corpusAndValidator();
  corpus.repositories[1].repository = corpus.repositories[0].repository;
  assert.equal(validate(corpus), true);
  assert.equal(new Set(corpus.repositories.map((item: { repository: string }) => item.repository)).size, 19);
});

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
