import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { after, test } from "node:test";

import { parse as parseYaml } from "yaml";

import { createBaseline, writeBaseline } from "../src/baseline.js";
import { builtInDetectors } from "../src/detectors/index.js";
import { scanRepository } from "../src/engine.js";
import { runGitHubAction } from "../src/github-action.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-action-"));
  temporaryRoots.push(root);
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  return root;
}

test("the GitHub Action reports only regressions and enforces severity gates", async () => {
  const root = await fixtureRepository();
  const baselinePath = join(root, ".evergreen-baseline.json");
  await writeBaseline(baselinePath, createBaseline(await scanRepository(root, builtInDetectors)));
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
  );

  const reportPath = join(root, "reports", "evergreen.json");
  const outcome = await runGitHubAction({
    root,
    baselinePath,
    reportPath,
    failOnSeverity: "high",
  });

  assert.equal(outcome.result.findings.length, 1);
  assert.match(outcome.result.diagnostics.at(-1) ?? "", /Suppressed 1 finding/);
  assert.equal(outcome.failed, true);
  assert.deepEqual(outcome.annotations[0], {
    level: "error",
    title: "Evergreen: Unsupported actions/checkout runtime",
    message: `${outcome.result.findings[0]?.summary}\nReplacement: actions/checkout@v5 or later\nFinding: ${outcome.result.findings[0]?.id}`,
    location: { path: ".github/workflows/ci.yml", line: 4 },
  });
  const report = JSON.parse(await readFile(reportPath, "utf8")) as { findings: unknown[] };
  assert.equal(report.findings.length, 1);

  const criticalOnly = await runGitHubAction({
    root,
    baselinePath,
    reportPath: join(root, "critical.json"),
    failOnSeverity: "critical",
  });
  assert.equal(criticalOnly.failed, false);
});

test("the GitHub Action rejects an invalid severity gate", async () => {
  const root = await fixtureRepository();
  await assert.rejects(
    runGitHubAction({
      root,
      reportPath: join(root, "report.json"),
      failOnSeverity: "urgent" as never,
    }),
    /Invalid severity gate: urgent/,
  );
});

test("action metadata packages the scan and report upload as a reusable action", async () => {
  const metadata = parseYaml(await readFile(resolve("action.yml"), "utf8")) as {
    runs?: { using?: string; steps?: Array<{ run?: string; uses?: string; if?: string }> };
  };
  assert.equal(metadata.runs?.using, "composite");
  assert.ok(metadata.runs?.steps?.some((step) => step.run?.includes("dist/action/index.js")));
  assert.ok(
    metadata.runs?.steps?.some(
      (step) =>
        step.uses === "actions/upload-artifact@v7" &&
        step.if === "always() && inputs.upload-report == 'true'",
    ),
  );
});
