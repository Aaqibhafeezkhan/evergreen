# GitHub Action

Evergreen's reusable Action scans the checked-out repository locally, emits GitHub annotations for findings, compares against an optional baseline, enforces a severity gate, and uploads the versioned JSON result.

## Pull-request workflow

```yaml
name: Evergreen

on:
  pull_request:

permissions:
  contents: read

jobs:
  lifecycle:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: arminazimi/evergreen@v0.1.0
        with:
          baseline: .evergreen-baseline.json
          fail-on-severity: high
```

Version tags provide stable release references. Pin a full commit SHA when your threat model requires immutable third-party action references.

Create and commit the baseline locally when existing findings are accepted:

```bash
npx evergreen-deprecation baseline . --output .evergreen-baseline.json
```

The Action then annotates and gates only findings not represented by that baseline.

## Inputs and outputs

| Input | Default | Meaning |
| --- | --- | --- |
| `path` | `.` | Repository or subdirectory to scan. |
| `baseline` | empty | Baseline path relative to `path`. Missing configured files fail the Action. |
| `fail-on-severity` | `high` | Lowest failing level: `none`, `info`, `low`, `medium`, `high`, or `critical`. |
| `report-name` | `evergreen-report` | Artifact name for the JSON report. |
| `upload-report` | `true` | Set to `false` to keep the report only on the runner. |

`report-path` contains the local absolute JSON path and `finding-count` contains the post-baseline count. High and critical findings become error annotations, medium findings become warnings, and low or informational findings become notices. The gate is evaluated independently from annotation level.

## Permissions and privacy

Only `contents: read` is required. Evergreen does not need `pull-requests: write`, does not post comments, and does not send repository contents to an Evergreen backend. Annotations are emitted through runner workflow commands.

The bundled scan is local and deterministic. When `upload-report` is `true`, the official `actions/upload-artifact` adapter sends `evergreen-report.json` to GitHub and retains it for 14 days. The report can contain repository-relative paths, matched source excerpts, dependency versions, and lifecycle evidence. Repository administrators should apply normal Actions artifact access controls or disable uploading for sensitive repositories.

Forked pull requests receive the same read-only scan behavior; no repository secrets are required.
