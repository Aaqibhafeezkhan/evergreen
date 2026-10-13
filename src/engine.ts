import { resolve } from "node:path";

import type { Detector, ScanResult } from "./domain.js";

export async function scanRepository(
  root: string,
  detectors: readonly Detector[] = [],
): Promise<ScanResult> {
  const resolvedRoot = resolve(root);
  const findings = (
    await Promise.all(detectors.map((detector) => detector.scan({ root: resolvedRoot })))
  ).flat();

  return {
    schemaVersion: "evergreen.scan.v1",
    root: resolvedRoot,
    scannedAt: new Date().toISOString(),
    findings: findings.sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics:
      detectors.length === 0
        ? ["No detectors are enabled yet. The first GitHub Actions detector is planned for Week 2."]
        : [],
  };
}
