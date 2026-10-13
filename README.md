# Evergreen

Evergreen is a local-first deprecation intelligence engine for software repositories. It connects upcoming ecosystem changes to the exact files they affect and produces evidence-backed migration context for humans and AI coding agents.

> Early development: the current release includes the first GitHub Actions lifecycle detector.

## Product principles

- Local-first: source code stays on the user's machine or CI runner.
- Deterministic core: findings do not require an LLM.
- Evidence-backed: every deprecation claim links to an authoritative source.
- Agent-ready: every human-readable report has a machine-readable equivalent.
- Extensible: ecosystems are added through detectors rather than core rewrites.

## Development

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev -- scan .
npm test
```

The initial detector reports unsupported major versions of five first-party actions with exact file and line locations:

- `actions/checkout`
- `actions/setup-node`
- `actions/cache`
- `actions/upload-artifact`
- `actions/download-artifact`

Pinned commit SHAs and dynamic expressions are intentionally left unclassified until Evergreen can resolve them without guessing.

## Initial product shape

The CLI is the product. Detectors extend it, GitHub Actions automate it, and an MCP server will expose it to agents. A hosted backend is intentionally outside the first three-month roadmap.

See [the roadmap](docs/ROADMAP.md) and [architecture](docs/ARCHITECTURE.md).
