# Runtime drift

`evergreen drift` reports every place a repository states a runtime version: Dockerfiles, CI configuration, version files, manifests, and toolchain files. Each value is listed with its exact file, line, source, and the release line it resolves to offline. When the values disagree, the runtime is marked `DRIFT`; when a minimum the project requires is above the version that builds it, the value is listed as a floor conflict.

```bash
evergreen drift .              # what the repository states, by runtime
evergreen drift . --check      # exit 1 when any runtime disagrees
evergreen drift . --runtime rust --align 1.82   # print a patch; nothing is written
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
