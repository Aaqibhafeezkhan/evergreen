# Runtime drift

`evergreen drift` finds every place a repository states a runtime version and reports, per runtime, whether those values agree. A repository that runs Node 18 in its Dockerfile, Node 20 in CI, and Node 22 in `.nvmrc` has a drift, even when every test passes on the version the developer uses. The command reads repository files only: scans never use the network and never execute repository code.

```bash
evergreen drift .                    # text report
evergreen drift . --json             # https://github.com/arminazimi/evergreen/schemas/drift.v1.schema.json
evergreen drift . --check            # exit 1 when a runtime drifts or has a floor conflict
evergreen drift . --runtime java --align 21   # print a patch; never write it
```

`--json` prints an `evergreen.drift.v1` document. Every pin carries its repository-relative path, the 1-based line of the value, the source it came from, the value exactly as written, and the release it resolves to offline. A value that cannot be resolved offline keeps its place in the report with an `unresolved` reason instead of a guessed release.

`--align <release>` prints a unified diff for the pins of one runtime that can be rewritten safely, and lists the refused pins on stderr. Evergreen never writes the patch.

## Java

Java releases are compared at the feature-release major: `17`, `21`, `25`. A legacy `1.8` resolves to `8`; a vendor prefix (`temurin-`) or suffix (`-tem`) is ignored. The vendor never changes support status.

| File | Fields read |
| --- | --- |
| `pom.xml` | `maven.compiler.release`, `maven.compiler.source`, `maven.compiler.target`, and `java.version` properties; `release`, `source`, and `target` in `maven-compiler-plugin` configuration, including `pluginManagement`. |
| `build.gradle`, `build.gradle.kts` | `java.toolchain.languageVersion` (`.set(...)` or `=`), `jvmToolchain(N)`, `sourceCompatibility`, and `targetCompatibility`, as literal values only. |
| `.java-version` | The first non-comment line. |
| `.sdkmanrc` | The `java=` entry. |
| `.tool-versions` | The first version of the `java` entry. |
| `Dockerfile`, `*.Dockerfile`, `Containerfile*` | `FROM` images of the `eclipse-temurin`, `openjdk`, and `amazoncorretto` families; `maven` and `gradle` tags that name a JDK, such as `3.9-eclipse-temurin-17` or `8.10-jdk21`; and `sdk install java` or `asdf install java` `RUN` lines. |
| `.github/workflows/*.yml` | The `java-version` input of `actions/setup-java`. A `${{ matrix.<key> }}` value is followed to the matrix list in the same job. |
| `.gitlab-ci.yml`, `.circleci/config.yml` | `image` references of the same JDK and build-image families. |

Every one of these is a `pin`: the JDK that builds or runs the project. There is no Java floor source in this collector.

Reported as unresolved, never guessed:

- a Maven property reference such as `${java.version}`;
- a Gradle expression such as `JavaVersion.toVersion(libs.versions.java.get())`;
- a matrix or other workflow expression that does not resolve to a literal;
- `latest`, `lts`, `system`, or another floating version-file value;
- an image with no tag, a floating tag, or an image reference containing a variable.

`--align` rewrites only values it can select a release with:

- Maven compiler properties and `maven-compiler-plugin` settings whose text is a literal version;
- `.java-version`, `.sdkmanrc`, and `.tool-versions` entries with a literal version;
- an image tag that is a plain major, such as `eclipse-temurin:17`, or the JDK segment of a Maven or Gradle tag, such as `3.9-eclipse-temurin-17`;
- a single scalar `java-version` in `actions/setup-java`.

It refuses Gradle toolchain and compatibility settings, `Dockerfile RUN` installs, property references, floating tags, matrix values, and image tags with a digest or a non-major suffix.
