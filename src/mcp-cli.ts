#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { createEvergreenMcpServer } from "./mcp.js";

serveStdio(() => createEvergreenMcpServer(), {
  onerror(error) {
    process.stderr.write(`Evergreen MCP error: ${error.message}\n`);
  },
});
