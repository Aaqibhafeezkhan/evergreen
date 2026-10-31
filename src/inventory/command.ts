import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import process from "node:process";

import { ConfigError, loadConfig } from "../config.js";
import type { Severity } from "../domain.js";
import { severityValues } from "../domain.js";
import { inventoryImporters, runInventory } from "./index.js";
import type { InventoryReport, InventoryResult } from "./types.js";

const USAGE = "Usage: evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]";

/** The first 12 hex characters of a resource name's SHA-256, used by `--redact`. */
export function redactResource(resource: string): string {
  return createHash("sha256").update(resource).digest("hex").slice(0, 12);
}

/** Replaces every `resource` in a report with its redacted form. */
export function redactInventoryReport(report: InventoryReport): InventoryReport {
  return {
    ...report,
    results: report.results.map((result) => ({ ...result, item: { ...result.item, resource: redactResource(result.item.resource) } })),
  };
}

function padTable(rows: readonly (readonly string[])[]): string[] {
  const widths = rows.reduce<number[]>((sizes, row) => {
    row.forEach((cell, index) => {
      sizes[index] = Math.max(sizes[index] ?? 0, cell.length);
    });
    return sizes;
  }, []);
  return rows.map((row) => row.map((cell, index) => (index === row.length - 1 ? cell : cell.padEnd(widths[index] ?? 0))).join("  "));
}

function resultRows(results: readonly InventoryResult[]): string[][] {
  return results.map((result) => {
    const finding = result.check.findings[0];
    return [result.item.resource, result.item.version ?? "-", result.check.status, finding?.ruleId ?? "-", result.item.pointer];
  });
}

/** The text rendering: findings grouped by file, then items without a rule, then files no importer recognized. */
export function renderInventoryText(report: InventoryReport): string {
  const byFile = new Map<string, InventoryResult[]>();
  for (const result of report.results) {
    const entries = byFile.get(result.item.file);
    if (entries) entries.push(result);
    else byFile.set(result.item.file, [result]);
  }
  const files = [...byFile.keys()].sort();
  const lines = ["Evergreen inventory", `${report.results.length} item${report.results.length === 1 ? "" : "s"} in ${files.length} file${files.length === 1 ? "" : "s"}`];

  const findings: string[] = [];
  for (const file of files) {
    const entries = (byFile.get(file) ?? []).filter((result) => result.check.status !== "no-data");
    if (entries.length === 0) continue;
    const affected = entries.filter((result) => result.check.status === "affected");
    const rest = entries.filter((result) => result.check.status !== "affected");
    findings.push("", file, ...padTable([["RESOURCE", "VERSION", "STATUS", "RULE", "POINTER"], ...resultRows([...affected, ...rest])]));
  }
  lines.push("", ...(findings.length > 0 ? findings : ["No affected or checked items."]));

  const noData: string[] = [];
  for (const file of files) {
    const entries = (byFile.get(file) ?? []).filter((result) => result.check.status === "no-data");
    if (entries.length === 0) continue;
    noData.push("", file, ...padTable([["RESOURCE", "VERSION", "POINTER"], ...entries.map((result) => [result.item.resource, result.item.version ?? "-", result.item.pointer])]));
  }
  if (noData.length > 0) {
    lines.push("", "No data (Evergreen has no rule for these; that does not mean they are safe)", ...noData);
  }

  if (report.unrecognized.length > 0) {
    lines.push("", "Unrecognized or unreadable files", ...report.unrecognized.map((file) => `  ${file}`));
  }
  return lines.join("\n");
}

function usage(): number {
  process.stderr.write(`${USAGE}\n`);
  return 2;
}

/**
 * `inventory`: checks the objects named in exported cloud and cluster state against lifecycle rules.
 * Reads only the files given: no network, no cloud API, no commands.
 */
export async function inventoryCommand(args: string[]): Promise<number> {
  const files: string[] = [];
  let json = false;
  let redact = false;
  let only: string | undefined;
  let gateFlag: string | undefined;

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
      if (value === undefined || value.startsWith("-")) return usage();
      if (argument === "--format") {
        if (value !== "auto" && !inventoryImporters.some((importer) => importer.id === value)) {
          process.stderr.write(`Unknown importer: ${value} (expected auto or ${inventoryImporters.map((importer) => importer.id).join(", ")}).\n`);
          return 2;
        }
        only = value === "auto" ? undefined : value;
      } else {
        gateFlag = value;
      }
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return usage();
    files.push(argument);
  }
  if (files.length === 0) return usage();

  let config: Awaited<ReturnType<typeof loadConfig>>;
  try {
    config = await loadConfig(process.cwd());
  } catch (error) {
    if (error instanceof ConfigError) {
      process.stderr.write(`${error.message}\n`);
      return 2;
    }
    throw error;
  }
  const gate = gateFlag ?? config?.failOn ?? "high";
  if (gate !== "none" && !severityValues.includes(gate as Severity)) {
    process.stderr.write(`Unknown severity for --fail-on: ${gate} (expected none, ${severityValues.join(", ")}).\n`);
    return 2;
  }

  const readable: string[] = [];
  const unreadable: string[] = [];
  for (const file of files) {
    try {
      await readFile(file);
      readable.push(file);
    } catch {
      unreadable.push(file);
    }
  }

  let report: InventoryReport;
  try {
    report = await runInventory(readable, inventoryImporters, only);
  } catch (error) {
    process.stderr.write(`Cannot read the exported state: ${error instanceof Error ? error.message : String(error)}\n`);
    return 4;
  }
  report = { ...report, unrecognized: [...report.unrecognized, ...unreadable] };
  const output = redact ? redactInventoryReport(report) : report;

  process.stdout.write(`${json ? JSON.stringify(output, null, 2) : renderInventoryText(output)}\n`);

  if (output.unrecognized.length > 0) return 2;
  if (gate === "none") return 0;
  const gateRank = severityValues.indexOf(gate as Severity);
  const reached = output.results.some(
    (result) => result.check.status === "affected" && result.check.severity !== undefined && severityValues.indexOf(result.check.severity) >= gateRank,
  );
  return reached ? 1 : 0;
}
