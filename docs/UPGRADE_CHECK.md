# Upgrade check

`evergreen upgrade-check --to <runtime@version> [path] [--json]` answers, offline and from files already in the repository, whether a project can move to a target runtime. It lists each blocker, warning, and unknown with the exact lockfile or manifest entry behind it. Agents get the same answer through the `check_upgrade` MCP tool.

```bash
evergreen upgrade-check --to php@8.4 .
evergreen upgrade-check --to nodejs@22 . --json
```

The text output starts with the verdict, then one line per issue:

```text
php@8.4: blocked (1 blockers, 0 warnings, 0 unknown)
composer.lock:9  acme/http-client@2.1.0  acme/http-client@2.1.0 requires php ^7.4, which excludes PHP 8.4.  [lockfile: require.php: ^7.4]
```

The JSON output is an `evergreen.upgrade.v1` document that conforms to [`schemas/upgrade.v1.schema.json`](../schemas/upgrade.v1.schema.json). Exit codes: `1` when the verdict is `blocked`, `0` for `ready` and `unknown`, `2` for bad input.

An analyzer only runs when the repository has the files it reads. Each issue names its analyzer, its level (`blocker`, `warning`, or `unknown`), the affected subject, the path and line, and the evidence value exactly as written.

- `blocker`: the project will not install or run on the target.
- `warning`: it works but is deprecated on the target.
- `unknown`: the evidence needed to judge it is missing.

## What it cannot know

- **Native extensions and build-time requirements.** A package may fail to build on the target for reasons its metadata does not state.
- **Packages without declared support ranges.** If a package never declares which runtime it supports, the analyzer reports `unknown` or nothing, never `ready` by assumption.
- **Code paths outside the source.** Dynamic loading, `eval`, generated code, and behavior that only appears at runtime are not visible here.
- **Your CI images and operating system.** The runtime inside a container image or on a runner is not part of this check.
- **Unresolved dependencies.** When a lockfile does not record a support range for a package, no analyzer can judge that package.
- **Anything at install time.** Evergreen never runs a package manager, Compiler, or test suite, and no scan uses the network.

An `unknown` verdict means Evergreen found no evidence for that runtime in this repository. It is not a statement that the upgrade is safe.

## Composer

The Composer analyzer (`composer-lock`) runs for `php` targets when `composer.lock` exists.

**Files and fields**

- `composer.lock` `packages[*].require.php` — a `blocker`.
- `composer.lock` `packages-dev[*].require.php` — a `warning`.
- `composer.lock` top-level `platform.php` — a `blocker`. This is the platform requirement the lockfile was resolved against.
- `composer.lock` top-level `platform-overrides.php` — a `blocker`.
- `composer.json` `require.php` — a `blocker`, with evidence kind `manifest`.

Each issue carries the constraint exactly as written (for example `^7.4` or `>=8.1 <8.5`) and the line of the field it came from. Package subjects are `<name>@<version>`; platform subjects are `platform.php` and `platform-overrides.php`; the project's own constraint uses the subject `composer.json`.

**Version syntax**

The matcher understands Composer's constraint syntax:

- caret ranges: `^1.2.3`, `^0.3`, `^0.0.3`
- tilde ranges: `~1.2`, `~8.4.0`
- comparisons: `>=`, `>`, `<=`, `<`, `!=`, `<>`, `==`, `=`
- wildcards: `*`, `1.*`, `1.0.x`
- hyphen ranges: `1.0 - 2.0`
- OR: `||` and `|`
- AND: space- or comma-joined terms, such as `>=8.1 <8.5` or `>=8.1, <8.5`
- pre-release suffixes: `8.4.0RC1`, `8.4.0-beta1`

A target written as a release line (`8.4`) is tested as both `8.4.0` and `8.4.99`, so an upper bound written as `<8.5` is not mistaken for a blocker. A target written with three or more parts (`8.4.0`) is tested as written.

**What it reports as `unknown`**

- A `require.php` value that is not a constraint this matcher understands, such as a truncated OR (`^8.4 ||`) or a value containing an unevaluated `${...}` expression.

A missing `require.php`, a `*` constraint, or a constraint that includes the target produces no issue. Composer itself is never run, and the lockfile is parsed as untrusted JSON.

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
