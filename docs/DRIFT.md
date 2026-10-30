# Drift

`evergreen drift` reads every place a repository states a runtime version and reports, with exact file and line, when those values select different release lines. A repository with Python 3.10 in `.python-version`, 3.11 in its Dockerfile, and 3.12 in CI has drift: tests pass on one version while production runs another.

Scans read repository files and nothing else. No drift path uses the network, runs a command, or evaluates repository code, and `--align` prints patches instead of writing files.

```bash
evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]
```

- `--check` exits `1` when any runtime has drifted or has a floor conflict.
- `--json` prints the `evergreen.drift.v1` document described by [`schemas/drift.v1.schema.json`](../schemas/drift.v1.schema.json).
- `--runtime <id>` limits the report to one runtime.
- `--align <release>` requires `--runtime`, and prints a unified diff that rewrites the pins it understands to `release`. It lists pins it refuses on stderr.

Each runtime is reported as its own block. Every pin carries its location, the source it came from, the value as written, and the release line the value selects offline. A value that cannot be resolved carries the reason instead of a guess. A `floor` is a minimum the project supports, not the version that builds it; a floor above the lowest pin is reported as a floor conflict.

Release granularity differs by runtime. Each section below states the granularity it reports and the values it leaves unresolved.
