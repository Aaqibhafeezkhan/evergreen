import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import type { Finding, ScanResult } from "./domain.js";

export interface BaselineEntry {
  fingerprint: string;
  ruleId: string;
  path: string;
}

export interface Baseline {
  schemaVersion: "evergreen.baseline.v1";
  createdAt: string;
  findings: BaselineEntry[];
}

export function findingFingerprint(finding: Finding): string {
  const usages = finding.usages
    ?.map((usage) => [usage.kind, usage.location.path, usage.symbol])
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256")
    .update(
      JSON.stringify([
        finding.ruleId,
        finding.location.path,
        finding.summary,
        ...(usages && usages.length > 0 ? [usages] : []),
      ]),
    )
    .digest("hex");
}

export function createBaseline(result: ScanResult): Baseline {
  return {
    schemaVersion: "evergreen.baseline.v1",
    createdAt: new Date().toISOString(),
    findings: result.findings.map((finding) => ({
      fingerprint: findingFingerprint(finding),
      ruleId: finding.ruleId,
      path: finding.location.path,
    })),
  };
}

export async function writeBaseline(path: string, baseline: Baseline): Promise<void> {
  await writeFile(path, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

export async function readBaseline(path: string): Promise<Baseline> {
  const baseline = JSON.parse(await readFile(path, "utf8")) as Baseline;
  if (baseline.schemaVersion !== "evergreen.baseline.v1" || !Array.isArray(baseline.findings)) {
    throw new Error(`Unsupported Evergreen baseline: ${path}`);
  }
  return baseline;
}

export function applyBaseline(result: ScanResult, baseline: Baseline): ScanResult {
  const suppressed = new Set(baseline.findings.map((entry) => entry.fingerprint));
  const findings = result.findings.filter(
    (finding) => !suppressed.has(findingFingerprint(finding)),
  );
  const suppressedCount = result.findings.length - findings.length;
  return {
    ...result,
    findings,
    diagnostics: [
      ...result.diagnostics,
      `Suppressed ${suppressedCount} finding${suppressedCount === 1 ? "" : "s"} from the baseline.`,
    ],
  };
}
