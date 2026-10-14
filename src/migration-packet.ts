import { severityValues, sourceLanguageValues } from "./domain.js";
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

export class MigrationPacketValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MigrationPacketValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isLocation(value: unknown): value is SourceLocation {
  if (!isRecord(value) || !isNonEmptyString(value.path)) return false;
  return [value.line, value.column].every(
    (item) => item === undefined || (Number.isInteger(item) && Number(item) >= 1),
  );
}

function isSource(value: unknown): value is EvidenceSource {
  return (
    isRecord(value) &&
    isNonEmptyString(value.title) &&
    isNonEmptyString(value.url) &&
    (value.accessedAt === undefined || isNonEmptyString(value.accessedAt))
  );
}

function isUsage(value: unknown): value is SourceUsage {
  return (
    isRecord(value) &&
    ["import", "call", "config-key"].includes(value.kind as string) &&
    sourceLanguageValues.includes(value.language as never) &&
    isNonEmptyString(value.symbol) &&
    isLocation(value.location) &&
    typeof value.excerpt === "string"
  );
}

function isFinding(value: unknown): value is Finding {
  return (
    isRecord(value) &&
    [value.id, value.ruleId, value.detector, value.title, value.summary].every(isNonEmptyString) &&
    severityValues.includes(value.severity as never) &&
    isLocation(value.location) &&
    Array.isArray(value.sources) &&
    value.sources.length > 0 &&
    value.sources.every(isSource) &&
    (value.usages === undefined || (Array.isArray(value.usages) && value.usages.every(isUsage)))
  );
}

export function validateMigrationPacket(value: unknown): MigrationPacket {
  if (!isRecord(value) || value.schemaVersion !== "evergreen.context.v1") {
    throw new MigrationPacketValidationError("Unsupported migration packet schema.");
  }
  if (
    !isNonEmptyString(value.generatedAt) ||
    Number.isNaN(Date.parse(value.generatedAt)) ||
    !isNonEmptyString(value.repositoryRoot) ||
    !isFinding(value.finding)
  ) {
    throw new MigrationPacketValidationError("Invalid migration packet metadata or finding.");
  }
  if (
    !Array.isArray(value.affectedFiles) ||
    value.affectedFiles.length === 0 ||
    !value.affectedFiles.every(isNonEmptyString) ||
    new Set(value.affectedFiles).size !== value.affectedFiles.length ||
    !Array.isArray(value.usages) ||
    !value.usages.every(isUsage) ||
    !Array.isArray(value.constraints) ||
    value.constraints.length === 0 ||
    !value.constraints.every(isNonEmptyString) ||
    !Array.isArray(value.sources) ||
    value.sources.length === 0 ||
    !value.sources.every(isSource)
  ) {
    throw new MigrationPacketValidationError("Invalid migration packet scope or evidence.");
  }
  const validStep = (step: unknown): boolean =>
    isRecord(step) &&
    [step.id, step.title, step.instructions].every(isNonEmptyString) &&
    Array.isArray(step.paths) &&
    step.paths.every(isNonEmptyString);
  const validVerification = (verification: unknown): boolean =>
    isRecord(verification) &&
    isNonEmptyString(verification.command) &&
    isNonEmptyString(verification.purpose);
  if (
    !Array.isArray(value.steps) ||
    value.steps.length === 0 ||
    !value.steps.every(validStep) ||
    !Array.isArray(value.verification) ||
    value.verification.length === 0 ||
    !value.verification.every(validVerification)
  ) {
    throw new MigrationPacketValidationError("Invalid migration steps or verification commands.");
  }
  return value as unknown as MigrationPacket;
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
  return validateMigrationPacket({
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
  });
}
