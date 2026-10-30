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
