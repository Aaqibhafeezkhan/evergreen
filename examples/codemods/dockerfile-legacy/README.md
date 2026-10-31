# Dockerfile legacy syntax codemod

`before.Dockerfile` uses the deprecated `MAINTAINER` instruction and the legacy space-separated `ENV key value` form. `after.Dockerfile` is what `evergreen fix` plans for it.

```bash
evergreen scan examples/codemods/dockerfile-legacy
evergreen fix --dry-run examples/codemods/dockerfile-legacy
```

The patch is printed as a diff. Nothing is written unless `fix --branch` is used.
