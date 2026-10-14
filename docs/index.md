---
title: Evergreen documentation
---

# Evergreen

Evergreen is local-first deprecation intelligence for software repositories and coding agents. It discovers supported lifecycle risks, connects them to exact files and usages, and produces evidence-backed migration context without a hosted service.

## Start here

- [90-second demo](DEMO.md)
- [v0.1 validation results](VALIDATION.md)
- [Migration packets](MIGRATION_PACKETS.md)
- [Local MCP server](MCP.md)
- [Agent Skill](AGENT_SKILLS.md)
- [GitHub Action](GITHUB_ACTION.md)
- [Detector SDK](DETECTORS.md)
- [Architecture and trust boundaries](ARCHITECTURE.md)
- [Roadmap](ROADMAP.md)
- [Post-launch notes and next roadmap](NEXT.md)

## Install

```bash
npx evergreen-deprecation scan .
```

Evergreen runs on Node.js 22 or newer. Repository analysis stays on the local machine or CI runner.

[Source code](https://github.com/arminazimi/evergreen) · [Report an issue](https://github.com/arminazimi/evergreen/issues) · [npm package](https://www.npmjs.com/package/evergreen-deprecation)
