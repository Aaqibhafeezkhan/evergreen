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

## Poetry (`poetry.lock`)

Applies when `poetry.lock` exists. Runtime: `python`.

Files and fields it reads:

- Every `[[package]]` entry in `poetry.lock`: `name`, `version`, `python-versions`, and `category` (Poetry 1.1) or `groups` (later Poetry versions). Both group forms are handled.
- The project's own `[tool.poetry.dependencies]` `python` constraint in `pyproject.toml`, as a string or as a table with `version`.

Version syntax it understands: PEP 440 specifiers `>=`, `<=`, `<`, `>`, `==` (including `.*`), `!=`, and `~=`, joined with commas for AND; Poetry's `^` (caret), `~` (tilde), and `||` (OR) forms; and `*`, which matches every version. Comparisons follow PEP 440 ordering, including pre-releases, post-releases, development releases, and epochs.

What it reports:

- `blocker` for a main-group package whose `python-versions` excludes the target release, and for a project-level `python` constraint that excludes it.
- `warning` for a package in the `dev` or any other non-main group whose `python-versions` excludes the target.
- `unknown` for a `python-versions` value or project constraint the matcher cannot parse.

Evidence is the value as written: `python-versions: <value>` with `kind: "lockfile"` at that field's line, or `python: <value>` with `kind: "manifest"` at the `python` line in `pyproject.toml`. The subject is `<name>@<version>`, or `python` for the project constraint.

Example:

```text
blocked
poetry.lock:12  requests@2.28.0  requests@2.28.0 declares python-versions ">=3.7,<3.11", which excludes Python 3.13.  [lockfile: python-versions: >=3.7,<3.11]
pyproject.toml:9  python  The project's [tool.poetry.dependencies] python constraint ">=3.8,<3.12" excludes Python 3.13.  [manifest: python: >=3.8,<3.12]
```

