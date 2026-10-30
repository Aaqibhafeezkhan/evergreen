import process from "node:process";
import { resolve } from "node:path";

import { checkUpgrade, parseUpgradeTarget } from "./index.js";
import type { UpgradeIssue, UpgradeReport } from "./types.js";

export const UPGRADE_CHECK_USAGE = "Usage: evergreen upgrade-check --to <runtime@version> [path] [--json]";

/** Printed for every `unknown` verdict so a reader never mistakes missing evidence for a safe upgrade. */
export const UNKNOWN_VERDICT_NOTE =
  "Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.";

/** One issue as `path:line  subject  reason  [evidence]`. */
export function renderUpgradeIssue(issue: UpgradeIssue): string {
  const location = issue.line === undefined ? issue.path : `${issue.path}:${issue.line}`;
  return `${location}  ${issue.subject}  ${issue.reason}  [${issue.evidence.kind}: ${issue.evidence.value}]`;
}

/** The verdict first, then blockers, warnings, and unknowns. */
export function renderUpgradeText(report: UpgradeReport): string {
  const lines = [`Verdict: ${report.verdict}`];
  if (report.verdict === "unknown") lines.push(UNKNOWN_VERDICT_NOTE);
  for (const [level, heading] of [["blocker", "Blockers"], ["warning", "Warnings"], ["unknown", "Unknown"]] as const) {
    const issues = report.issues.filter((issue) => issue.level === level);
    if (issues.length === 0) continue;
    lines.push("", `${heading}:`, ...issues.map(renderUpgradeIssue));
  }
  return lines.join("\n");
}

function usageError(message: string): number {
  process.stderr.write(`${message}\n${UPGRADE_CHECK_USAGE}\n`);
  return 2;
}

/**
 * `evergreen upgrade-check --to <runtime@version> [path] [--json]`.
 * Exits 1 when blocked, 0 for ready and unknown, and 2 for bad input.
 */
export async function upgradeCheckCommand(args: string[]): Promise<number> {
  const json = args.includes("--json");
  const toIndex = args.indexOf("--to");
  const targetText = toIndex === -1 ? undefined : args[toIndex + 1];
  if (toIndex !== -1 && (targetText === undefined || targetText.startsWith("-"))) {
    return usageError("--to needs a target, for example go@1.23.");
  }
  if (targetText === undefined) return usageError("Missing --to, for example --to go@1.23.");
  const target = parseUpgradeTarget(targetText);
  if (target === undefined) return usageError(`"${targetText}" is not <runtime@version>, for example go@1.23.`);

  const positional = args.filter(
    (argument, index) => argument !== "--json" && argument !== "--to" && index !== toIndex + 1,
  );
  const unknownOptions = positional.filter((argument) => argument.startsWith("-"));
  if (unknownOptions.length > 0) return usageError(`Unknown option: ${unknownOptions[0]}`);
  if (positional.length > 1) return usageError("Too many paths.");

  const report = await checkUpgrade(resolve(positional[0] ?? "."), target);
  process.stdout.write(`${json ? JSON.stringify(report, null, 2) : renderUpgradeText(report)}\n`);
  return report.verdict === "blocked" ? 1 : 0;
}
