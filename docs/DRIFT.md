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

## Python

Python pins are reported at `major.minor` granularity: `3.11.4`, `3.11`, and `python-3.11` all select `3.11`.

**Pins**

| Source | Field | Align |
| --- | --- | --- |
| `.python-version` | every line | yes |
| `.tool-versions` | the `python` line, one pin per version | yes |
| `runtime.txt` | `python-<version>` | yes |
| `Pipfile` | `[requires]` `python_version` and `python_full_version` | yes |
| `Dockerfile`, `*.Dockerfile`, `Containerfile` | `FROM python:<version>[-variant]`, including `--platform` and all stages | yes |
| GitHub Actions | `actions/setup-python` `python-version`, following a `${{ matrix.<key> }}` reference to its literal list; matrix values keep one pin each | single value only |
| `.gitlab-ci.yml` | `image` and `service` values that name a Python image | no |
| `.circleci/config.yml` | job and executor `docker`/`machine` `image` values that name a Python image | no |
| `azure-pipelines.yml` | `container` and `resources.containers[].image` values that name a Python image | no |
| `environment.yml`, `environment.yaml` | literal `python=...` entries under `dependencies`; a lower bound is a floor | no |

A Python image is `python`, `cimg/python`, or `circleci/python` on Docker Hub. A multi-version `.python-version` or `.tool-versions` line reports one pin per version.

**Floors**

| Source | Field |
| --- | --- |
| `pyproject.toml` | `[project]` `requires-python` |
| `pyproject.toml` | `[tool.poetry.dependencies]` `python` |
| `setup.cfg` | `[options]` `python_requires`, including continuation lines |
| `setup.py` | a literal `python_requires="..."` string; the file is read, never executed |

A floor resolves from its first lower bound, so `>=3.10,<3.13`, `^3.10`, and `~=3.10.2` all report `3.10`.

**Unresolved**

`3`, `3.x`, a wildcard with no minor version, `latest`, a tag or image with no version, a dynamic image reference, an expression, a constraint with no lower bound, and any value Evergreen does not read are reported as pins with a one-sentence reason and no release. A value is never guessed from a newer version existing.

**Align**

`--align` rewrites `.python-version`, `.tool-versions`, `runtime.txt`, `Pipfile`, `FROM python:<version>[-variant]` (keeping the variant suffix and the rest of the instruction), and a single-value `setup-python` `python-version`. It refuses floors, matrix entries, CI image references, and any line whose form it does not recognize.
