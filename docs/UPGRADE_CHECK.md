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

### Python standard library

Applies when the repository has at least one Python source file.

- **Reads:** every `.py` file the usage analysis reads (the same traversal as a scan: `.git`, virtual environments, build output, and dependency directories are skipped, as are files over 1 MB) and the module-import and symbol rules in `registry/python.json` whose package URL is `pkg:generic/python`.
- **Version syntax:** PEP 440 ranges from the rule's `vers`, compared with the target release, as in `python@3.13`.
- **Reports:** every `import module` and `from module import name` of a module removed by the target, and every use of a removed or deprecated function that the symbol rules describe. A `removed` rule whose range includes the target is a blocker; a `deprecated` rule whose range includes the target is a warning. Each issue is one usage location; the subject is the module or symbol and the evidence is the rule id.
- **`unknown`:** this analyzer reports none. A rule whose range does not include the target, or a target release the PEP 440 comparison cannot read, produces no issue.

