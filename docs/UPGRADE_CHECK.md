# Upgrade readiness

`evergreen upgrade-check --to <runtime@version> [path]` answers, offline, whether a repository can move to a runtime release. It reads files already in the repository and the lifecycle data bundled with the release: it never uses the network, installs nothing, and runs no project command. Agents get the same answer from the `check_upgrade` MCP tool.

The output is an `evergreen.upgrade.v1` document ([`schemas/upgrade.v1.schema.json`](../schemas/upgrade.v1.schema.json)). Each issue names the analyzer, a level (`blocker`, `warning`, or `unknown`), the subject, the file and line, one sentence, and the exact evidence value as written in the file.

| Verdict | Meaning |
| --- | --- |
| `blocked` | At least one analyzer found a blocker. |
| `ready` | At least one analyzer applied and none found a blocker. Warnings and unknowns may still be listed. |
| `unknown` | No analyzer found evidence for this runtime in this repository. The command always prints: “Evergreen found no evidence for this runtime in this repository. This is not a statement that the upgrade is safe.” |

## What it cannot know

- Native addons or extensions built at install time against the runtime.
- Packages that do not declare a support range.
- Code paths that are not visible in the repository, such as generated code or services deployed elsewhere.
- Lockfiles that do not record support ranges (for example `yarn.lock` and `Cargo.lock`).
- Anything that requires installing, resolving, or executing repository code.

When the evidence is missing, an analyzer reports `unknown` or nothing. It never assumes a version is supported because a newer one exists or because a package is popular.

