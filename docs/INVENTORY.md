# Inventory

`evergreen inventory` reads the JSON or text exports that cloud and cluster tools already produce and reports what they say is deployed: end-of-life runtimes, images, engines, cluster versions, and operating systems. Each result carries the importer, the file, and the exact place in the file the claim rests on, as an RFC 6901 JSON Pointer.

Evergreen never calls a cloud or cluster API. You run the export command on a machine with credentials, then give the file to `evergreen inventory`:

```bash
kubectl get deploy,sts,ds,cronjob,job,pod -A -o json > workloads.json
evergreen inventory workloads.json
```

Every importer reads one export file and produces items. The output is deterministic: results sort by file and pointer. An affected item means a lifecycle rule applies to the version the export names; `no-data` means Evergreen has no rule for that PURL, never that the thing is safe. A file no importer recognizes is listed, the run exits `2`, and the files that were recognized are still reported.

## Privacy

`inventory` reads only the files named on the command line. It makes no network request, runs no command, and reads no other file. It never executes code or tools from the scanned export. Output names only the resource's own short name: `resource` is never an account id, ARN, subscription id, project number, IP address, node name, tag, or environment variable. `--redact` replaces each resource name with the first 12 hex characters of its SHA-256, in text and JSON output alike.

## Kubernetes workloads

### What it reads

Export a cluster's workload objects:

```bash
kubectl get deploy,sts,ds,cronjob,job,pod -A -o json > workloads.json
evergreen inventory workloads.json
```

The importer recognizes a Kubernetes `List` whose items each have `apiVersion`, `kind`, and `metadata`. A list of `Node` objects is left to the cluster importer. For every item it reads:

- `apiVersion` and `kind`, mapped to the Kubernetes lifecycle rules.
- `metadata.namespace` and `metadata.name`, which form `resource` as `<namespace>/<kind>/<name>`. Cluster-scoped objects have no namespace and use `cluster` instead.
- For `Pod`, `Deployment`, `StatefulSet`, `DaemonSet`, `ReplicaSet`, `Job`, and `CronJob`, every `containers[].image` and `initContainers[].image` in the pod template. For a `CronJob` that is `spec.jobTemplate.spec.template`.

Images are parsed with the same parser as the container detector. Identical image references are reported once per namespace and workload, at the first pointer where they appear. A label, annotation, environment variable, pod status, and `spec.nodeName` are never read.

### Rules matched

| Item | PURL | Registry |
| --- | --- | --- |
| Container image | `pkg:docker/<repository>`, for example `pkg:docker/library/node` | `registry/container.json` |
| API version | `pkg:generic/kubernetes/<group>/<Kind>`, for example `pkg:generic/kubernetes/networking.k8s.io/Ingress` | `registry/kubernetes.json` |

A Docker Hub image is written without the registry: `docker.io/library/node` is `pkg:docker/library/node`. Images from other registries are skipped, not reported, because no rule covers them yet and a private registry host can carry an account id.

An image tag is used as the version only when it is a plain release number: `node:18.19.0` is `18.19.0`, and `node:18` is `18.0.0`. Floating tags such as `latest`, `22-alpine`, or a digest with no tag name no version, so the item is reported as `version-dependent`, not guessed. An API version is translated to the rule's semver form by the same rule as the Kubernetes detector (decision 0008): `v1` is `1.0.0`, `v1beta1` is `1.0.0-beta.1`, and `v2beta2` is `2.0.0-beta.2`.

### Limit: the API server's preferred version

`kubectl get -o json` reports each object at a version the API server chooses to serve, not necessarily the version it was stored or applied at. An object created through a removed API can therefore appear at its replacement: an `Ingress` applied as `networking.k8s.io/v1beta1` is reported by a modern server as `networking.k8s.io/v1`. This importer can only judge the version the export names; it cannot infer an older stored version. Use a manifest scan to judge what the repository declares.

### What it does not judge

