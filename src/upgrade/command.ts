import { stat } from "node:fs/promises";
import process from "node:process";

import { checkUpgrade, parseUpgradeTarget } from "./index.js";
import type { UpgradeReport } from "./types.js";

export const UPGRADE_USAGE = "Usage: evergreen upgrade-check --to <runtime@version> [path] [--json]";

/** Printed whenever no analyzer could read evidence for the target. */
export const UNKNOWN_VERDICT_SENTENCE =
  "Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.";

/** One issue per line: `path:line  subject  reason  [evidence]`. */
export function renderUpgradeText(report: UpgradeReport): string {
  const { runtime, version } = report.target;
  const lines: string[] = [];
  if (report.verdict === "blocked") {
    const blockers = report.issues.filter((issue) => issue.level === "blocker").length;
    lines.push(`Blocked for ${runtime} ${version}: ${blockers} blocker${blockers === 1 ? "" : "s"}.`);
  } else if (report.verdict === "unknown") {
    lines.push(`Unknown for ${runtime} ${version}.`);
    lines.push(UNKNOWN_VERDICT_SENTENCE);
  } else {
    lines.push(`Ready for ${runtime} ${version}.`);
  }
  if (report.issues.length > 0) lines.push("");
  for (const issue of report.issues) {
    const location = issue.line === undefined ? issue.path : `${issue.path}:${issue.line}`;
    lines.push(`${location}  ${issue.subject}  ${issue.reason}  [${issue.evidence.value}]`);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * `evergreen upgrade-check --to <runtime@version> [path] [--json]`: reads lockfiles and manifests only, so it works
 * offline. Exit code 1 means blocked, 0 means ready or unknown, and 2 means the input was wrong.
 */
export async function upgradeCommand(args: string[]): Promise<number> {
  let targetText: string | undefined;
  let json = false;
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--to") {
      const value = args[index + 1];
      if (value === undefined || value.startsWith("-")) {
        process.stderr.write(`${UPGRADE_USAGE}\n`);
        return 2;
      }
      targetText = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      process.stderr.write(`Unknown option: ${argument}\n${UPGRADE_USAGE}\n`);
      return 2;
    }
    positional.push(argument);
  }
  if (targetText === undefined || positional.length > 1) {
    process.stderr.write(`${UPGRADE_USAGE}\n`);
    return 2;
  }
  const target = parseUpgradeTarget(targetText);
  if (target === undefined) {
    process.stderr.write(`--to must name a runtime and a release, for example nodejs@22.\n${UPGRADE_USAGE}\n`);
    return 2;
  }
  const root = positional[0] ?? ".";
  try {
    const info = await stat(root);
    if (!info.isDirectory()) {
      process.stderr.write(`Cannot read ${root}: not a directory.\n`);
      return 2;
    }
  } catch (error) {
    process.stderr.write(`Cannot read ${root}: ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  const report = await checkUpgrade(root, target);
  process.stdout.write(json ? `${JSON.stringify(report, null, 2)}\n` : renderUpgradeText(report));
  return report.verdict === "blocked" ? 1 : 0;
}
