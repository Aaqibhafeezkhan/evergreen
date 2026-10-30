import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

import { ConfigError, loadConfig } from "../config.js";
import { severityValues } from "../domain.js";
import type { Severity } from "../domain.js";
import { inventoryImporters, runInventory } from "./index.js";
import type { InventoryImporter, InventoryItem, InventoryReport } from "./types.js";

export const INVENTORY_USAGE = "Usage: evergreen inventory <file>... [--format auto|<importer-id>] [--json] [--fail-on <severity|none>] [--redact]";

/** The first 12 hex characters of the resource's SHA-256, so a report can be shared without host names. */
export function redactResource(resource: string): string {
  return createHash("sha256").update(resource, "utf8").digest("hex").slice(0, 12);
}

export interface InventoryCommandOptions {
  /** The importers to use; defaults to every built-in importer. */
  importers?: readonly InventoryImporter[];
  /** The config's failOn, used when `--fail-on` is absent. */
  failOn?: Severity | "none";
  write?: (text: string) => void;
  writeError?: (text: string) => void;
}

interface Row {
  item: InventoryItem;
  check: InventoryReport["results"][number]["check"];
}

function renderRows(rows: readonly Row[]): string[] {
  const lines: string[] = [];
  const byFile = new Map<string, Row[]>();
  for (const row of rows) {
    const fileRows = byFile.get(row.item.file) ?? [];
    fileRows.push(row);
    byFile.set(row.item.file, fileRows);
  }
  for (const [file, fileRows] of [...byFile].sort(([left], [right]) => left.localeCompare(right))) {
    lines.push(file, "  resource  version  status  rule  pointer");
    for (const { item, check } of fileRows) {
      const rules = check.findings.map((finding) => finding.ruleId).join(", ") || "-";
      lines.push(`  ${item.resource}  ${item.version ?? "-"}  ${check.status}  ${rules}  ${item.pointer}`);
    }
  }
  return lines;
}

/** The human-readable report: affected items first, then what is not affected, then no-data, then unrecognized files. */
export function renderInventoryText(report: InventoryReport, options: { color?: boolean } = {}): string {
  const affected = report.results.filter((result) => result.check.status === "affected");
  const notAffected = report.results.filter((result) => result.check.status === "not-affected" || result.check.status === "version-dependent");
  const noData = report.results.filter((result) => result.check.status === "no-data");
  const dim = options.color === true ? "\u001b[2m" : "";
  const reset = options.color === true ? "\u001b[0m" : "";

  const lines: string[] = ["Evergreen inventory"];
  if (report.results.length === 0 && report.unrecognized.length === 0) lines.push("", "No items found.");
  if (affected.length > 0) lines.push("", `Affected (${affected.length})`, ...renderRows(affected));
  if (notAffected.length > 0) lines.push("", `Not affected (${notAffected.length})`, ...renderRows(notAffected));
  if (noData.length > 0) lines.push("", `${dim}No lifecycle rule (${noData.length}); no-data is not a statement that it is safe${reset}`, ...renderRows(noData));
  if (report.unrecognized.length > 0) lines.push("", "Unrecognized or unreadable files:", ...report.unrecognized.map((file) => `  ${file}`));
  return lines.join("\n");
}

/** `evergreen inventory`: reads the given exports only and checks every item they name. Offline and deterministic. */
export async function inventoryCommand(args: string[], options: InventoryCommandOptions = {}): Promise<number> {
  const write = options.write ?? ((text: string) => process.stdout.write(text));
  const writeError = options.writeError ?? ((text: string) => process.stderr.write(text));
  const importers = options.importers ?? inventoryImporters;

  const files: string[] = [];
  let format = "auto";
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
        writeError(`${argument} needs a value.\n${INVENTORY_USAGE}\n`);
        return 2;
      }
      if (argument === "--format") format = value;
      else gate = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      writeError(`Unknown option for inventory: ${argument}\n${INVENTORY_USAGE}\n`);
      return 2;
    }
    files.push(argument);
  }

  if (files.length === 0) {
    writeError(`Missing export file.\n${INVENTORY_USAGE}\n`);
    return 2;
  }

  const only = format === "auto" ? undefined : format;
  if (only !== undefined && !importers.some((candidate) => candidate.id === only)) {
    const known = ["auto", ...importers.map((candidate) => candidate.id)].join(", ");
    writeError(`Unknown importer for --format: ${format} (expected ${known}).\n`);
    return 2;
  }

  let configGate = options.failOn;
  if (gate === undefined && configGate === undefined) {
    try {
      configGate = (await loadConfig())?.failOn;
    } catch (error) {
      if (error instanceof ConfigError) {
        writeError(`${error.message}\n`);
        return 2;
      }
      throw error;
    }
  }
  const threshold = gate ?? configGate ?? "high";
  if (threshold !== "none" && !severityValues.includes(threshold as Severity)) {
    writeError(`Unknown severity for --fail-on: ${threshold} (expected none, ${severityValues.join(", ")}).\n`);
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

  const report = await runInventory(readable, importers, only);
  const unrecognizedSet = new Set([...report.unrecognized, ...unreadable]);
  const ordered: InventoryReport = {
    ...report,
    results: [...report.results].sort((left, right) => left.item.file.localeCompare(right.item.file) || left.item.pointer.localeCompare(right.item.pointer)),
    unrecognized: files.filter((file) => unrecognizedSet.has(file)),
  };
  const output: InventoryReport = redact
    ? { ...ordered, results: ordered.results.map((result) => ({ ...result, item: { ...result.item, resource: redactResource(result.item.resource) } })) }
    : ordered;

  if (json) write(`${JSON.stringify(output, null, 2)}\n`);
  else write(`${renderInventoryText(output, { color: process.stdout.isTTY === true && !process.env.NO_COLOR })}\n`);

  if (output.unrecognized.length > 0) return 2;
  const rank = (severity: Severity): number => severityValues.indexOf(severity);
  const blocking = threshold === "none"
    ? []
    : output.results.filter((result) => result.check.status === "affected" && result.check.severity !== undefined && rank(result.check.severity) >= rank(threshold as Severity));
  return blocking.length > 0 ? 1 : 0;
}
