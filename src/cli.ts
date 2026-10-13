#!/usr/bin/env node

import process from "node:process";

import { builtInDetectors } from "./detectors/index.js";
import { scanRepository } from "./engine.js";
import { renderFindingText, renderJson, renderText } from "./reporters.js";

const HELP = `Evergreen — local-first deprecation intelligence

Usage:
  evergreen scan [path] [--json]
  evergreen explain <finding-id> [path] [--json]
  evergreen --help
  evergreen --version
`;

async function main(args: string[]): Promise<number> {
  if (args.includes("--help") || args.includes("-h") || args.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }

  if (args.includes("--version") || args.includes("-v")) {
    process.stdout.write("0.0.1\n");
    return 0;
  }

  const [command] = args;
  if (command !== "scan" && command !== "explain") {
    process.stderr.write(`Unknown command: ${command ?? ""}\n\n${HELP}`);
    return 2;
  }

  const json = args.includes("--json");
  const positional = args.slice(1).filter((argument) => !argument.startsWith("-"));
  const findingId = command === "explain" ? positional[0] : undefined;
  if (command === "explain" && !findingId) {
    process.stderr.write(`Missing finding ID.\n\n${HELP}`);
    return 2;
  }
  const pathArgument = command === "explain" ? (positional[1] ?? ".") : (positional[0] ?? ".");
  const result = await scanRepository(pathArgument, builtInDetectors);
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
