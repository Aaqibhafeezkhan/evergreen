import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { renderDiff } from "../agent-instructions.js";
import { analyzeDrift, driftCollectors } from "./index.js";
import type { DriftCollector, RuntimeDrift } from "./types.js";

const usage = "Usage: evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]";

interface Options {
  root: string;
  json: boolean;
  check: boolean;
  runtime?: string;
  align?: string;
}

function parse(args: string[]): Options | string {
  let json = false;
  let check = false;
  let runtime: string | undefined;
  let align: string | undefined;
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
    } else if (argument === "--check") {
      check = true;
    } else if (argument === "--runtime" || argument === "--align") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) return usage;
      if (argument === "--runtime") runtime = value;
      else align = value;
      index += 1;
    } else if (argument.startsWith("-")) {
      return usage;
    } else {
      positional.push(argument);
    }
  }
  if (positional.length > 1) return usage;
  if (align !== undefined && runtime === undefined) return `${usage}\n--align needs --runtime <id>.`;
  return { root: resolve(positional[0] ?? "."), json, check, ...(runtime === undefined ? {} : { runtime }), ...(align === undefined ? {} : { align }) };
}

function renderText(runtimes: readonly RuntimeDrift[]): string {
  if (runtimes.length === 0) return "No runtime pins found.";
  const lines: string[] = [];
  for (const runtime of runtimes) {
    lines.push(runtime.runtime);
    for (const pin of runtime.pins) {
      const resolved = pin.release !== undefined ? pin.release : `unresolved: ${pin.unresolved ?? "no reason recorded"}`;
      lines.push(`  ${pin.path}:${pin.line}  ${pin.source}  ${pin.kind}  ${pin.raw} -> ${resolved}`);
    }
    if (runtime.drifted) lines.push(`  DRIFT: ${runtime.releases.join(", ")}`);
    for (const pin of runtime.floorConflicts) {
      lines.push(`  floor conflict: ${pin.path}:${pin.line}  ${pin.source}  ${pin.raw} -> ${pin.release}`);
    }
  }
  return lines.join("\n");
}

/** Prints the patches that make each alignable pin select `release`; refuses the rest on stderr. */
async function alignRuntime(collector: DriftCollector, root: string, release: string): Promise<void> {
  const report = await analyzeDrift(root, [collector]);
  const pins = report.runtimes[0]?.pins ?? [];
  const files = new Map<string, { before: string; after: string }>();
  const refuse = (path: string, line: number, source: string, raw: string): void => {
    process.stderr.write(`Cannot align ${source} at ${path}:${line} (${raw}) to ${release}.\n`);
  };
  for (const pin of pins) {
    // A pin that already selects the requested release needs no patch, and is not a refusal.
    if (pin.release === release) continue;
    if (!collector.align) {
      refuse(pin.path, pin.line, pin.source, pin.raw);
      continue;
    }
    let file = files.get(pin.path);
    if (!file) {
      const contents = await readFile(resolve(root, pin.path), "utf8").catch(() => undefined);
      if (contents === undefined) {
        refuse(pin.path, pin.line, pin.source, pin.raw);
        continue;
      }
      file = { before: contents, after: contents };
      files.set(pin.path, file);
    }
    const lines = file.after.split("\n");
    const lineText = lines[pin.line - 1];
    const replacement = lineText === undefined ? undefined : collector.align(pin, lineText, release);
    if (replacement === undefined || lineText === undefined) {
      refuse(pin.path, pin.line, pin.source, pin.raw);
      continue;
    }
    if (replacement === lineText) continue;
    lines[pin.line - 1] = replacement;
    file.after = lines.join("\n");
  }
  for (const [path, file] of files) {
    if (file.before !== file.after) {
      process.stdout.write(`${renderDiff(path, withoutFinalNewline(file.before), withoutFinalNewline(file.after))}\n`);
    }
  }
}

/** A final newline is not a line of its own; counting it would make the patch claim a context line that is not there. */
function withoutFinalNewline(text: string): string {
  return text.endsWith("\n") ? text.slice(0, -1) : text;
}

export async function driftCommand(args: string[]): Promise<number> {
  const options = parse(args);
  if (typeof options === "string") {
    process.stderr.write(`${options}\n`);
    return 2;
  }
  const collectors = options.runtime === undefined
    ? driftCollectors
    : driftCollectors.filter((collector) => collector.runtime === options.runtime);
  if (collectors.length === 0) {
    process.stderr.write(`Unknown runtime: ${options.runtime} (expected ${driftCollectors.map((collector) => collector.runtime).join(", ") || "none"}).\n`);
    return 2;
  }
  if (options.align !== undefined) {
    await alignRuntime(collectors[0]!, options.root, options.align);
    return 0;
  }
  const report = await analyzeDrift(options.root, collectors);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${renderText(report.runtimes)}\n`);
  }
  const failing = report.runtimes.some((runtime) => runtime.drifted || runtime.floorConflicts.length > 0);
  return options.check && failing ? 1 : 0;
}
