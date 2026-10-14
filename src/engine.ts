import { resolve } from "node:path";

import type { ScanResult } from "./domain.js";
import { assertDetectorCompatible } from "./sdk.js";
import type { Detector } from "./sdk.js";

export async function scanRepository(
  root: string,
  detectors: readonly Detector[] = [],
): Promise<ScanResult> {
  const resolvedRoot = resolve(root);
  const findings = (
    await Promise.all(
      detectors.map(async (detector) => {
        assertDetectorCompatible(detector);
        return (await detector.scan({ root: resolvedRoot })).map((finding) => ({
          ...finding,
          detector: detector.id,
        }));
      }),
    )
  ).flat();

  return {
    schemaVersion: "evergreen.scan.v1",
    root: resolvedRoot,
    scannedAt: new Date().toISOString(),
    findings: findings.sort((left, right) => left.id.localeCompare(right.id)),
    diagnostics:
      detectors.length === 0
        ? ["No detectors are enabled."]
        : [],
  };
}
