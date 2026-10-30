import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { validateRegistryV2 } from "../src/registry.js";

const AWS_RUNTIMES = "https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html";
const GOOGLE_RUNTIMES = "https://cloud.google.com/functions/docs/runtime-support";
const GOOGLE_APPENGINE = "https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule";

/** Deadlines taken from the vendor tables on 2026-10-29 (AWS deprecation date; Google decommission date). */
const SOURCE_DEADLINES = {
  "serverless.aws-lambda.nodejs12.x": { deadline: "2023-03-31", source: AWS_RUNTIMES, identifier: "nodejs12.x" },
  "serverless.aws-lambda.nodejs14.x": { deadline: "2023-12-04", source: AWS_RUNTIMES, identifier: "nodejs14.x" },
  "serverless.aws-lambda.python3.8": { deadline: "2024-10-14", source: AWS_RUNTIMES, identifier: "python3.8" },
  "serverless.aws-lambda.python3.7": { deadline: "2023-12-04", source: AWS_RUNTIMES, identifier: "python3.7" },
  "serverless.aws-lambda.ruby2.7": { deadline: "2023-12-07", source: AWS_RUNTIMES, identifier: "ruby2.7" },
  "serverless.aws-lambda.dotnetcore3.1": { deadline: "2023-04-03", source: AWS_RUNTIMES, identifier: "dotnetcore3.1" },
  "serverless.google-cloud-functions.nodejs14": {
    deadline: "2025-01-30",
    source: GOOGLE_RUNTIMES,
    identifier: "nodejs14",
  },
} as const;

async function rules() {
  return validateRegistryV2(JSON.parse(await readFile("registry/serverless.json", "utf8"))).rules;
}

test("the serverless registry holds the curated AWS and Google Cloud rules, each citing its vendor table", async () => {
  const all = await rules();
  assert.equal(all.length, 74);
  const aws = all.filter((rule) => rule.id.startsWith("serverless.aws-lambda."));
  assert.deepEqual(
    aws.map((rule) => rule.id).sort(),
    Object.keys(SOURCE_DEADLINES).filter((id) => id.startsWith("serverless.aws-lambda.")).sort(),
  );
  for (const rule of aws) {
    const expected = SOURCE_DEADLINES[rule.id as keyof typeof SOURCE_DEADLINES];
    assert.ok(expected, rule.id);
    assert.ok(rule.sources.every((source) => source.url.startsWith("https://")), rule.id);
    assert.ok(
      rule.sources.some((source) => source.url === expected.source),
      `${rule.id} cites ${expected.source}`,
    );
    assert.match(rule.summary, new RegExp(expected.identifier.replace(/\./g, "\\.")));
  }

  const functions = all.filter((rule) => rule.id.startsWith("serverless.google-cloud-functions."));
  const appEngine = all.filter((rule) => rule.id.startsWith("serverless.google-appengine-runtime."));
  assert.equal(functions.length, 32);
  assert.equal(appEngine.length, 36);
  for (const rule of [...functions, ...appEngine]) {
    const source = rule.id.startsWith("serverless.google-cloud-functions.") ? GOOGLE_RUNTIMES : GOOGLE_APPENGINE;
    assert.ok(rule.sources.some((entry) => entry.url === source), `${rule.id} cites ${source}`);
    assert.match(rule.summary, /runtime ID /, rule.id);
    assert.equal(rule.vers, "vers:semver/*", rule.id);
  }
});

test("each serverless rule deadline matches the date published by its source", async () => {
  const all = await rules();
  for (const [id, expected] of Object.entries(SOURCE_DEADLINES)) {
    const rule = all.find((candidate) => candidate.id === id);
    assert.ok(rule, id);
    assert.equal(rule.deadline, expected.deadline, id);
    assert.match(rule.summary, new RegExp(expected.deadline.replaceAll("-", "\\-")), `${id} summary names the deadline`);
  }
});
