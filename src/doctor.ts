import { access, readFile, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { satisfies } from "semver";

export const doctorCategories = ["runtime", "package", "mcp", "skill", "plugin", "ci"] as const;
export type DoctorCategory = (typeof doctorCategories)[number];
export type DoctorStatus = "pass" | "warning" | "fail";
export type DoctorContext = "local" | "github-actions" | "gitlab-ci";

export interface DoctorCheck {
  id: string;
  category: DoctorCategory;
  status: DoctorStatus;
  summary: string;
  details: string;
  remediation?: string;
}

export interface DoctorResult {
  schemaVersion: "evergreen.doctor.v1";
  root: string;
  context: {
    kind: DoctorContext;
    platform: NodeJS.Platform;
    nodeVersion: string;
  };
  summary: {
    status: "ready" | "ready-with-warnings" | "not-ready";
    passed: number;
    warnings: number;
    failed: number;
  };
  checks: DoctorCheck[];
  privacy: {
    repositoryDataUploaded: false;
    configurationMutated: false;
  };
}

export interface DoctorOptions {
  environment?: Readonly<Record<string, string | undefined>>;
  installationRoot?: string;
  nodeVersion?: string;
  platform?: NodeJS.Platform;
}

interface PackageManifest {
  name?: string;
  engines?: { node?: string };
  bin?: Record<string, string>;
}

const defaultInstallationRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function detectContext(environment: Readonly<Record<string, string | undefined>>): DoctorContext {
  if (environment.GITHUB_ACTIONS === "true") return "github-actions";
  if (environment.GITLAB_CI === "true") return "gitlab-ci";
  return "local";
}

function resultStatus(checks: DoctorCheck[]): DoctorResult["summary"] {
  const passed = checks.filter((check) => check.status === "pass").length;
  const warnings = checks.filter((check) => check.status === "warning").length;
  const failed = checks.filter((check) => check.status === "fail").length;
  return {
    status: failed > 0 ? "not-ready" : warnings > 0 ? "ready-with-warnings" : "ready",
    passed,
    warnings,
    failed,
  };
}

async function readManifest(root: string): Promise<PackageManifest | undefined> {
  try {
    return JSON.parse(await readFile(resolve(root, "package.json"), "utf8")) as PackageManifest;
  } catch {
    return undefined;
  }
}

async function runtimeCheck(nodeVersion: string, manifest?: PackageManifest): Promise<DoctorCheck> {
  const required = manifest?.engines?.node ?? ">=22";
  if (satisfies(nodeVersion, required, { includePrerelease: true })) {
    return {
      id: "runtime.node",
      category: "runtime",
      status: "pass",
      summary: `Node.js ${nodeVersion} satisfies ${required}.`,
      details: "The current runtime can execute this Evergreen installation.",
    };
  }
  return {
    id: "runtime.node",
    category: "runtime",
    status: "fail",
    summary: `Node.js ${nodeVersion} does not satisfy ${required}.`,
    details: "Evergreen cannot reliably run on this Node.js version.",
    remediation: `Install a Node.js release matching ${required}, then run evergreen doctor again.`,
  };
}

function packageCheck(manifest?: PackageManifest): DoctorCheck {
  if (manifest?.name === "evergreen-deprecation" && manifest.bin?.evergreen) {
    return {
      id: "package.installation",
      category: "package",
      status: "pass",
      summary: "The Evergreen package and CLI entry point are present.",
      details: `CLI entry: ${manifest.bin.evergreen}`,
    };
  }
  return {
    id: "package.installation",
    category: "package",
    status: "fail",
    summary: "The Evergreen package metadata or CLI entry point is incomplete.",
    details: "Expected package evergreen-deprecation with an evergreen executable.",
    remediation: "Reinstall evergreen-deprecation from npm or rebuild the source checkout.",
  };
}

async function mcpCheck(installationRoot: string, manifest?: PackageManifest): Promise<DoctorCheck> {
  const entry = manifest?.bin?.["evergreen-mcp"];
  if (entry && await exists(resolve(installationRoot, entry))) {
    return {
      id: "mcp.stdio-server",
      category: "mcp",
      status: "pass",
      summary: "The local MCP stdio server is available.",
      details: `MCP entry: ${entry}; no network listener or credentials are required.`,
    };
  }
  return {
    id: "mcp.stdio-server",
    category: "mcp",
    status: "fail",
    summary: "The local MCP stdio server entry point is unavailable.",
    details: entry ? `Missing built entry: ${entry}` : "The evergreen-mcp package entry is not declared.",
    remediation: "Reinstall the package or run npm run build in an Evergreen source checkout.",
  };
}

async function skillCheck(installationRoot: string): Promise<DoctorCheck> {
  const path = resolve(installationRoot, "skills/evergreen-deprecation/SKILL.md");
  try {
    const source = await readFile(path, "utf8");
    if (
      source.startsWith("---\n")
      && /^name:\s*evergreen-deprecation\s*$/m.test(source)
      && /^description:\s*\S.+$/m.test(source)
      && /\n---\n/.test(source)
    ) {
      return {
        id: "skill.portable-bundle",
        category: "skill",
        status: "pass",
        summary: "The portable Evergreen Agent Skill is available.",
        details: "The skill has valid frontmatter and can be copied or linked into a compatible host.",
      };
    }
  } catch {
    // The failure below includes the remediation and remains deterministic.
  }
  return {
    id: "skill.portable-bundle",
    category: "skill",
    status: "fail",
    summary: "The portable Evergreen Agent Skill is missing or invalid.",
    details: "Expected skills/evergreen-deprecation/SKILL.md with Evergreen frontmatter.",
    remediation: "Reinstall the package or restore the packaged skills/evergreen-deprecation directory.",
  };
}

function pluginCheck(checks: DoctorCheck[]): DoctorCheck {
  const foundationsReady = checks
    .filter((check) => check.category === "mcp" || check.category === "skill")
    .every((check) => check.status === "pass");
  if (!foundationsReady) {
    return {
      id: "plugin.foundation",
      category: "plugin",
      status: "fail",
      summary: "Plugin prerequisites are incomplete.",
      details: "Evergreen plugins require both the local MCP server and portable Agent Skill.",
      remediation: "Repair the failed MCP and Skill checks before configuring a host plugin.",
    };
  }
  return {
    id: "plugin.foundation",
    category: "plugin",
    status: "warning",
    summary: "Shared plugin prerequisites are ready; host-specific plugins remain experimental.",
    details: "The MCP server and portable skill are available, but no stable host plugin is bundled yet.",
    remediation: "Use the CLI, MCP server, or portable skill until a host-specific plugin is published.",
  };
}

async function ciCheck(
  context: DoctorContext,
  environment: Readonly<Record<string, string | undefined>>,
): Promise<DoctorCheck> {
  if (context === "local") {
    return {
      id: "ci.environment",
      category: "ci",
      status: "pass",
      summary: "Local execution detected; no CI workspace variables are required.",
      details: "Use evergreen doctor inside CI to validate runner-specific variables.",
    };
  }
  const variable = context === "github-actions" ? "GITHUB_WORKSPACE" : "CI_PROJECT_DIR";
  const workspace = environment[variable];
  if (workspace) {
    try {
      if ((await stat(workspace)).isDirectory()) {
        return {
          id: "ci.environment",
          category: "ci",
          status: "pass",
          summary: `${context === "github-actions" ? "GitHub Actions" : "GitLab CI"} workspace is available.`,
          details: `${variable} points to an accessible directory.`,
        };
      }
    } catch {
      // The failure below includes the missing or inaccessible workspace.
    }
  }
  return {
    id: "ci.environment",
    category: "ci",
    status: "fail",
    summary: `${context === "github-actions" ? "GitHub Actions" : "GitLab CI"} workspace is unavailable.`,
    details: `${variable} is missing or does not point to an accessible directory.`,
    remediation: `Run Evergreen after checkout and ensure ${variable} points to the checked-out repository.`,
  };
}

export async function diagnoseEnvironment(root = ".", options: DoctorOptions = {}): Promise<DoctorResult> {
  const environment = options.environment ?? process.env;
  const installationRoot = resolve(options.installationRoot ?? defaultInstallationRoot);
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const platform = options.platform ?? process.platform;
  const context = detectContext(environment);
  const manifest = await readManifest(installationRoot);
  const checks: DoctorCheck[] = [
    await runtimeCheck(nodeVersion, manifest),
    packageCheck(manifest),
    await mcpCheck(installationRoot, manifest),
    await skillCheck(installationRoot),
  ];
  checks.push(pluginCheck(checks));
  checks.push(await ciCheck(context, environment));

  return {
    schemaVersion: "evergreen.doctor.v1",
    root: resolve(root),
    context: { kind: context, platform, nodeVersion },
    summary: resultStatus(checks),
    checks,
    privacy: {
      repositoryDataUploaded: false,
      configurationMutated: false,
    },
  };
}

export function renderDoctorText(result: DoctorResult): string {
  const symbols: Record<DoctorStatus, string> = { pass: "PASS", warning: "WARN", fail: "FAIL" };
  const lines = [
    "Evergreen doctor",
    `Repository: ${result.root}`,
    `Environment: ${result.context.kind} on ${result.context.platform}`,
    `Status: ${result.summary.status}`,
  ];
  for (const check of result.checks) {
    lines.push("", `[${symbols[check.status]}] ${check.category}: ${check.summary}`, check.details);
    if (check.remediation) lines.push(`Next: ${check.remediation}`);
  }
  lines.push(
    "",
    "Privacy: no repository data was uploaded and no configuration was changed.",
  );
  return lines.join("\n");
}
