# Architecture

## Shape

```text
CLI / GitHub Action / MCP server
              |
          Scan engine
          /         \
    Detectors       Registry
          \         /
            Findings
              |
      Text / JSON / annotations
```

The project remains one TypeScript package with explicit module seams. The public detector SDK is exported from `evergreen-deprecation/sdk`; a separate workspace package is unnecessary while the interface and implementation share a release lifecycle.

The detector SDK is the seam between the scan engine and detector adapters. Its interface is deliberately small: an API version, a stable detector ID, and one `scan` operation. Built-in detectors are composed by the CLI and are not imported by the core engine. The engine owns detector attribution, sorting, and output contracts.

The Python detector is the first new ecosystem implemented entirely through this seam. Its manifest and lockfile parsing remains inside the detector adapter; the engine requires no Python-specific behavior.

## Trust boundaries

- Repository contents are untrusted input.
- Registry entries are reviewed data, not executable code.
- Detectors cannot make network calls through the core contract.
- A finding must identify its detector, rule, evidence source, and affected location.
- AI-generated interpretation may enrich a finding but cannot create a core finding.
- Registry envelopes and every rule are validated before detector logic consumes them.

## Hosting

No backend is required. The CLI and MCP server run locally, the GitHub Action runs on the repository's runner, and the rule registry ships with signed project releases. Documentation may be hosted as a static site.
