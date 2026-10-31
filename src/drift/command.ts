import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import { analyzeDrift, driftCollectors } from "./index.js";
import type { DriftCollector, DriftReport, RuntimePin } from "./types.js";

const USAGE = "Usage: evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]";

interface Options {
  path: string;
  json: boolean;
  check: boolean;
  runtime?: string;
  align?: string;
}

function parseOptions(args: string[]): Options | undefined {
  let path: string | undefined;
  let json = false;
  let check = false;
  let runtime: string | undefined;
  let align: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--check") {
      check = true;
      continue;
    }
    if (argument === "--runtime" || argument === "--align") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) return undefined;
      if (argument === "--runtime") runtime = value;
      else align = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return undefined;
    if (path !== undefined) return undefined;
    path = argument;
  }

  if (align !== undefined && (runtime === undefined || json || check)) return undefined;
  if (align !== undefined && !/^\d+\.\d+$/.test(align)) return undefined;
  return { path: path ?? ".", json, check, ...(runtime === undefined ? {} : { runtime }), ...(align === undefined ? {} : { align }) };
}

function refusal(pin: RuntimePin): string {
  return pin.source === "Gemfile.lock RUBY VERSION" ? "regenerate the lockfile" : "no automatic replacement";
}

async function renderAlignment(report: DriftReport, collectors: readonly DriftCollector[], root: string, release: string): Promise<number> {
  const byRuntime = new Map(collectors.map((collector) => [collector.runtime, collector]));
  const files = new Map<string, string | undefined>();
  const rootPath = resolve(root);

  for (const runtime of report.runtimes) {
    const collector = byRuntime.get(runtime.runtime);
    if (!collector?.align) {
      for (const pin of runtime.pins) process.stderr.write(`refused ${pin.path}:${pin.line} (${pin.source}): ${refusal(pin)}\n`);
      continue;
    }
    for (const pin of runtime.pins) {
      if (!files.has(pin.path)) {
        try {
          files.set(pin.path, await readFile(resolve(rootPath, pin.path), "utf8"));
        } catch {
          files.set(pin.path, undefined);
        }
      }
      const contents = files.get(pin.path);
      const eol = contents?.includes("\r\n") ? "\r\n" : "\n";
      const lines = contents === undefined ? [] : contents.split(/\r?\n/);
      const lineText = lines[pin.line - 1];
      if (contents === undefined || lineText === undefined) {
        process.stderr.write(`refused ${pin.path}:${pin.line} (${pin.source}): the line could not be read\n`);
        continue;
      }
      if (pin.kind === "floor") {
        process.stderr.write(`refused ${pin.path}:${pin.line} (${pin.source}): floors and ranges are not rewritten\n`);
        continue;
      }
      const replacement = collector.align(pin, lineText, release);
      if (replacement === undefined) {
        process.stderr.write(`refused ${pin.path}:${pin.line} (${pin.source}): ${refusal(pin)}\n`);
        continue;
      }
      lines[pin.line - 1] = replacement;
      process.stdout.write(`${renderDiff(pin.path, contents, lines.join(eol))}\n`);
    }
  }
  return 0;
}

/** `evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]` */
export async function driftCommand(args: string[]): Promise<number> {
  const options = parseOptions(args);
  if (!options) {
    process.stderr.write(`${USAGE}\n`);
    return 2;
  }

  const available = driftCollectors.map((collector) => collector.runtime);
  if (options.runtime !== undefined && !available.includes(options.runtime)) {
    process.stderr.write(`Unknown runtime: ${options.runtime} (expected one of ${available.length === 0 ? "none" : available.join(", ")}).\n${USAGE}\n`);
    return 2;
  }

  const root = resolve(options.path);
  try {
    if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
  } catch {
    process.stderr.write(`Cannot read ${options.path}: not a directory.\n`);
    return 2;
  }

  const collectors = options.runtime === undefined ? driftCollectors : driftCollectors.filter((collector) => collector.runtime === options.runtime);
  const report = await analyzeDrift(root, collectors);

  if (options.align !== undefined) return renderAlignment(report, collectors, root, options.align);

  if (options.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else process.stdout.write(`${renderDriftText(report)}\n`);

  if (options.check && report.runtimes.some((runtime) => runtime.drifted || runtime.floorConflicts.length > 0)) return 1;
  return 0;
}

/** The human-readable report: one block per runtime, every pin, then any drift and floor conflicts. */
export function renderDriftText(report: DriftReport): string {
  if (report.runtimes.length === 0) return "No runtime pins found.";
  return report.runtimes
    .map((runtime) => {
      const lines = [runtime.runtime];
      for (const pin of runtime.pins) {
        const kind = pin.kind === "floor" ? " (floor)" : "";
        const status = pin.release === undefined ? `unresolved: ${pin.unresolved ?? "cannot resolve"}` : `release ${pin.release}`;
        lines.push(`  ${pin.path}:${pin.line}  ${pin.source}  ${pin.raw}${kind}  ${status}`);
      }
      if (runtime.drifted) lines.push(`  DRIFT: pins select ${runtime.releases.join(", ")}`);
      for (const pin of runtime.floorConflicts) {
        lines.push(`  FLOOR CONFLICT: ${pin.path}:${pin.line} requires ${pin.release}, above the lowest pinned release ${runtime.releases[0] ?? "none"}`);
      }
      return lines.join("\n");
    })
    .join("\n\n");
}
