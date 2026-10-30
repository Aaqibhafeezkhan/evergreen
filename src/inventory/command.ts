import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";

import { ConfigError, loadConfig } from "../config.js";
import { severityValues, type Severity } from "../domain.js";
import { inventoryImporters, runInventory } from "./index.js";
import type { InventoryReport, InventoryResult } from "./types.js";

const USAGE =
  "Usage: evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]";

const severityRank = new Map(severityValues.map((severity, index) => [severity, index]));

/** The redacted form of a resource name: the first 12 hex characters of its SHA-256. */
export function redactResource(resource: string): string {
  return createHash("sha256").update(resource).digest("hex").slice(0, 12);
}

interface InventoryOptions {
  files: string[];
  importer?: string;
  json: boolean;
  failOn?: Severity | "none";
  redact: boolean;
}

function parseOptions(args: string[]): InventoryOptions | string {
  const files: string[] = [];
  let importer: string | undefined;
  let json = false;
  let failOn: Severity | "none" | undefined;
  let redact = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--redact") {
      redact = true;
      continue;
    }
    if (argument === "--format" || argument === "--fail-on") {
      const value = args[index + 1];
      if (value === undefined) return USAGE;
      index += 1;
      if (argument === "--format") {
        importer = value === "auto" ? undefined : value;
        continue;
      }
      if (value !== "none" && !severityValues.includes(value as Severity)) {
        return `Unknown severity for --fail-on: ${value} (expected none, ${severityValues.join(", ")}).`;
      }
      failOn = value as Severity | "none";
      continue;
    }
    if (argument.startsWith("-")) return USAGE;
    files.push(argument);
  }
  if (files.length === 0) return USAGE;
  return { files, ...(importer === undefined ? {} : { importer }), json, ...(failOn === undefined ? {} : { failOn }), redact };
}

/** Replaces every resource name with its redacted form, in place of the report the caller prints. */
export function redactReport(report: InventoryReport): InventoryReport {
  return {
    ...report,
    results: report.results.map((result) => ({ ...result, item: { ...result.item, resource: redactResource(result.item.resource) } })),
  };
}

const DIM = "\u001b[2m";
const RESET = "\u001b[0m";

function dim(text: string): string {
  return process.stdout.isTTY && !process.env.NO_COLOR ? `${DIM}${text}${RESET}` : text;
}

function resultLine(result: InventoryResult): string {
  const { item, check } = result;
  const rule = check.findings.length === 0 ? "-" : check.findings.map((finding) => finding.ruleId).join(",");
  return `${item.resource}  ${item.version ?? "-"}  ${check.status}  ${rule}  ${item.pointer}`;
}

function groupedLines(results: InventoryResult[]): string[] {
  const lines: string[] = [];
  let file: string | undefined;
  for (const result of results) {
    if (result.item.file !== file) {
      if (file !== undefined) lines.push("");
      file = result.item.file;
      lines.push(file);
    }
    lines.push(`  ${resultLine(result)}`);
  }
  return lines;
}

/** Renders a report: affected results first, `no-data` last, and the files that were skipped at the end. */
export function renderInventoryText(report: InventoryReport, unreadable: readonly string[] = []): string {
  const affected = report.results.filter((result) => result.check.status === "affected");
  const other = report.results.filter((result) => result.check.status !== "affected" && result.check.status !== "no-data");
  const noData = report.results.filter((result) => result.check.status === "no-data");
  const lines: string[] = [];
  if (affected.length > 0) lines.push(...groupedLines(affected));
  if (other.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(...groupedLines(other));
  }
  if (noData.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(dim("No lifecycle data (that is not a statement that the resource is safe):"));
    for (const line of groupedLines(noData)) lines.push(dim(line));
  }
  if (unreadable.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Unreadable: ${unreadable.join(", ")}`);
  }
  if (report.unrecognized.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(`Unrecognized: ${report.unrecognized.join(", ")}`);
  }
  if (lines.length === 0) lines.push("No resources found in the given files.");
  return lines.join("\n");
}

async function splitReadable(files: readonly string[]): Promise<{ readable: string[]; unreadable: string[] }> {
  const readable: string[] = [];
  const unreadable: string[] = [];
  for (const file of files) {
    try {
      if ((await stat(file)).isFile()) readable.push(file);
      else unreadable.push(file);
    } catch {
      unreadable.push(file);
    }
  }
  return { readable, unreadable };
}

function reachesGate(results: readonly InventoryResult[], gate: Severity | "none"): boolean {
  if (gate === "none") return false;
  const threshold = severityRank.get(gate) ?? 0;
  return results.some(
    (result) =>
      result.check.status === "affected" &&
      result.check.severity !== undefined &&
      (severityRank.get(result.check.severity) ?? 0) >= threshold,
  );
}

/** `inventory`: reads export files the user already produced and judges the resources they name. */
export async function runInventoryCommand(args: string[]): Promise<number> {
  const options = parseOptions(args);
  if (typeof options === "string") {
    process.stderr.write(`${options}\n`);
    return 2;
  }
  if (options.importer !== undefined && !inventoryImporters.some((importer) => importer.id === options.importer)) {
    const known = ["auto", ...inventoryImporters.map((importer) => importer.id)].join(", ");
    process.stderr.write(`Unknown importer "${options.importer}" (expected ${known}).\n`);
    return 2;
  }
  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
  const gate = options.failOn ?? config?.failOn ?? "high";
  const { readable, unreadable } = await splitReadable(options.files);
  const report = await runInventory(readable, inventoryImporters, options.importer);
  const shown = options.redact ? redactReport(report) : report;
  if (options.json) {
    process.stdout.write(`${JSON.stringify(shown, null, 2)}\n`);
    if (unreadable.length > 0) process.stderr.write(`Unreadable: ${unreadable.join(", ")}\n`);
  } else {
    process.stdout.write(`${renderInventoryText(shown, unreadable)}\n`);
  }
  if (unreadable.length > 0 || report.unrecognized.length > 0) return 2;
  return reachesGate(report.results, gate) ? 1 : 0;
}
