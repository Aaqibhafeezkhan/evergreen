#!/usr/bin/env node

import process from "node:process";

import { scanRepository } from "./engine.js";
import { renderJson, renderText } from "./reporters.js";

const HELP = `Evergreen — local-first deprecation intelligence

Usage:
  evergreen scan [path] [--json]
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
  if (command !== "scan") {
    process.stderr.write(`Unknown command: ${command ?? ""}\n\n${HELP}`);
    return 2;
  }

  const json = args.includes("--json");
  const pathArgument = args.slice(1).find((argument) => !argument.startsWith("-")) ?? ".";
  const result = await scanRepository(pathArgument);
  process.stdout.write(`${json ? renderJson(result) : renderText(result)}\n`);
  return 0;
}

process.exitCode = await main(process.argv.slice(2));
