import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "node:test";

import { parse as parseYaml } from "yaml";

const skillPath = resolve("skills/evergreen-deprecation/SKILL.md");

function parseSkill(contents: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]+)$/.exec(contents);
  assert.ok(match, "SKILL.md must contain YAML frontmatter and a Markdown body");
  return {
    frontmatter: parseYaml(match[1]!) as Record<string, unknown>,
    body: match[2]!,
  };
}

test("Evergreen skill follows the portable Agent Skills contract", async () => {
  const contents = await readFile(skillPath, "utf8");
  const { frontmatter, body } = parseSkill(contents);

  assert.equal(frontmatter.name, "evergreen-deprecation");
  assert.equal(typeof frontmatter.description, "string");
  assert.ok(String(frontmatter.description).length <= 1024);
  assert.deepEqual(
    Object.keys(frontmatter).sort(),
    ["description", "license", "metadata", "name"],
  );
  assert.ok(body.split("\n").length < 100, "skill instructions should stay thin");
  assert.doesNotMatch(contents, /\b(Codex|Claude|Cursor|Gemini|OpenAI|Anthropic)\b/i);

  for (const tool of [
    "scan_repository",
    "list_deprecations",
    "explain_deprecation",
    "create_migration_context",
    "verify_migration",
  ]) {
    assert.match(body, new RegExp(`\\b${tool}\\b`));
  }
  assert.match(body, /unknown ID is not proof of successful migration/);
  assert.match(body, /normal authorization rules/);
});

test("skill evaluation corpus covers triggering and non-triggering requests", async () => {
  const evaluation = JSON.parse(
    await readFile(resolve("skills/evergreen-deprecation/evals/cases.json"), "utf8"),
  ) as {
    schemaVersion: string;
    cases: Array<{ id: string; prompt: string; shouldTrigger: boolean; reason: string }>;
  };

  assert.equal(evaluation.schemaVersion, "evergreen.skill-evals.v1");
  assert.equal(new Set(evaluation.cases.map((item) => item.id)).size, evaluation.cases.length);
  assert.ok(evaluation.cases.every((item) => item.prompt.length > 0 && item.reason.length > 0));
  assert.ok(evaluation.cases.filter((item) => item.shouldTrigger).length >= 4);
  assert.ok(evaluation.cases.filter((item) => !item.shouldTrigger).length >= 4);
});
