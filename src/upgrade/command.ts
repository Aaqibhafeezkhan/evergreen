import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { checkUpgrade, parseUpgradeTarget } from "./index.js";
import { parseVersion } from "./pep440.js";
import type { UpgradeReport } from "./types.js";

export const UPGRADE_USAGE = "Usage: evergreen upgrade-check --to <runtime@version> [path] [--json]";

export const UNKNOWN_UPGRADE_CAVEAT =
  "Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.";

/** The text report: the verdict first, then every issue as `path[:line]  subject  reason  [evidence]`. */
export function renderUpgradeText(report: UpgradeReport): string {
  const lines: string[] = [report.verdict];
  if (report.verdict === "unknown") lines.push(UNKNOWN_UPGRADE_CAVEAT);
  for (const issue of report.issues) {
    const location = issue.line === undefined ? issue.path : `${issue.path}:${issue.line}`;
    lines.push(`${location}  ${issue.subject}  ${issue.reason}  [${issue.evidence.kind}: ${issue.evidence.value}]`);
  }
  return lines.join("\n");
}

function fail(message: string): number {
  process.stderr.write(`${message}\n${UPGRADE_USAGE}\n`);
  return 2;
}

/** `evergreen upgrade-check --to <runtime@version> [path] [--json]` */
export async function upgradeCheckCommand(args: string[]): Promise<number> {
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
      if (value === undefined || value.startsWith("-")) return fail("--to needs a target, for example python@3.13.");
      targetText = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return fail(`Unknown option: ${argument}`);
    positional.push(argument);
  }
  if (targetText === undefined) return fail("Missing --to <runtime@version>.");
  if (positional.length > 1) return fail(UPGRADE_USAGE);

  const target = parseUpgradeTarget(targetText);
  if (!target || parseVersion(target.version) === undefined) {
    return fail(`Invalid target: ${targetText}. Use <runtime>@<version>, for example python@3.13.`);
  }

  const root = resolve(positional[0] ?? ".");
  try {
    if (!(await stat(root)).isDirectory()) return fail(`Not a directory: ${root}`);
  } catch {
    return fail(`Cannot read ${root}.`);
  }

  const report = await checkUpgrade(root, target);
  process.stdout.write(`${json ? JSON.stringify(report, null, 2) : renderUpgradeText(report)}\n`);
  return report.verdict === "blocked" ? 1 : 0;
}
