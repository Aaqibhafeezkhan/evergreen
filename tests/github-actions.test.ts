import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { GitHubActionsDetector } from "../src/detectors/github-actions.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function repositoryWithWorkflow(contents: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-actions-"));
  temporaryRoots.push(root);
  const workflows = join(root, ".github", "workflows");
  await mkdir(workflows, { recursive: true });
  await writeFile(join(workflows, "ci.yml"), contents);
  return root;
}

test("finds unsupported action majors with exact line locations", async () => {
  const root = await repositoryWithWorkflow(`name: CI
jobs:
  test:
    steps:
      - uses: actions/checkout@v4
      - uses: "actions/setup-node@v4" # old runtime
      - uses: actions/cache@v4.2.0
      - uses: actions/upload-artifact@v6
      - uses: actions/download-artifact@v3
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.equal(findings.length, 5);
  assert.deepEqual(
    findings.map((finding) => finding.location.line),
    [5, 6, 7, 8, 9],
  );
  assert.equal(findings[0]?.location.path, ".github/workflows/ci.yml");
  assert.equal(findings[4]?.severity, "critical");
});

test("ignores supported, local, Docker, dynamic, and SHA-pinned actions", async () => {
  const root = await repositoryWithWorkflow(`jobs:
  test:
    steps:
      - uses: actions/checkout@v5
      - uses: actions/cache@v6
      - uses: ./local-action
      - uses: docker://alpine:3.20
      - uses: owner/action@\${{ inputs.ref }}
      - uses: actions/checkout@11bd71901bbe5b1630ceea73d27597364c9af683
`);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.deepEqual(findings, []);
});

test("returns no findings when the workflows directory is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "evergreen-actions-empty-"));
  temporaryRoots.push(root);

  const findings = await new GitHubActionsDetector().scan({ root });

  assert.deepEqual(findings, []);
});