- Images from registries other than Docker Hub, including private registries and IP-address hosts: no rule covers them yet, so they are skipped rather than reported and no host, address, or account id reaches the output.
- Floating tags and digest-only references, whose release line the file does not name.
- The core API group (`apiVersion: v1`, such as `Pod`), which has no removed kinds in the Kubernetes migration guide.
- Objects and fields beyond the ones listed above.

The fixtures under `tests/fixtures/inventory/k8s-workloads/` reproduce the documented output shape of `kubectl get … -o json` (kubectl 1.31), with every identifier replaced by a placeholder. They were assembled from the command's output shape, not captured from a live cluster.

## Host operating systems

The `os-release` importer reads an `/etc/os-release` file from one host, or a bundle collected from several hosts, and reports the distribution release against its lifecycle rules.

### Export

One host:

```bash
ssh web-1 'cat /etc/os-release' > web-1.os-release
evergreen inventory web-1.os-release
```

Several hosts, in one file. Each block starts with `### host: <name>`; that name becomes the result's `resource`:

```bash
while read -r host; do
  printf '### host: %s\n' "$host"
  ssh "$host" 'cat /etc/os-release'
done < hosts.txt > os-release.bundle
evergreen inventory os-release.bundle
```

Evergreen runs neither loop; you run it, and Evergreen reads the result.

### Fields read

| Field | Use |
| --- | --- |
| `ID` | Names the distribution, and so the `pkg:generic/<distro>` rule set. |
| `VERSION_ID` | The release line the rules judge. The result's `pointer` is the `line:<n>` of this line in the file. |
| `ID_LIKE` | Read as the declared family. It is never used to apply a parent distribution's dates, because a derivative keeps its own release schedule. |

A block without both `ID` and a numeric `VERSION_ID` is skipped: a codename or a rolling tag such as `testing` does not name a release line the rules can judge. A single file with no host header uses its file name as the resource. Quoted values, such as `VERSION_ID="20.04"` and `ID='ubuntu'`, are read the same as unquoted ones.

### Rules matched

| Distribution (`ID`) | PURL | Release lines reported | Rule |
| --- | --- | --- | --- |
| `ubuntu` | `pkg:generic/ubuntu` | before 22.04 | `container.host-ubuntu.eol-22.04-and-older` |
| `debian` | `pkg:generic/debian` | before 12 | `container.host-debian.eol-11-and-older` |
| `rhel` | `pkg:generic/rhel` | 7 and older | `container.host-rhel.eol-7-and-older` |
| `centos` | `pkg:generic/centos` | 8 and older | `container.host-centos.eol-8-and-older` |
| `amzn` | `pkg:generic/amzn` | 2 and the 2018.03 AMI | `container.host-amazon-linux.eol-2-and-older` |
| `alpine` | `pkg:generic/alpine` | before 3.21 | `container.host-alpine.eol-3.20-and-older` |
| `sles` | `pkg:generic/sles` | 15 SP6 and older | `container.host-sles.eol-15-sp6-and-older` |

Every rule cites the distribution's own lifecycle page, not an aggregator. The rules live in `registry/container.json` next to the image rules, but use `pkg:generic/<distro>` PURLs and distribution sources: an image rule describes what a Docker tag ships, which is not the same question as what a host runs.

### What is not judged

- A file without `VERSION_ID` is skipped: a codename alone does not identify the release line for every distribution.
- A derivative reported under its own `ID` is checked only if that `ID` has a rule. `ID_LIKE` does not borrow the parent's dates. It is reported as `no-data`, not as safe.
- Paid add-on support is not treated as standard support. RHEL 7 Extended Life Cycle Support and SUSE Long Term Service Pack Support extend security fixes for a fee; the rules report that general support ended and name the add-on in the summary.
- A host with no readable `/etc/os-release` is not reported. Evergreen does not guess a distribution from other files.

### Fixtures

The fixtures under `tests/fixtures/inventory/os-release/` are the output of `cat /etc/os-release` on each distribution, with every identifier replaced by a placeholder. There is no CLI version to record: `cat` is part of the coreutils of each distribution.

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
