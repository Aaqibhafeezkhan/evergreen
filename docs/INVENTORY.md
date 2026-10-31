# Lifecycle inventory

`evergreen inventory <file>...` reports the lifecycle of what is deployed, not only what is in git. It reads the JSON (or text) exports that cloud and cluster tools already produce, such as `docker inspect`, `kubectl get -o json`, `terraform show -json`, and `aws lambda list-functions`. Each result names the exact place in the export the claim rests on: an RFC 6901 JSON Pointer, or `line:<n>` for a text export.

Evergreen never calls a cloud API, a cluster API, or Docker. You run the export command; Evergreen reads the file. The command is offline, deterministic, and reads only the files named on the command line.

```bash
evergreen inventory docker-inspect.json --fail-on high
evergreen inventory *.json --json
evergreen inventory docker-compose-ps.json --format docker --redact
```

Exit codes: `2` when a file is unrecognized or unreadable (the other files are still reported), `1` when an affected result reaches `--fail-on` (default: the config's `failOn`, else `high`), and `0` otherwise. `--format auto` (the default) tries every importer; `--format <importer-id>` restricts the run to one. `--redact` replaces each resource name with the first 12 hex characters of its SHA-256. The JSON document conforms to [`schemas/inventory.v1.schema.json`](../schemas/inventory.v1.schema.json).

## Privacy

An importer reads only the document it is given. It makes no network request, runs no command, and reads no other file. An item carries the resource's own short name and the version value; it never carries account ids, ARNs, subscription ids, project numbers, IP addresses, environment variables, mounts, or tags. Fields an importer does not name are ignored, so credentials in an export never reach the report.

## Docker containers and images

Produce the exports with the Docker CLI. Both forms are supported:

```bash
# running and stopped containers, including labels and state
docker inspect $(docker ps -aq) > docker-inspect.json

# a Compose project: a JSON array, or one JSON object per line
docker compose ps --format json > docker-compose-ps.json
```

The fixtures under [`tests/fixtures/inventory/docker/`](../tests/fixtures/inventory/docker/) follow the output of Docker CLI 29.6.2 (`docker inspect`) and Docker Compose v2 (`docker compose ps --format json`), with ids, names, and image tags replaced. The example [`examples/inventory/docker-inspect.json`](../examples/inventory/docker-inspect.json) is the same shape.

### What is read

| Format | Fields | Pointer |
| --- | --- | --- |
| `docker inspect` | `Name`, `Config.Image` | `/i/Name`, `/i/Config/Image` |
| `docker inspect` | `Config.Labels["org.opencontainers.image.base.name"]` | `/i/Config/Labels/org.opencontainers.image.base.name` |
| `docker inspect` | `Config.Labels["org.opencontainers.image.version"]` | `/i/Config/Labels/org.opencontainers.image.version` |
| `docker compose ps` | `Service`, `Image` | `/i/Service`, `/i/Image` |

`i` is the entry's index in the JSON array, or the zero-based line for line-delimited Compose output. Nothing else is read: `Env`, `Mounts`, `NetworkSettings`, `Ports`, and `Labels` beyond the two OCI labels above never appear in the report.

`resource` is the container name without the leading `/`, or the Compose service name. The image reference is parsed with the same parser the container detector uses ([`src/detectors/container/parse-image.ts`](../src/detectors/container/parse-image.ts)); interpolated values (`${IMAGE}`) and invalid references are skipped, never guessed.

### Rules matched

Images map to Docker PURLs, `pkg:docker/<repository>`, and are checked against [`registry/container.json`](../registry/container.json). For example, `node:18-alpine` becomes `pkg:docker/library/node` at version `18-alpine`, and `redis:6.0` becomes `pkg:docker/library/redis` at `6.0`. A tag that names a release line is the version; a floating tag such as `latest` or a digest-only reference has no version, so a range rule reports `version-dependent` instead of guessing.

Images from a registry other than Docker Hub keep the registry as the PURL namespace, for example `pkg:docker/ghcr.io/acme/app`. No Docker Hub rule matches those PURLs, so they are reported as `no-data`.

The two OCI labels add items when present: `org.opencontainers.image.base.name` is the base image, and `org.opencontainers.image.version` is the image's own version. Both are checked against the same rules, with the container name as their resource.

### Image ids

When `Config.Image` is a bare image id (`sha256:…`), Evergreen does not resolve it to an image. The container is reported with the PURL `pkg:docker/image-id` and the id as its version, which yields `no-data`: there is no lifecycle rule for an unresolved id. Run `docker inspect --format '{{.Config.Image}}' <container>` with a name instead when you need the image.

### What is not judged

- The operating system and runtimes *inside* an image: export or unpack the root filesystem and run `evergreen scan` on it.
- Images on registries other than Docker Hub, and Microsoft .NET images on `mcr.microsoft.com`: no rule is applied.
- Environment variables, mounts, published ports, and network settings: never read or reported.
- Whether a container is running: stopped containers are reported the same way.
