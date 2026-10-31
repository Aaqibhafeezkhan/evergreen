# Runtime drift

`evergreen drift` reports every place a repository states a runtime version: Dockerfiles, CI configuration, version files, manifests, and toolchain files. Each value is listed with its exact file, line, source, and the release line it resolves to offline. When the values disagree, the runtime is marked `DRIFT`; when a minimum the project requires is above the version that builds it, the value is listed as a floor conflict.

```bash
evergreen drift .              # what the repository states, by runtime
evergreen drift . --check      # exit 1 when any runtime disagrees
evergreen drift . --runtime rust --align 1.82   # print a patch; nothing is written
```

Drift reads repository files only. It never uses the network, never executes repository code or tools, and never writes a file. `--align` prints a unified diff for review; apply it yourself, for example with `git apply`.

A value is a **pin** when it selects the version that builds or runs the project, and a **floor** when it states a minimum the project supports. Floors are compared with the lowest pinned release: a floor above it is a conflict, because the environment the pin selects cannot satisfy the project.

Values that cannot be resolved offline are still reported, with the reason. Evergreen never guesses a release.
