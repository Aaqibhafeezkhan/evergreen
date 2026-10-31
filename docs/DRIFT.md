# Runtime drift

`evergreen drift` reports every place a repository states a runtime version: Dockerfiles, CI configuration, version files, manifests, and toolchain files. Each value is listed with its exact file, line, source, and the release line it resolves to offline. When the values disagree, the runtime is marked `DRIFT`; when a minimum the project requires is above the version that builds it, the value is listed as a floor conflict.

```bash
evergreen drift .              # what the repository states, by runtime
evergreen drift . --check      # exit 1 when any runtime disagrees
evergreen drift . --runtime rust --align 1.82   # print a patch; nothing is written
evergreen drift . --runtime go --align 1.22   # print a patch; nothing is written
```

Drift reads repository files only. It never uses the network, never executes repository code or tools, and never writes a file. `--align` prints a unified diff for review; apply it yourself, for example with `git apply`.

A value is a **pin** when it selects the version that builds or runs the project, and a **floor** when it states a minimum the project supports. Floors are compared with the lowest pinned release: a floor above it is a conflict, because the environment the pin selects cannot satisfy the project.

Values that cannot be resolved offline are still reported, with the reason. Evergreen never guesses a release.

## Rust

Release granularity is `1.minor`: the toolchain channel `1.79.0`, the image tag `1.79.0-slim-bookworm`, and the `.tool-versions` entry `1.79.0` all resolve to `1.79`. A `rust-toolchain` channel selects the toolchain that builds the project, so it is a pin; `rust-version` in `Cargo.toml` states the minimum the project supports, so it is a floor.

| Source | Field | Kind |
| --- | --- | --- |
| `rust-toolchain.toml`, `rust-toolchain` | `channel` (or the one-line legacy form) | pin |
| `.tool-versions` | `rust` entry | pin |
| `Dockerfile*`, `Containerfile*`, `*.Dockerfile` | `FROM rust:<tag>` | pin |
| `.github/workflows/*.yml` | `dtolnay/rust-toolchain@<ref>` | pin |
| `.github/workflows/*.yml` | `dtolnay/rust-toolchain` `toolchain:` input | pin |
| `.github/workflows/*.yml` | `actions-rs/toolchain` `toolchain:` input | pin |
| `.github/workflows/*.yml` | job `container:` and `services.<name>.image` rust image | pin |
| `.gitlab-ci.yml` | `image:` or `services:` rust image | pin |
| `.circleci/config.yml` | Docker executor rust image | pin |
| `azure-pipelines.yml` | job `container:` rust image | pin |
| `Cargo.toml` | `package.rust-version` and `workspace.package.rust-version` | floor |

The Rust collector reuses the existing `rust-toolchain` and `Cargo.toml` parsers and reads Dockerfile `FROM` lines with the container parser. It reports these values as unresolved, without a release: `stable`, `beta`, `nightly`, and dated nightlies, a floating image tag such as `rust:latest`, an image with no tag, a tag that is not `1.minor`, an expression that is not a literal version, and a `.tool-versions` entry that names a `ref:` or `path:`.

`--align` rewrites `channel = "1.x"` lines and the one-line `rust-toolchain`, the `rust` entry of `.tool-versions`, `rust:<version>[-variant]` tags in Dockerfiles and CI configuration, `dtolnay/rust-toolchain@<ref>`, and the `toolchain:` input of `dtolnay/rust-toolchain` and `actions-rs/toolchain`. It keeps the target or image variant suffix. It refuses floors, named channels, expressions, and images pinned by digest.
## Go
Release granularity is `1.minor`: `go1.22.4` and the image tag `1.22.4-alpine` both resolve to `1.22`. A `go` directive is a minimum since Go 1.21 ([Go toolchains](https://go.dev/doc/toolchain), [go directive](https://go.dev/ref/mod#go-mod-file-go)), so it is a floor; a `toolchain` line selects the toolchain that builds the module, so it is a pin.
| `go.mod` | `toolchain go1.x.y` | pin |
| `go.work` | `toolchain go1.x.y` | pin |
| `go.mod` | `go 1.x[.y]` | floor |
| `go.work` | `go 1.x[.y]` | floor |
| `.go-version` | first non-comment line | pin |
| `.tool-versions` | `golang` entry | pin |
| `Dockerfile*`, `Containerfile*` | `FROM golang:<tag>` | pin |
| `.github/workflows/*.yml` | `actions/setup-go` `go-version` | pin |
| `.github/workflows/*.yml` | `actions/setup-go` `go-version-file` | pin, pointing at the named file |
| `.gitlab-ci.yml` | `image:` or `services:` golang image | pin |
| `.circleci/config.yml` | Docker executor golang image | pin |
| `azure-pipelines.yml` | job `container:` golang image | pin |
The Go collector reuses the existing `go.mod` and `go.work` parsers and reads Dockerfile `FROM` lines with the container parser. It reports these values as unresolved, without a release: a floating image tag such as `golang:latest`, an image with no tag, a tag that is not `major.minor`, a `stable` or `oldstable` `go-version`, an expression that is not a `matrix` reference, a matrix entry that is not a plain version, and a `.go-version` or `.tool-versions` value that is not a Go version.
`--align` rewrites `toolchain go1.x.y` lines, `.go-version`, the `golang` entry of `.tool-versions`, `FROM golang:<version>[-variant]` (keeping the variant suffix), and a single-value `actions/setup-go` `go-version`. It refuses floors, matrix and expression values, `go-version-file` pointers, and floating tags.
## Python
Python pins are reported at `major.minor` granularity: `3.11.4`, `3.11`, and `python-3.11` all select `3.11`.
**Pins**
| Source | Field | Align |
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
