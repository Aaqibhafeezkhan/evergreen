export const severityValues = ["info", "low", "medium", "high", "critical"] as const;

export type Severity = (typeof severityValues)[number];

export interface EvidenceSource {
  title: string;
  url: string;
  accessedAt?: string;
}

export interface SourceLocation {
  path: string;
  line?: number;
  column?: number;
}

export interface DeprecationRule {
  id: string;
  ecosystem: string;
  title: string;
  summary: string;
  severity: Severity;
  replacement?: string;
  deadline?: string;
  sources: EvidenceSource[];
}

export interface Finding {
  id: string;
  ruleId: string;
  detector: string;
  title: string;
  summary: string;
  severity: Severity;
  location: SourceLocation;
  replacement?: string;
  deadline?: string;
  sources: EvidenceSource[];
}

export interface ScanResult {
  schemaVersion: "evergreen.scan.v1";
  root: string;
  scannedAt: string;
  findings: Finding[];
  diagnostics: string[];
}
