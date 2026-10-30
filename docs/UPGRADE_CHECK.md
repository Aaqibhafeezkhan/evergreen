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

## Dart and Flutter

Applies when `pubspec.lock` exists. Runtimes: `dart` and `flutter`.

| File | Field | What it means |
| --- | --- | --- |
| `pubspec.lock` | `sdks.dart` | The Dart SDK bound shared by every resolved package: the intersection of their individual bounds. |
| `pubspec.lock` | `sdks.flutter` | The Flutter SDK bound shared by every resolved package. |
| `pubspec.yaml` | `environment.sdk` | The Dart SDK bound the project itself declares. |
| `pubspec.yaml` | `environment.flutter` | The Flutter SDK bound the project itself declares. |

A `dart@x` target is checked against the Dart bounds and a `flutter@x` target against the Flutter bounds; the other runtime's bounds are not consulted. A target outside a `pubspec.lock` bound is a `blocker` with subject `resolved package set` and `kind: "lockfile"`: the resolved set would not install. A target outside a `pubspec.yaml` bound is a `blocker` with subject `environment.sdk` or `environment.flutter` and `kind: "manifest"`. When neither file records a bound for the target runtime, one `unknown` issue is reported; it names the absent `sdks` key as evidence.

A target with fewer than three components is checked as `x.0.0` or `x.y.0`, so `dart@3.5` is checked as `3.5.0`.

Version syntax: a constraint is `any` or one or more space-joined terms, each `^`, `>=`, `<=`, `>`, `<`, or a bare version followed by `x.y.z` and an optional pre-release or build suffix. Caret follows pub's rules: `^1.2.3` means `>=1.2.3 <2.0.0`, `^0.2.3` means `>=0.2.3 <0.3.0`, and `^0.0.3` means `>=0.0.3 <0.0.4`. A bound the parser cannot read (a template, `||` range, or missing components) is treated as missing evidence, so the answer is `unknown` rather than `ready`.

The parsers are the ones the Dart detector uses: `src/detectors/dart/parse-pubspec-lock.ts` and `parse-pubspec.ts`.

```bash
evergreen upgrade-check --to dart@3.5 examples/upgrade/dart-sdk
```

```text
blocked: dart@3.5 (1 blocker, 0 warnings, 0 unknown)
pubspec.lock:12  resolved package set  The resolved package set requires Dart >=3.6.0 <4.0.0, which excludes 3.5.0.  [lockfile >=3.6.0 <4.0.0]
```
