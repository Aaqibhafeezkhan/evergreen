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

The project starts as one TypeScript package with explicit module boundaries. Packages will be split only when the detector SDK becomes public; this avoids workspace and release complexity before the interfaces are proven.

## Trust boundaries

- Repository contents are untrusted input.
- Registry entries are reviewed data, not executable code.
- Detectors cannot make network calls through the core contract.
- A finding must identify its detector, rule, evidence source, and affected location.
- AI-generated interpretation may enrich a finding but cannot create a core finding.

## Hosting

No backend is required. The CLI and MCP server run locally, the GitHub Action runs on the repository's runner, and the rule registry ships with signed project releases. Documentation may be hosted as a static site.
