import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

import { checkUpgrade, parseUpgradeTarget } from "./index.js";
import type { UpgradeIssue, UpgradeReport } from "./types.js";

const USAGE = "Usage: evergreen upgrade-check --to <runtime@version> [path] [--json]";

const unknownVerdict = "Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.";

function count(issues: readonly UpgradeIssue[], level: UpgradeIssue["level"]): number {
  return issues.filter((issue) => issue.level === level).length;
}

/** The text form: the verdict first, then one line per issue, then the `unknown` caveat. */
export function renderUpgradeReport(report: UpgradeReport): string {
  const counts = { blocker: count(report.issues, "blocker"), warning: count(report.issues, "warning"), unknown: count(report.issues, "unknown") };
  const detail = report.verdict === "blocked" ? ` (${counts.blocker} blocker${counts.blocker === 1 ? "" : "s"}, ${counts.warning} warning${counts.warning === 1 ? "" : "s"}, ${counts.unknown} unknown)` : "";
  const lines = [`${report.verdict}: ${report.target.runtime}@${report.target.version}${detail}`];
  for (const issue of report.issues) {
    const location = issue.line === undefined ? issue.path : `${issue.path}:${issue.line}`;
    lines.push(`${location}  ${issue.subject}  ${issue.reason}  [${issue.evidence.kind} ${issue.evidence.value}]`);
  }
  if (report.verdict === "unknown") lines.push(unknownVerdict);
  return lines.join("\n");
}

function usage(message: string): number {
  process.stderr.write(`${message}\n${USAGE}\n`);
  return 2;
}

/** `evergreen upgrade-check --to <runtime@version> [path] [--json]`. Exits `1` only when the target is blocked. */
export async function upgradeCheckCommand(args: string[]): Promise<number> {
  let to: string | undefined;
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
      if (value === undefined || value.startsWith("-")) return usage("--to needs a value, for example --to dart@3.5.");
      to = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return usage(`Unknown option: ${argument}`);
    positional.push(argument);
  }

  if (to === undefined) return usage("Missing --to.");
  if (positional.length > 1) return usage("upgrade-check reads one repository path.");
  const target = parseUpgradeTarget(to);
  if (!target || !/^\d+(?:\.\d+){0,2}(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(target.version)) {
    return usage(`--to must be <runtime>@<version>, for example --to dart@3.5.`);
  }

  const root = resolve(positional[0] ?? ".");
  const info = await stat(root).catch(() => undefined);
  if (!info?.isDirectory()) return usage(`Not a directory: ${root}`);

  const report = await checkUpgrade(root, target);
  process.stdout.write(`${json ? JSON.stringify(report, null, 2) : renderUpgradeReport(report)}\n`);
  return report.verdict === "blocked" ? 1 : 0;
}
