import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const skillEvalHosts = ["agent-skills", "codex", "claude"] as const;
export type SkillEvalHost = (typeof skillEvalHosts)[number];
export type SkillEvalKind = "positive" | "negative" | "ambiguous";

export interface SkillEvalCase {
  id: string;
  host: SkillEvalHost;
  kind: SkillEvalKind;
  prompt: string;
  shouldTrigger: boolean;
  reason: string;
}

export interface SkillEvalCorpus {
  schemaVersion: "evergreen.skill-evals.v2";
  cases: SkillEvalCase[];
}

export interface SkillTriggerMetrics {
  cases: number;
  expectedTriggers: number;
  expectedNonTriggers: number;
  truePositives: number;
  falsePositives: number;
  recall: number;
  falseTriggerRate: number;
}

const lifecycleTerms = [
  /\bdeprecated?\b/,
  /\bdeprecation\b/,
  /\bend[ -]of[ -]life\b/,
  /\beol\b/,
  /\bout of support\b/,
  /\bunsupported\b/,
  /\bretired?\b/,
  /\bsunset\b/,
  /\bobsolete\b/,
  /\bno longer maintained\b/,
  /\bmaintenance (?:has )?ended\b/,
  /\bsupport window\b/,
  /\blifecycle status\b/,
];

const repositoryDependencyTerms = [
  /\brepositor(?:y|ies)\b/,
  /\brepo\b/,
  /\bruntime\b/,
  /\bnode(?:\.js|js)?\b/,
  /\bpython\b/,
  /\bpackage(?:s| declaration)?\b/,
  /\bdependenc(?:y|ies)\b/,
  /\bgithub action(?:s)?\b/,
  /\bactions\/[\w-]+\b/,
  /\bworkflow(?:s)?\b/,
  /\bmanifest(?:s)?\b/,
  /\bpackage\.json\b/,
  /\brequirements(?:\.txt)?\b/,
  /\bci (?:action|pipeline|configuration)\b/,
  /\btoolchain\b/,
];

const evergreenFindingTerms = [
  /\bevergreen (?:finding|scan|report|context|migration|verification)\b/,
  /\bfinding id\b/,
  /\bdeprecation finding\b/,
];

const securityTerms = [
  /\bvulnerabilit(?:y|ies)\b/,
  /\bsecurity audit\b/,
  /\bcve-?\d*/,
  /\bsnyk\b/,
  /\bosv\b/,
  /\bdependabot alert\b/,
];

const sourceApiTerms = [
  /\bdeprecated (?:api|method|function|component|prop|hook|endpoint|class)\b/,
  /\breplace .* (?:api|method|function|component|prop|hook)\b/,
];

const routineUpgradeTerms = [
  /\b(?:upgrade|update|bump) (?:all |every |the )?(?:dependencies|dependency|packages?)\b/,
  /\blatest (?:version|versions|release)\b/,
  /\brefresh (?:the )?lockfile\b/,
  /\brenovate\b/,
];

function matchesAny(prompt: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(prompt));
}

/**
 * Deterministic proxy for metadata-only skill selection. It intentionally uses
 * concepts stated in the skill description, not case IDs or expected labels.
 */
export function classifySkillTrigger(prompt: string): boolean {
  const normalized = prompt.toLowerCase().replaceAll("’", "'");
  const hasLifecycle = matchesAny(normalized, lifecycleTerms);
  const hasRepositoryDependency = matchesAny(normalized, repositoryDependencyTerms);
  const hasEvergreenFinding = matchesAny(normalized, evergreenFindingTerms);

  if (matchesAny(normalized, securityTerms) && !hasLifecycle && !hasEvergreenFinding) {
    return false;
  }
  if (matchesAny(normalized, sourceApiTerms) && !hasRepositoryDependency && !hasEvergreenFinding) {
    return false;
  }
  if (matchesAny(normalized, routineUpgradeTerms) && !hasLifecycle && !hasEvergreenFinding) {
    return false;
  }

  return hasEvergreenFinding || (hasLifecycle && hasRepositoryDependency);
}

export function calculateMetrics(cases: SkillEvalCase[]): SkillTriggerMetrics {
  const predictions = cases.map((item) => ({
    expected: item.shouldTrigger,
    actual: classifySkillTrigger(item.prompt),
  }));
  const expectedTriggers = predictions.filter((item) => item.expected).length;
  const expectedNonTriggers = predictions.length - expectedTriggers;
  const truePositives = predictions.filter((item) => item.expected && item.actual).length;
  const falsePositives = predictions.filter((item) => !item.expected && item.actual).length;

  return {
    cases: predictions.length,
    expectedTriggers,
    expectedNonTriggers,
    truePositives,
    falsePositives,
    recall: expectedTriggers === 0 ? 0 : truePositives / expectedTriggers,
    falseTriggerRate: expectedNonTriggers === 0 ? 0 : falsePositives / expectedNonTriggers,
  };
}

export async function loadSkillEvalCorpus(): Promise<SkillEvalCorpus> {
  return JSON.parse(
    await readFile(resolve("skills/evergreen-deprecation/evals/cases.json"), "utf8"),
  ) as SkillEvalCorpus;
}

async function run(): Promise<void> {
  const corpus = await loadSkillEvalCorpus();
  const overall = calculateMetrics(corpus.cases);
  const byHost = Object.fromEntries(
    skillEvalHosts.map((host) => [
      host,
      calculateMetrics(corpus.cases.filter((item) => item.host === host)),
    ]),
  );
  const failures = corpus.cases
    .filter((item) => classifySkillTrigger(item.prompt) !== item.shouldTrigger)
    .map((item) => item.id);
  const result = { schemaVersion: corpus.schemaVersion, overall, byHost, failures };

  console.log(JSON.stringify(result, null, 2));
  if (
    corpus.cases.length < 50 ||
    overall.recall < 0.9 ||
    overall.falseTriggerRate >= 0.05 ||
    Object.values(byHost).some(
      (metrics) => metrics.recall < 0.9 || metrics.falseTriggerRate >= 0.05,
    )
  ) {
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  await run();
}
