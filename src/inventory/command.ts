import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

import { ConfigError, loadConfig } from "../config.js";
import { severityValues } from "../domain.js";
import type { Severity } from "../domain.js";
import { inventoryImporters, runInventory } from "./index.js";
import type { InventoryReport, InventoryResult } from "./types.js";

const USAGE = "Usage: evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]";

/** Replaces a resource name with the first 12 hex characters of its SHA-256. */
export function redactResource(resource: string): string {
  return createHash("sha256").update(resource).digest("hex").slice(0, 12);
}

interface InventoryOptions {
  files: string[];
  format: string;
  failOn?: Severity | "none";
  json: boolean;
  redact: boolean;
}

function parseArgs(args: readonly string[]): InventoryOptions | string {
  const files: string[] = [];
  let format = "auto";
  let failOn: Severity | "none" | undefined;
  let json = false;
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
      if (value === undefined || value.startsWith("-")) return `--${argument.slice(2)} needs a value.`;
      if (argument === "--format") format = value;
      else if (value !== "none" && !severityValues.includes(value as Severity)) {
        return `Unknown severity for --fail-on: ${value} (expected none, ${severityValues.join(", ")}).`;
      } else failOn = value as Severity | "none";
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return `Unknown option: ${argument}.`;
    files.push(argument);
  }

  if (files.length === 0) return "Missing export file.";
  if (format !== "auto" && !inventoryImporters.some((importer) => importer.id === format)) {
    const known = inventoryImporters.map((importer) => importer.id).join(", ");
    return `Unknown importer for --format: ${format} (expected auto${known.length > 0 ? `, ${known}` : ""}).`;
  }
  return { files, format, ...(failOn === undefined ? {} : { failOn }), json, redact };
}

function fail(message: string): number {
  process.stderr.write(`${message}\n${USAGE}\n`);
  return 2;
}

function severityRank(severity: Severity | undefined): number {
  return severity === undefined ? -1 : severityValues.indexOf(severity);
}

const statusRank = new Map<string, number>([
  ["affected", 0],
  ["version-dependent", 1],
  ["not-affected", 2],
  ["no-data", 3],
]);

function columns(result: InventoryResult): string {
  const rule = result.check.findings[0]?.ruleId ?? "-";
  return `${result.item.resource}  ${result.item.version ?? "-"}  ${result.check.status}  ${rule}  ${result.item.pointer}`;
}

/** Text output: results that can be judged, grouped by file, then `no-data` items dimmed, then unrecognized files. */
export function renderInventoryText(report: InventoryReport, options: { color?: boolean } = {}): string {
  const color = options.color ?? (Boolean(process.stdout.isTTY) && !process.env.NO_COLOR);
  const dim = (text: string) => (color ? `\x1b[2m${text}\x1b[0m` : text);

  const byFile = new Map<string, InventoryResult[]>();
  for (const result of report.results) {
    const list = byFile.get(result.item.file) ?? [];
    list.push(result);
    byFile.set(result.item.file, list);
  }

  const lines: string[] = [];
  for (const [file, results] of byFile) {
    const judged = results
      .filter((result) => result.check.status !== "no-data")
      .sort((left, right) => (statusRank.get(left.check.status) ?? 0) - (statusRank.get(right.check.status) ?? 0));
    if (judged.length === 0) continue;
    lines.push(file);
    for (const result of judged) lines.push(`  ${columns(result)}`);
  }

  const noData = report.results.filter((result) => result.check.status === "no-data");
  if (noData.length > 0) {
    lines.push("", "no-data (no lifecycle rule matched):");
    for (const result of noData) {
      lines.push(dim(`  ${result.item.file}  ${result.item.resource}  ${result.item.version ?? "-"}  ${result.item.pointer}`));
    }
  }

  if (report.unrecognized.length > 0) {
    lines.push("", "Unrecognized files:");
    for (const file of report.unrecognized) lines.push(`  ${file}`);
  }
  return lines.join("\n");
}

/**
 * `evergreen inventory`: reads the given exports, reports lifecycle risks, and never uses the network.
 * Exit 2 when a file is unrecognized or unreadable; exit 1 when an affected item reaches `--fail-on`; else 0.
 */
export async function inventoryCommand(args: readonly string[]): Promise<number> {
  const parsed = parseArgs(args);
  if (typeof parsed === "string") return fail(parsed);

  let gate: Severity | "none" = parsed.failOn ?? "high";
  if (parsed.failOn === undefined) {
    try {
      gate = (await loadConfig())?.failOn ?? "high";
    } catch (error) {
      if (error instanceof ConfigError) return fail(error.message);
      throw error;
    }
  }

  const readable: string[] = [];
  const unreadable: string[] = [];
  for (const file of parsed.files) {
    try {
      await readFile(file);
      readable.push(file);
    } catch {
      unreadable.push(file);
    }
  }

  const report = await runInventory(readable, inventoryImporters, parsed.format === "auto" ? undefined : parsed.format);
  report.unrecognized.push(...unreadable);
  report.unrecognized.sort((left, right) => left.localeCompare(right));

  if (parsed.redact) {
    for (const result of report.results) result.item.resource = redactResource(result.item.resource);
  }

  process.stdout.write(`${parsed.json ? JSON.stringify(report, null, 2) : renderInventoryText(report)}\n`);

  if (report.unrecognized.length > 0) return 2;
  if (gate === "none") return 0;
  const blocked = report.results.some(
    (result) => result.check.status === "affected" && severityRank(result.check.severity) >= severityRank(gate as Severity),
  );
  return blocked ? 1 : 0;
}
