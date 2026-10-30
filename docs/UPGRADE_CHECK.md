# Upgrade check

`evergreen upgrade-check --to <runtime@version>` answers whether a project can move to a target runtime release from files already in the repository. It reads lockfiles, manifests, runtime pins, and source code, and it never installs, builds, or runs anything in the scanned project.

```bash
evergreen upgrade-check --to nodejs@22
evergreen upgrade-check --to python@3.13 path/to/project --json
```

The report is `evergreen.upgrade.v1`. Each issue names the analyzer that reported it, a level, the affected subject, the exact path and line, a one-sentence reason, and the evidence: a lockfile or manifest value as written, or the lifecycle rule id.

## Verdicts

| Verdict | Meaning |
| --- | --- |
| `blocked` | At least one issue is a blocker: the project will not install or run on the target. |
| `ready` | At least one analyzer applied and no blocker was found. Warnings may still be listed. |
| `unknown` | No analyzer found evidence for this runtime in this repository. This is not a statement that the upgrade is safe. |

## Levels

| Level | Meaning |
| --- | --- |
| `blocker` | The project will not install or run on the target. |
| `warning` | The project works on the target but uses something deprecated there. |
| `unknown` | The evidence needed to judge an item is missing. |

## Exit codes

`0` for `ready` and `unknown`, `1` for `blocked`, and `2` for bad input.

## What it cannot know

- Native addons and other packages built at install time from the machine's toolchain.
- Packages that do not declare a support range in their published metadata.
- Code paths that are not visible in the repository, such as plugins loaded at runtime or generated code that is not committed.
- Whether an upgrade is safe overall. A `ready` verdict means no analyzer found a blocker in the evidence it can read; it is not a guarantee.

## Analyzers

Each section below lists the files and fields an analyzer reads, the version syntax it understands, and what it reports as `unknown`.
