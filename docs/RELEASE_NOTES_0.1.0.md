# Evergreen v0.1.0

Evergreen v0.1 is the first public, end-to-end release of local-first deprecation intelligence for repositories and coding agents.

## Highlights

- Evidence-backed lifecycle detection for GitHub Actions, Node.js, npm packages, Python runtimes, and Python packages.
- Exact source locations plus language-aware imports, calls, and configuration usages.
- Deterministic text and versioned JSON output, explanations, baselines, and severity gates.
- A reusable GitHub Action with pull-request annotations and report artifacts.
- Validated migration packets shared by the CLI, local stdio MCP server, and portable Agent Skill.
- A versioned detector SDK with a complete external-detector example.

## Validation

The release was tested against 20 public repositories pinned to immutable commits. The audited corpus contained 27 expected findings with no observed false positives or false negatives. Median local scan time was 8.19 ms and p95 was 48.88 ms on the development machine. See the [full methodology and limitations](https://arminazimi.github.io/evergreen/VALIDATION.html).

## Install

```bash
npx evergreen-deprecation scan .
```

Node.js 22 or newer is required. Evergreen performs analysis locally and does not execute migration commands.

## Integrations

- CLI: `evergreen`
- Local MCP server: `evergreen-mcp`
- GitHub Action: `arminazimi/evergreen@v0.1.0`
- Agent Skill: `skills/evergreen-deprecation`
- Detector SDK: `evergreen-deprecation/sdk`

See the [documentation](https://arminazimi.github.io/evergreen/) and [90-second demo](https://arminazimi.github.io/evergreen/DEMO.html).
