# Upgrade checks

`evergreen upgrade-check --to <runtime@version> [path]` answers, offline and from files already in the repository, whether the project can move to a target runtime release. It lists each blocker with the exact lockfile entry, manifest field, or lifecycle rule behind it, so a person or an agent can check the claim instead of trusting a verdict.

```bash
evergreen upgrade-check --to nodejs@22
evergreen upgrade-check --to go@1.23 ./service --json
```

The same answer is available to agents through the `check_upgrade` MCP tool.

- `blocker`: the project will not install or run on the target as it is.
- `warning`: the project works on the target, but the target itself is deprecated or end-of-life.
- `unknown`: the evidence needed to judge is missing. It is never a statement that the upgrade is safe.

Exit codes are `1` when a blocker exists, `0` for `ready` and `unknown`, and `2` for bad input.

## What it cannot know

- Code paths that are not visible in the repository: generated sources, code fetched at build time, and private forks.
- Native addons and binaries that are built or downloaded at install time; their runtime requirements are not in a manifest or lockfile.
- Packages that declare no support range. A missing range is reported as `unknown`, never assumed to be compatible.
- What a test suite would catch. Evergreen reads declarations; it never installs, builds, or runs the project, and it never uses the network.
- A target that is newer than every lifecycle rule bundled with this release. It gets no lifecycle warning because no rule covers it, not because it is supported forever.

## Go modules and vendored requirements

Analyzer id `go-modules`; runtime `go`. It applies when the repository root has a `go.mod`.

**Files and fields it reads**

- `go.mod`: the `go` directive and its line.
- `go.work`: the `go` directive and its line, when the workspace file is in the repository root.
- `vendor/modules.txt`: every `# <module> <version>` header and the `## explicit; go <version>` (or `## go <version>`) annotation that follows it. Package lines are ignored.
- The bundled `registry/go.json` rules for `pkg:generic/golang`.

**Version syntax it understands**

Release numbers as Go writes them: `1.23`, `1.23.0`, and a leading `go` (`go1.23.0`) are accepted and compared part by part. A target that is not a release number, such as `nightly`, is reported as `unknown`; it is never compared.

**What it reports**

- `blocker`, `manifest`: the target is below the `go` directive of `go.mod` or `go.work`. Since Go 1.21 the `go` line is a required minimum, not advice: a Go toolchain refuses a module that declares a newer Go version. The evidence is the directive value as written, at its line.
- `blocker`, `lockfile`: the target is below the `go` version `go mod vendor` recorded for a dependency in `vendor/modules.txt`. The subject is `<module>@<version>` and the evidence is the annotation line exactly as written.
- `warning`, `rule`: the target itself matches a bundled lifecycle rule for Go, so it is deprecated or end-of-support. The evidence is the rule id.
- `unknown`: `vendor/modules.txt` is absent, or records no `go` version. Dependencies' Go requirements are not in the repository without vendoring, so Evergreen reports `unknown` for them instead of assuming they are compatible. It does not run `go mod tidy` or any Go command to find out.

**Sources**

- [Go Modules Reference: `go` directive](https://go.dev/ref/mod#go-mod-file-go): the `go` line is a minimum required Go version since Go 1.21, and must be greater than or equal to the `go` line of every dependency.
- [Go Modules Reference: `go.work` files](https://go.dev/ref/mod#go-work-file-go): the workspace `go` directive names the toolchain version the workspace is written for.
- [Go Modules Reference: vendoring](https://go.dev/ref/mod#vendoring): `go mod vendor` writes `vendor/modules.txt` and records the `go` version from each dependency's `go.mod` since Go 1.17.
- [Go toolchains](https://go.dev/doc/toolchain): how the `go` directive selects a toolchain.
