---
title: 90-second demo
---

# 90-second demo

This repository includes a deliberately outdated project at `examples/demo`. It declares an unsupported Node.js range, uses the deprecated `request` package, and runs an old checkout action.

```bash
git clone https://github.com/arminazimi/evergreen.git
cd evergreen
npm ci
npm run build
node dist/src/cli.js scan examples/demo
```

Evergreen reports four evidence-backed lifecycle findings: Node.js 18 and 20, `request`, and `actions/checkout@v4`. Each result includes the exact declaration, severity, replacement, and authoritative sources.

Pick the `request` finding ID from the scan and inspect it:

```bash
node dist/src/cli.js explain '<finding-id>' examples/demo
node dist/src/cli.js context '<finding-id>' examples/demo --json
```

The context packet identifies `package.json` and `src/client.js`, preserves HTTP behavior as a migration constraint, proposes ordered changes, and suggests checks. Evergreen does not modify files or execute suggested commands.

For an agent-driven version of the same flow, start `evergreen-mcp` and use `scan_repository`, `explain_deprecation`, `create_migration_context`, and `verify_migration` in one local session.
