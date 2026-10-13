import type { ScanResult } from "./domain.js";

export function renderJson(result: ScanResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderText(result: ScanResult): string {
  const lines = [
    "Evergreen scan",
    `Repository: ${result.root}`,
    `Findings: ${result.findings.length}`,
  ];

  for (const finding of result.findings) {
    const line = finding.location.line ? `:${finding.location.line}` : "";
    lines.push("", `${finding.severity.toUpperCase()} ${finding.title}`);
    lines.push(`${finding.location.path}${line}`);
    lines.push(finding.summary);
    if (finding.replacement) {
      lines.push(`Replacement: ${finding.replacement}`);
    }
    if (finding.deadline) {
      lines.push(`Deadline: ${finding.deadline}`);
    }
    for (const source of finding.sources) {
      lines.push(`Source: ${source.url}`);
    }
  }

  for (const diagnostic of result.diagnostics) {
    lines.push("", `Note: ${diagnostic}`);
  }

  return lines.join("\n");
}
