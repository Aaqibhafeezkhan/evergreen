# Drift

`evergreen drift` reads every place a repository states a runtime version and reports, with exact file and line, when those values select different release lines. A repository with Python 3.10 in `.python-version`, 3.11 in its Dockerfile, and 3.12 in CI has drift: tests pass on one version while production runs another.

Scans read repository files and nothing else. No drift path uses the network, runs a command, or evaluates repository code, and `--align` prints patches instead of writing files.

```bash
evergreen drift [path] [--json] [--check] [--runtime <id>] [--align <release>]
```

- `--check` exits `1` when any runtime has drifted or has a floor conflict.
- `--json` prints the `evergreen.drift.v1` document described by [`schemas/drift.v1.schema.json`](../schemas/drift.v1.schema.json).
- `--runtime <id>` limits the report to one runtime.
- `--align <release>` requires `--runtime`, and prints a unified diff that rewrites the pins it understands to `release`. It lists pins it refuses on stderr.

Each runtime is reported as its own block. Every pin carries its location, the source it came from, the value as written, and the release line the value selects offline. A value that cannot be resolved carries the reason instead of a guess. A `floor` is a minimum the project supports, not the version that builds it; a floor above the lowest pin is reported as a floor conflict.

Release granularity differs by runtime. Each section below states the granularity it reports and the values it leaves unresolved.

## .NET

.NET pins are reported at `major.minor` granularity: the SDK `8.0.204`, the image tag `8.0-alpine`, and the moniker `net8.0` all select `8.0`.

`netstandard*` and `netcoreapp` below 5 resolve to their own names (`netstandard2.0`, `netcoreapp3.1`) and are not compared with `netX.Y` releases. .NET Framework monikers such as `net48` are reported as unresolved.

**Pins**

| Source | Field | Align |
| --- | --- | --- |
| `global.json` | `sdk.version`, wherever the file appears | yes, keeping `rollForward` |
| `*.csproj`, `*.fsproj`, `*.vbproj` | a single `TargetFramework` in a `PropertyGroup` | yes |
| `Directory.Build.props` | a single `TargetFramework` | yes |
| `Dockerfile`, `*.Dockerfile`, `Containerfile` | `FROM mcr.microsoft.com/dotnet/{sdk,aspnet,runtime,runtime-deps}:<tag>`, including legacy `dotnet/core/*` images and `--platform` | yes |
| GitHub Actions | `actions/setup-dotnet` `dotnet-version`, one pin per line of a multi-line value | single value only |
| `.gitlab-ci.yml` | `image` and service values that name a Microsoft .NET image | no |
| `.circleci/config.yml` | job and executor `docker`/`machine` image values that name a Microsoft .NET image | no |
| `azure-pipelines.yml` | `container` and `resources.containers[].image` values that name a Microsoft .NET image | no |

A Microsoft .NET image is `mcr.microsoft.com/dotnet/sdk`, `aspnet`, `runtime`, or `runtime-deps`, or the legacy `dotnet/core/*` equivalents. Image tags keep their suffix: `8.0-alpine` selects `8.0`.

**Multi-targeting**

`<TargetFrameworks>` with several entries is intentional multi-targeting. Each entry is reported as a pin with source `TargetFrameworks`, the entries share one group, and they are not counted against each other. A source outside the list still counts: `TargetFrameworks` of `net6.0;net8.0` agrees with a Dockerfile that selects `8.0`, but drifts when the Dockerfile selects `9.0`. `--align` refuses the multi-targeting form.

**Unresolved**

A .NET Framework moniker, an MSBuild property reference such as `$(Tfm)`, a version with no minor (`8`, `latest`), a dynamic image reference, an expression, an image with no tag, and any value Evergreen does not read are reported as pins with a one-sentence reason and no release. A value is never guessed from a newer version existing.

**Align**

`--align` rewrites `global.json` `sdk.version` (keeping `rollForward`), a single `TargetFramework`, `FROM` tags that preserve the image suffix, and a single-value `setup-dotnet` `dotnet-version`. It refuses `TargetFrameworks`, MSBuild property references, .NET Framework monikers, CI image references, and any line whose form it does not recognize.
