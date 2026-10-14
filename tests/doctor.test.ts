import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";

import { diagnoseEnvironment, renderDoctorText } from "../src/doctor.js";

const temporaryRoots: string[] = [];

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function installationFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-doctor-"));
  temporaryRoots.push(root);
  await mkdir(join(root, "dist", "src"), { recursive: true });
  await mkdir(join(root, "skills", "evergreen-deprecation"), { recursive: true });
  await writeFile(
    join(root, "package.json"),
    JSON.stringify({
      name: "evergreen-deprecation",
      engines: { node: ">=22" },
      bin: { evergreen: "dist/src/cli.js", "evergreen-mcp": "dist/src/mcp-cli.js" },
    }),
  );
  await writeFile(join(root, "dist", "src", "mcp-cli.js"), "");
  await writeFile(
    join(root, "skills", "evergreen-deprecation", "SKILL.md"),
    "---\nname: evergreen-deprecation\ndescription: Test fixture\n---\n",
  );
  return root;
}

test("doctor produces deterministic local text and JSON-ready results", async () => {
  const installationRoot = await installationFixture();
  const options = {
    installationRoot,
    environment: {},
    nodeVersion: "22.12.0",
    platform: "linux" as const,
  };
  const first = await diagnoseEnvironment(installationRoot, options);
  const second = await diagnoseEnvironment(installationRoot, options);

  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, "evergreen.doctor.v1");
  assert.equal(first.context.kind, "local");
  assert.equal(first.summary.status, "ready-with-warnings");
  assert.equal(first.summary.failed, 0);
  assert.match(renderDoctorText(first), /no repository data was uploaded/i);
});

test("doctor validates GitHub Actions and GitLab CI workspaces", async () => {
  const installationRoot = await installationFixture();
  const github = await diagnoseEnvironment(installationRoot, {
    installationRoot,
    environment: { GITHUB_ACTIONS: "true", GITHUB_WORKSPACE: installationRoot },
    nodeVersion: "22.12.0",
    platform: "linux",
  });
  assert.equal(github.context.kind, "github-actions");
  assert.equal(github.checks.find((check) => check.category === "ci")?.status, "pass");

  const gitlab = await diagnoseEnvironment(installationRoot, {
    installationRoot,
    environment: { GITLAB_CI: "true", CI_PROJECT_DIR: installationRoot },
    nodeVersion: "22.12.0",
    platform: "linux",
  });
  assert.equal(gitlab.context.kind, "gitlab-ci");
  assert.equal(gitlab.checks.find((check) => check.category === "ci")?.status, "pass");
});

test("doctor failures include concrete remediation", async () => {
  const installationRoot = await installationFixture();
  const result = await diagnoseEnvironment(installationRoot, {
    installationRoot,
    environment: { GITHUB_ACTIONS: "true" },
    nodeVersion: "20.18.0",
    platform: "linux",
  });
  const failures = result.checks.filter((check) => check.status === "fail");

  assert.equal(result.summary.status, "not-ready");
  assert.ok(failures.length >= 2);
  assert.ok(failures.every((check) => Boolean(check.remediation)));
});
