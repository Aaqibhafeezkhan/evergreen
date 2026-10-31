# Codemods

`evergreen fix` plans deterministic repairs for findings whose change is mechanical, and prints them as unified diffs that `git apply` accepts. It never writes a file or runs a command. A codemod applies only while the text it rewrites still matches the finding, and every finding it declines is reported as a refusal with the reason.

```bash
evergreen fix --dry-run            # print the patches
evergreen fix --branch <name>      # apply them on a local branch and re-scan
```

## Dockerfile legacy syntax

Rules `container.dockerfile.maintainer` and `container.dockerfile.legacy-env-format` are repaired by the `dockerfile-legacy` fixer.

| Before | After |
| --- | --- |
| `MAINTAINER Evergreen Team <team@example.com>` | `LABEL org.opencontainers.image.authors="Evergreen Team <team@example.com>"` |
| `ENV APP_HOME /opt/app` | `ENV APP_HOME="/opt/app"` |

The fixer leaves an instruction alone and reports why when the value contains a double quote or a backslash, when the instruction continues on another line, when the value contains a heredoc, and when the instruction sits inside an `ONBUILD` trigger. An `ENV key=value` assignment is already in the supported form and is not reported.

A worked example lives in [`examples/codemods/dockerfile-legacy`](../examples/codemods/dockerfile-legacy).
