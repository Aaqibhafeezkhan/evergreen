import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { after, test } from "node:test";

const execute = promisify(execFile);
const temporaryRoots: string[] = [];
const cli = resolve("dist/src/cli.js");

after(async () => {
  await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
});

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "evergreen-cli-"));
  temporaryRoots.push(root);
  await mkdir(join(root, ".github", "workflows"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ engines: { node: "20" } }));
  await writeFile(
    join(root, ".github", "workflows", "ci.yml"),
    "jobs:\n  test:\n    steps:\n      - uses: actions/checkout@v4\n",
  );
  return root;
}

test("CLI scans, explains, creates a baseline, and suppresses known findings", async () => {
  const root = await fixtureRepository();
  const firstScan = await execute(process.execPath, [cli, "scan", root, "--json"]);
  const result = JSON.parse(firstScan.stdout) as { findings: Array<{ id: string }> };
  assert.equal(result.findings.length, 2);

  const explanation = await execute(process.execPath, [
    cli,
    "explain",
    result.findings[0]?.id ?? "",
    root,
  ]);
  assert.match(explanation.stdout, /Sources:/);

  const baselinePath = join(root, "baseline.json");
  await execute(process.execPath, [cli, "baseline", root, "--output", baselinePath]);
  const baseline = JSON.parse(await readFile(baselinePath, "utf8")) as { findings: unknown[] };
  assert.equal(baseline.findings.length, 2);

  const filteredScan = await execute(process.execPath, [
    cli,
    "scan",
    root,
    "--baseline",
    baselinePath,
    "--json",
  ]);
  const filtered = JSON.parse(filteredScan.stdout) as { findings: unknown[]; diagnostics: string[] };
  assert.deepEqual(filtered.findings, []);
  assert.match(filtered.diagnostics.at(-1) ?? "", /Suppressed 2 findings/);
});
