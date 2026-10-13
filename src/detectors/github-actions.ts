import { readFile, readdir } from "node:fs/promises";
import { relative, resolve } from "node:path";

import type {
  DeprecationRule,
  Detector,
  DetectorContext,
  Finding,
} from "../domain.js";

interface GitHubActionRule extends DeprecationRule {
  action: string;
  supportedFromMajor: number;
}

interface GitHubActionsRegistry {
  schemaVersion: "evergreen.github-actions-registry.v1";
  rules: GitHubActionRule[];
}

interface ActionReference {
  action: string;
  ref: string;
  line: number;
}

const USES_PATTERN = /^\s*(?:-\s*)?uses\s*:\s*["']?([^\s#"']+)["']?(?:\s+#.*)?$/;
const VERSION_PATTERN = /^v?(\d+)(?:\.\d+){0,2}$/;

async function loadRegistry(): Promise<GitHubActionRule[]> {
  const registryUrl = new URL("../../../registry/github-actions.json", import.meta.url);
  const contents = await readFile(registryUrl, "utf8");
  const registry = JSON.parse(contents) as GitHubActionsRegistry;

  if (registry.schemaVersion !== "evergreen.github-actions-registry.v1") {
    throw new Error(`Unsupported GitHub Actions registry: ${registry.schemaVersion}`);
  }

  return registry.rules;
}

async function findWorkflowFiles(root: string): Promise<string[]> {
  const workflowDirectory = resolve(root, ".github", "workflows");

  try {
    const entries = await readdir(workflowDirectory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
      .map((entry) => resolve(workflowDirectory, entry.name))
      .sort();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function parseActionReferences(contents: string): ActionReference[] {
  const references: ActionReference[] = [];

  for (const [index, line] of contents.split(/\r?\n/).entries()) {
    const match = USES_PATTERN.exec(line);
    const target = match?.[1];
    if (!target || target.startsWith("./") || target.startsWith("docker://")) {
      continue;
    }

    const separator = target.lastIndexOf("@");
    if (separator <= 0 || separator === target.length - 1) {
      continue;
    }

    references.push({
      action: target.slice(0, separator).toLowerCase(),
      ref: target.slice(separator + 1),
      line: index + 1,
    });
  }

  return references;
}

function majorVersion(ref: string): number | undefined {
  const match = VERSION_PATTERN.exec(ref);
  const value = match?.[1];
  return value === undefined ? undefined : Number.parseInt(value, 10);
}

export class GitHubActionsDetector implements Detector {
  readonly name = "github-actions";

  async scan(context: DetectorContext): Promise<Finding[]> {
    const [rules, workflowFiles] = await Promise.all([
      loadRegistry(),
      findWorkflowFiles(context.root),
    ]);
    const rulesByAction = new Map(rules.map((rule) => [rule.action.toLowerCase(), rule]));
    const findings: Finding[] = [];

    for (const workflowFile of workflowFiles) {
      const contents = await readFile(workflowFile, "utf8");

      for (const reference of parseActionReferences(contents)) {
        const rule = rulesByAction.get(reference.action);
        const major = majorVersion(reference.ref);
        if (!rule || major === undefined || major >= rule.supportedFromMajor) {
          continue;
        }

        const path = relative(context.root, workflowFile);
        findings.push({
          id: `${rule.id}:${path}:${reference.line}`,
          ruleId: rule.id,
          detector: this.name,
          title: rule.title,
          summary: `${reference.action}@${reference.ref}: ${rule.summary}`,
          severity: rule.severity,
          location: { path, line: reference.line },
          ...(rule.replacement ? { replacement: rule.replacement } : {}),
          ...(rule.deadline ? { deadline: rule.deadline } : {}),
          sources: rule.sources,
        });
      }
    }

    return findings;
  }
}

export const githubActionsDetector = new GitHubActionsDetector();
