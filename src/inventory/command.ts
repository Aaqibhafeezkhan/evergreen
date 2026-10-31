import { createHash } from "node:crypto";
import { access } from "node:fs/promises";

import { ConfigError, loadConfig } from "../config.js";
import { severityValues, type Severity } from "../domain.js";
import { inventoryImporters, runInventory } from "./index.js";
import type { InventoryReport, InventoryResult } from "./types.js";

export const INVENTORY_USAGE = "Usage: evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]";

const EXIT_UNRECOGNIZED = 2;
const EXIT_POLICY = 1;

/** The first 12 hex characters of the resource's SHA-256, for `--redact`. */
export function redactResource(resource: string): string {
  return createHash("sha256").update(resource).digest("hex").slice(0, 12);
}

const severityRank = (severity: Severity): number => severityValues.indexOf(severity);

function shownResource(result: InventoryResult, redact: boolean): string {
  return redact ? redactResource(result.item.resource) : result.item.resource;
}

function ruleColumn(result: InventoryResult): string {
  return result.check.findings.map((finding) => finding.ruleId).join(", ") || "-";
}

function rows(results: readonly InventoryResult[], redact: boolean): string[] {
  const cells = results.map((result) => [
    shownResource(result, redact),
    result.item.version ?? "-",
    result.check.status,
    ruleColumn(result),
    result.item.pointer,
  ]);
  const widths = [0, 1, 2, 3].map((column) => Math.max(...cells.map((cell) => cell[column]!.length)));
  return cells.map((cell) => `  ${cell.map((value, column) => (column === cell.length - 1 ? value : value.padEnd(widths[column]!))).join("  ")}`.trimEnd());
}

function byFile(results: readonly InventoryResult[], redact: boolean): string[] {
  const lines: string[] = [];
  const files = [...new Set(results.map((result) => result.item.file))];
  for (const file of files) {
    lines.push(file);
    lines.push(...rows(results.filter((result) => result.item.file === file), redact));
  }
  return lines;
}

/** Text output: affected results first, grouped by file; the rest in their own sections; unrecognized files last. */
export function renderInventoryText(report: InventoryReport, options: { redact?: boolean } = {}): string {
  const redact = options.redact ?? false;
  const affected = report.results.filter((result) => result.check.status === "affected");
  const rest = report.results.filter((result) => result.check.status !== "affected" && result.check.status !== "no-data");
  const noData = report.results.filter((result) => result.check.status === "no-data");

  const lines: string[] = [];
  lines.push(affected.length === 0 ? "No affected resources." : "Affected", ...(affected.length === 0 ? [] : byFile(affected, redact)));
  if (rest.length > 0) lines.push("", "Not affected", ...byFile(rest, redact));
  if (noData.length > 0) lines.push("", "No data (not judged)", ...byFile(noData, redact));
  if (report.unrecognized.length > 0) lines.push("", "Unrecognized files", ...report.unrecognized.map((file) => `  ${file}`));
  return lines.join("\n");
}

/** The configured gate, so `inventory` honors `.evergreen.json` like every other command. */
async function configuredGate(): Promise<Severity | "none" | undefined> {
  return (await loadConfig(process.cwd()))?.failOn;
}

/** `evergreen inventory`: reads the export files given and reports the resources the lifecycle rules cover. */
export async function inventoryCommand(args: readonly string[]): Promise<number> {
  const files: string[] = [];
  let format: string | undefined;
  let gate: string | undefined;
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
      if (value === undefined || value.startsWith("-")) {
        process.stderr.write(`${argument} needs a value.\n${INVENTORY_USAGE}\n`);
        return EXIT_UNRECOGNIZED;
      }
      if (argument === "--format") format = value;
      else gate = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      process.stderr.write(`Unknown option: ${argument}\n${INVENTORY_USAGE}\n`);
      return EXIT_UNRECOGNIZED;
    }
    files.push(argument);
  }

  if (files.length === 0) {
    process.stderr.write(`Give at least one export file.\n${INVENTORY_USAGE}\n`);
    return EXIT_UNRECOGNIZED;
  }
  if (format !== undefined && format !== "auto" && !inventoryImporters.some((importer) => importer.id === format)) {
    process.stderr.write(`Unknown importer for --format: ${format} (expected auto or ${inventoryImporters.map((importer) => importer.id).join(", ") || "no importer is built in"}).\n`);
    return EXIT_UNRECOGNIZED;
  }
  if (gate !== undefined && gate !== "none" && !severityValues.includes(gate as Severity)) {
    process.stderr.write(`Unknown severity for --fail-on: ${gate} (expected none, ${severityValues.join(", ")}).\n`);
    return EXIT_UNRECOGNIZED;
  }

  let effectiveGate: Severity | "none";
  try {
    effectiveGate = (gate as Severity | "none" | undefined) ?? (await configuredGate()) ?? "high";
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      return EXIT_UNRECOGNIZED;
    }
    throw error;
  }

  const readable: string[] = [];
  const unreadable: string[] = [];
  for (const file of files) {
    try {
      await access(file);
      readable.push(file);
    } catch {
      unreadable.push(file);
    }
  }

  const report = await runInventory(readable, inventoryImporters, format === undefined || format === "auto" ? undefined : format);
  if (unreadable.length > 0) report.unrecognized.push(...unreadable);

  process.stdout.write(`${json ? JSON.stringify(redact ? redactReport(report) : report, null, 2) : renderInventoryText(report, { redact })}\n`);

  if (report.unrecognized.length > 0) return EXIT_UNRECOGNIZED;
  if (effectiveGate === "none") return 0;
  const blocking = report.results.some(
    (result) => result.check.status === "affected" && result.check.severity !== undefined && severityRank(result.check.severity) >= severityRank(effectiveGate as Severity),
  );
  return blocking ? EXIT_POLICY : 0;
}

/** The report with every resource replaced by its redacted form. */
function redactReport(report: InventoryReport): InventoryReport {
  return {
    ...report,
    results: report.results.map((result) => ({ ...result, item: { ...result.item, resource: redactResource(result.item.resource) } })),
  };
}
