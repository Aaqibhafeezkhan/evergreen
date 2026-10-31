# Runtime drift

`evergreen drift` reports every place a repository states a runtime version: Dockerfiles, CI configuration, version files, manifests, and toolchain files. Each value is listed with its exact file, line, source, and the release line it resolves to offline. When the values disagree, the runtime is marked `DRIFT`; when a minimum the project requires is above the version that builds it, the value is listed as a floor conflict.

```bash
evergreen drift .              # what the repository states, by runtime
evergreen drift . --check      # exit 1 when any runtime disagrees
evergreen drift . --runtime go --align 1.22   # print a patch; nothing is written
```

Drift reads repository files only. It never uses the network, never executes repository code or tools, and never writes a file. `--align` prints a unified diff for review; apply it yourself, for example with `git apply`.

A value is a **pin** when it selects the version that builds or runs the project, and a **floor** when it states a minimum the project supports. Floors are compared with the lowest pinned release: a floor above it is a conflict, because the environment the pin selects cannot satisfy the project.

Values that cannot be resolved offline are still reported, with the reason. Evergreen never guesses a release.

## Go

Release granularity is `1.minor`: `go1.22.4` and the image tag `1.22.4-alpine` both resolve to `1.22`. A `go` directive is a minimum since Go 1.21 ([Go toolchains](https://go.dev/doc/toolchain), [go directive](https://go.dev/ref/mod#go-mod-file-go)), so it is a floor; a `toolchain` line selects the toolchain that builds the module, so it is a pin.

| Source | Field | Kind |
| --- | --- | --- |
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
