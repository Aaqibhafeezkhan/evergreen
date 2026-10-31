import { javaCollector } from "./java.js";
import type { DriftCollector, DriftReport, RuntimeDrift, RuntimePin } from "./types.js";

export type { DriftCollector, DriftReport, RuntimeDrift, RuntimePin } from "./types.js";

/** Every built-in collector, one per runtime. Each task in the drift epic appends its own entry. */
export const driftCollectors: DriftCollector[] = [javaCollector];

/** Compares dotted numeric releases such as `3.9` and `3.11`; non-numeric parts compare as text. */
export function compareReleases(a: string, b: string): number {
  const left = a.split(".");
  const right = b.split(".");
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const l = left[index] ?? "0";
    const r = right[index] ?? "0";
    const ln = Number(l);
    const rn = Number(r);
    const order = Number.isInteger(ln) && Number.isInteger(rn) ? ln - rn : l.localeCompare(r);
    if (order !== 0) return order;
  }
  return 0;
}

function byLocation(a: RuntimePin, b: RuntimePin): number {
  return a.path.localeCompare(b.path) || a.line - b.line || a.source.localeCompare(b.source);
}

/** Runs every collector over a repository and reports, per runtime, whether its pins agree. Deterministic. */
export async function analyzeDrift(root: string, collectors: readonly DriftCollector[] = driftCollectors): Promise<DriftReport> {
  const runtimes: RuntimeDrift[] = [];
  for (const collector of collectors) {
    const pins = [...(await collector.collect(root))].sort(byLocation);
    if (pins.length === 0) continue;
    const pinned = pins.filter((pin) => pin.kind === "pin" && pin.release !== undefined);
    const releases = [...new Set(pinned.map((pin) => pin.release as string))].sort(compareReleases);
    const lowest = releases[0];
    const floorConflicts = lowest === undefined
      ? []
      : pins.filter((pin) => pin.kind === "floor" && pin.release !== undefined && compareReleases(pin.release, lowest) > 0);
    runtimes.push({ runtime: collector.runtime, pins, releases, drifted: releases.length > 1, floorConflicts });
  }
  runtimes.sort((a, b) => a.runtime.localeCompare(b.runtime));
  return { schemaVersion: "evergreen.drift.v1", runtimes };
}
