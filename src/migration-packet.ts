import type { EvidenceSource, Finding, ScanResult, SourceLocation, SourceUsage } from "./domain.js";

export interface MigrationStep {
  id: string;
  title: string;
  instructions: string;
  paths: string[];
}

export interface VerificationCommand {
  command: string;
  purpose: string;
}

export interface MigrationPacket {
  schemaVersion: "evergreen.context.v1";
  generatedAt: string;
  repositoryRoot: string;
  finding: Finding;
  affectedFiles: string[];
  usages: SourceUsage[];
  constraints: string[];
  steps: MigrationStep[];
  sources: EvidenceSource[];
  verification: VerificationCommand[];
}

function affectedFiles(finding: Finding): string[] {
  return [...new Set([finding.location.path, ...(finding.usages ?? []).map((usage) => usage.location.path)])]
    .sort((left, right) => left.localeCompare(right));
}

function constraintsFor(finding: Finding): string[] {
  return [
    finding.replacement ? `Target replacement: ${finding.replacement}.` : undefined,
    finding.deadline ? `Migration deadline: ${finding.deadline}.` : undefined,
    finding.usages?.length
      ? `Preserve behavior across ${finding.usages.length} identified source usage${finding.usages.length === 1 ? "" : "s"}.`
      : "No concrete source usages were identified; verify dynamic and generated references manually.",
    "Keep the migration within the evidence and affected files in this packet unless verification reveals additional scope.",
  ].filter((value): value is string => value !== undefined);
}

function stepsFor(finding: Finding, paths: string[]): MigrationStep[] {
  const primary: SourceLocation = finding.location;
  const steps: MigrationStep[] = [
    {
      id: "review-evidence",
      title: "Review lifecycle evidence",
      instructions: `Confirm the reported lifecycle state for ${finding.title} against the authoritative sources.`,
      paths: [primary.path],
    },
    {
      id: "update-declaration",
      title: "Update the deprecated declaration",
      instructions: finding.replacement
        ? `Replace the deprecated declaration with ${finding.replacement}.`
        : "Remove or update the deprecated declaration using the cited ecosystem guidance.",
      paths: [primary.path],
    },
  ];
  if (finding.usages?.length) {
    steps.push({
      id: "migrate-usages",
      title: "Migrate affected usages",
      instructions: "Update the listed imports, calls, and configuration keys while preserving behavior.",
      paths,
    });
  }
  steps.push({
    id: "verify-migration",
    title: "Verify the migration",
    instructions: "Run the suggested verification commands and re-scan the repository.",
    paths,
  });
  return steps;
}

function verificationFor(finding: Finding): VerificationCommand[] {
  const ecosystemCommands: Record<string, VerificationCommand[]> = {
    npm: [
      { command: "npm test", purpose: "Run the repository test suite." },
      { command: "npm run build --if-present", purpose: "Verify the project still builds." },
    ],
    python: [
      { command: "python -m pytest", purpose: "Run the Python test suite." },
    ],
    "github-actions": [
      { command: "git diff --check", purpose: "Validate the edited workflow diff." },
    ],
  };
  return [
    ...(ecosystemCommands[finding.detector] ?? []),
    {
      command: "npx evergreen-deprecation scan .",
      purpose: "Confirm the lifecycle finding no longer appears.",
    },
  ];
}

export function createMigrationPacket(result: ScanResult, findingId: string): MigrationPacket {
  const finding = result.findings.find((candidate) => candidate.id === findingId);
  if (!finding) throw new Error(`Finding not found: ${findingId}`);
  const paths = affectedFiles(finding);
  return {
    schemaVersion: "evergreen.context.v1",
    generatedAt: result.scannedAt,
    repositoryRoot: result.root,
    finding,
    affectedFiles: paths,
    usages: finding.usages ?? [],
    constraints: constraintsFor(finding),
    steps: stepsFor(finding, paths),
    sources: finding.sources,
    verification: verificationFor(finding),
  };
}
