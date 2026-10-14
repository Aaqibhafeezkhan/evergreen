# Evergreen

Evergreen is a local-first deprecation intelligence engine for software repositories. It connects upcoming ecosystem changes to the exact files they affect and produces evidence-backed migration context for humans and AI coding agents.

> Early development: current main includes GitHub Actions, Node.js, npm, and Python lifecycle detectors.

## Product principles

- Local-first: source code stays on the user's machine or CI runner.
- Deterministic core: findings do not require an LLM.
- Evidence-backed: every deprecation claim links to an authoritative source.
- Agent-ready: every human-readable report has a machine-readable equivalent.
- Extensible: ecosystems are added through detectors rather than core rewrites.

## Quickstart

Requirements: Node.js 22 or newer.

```bash
npx evergreen-deprecation scan .
```

Create a baseline for accepted existing findings, then report only new lifecycle regressions:

```bash
npx evergreen-deprecation baseline .
npx evergreen-deprecation scan . --baseline .evergreen-baseline.json
```

Inspect the evidence and migration direction for one result:

```bash
npx evergreen-deprecation explain '<finding-id>' .
```

Evergreen runs locally and does not upload repository contents.

## Development

```bash
npm install
npm run check
```

The initial detector reports unsupported major versions of five first-party actions with exact file and line locations:

- `actions/checkout`
- `actions/setup-node`
- `actions/cache`
- `actions/upload-artifact`
- `actions/download-artifact`

Pinned commit SHAs and dynamic expressions are intentionally left unclassified until Evergreen can resolve them without guessing.

The npm detector also reads `package.json`, npm/pnpm/Yarn lockfiles, Node.js runtime declarations, and a small evidence-backed registry of deprecated direct dependencies. Use `evergreen explain <finding-id>` to inspect a finding and its sources.

The Python detector reads PEP 621 and Poetry metadata from `pyproject.toml`, `requirements*.txt`, common runtime-version files, and uv/Poetry/PDM/Pipenv lockfiles. It reports unsupported Python declarations and lifecycle risks in direct dependencies while ignoring transitive-only lockfile entries.

## Detector SDK

External detectors can use the versioned interface exported by `evergreen-deprecation/sdk`. The scan engine composes compatible detectors without importing any built-in implementation.

See the [detector authoring guide](docs/DETECTORS.md) and the [minimal detector example](examples/detectors/todo-comments.ts).

## Initial product shape

The CLI is the product. Detectors extend it, GitHub Actions automate it, and an MCP server will expose it to agents. A hosted backend is intentionally outside the first three-month roadmap.

See [the roadmap](docs/ROADMAP.md) and [architecture](docs/ARCHITECTURE.md).
