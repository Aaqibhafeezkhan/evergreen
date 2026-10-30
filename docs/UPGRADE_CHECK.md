# Upgrade check

`evergreen upgrade-check --to <runtime@version> [path]` answers, from files already in the repository, whether the project can move to that runtime. It names every blocker with the exact lockfile entry, manifest field, or lifecycle rule behind it. Agents get the same answer through the `check_upgrade` MCP tool.

```bash
evergreen upgrade-check --to nodejs@22
evergreen upgrade-check --to dart@3.5 . --json
```

The verdict is `blocked` when any blocker is reported, `unknown` when no analyzer applies to the target runtime, and `ready` otherwise. A scan reads repository files and bundled lifecycle data only: it never uses the network, never runs a package manager, and never executes repository code. The command exits `1` when the verdict is `blocked`, `0` for `ready` and `unknown`, and `2` for bad input.

Each issue carries the exact evidence value as written in the file, its path, and the 1-based line of the key it came from. Issues are sorted by level, then path, line, subject, and analyzer, so two runs on the same files print the same report.

## What it cannot know

- **Native addons built at install time.** A binding that compiles against the target runtime may fail for reasons no lockfile records.
- **Packages without declared support ranges.** A package that declares no engine or SDK bound is not evidence that it supports the target.
- **Code paths not visible in source.** A dynamic call, a generated file, or a capability resolved at runtime is not matched.
- **The runtime's behaviour.** A version bound says a package declares support; it does not prove the project works on the target. Evergreen suggests verification commands with a finding and never runs them.
- **Missing evidence.** When a file that would record a bound is absent, the answer is `unknown` for that check, never `ready` by assumption.
