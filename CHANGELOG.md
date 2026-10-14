# Changelog

## Unreleased

- Add the versioned detector SDK at `evergreen-deprecation/sdk`.
- Validate detector compatibility and registry envelopes before scanning.
- Add an external detector example, authoring guide, and compatibility suite.
- Add Python runtime and direct-package lifecycle detection for pyproject, requirements, version files, and common lockfiles.

## 0.1.0-alpha.0

- Add evidence-backed detection for five first-party GitHub Actions families.
- Add Node.js end-of-life detection from package metadata and version files.
- Add npm, pnpm, and Yarn lockfile discovery for deprecated direct dependencies.
- Add text and versioned JSON reports.
- Add finding explanations and portable baselines.
- Keep all repository analysis local and deterministic.
