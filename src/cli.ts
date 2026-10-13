#!/usr/bin/env node

import process from "node:process";
import { resolve } from "node:path";

import { applyBaseline, createBaseline, readBaseline, writeBaseline } from "./baseline.js";
import { builtInDetectors } from "./detectors/index.js";
import { scanRepository } from "./engine.js";
import { renderFindingText, renderJson, renderText } from "./reporters.js";

const HELP = `Evergreen — local-first deprecation intelligence

Usage:
  evergreen scan [path] [--json]
  evergreen scan [path] --baseline <file> [--json]
  evergreen baseline [path] [--output <file>]
  evergreen explain <finding-id> [path] [--json]
  evergreen --help
  evergreen --version
`;

const VERSION = "0.1.0-alpha.0";

async function main(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const [command] = args;
  if (command !== "scan" && command !== "explain" && command !== "baseline") {
    process.stderr.write(`Unknown command: ${command ?? ""}\n\n${HELP}`);
    return 2;
  }

  const json = args.includes("--json");
  const valueOptions = new Set(["--baseline", "--output"]);
  const positional: string[] = [];
  for (let index = 1; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument) continue;
    if (valueOptions.has(argument)) {
      index += 1;
    } else if (!argument.startsWith("-")) {
      positional.push(argument);
    }
  }
  const optionValue = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index === -1 ? undefined : args[index + 1];
  };
  const findingId = command === "explain" ? positional[0] : undefined;
  if (command === "explain" && !findingId) {
    process.stderr.write(`Missing finding ID.\n\n${HELP}`);
    return 2;
  }
  const pathArgument = command === "explain" ? (positional[1] ?? ".") : (positional[0] ?? ".");
  let result = await scanRepository(pathArgument, builtInDetectors);
  if (command === "baseline") {
    const output = resolve(optionValue("--output") ?? ".evergreen-baseline.json");
    const baseline = createBaseline(result);
    await writeBaseline(output, baseline);
    process.stdout.write(`Wrote ${baseline.findings.length} findings to ${output}\n`);
    return 0;
  }
  const baselinePath = optionValue("--baseline");
  if (baselinePath) {
    result = applyBaseline(result, await readBaseline(resolve(baselinePath)));
  }
  if (command === "explain") {
    const finding = result.findings.find((candidate) => candidate.id === findingId);
    if (!finding) {
      process.stderr.write(`Finding not found: ${findingId}\n`);
      return 1;
    }
    process.stdout.write(`${json ? JSON.stringify(finding, null, 2) : renderFindingText(finding)}\n`);
  } else {
    process.stdout.write(`${json ? renderJson(result) : renderText(result)}\n`);
  }
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
