# Upgrade readiness

`evergreen upgrade-check --to <runtime@version>` answers one question offline: can this repository move to that runtime release? It reads files already in the repository (lockfiles and manifests), never the network, and never runs the project's code or commands. Every issue names the analyzer, the exact evidence as written, the file, and the line.

```bash
evergreen upgrade-check --to nodejs@22
evergreen upgrade-check --to python@3.13 path/to/repository --json
```

The command exits `1` when the verdict is `blocked`, `0` for `ready` and `unknown`, and `2` for bad input. The same answer is available to agents through the `check_upgrade` MCP tool.

| Verdict | Meaning |
| --- | --- |
| `ready` | Every analyzer that applies ran and reported no blocker. Warnings and unknowns may still be present. |
| `blocked` | At least one analyzer reported a blocker. |
| `unknown` | No analyzer could read evidence for this runtime in this repository. The command prints: "Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe." |

## What it cannot know

- Native addons built at install time, and optional dependencies that are only resolved by a package manager at install time.
- Packages that declare no support range. Missing evidence is reported as `unknown` or not reported; it is never treated as support.
- Code paths that are not visible in the repository, such as a runtime upgraded in a deployment system that keeps its configuration elsewhere.
- The latest patch release of a runtime line. Lockfiles record ranges, not the release a machine will install.
- Whether a new version of a dependency fixes the problem. The check reports what the repository declares today.

## Analyzers

Each analyzer reads only the files listed, applies only to its runtime, and carries the exact value it read. A section that says "not available yet" describes work planned in the upgrade epic; it does not run in this release.

### npm lockfile

Not available yet in this release.

### pnpm lockfile

Runtime: `nodejs`. Applies when `pnpm-lock.yaml` exists with `lockfileVersion` 6.x or 9.x.

- Files read: `pnpm-lock.yaml`. In 6.x, `packages` entries carry `engines`, `dev`, and `devOptional`. In 9.x, `engines` lives under `packages`, while the dev flag is resolved from `importers` and `snapshots`.
- Fields read: `lockfileVersion`; for each `packages` entry, the key (`<name>@<version>`, with an optional leading `/` and an optional peer suffix) and `engines.node`; in 6.x, `dev` and `devOptional`; in 9.x, the `dependencies`, `optionalDependencies`, and `devDependencies` of every `importers` entry, and the `dependencies` and `optionalDependencies` of every `snapshots` entry.
- Version syntax: semver ranges in `engines.node`, tested with `semver.satisfies` and `includePrerelease: false`. A bare target major such as `22` is tested as `22.0.0`; the bundled lifecycle data does not list per-minor Node.js releases.
- Levels: `blocker` for a production dependency whose range excludes the target; `warning` for a dev dependency (`dev: true` or `devOptional: true` in 6.x, or reachable only from a dev dependency in 9.x); `unknown` for an `engines.node` value that is not a valid semver range.
- Evidence: `engines.node: <range as written>`, at the line of the `engines` key.
- Deduplication: identical name, version, and range across peer variants keep the first line.

### Node.js APIs removed in the target

Not available yet in this release.

### Poetry

Not available yet in this release.

### uv and PDM

Not available yet in this release.

### Python standard library

Not available yet in this release.

### Composer

Not available yet in this release.

### Dart and Flutter

Not available yet in this release.

### Go modules

Not available yet in this release.

### Target runtime lifecycle

Not available yet in this release.
