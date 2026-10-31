# Runtime drift

`evergreen drift` finds every place a repository states a runtime version — version files, manifests, container images, and CI configuration — and reports, with exact locations, when the values disagree. A Dockerfile on Node.js 18, CI on 20, and `.nvmrc` on 22 is one line of output instead of three files to compare by hand.

Every command in this page reads repository files only. Drift checks never run a runtime, execute a repository's tools, or use the network. `--align` prints a patch and never writes it.

```bash
evergreen drift . --check
evergreen drift . --runtime ruby --json
evergreen drift . --runtime ruby --align 3.4
```

## How to read the report

Each runtime block lists every value with its `path:line`, the file or field it came from, the value as written, and the release line it resolves to. A value that cannot be resolved offline is reported too, with the reason. When the `pin` values select more than one release, the block says `DRIFT`. A `floor` is a minimum the project supports; when a floor is above the lowest pinned release, the block says `FLOOR CONFLICT`.

`--check` exits `1` when any runtime drifted or has a floor conflict. `--align <release>` requires `--runtime`, prints a unified diff for the pins it can rewrite, lists refused pins on stderr, and never writes a file. It refuses floors and ranges, and each collector documents the files it can rewrite.

## Adding a collector

One collector per runtime lives in `src/drift/<runtime>.ts`, reuses the parsers the detectors already have, and is registered once in `driftCollectors` in `src/drift/index.ts`. Each section below names the sources it reads, its release granularity, what it refuses to resolve, and which file it can align.

## Ruby

Reads, at any depth:

- `.ruby-version`, including the rbenv `ruby-3.3.1` and `3.3.1p123` forms.
- `.tool-versions` `ruby` lines, including several fallback versions.
- `Gemfile`: an exact `ruby "3.3.0"` is a pin; a literal requirement such as `ruby ">= 3.1.0"` or `ruby "~> 3.2"` is a floor.
- `Gemfile.lock` `RUBY VERSION`.
- `*.gemspec`: a literal `required_ruby_version`, such as `">= 3.1.0"` or `"~> 3.2"`, as a floor.
- `Dockerfile*` and `Containerfile*`: `FROM ruby:<tag>` and a literal `RUN asdf install ruby <version>`.
- `.github/workflows/*.yml`: the `ruby-version` input of `ruby/setup-ruby`.
- `.gitlab-ci.yml` `image:` values and `.circleci/config.yml` `docker:` images for the official `ruby` and `cimg/ruby` images.

Release granularity is `major.minor` (`3.3`).

Unresolved values are reported with the reason and excluded from the drift comparison: `system`, `latest`, an image without a tag, a moving image tag, a `${{ matrix.* }}` expression, and a requirement that states no minimum.

`align <release>` rewrites `.ruby-version`, a single-value `.tool-versions` ruby line, an exact `Gemfile` `ruby` directive, a `ruby/setup-ruby` `ruby-version` input, and the tag of a Dockerfile, GitLab CI, or CircleCI image. It refuses floors, ranges, image digests, and multi-value lines. `Gemfile.lock` is reported and refused with "regenerate the lockfile": Bundler owns that file.
