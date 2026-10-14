import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import type { SourceUsageContract } from "../src/domain.js";
import { analyzeSourceUsage } from "../src/source-usage.js";

const fileCount = 200;
const expectedUsages = fileCount * 2;
const contract: SourceUsageContract = {
  id: "request",
  matchers: [
    { kind: "import", language: "typescript", module: "request" },
    {
      kind: "call",
      language: "typescript",
      module: "request",
      targets: ["get"],
    },
  ],
};

const root = await mkdtemp(join(tmpdir(), "evergreen-source-benchmark-"));
try {
  const source = join(root, "src");
  await mkdir(source);
  await Promise.all(
    Array.from({ length: fileCount }, async (_, index) => {
      await writeFile(
        join(source, `client-${index}.ts`),
        `import legacyRequest from "request";\nlegacyRequest.get("https://example.com");\n// legacyRequest.get("ignored");\nconst sample = "request.get()";\n`,
      );
    }),
  );

  const startedAt = performance.now();
  const [analysis] = await analyzeSourceUsage(root, [contract]);
  const durationMs = performance.now() - startedAt;
  const usages = analysis?.usages ?? [];
  const detectedUsages = usages.length;
  const expected = new Set(
    Array.from({ length: fileCount }).flatMap((_, index) => [
      `import:src/client-${index}.ts:1`,
      `call:src/client-${index}.ts:2`,
    ]),
  );
  const detected = new Set(
    usages.map((usage) =>
      [usage.kind, usage.location.path, usage.location.line].join(":"),
    ),
  );
  const truePositives = [...detected].filter((usage) => expected.has(usage)).length;
  const precision = detectedUsages === 0 ? 0 : truePositives / detectedUsages;
  const recall = truePositives / expectedUsages;
  const result = {
    files: fileCount,
    expectedUsages,
    detectedUsages,
    precision,
    recall,
    durationMs: Number(durationMs.toFixed(2)),
  };

  console.log(JSON.stringify(result, null, 2));
  if (precision !== 1 || recall !== 1) process.exitCode = 1;
} finally {
  await rm(root, { recursive: true, force: true });
}
