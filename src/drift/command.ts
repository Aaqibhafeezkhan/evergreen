import { readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

import { renderDiff } from "../agent-instructions.js";
import { analyzeDrift, driftCollectors } from "./index.js";
import type { RuntimeDrift, RuntimePin } from "./types.js";

const USAGE = "Usage: evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]";

interface DriftOptions {
  path: string;
  json: boolean;
  check: boolean;
  runtime?: string;
  align?: string;
}

function usage(message: string): number {
  process.stderr.write(`${message}\n${USAGE}\n`);
  return 2;
}

function parseOptions(args: readonly string[]): DriftOptions | undefined {
  const options: DriftOptions = { path: ".", json: false, check: false };
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") options.json = true;
    else if (argument === "--check") options.check = true;
    else if (argument === "--runtime" || argument === "--align") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      if (argument === "--runtime") options.runtime = value;
      else options.align = value;
      index += 1;
    } else if (argument.startsWith("-")) return undefined;
    else positional.push(argument);
  }
  if (positional.length > 1) return undefined;
  options.path = positional[0] ?? ".";
  if (options.align !== undefined && options.runtime === undefined) return undefined;
  return options;
}

function releaseText(pin: RuntimePin): string {
  return pin.release ?? `unresolved${pin.unresolved ? ` (${pin.unresolved})` : ""}`;
}

function renderRuntime(runtime: RuntimeDrift): string {
  const lines = [`${runtime.runtime}`];
  for (const pin of runtime.pins) {
    lines.push(`  ${pin.path}:${pin.line}  ${pin.source}  ${pin.raw}  -> ${releaseText(pin)}`);
  }
  if (runtime.drifted) lines.push(`  DRIFT ${runtime.releases.join(", ")}`);
  const lowest = runtime.releases[0];
  for (const pin of runtime.floorConflicts) {
    lines.push(`  floor conflict: ${pin.path}:${pin.line}  ${pin.source}  ${pin.raw}  -> ${releaseText(pin)}; the pinned release is ${lowest}`);
  }
  return lines.join("\n");
}

function withoutFinalNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

async function alignPins(root: string, runtime: string, release: string): Promise<number> {
  const collector = driftCollectors.find((candidate) => candidate.runtime === runtime);
  if (!collector?.align) return usage(`Runtime ${runtime} does not support --align.`);
  const report = await analyzeDrift(root, [collector]);
  const pins = report.runtimes[0]?.pins ?? [];
  const refused: RuntimePin[] = [];
  const texts = new Map<string, { before: string; lines: string[] }>();
  const changed = new Set<string>();

  for (const pin of pins) {
    if (pin.release === release) continue;
    let file = texts.get(pin.path);
    if (!file) {
      try {
        const before = await readFile(join(root, pin.path), "utf8");
        file = { before, lines: before.split("\n") };
      } catch {
        refused.push(pin);
        continue;
      }
      texts.set(pin.path, file);
    }
    const original = file.lines[pin.line - 1];
    if (original === undefined) {
      refused.push(pin);
      continue;
    }
    const replacement = collector.align(pin, original.replace(/\r$/, ""), release);
    if (replacement === undefined) {
      refused.push(pin);
      continue;
    }
    file.lines[pin.line - 1] = replacement + (original.endsWith("\r") ? "\r" : "");
    changed.add(pin.path);
  }

  for (const path of [...changed].sort()) {
    const file = texts.get(path)!;
    process.stdout.write(`${renderDiff(path, withoutFinalNewline(file.before), withoutFinalNewline(file.lines.join("\n")))}\n`);
  }
  for (const pin of refused) {
    process.stderr.write(`drift --align: refused ${pin.path}:${pin.line} ${pin.source} ${pin.raw}\n`);
  }
  return 0;
}

/** `evergreen drift`: reports, per runtime, whether the versions a repository states agree. Reads files only. */
export async function driftCommand(args: readonly string[]): Promise<number> {
  const options = parseOptions(args);
  if (!options) return usage("Invalid drift arguments.");
  if (options.runtime !== undefined && !driftCollectors.some((collector) => collector.runtime === options.runtime)) {
    return usage(`Unknown runtime: ${options.runtime}`);
  }

  if (options.align !== undefined) return alignPins(options.path, options.runtime!, options.align);

  const collectors = options.runtime === undefined
    ? driftCollectors
    : driftCollectors.filter((collector) => collector.runtime === options.runtime);
  const report = await analyzeDrift(options.path, collectors);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (report.runtimes.length === 0) {
    process.stdout.write("No runtime version pins found.\n");
  } else {
    process.stdout.write(`${report.runtimes.map(renderRuntime).join("\n\n")}\n`);
  }

  if (options.check && report.runtimes.some((runtime) => runtime.drifted || runtime.floorConflicts.length > 0)) return 1;
  return 0;
}
