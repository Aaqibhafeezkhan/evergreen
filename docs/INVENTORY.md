# Inventory: judge what is deployed

`evergreen inventory <file>...` reads the JSON exports cloud and cluster tools already produce — `gcloud … --format=json`, `kubectl get -o json`, `terraform show -json`, `docker inspect`, and so on — and reports end-of-life runtimes, images, and cluster versions that are running now. Every result names the export file and the [JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) to the value the claim rests on, so you can open the export and see the evidence yourself.

The command is offline by design. Evergreen never calls a provider API, never stores credentials, and never runs a command: you run the export, and Evergreen reads the file. A resource whose PURL has no rule is reported as `no-data`, which is not a statement that the resource is safe.

The report is `evergreen.inventory.v1` (`schemas/inventory.v1.schema.json`). Results are sorted by file and pointer so two runs over the same exports print the same report.

## Privacy

Inventory output names resources only, by the short name each provider gives them: a function name, a service name, a cluster name. It never prints project ids or numbers, account ids, subscription ids, service-account addresses, ARNs, URLs, IP addresses, environment variables, or tags. Two resources with the same short name in different projects are indistinguishable in the report on purpose.

`--redact` replaces every resource name with the first 12 hex characters of its SHA-256, in text and JSON output. The rest of the report — status, rule, version, pointer — is unchanged.

Scans of this kind read only the files given on the command line. Nothing in `inventory` imports `node:child_process`, `node:http`, `node:https`, or `node:net`, and nothing calls `fetch`.

## Importers

Each importer recognizes one export format, skips shapes it does not understand rather than guessing, and maps resources to version-less Package URLs the lifecycle registry is written against.

### Google Cloud

```bash
gcloud functions list --format=json > functions.json
gcloud app versions list --format=json > app-engine-versions.json
gcloud container clusters list --format=json > gke-clusters.json
gcloud run services list --format=json > cloud-run-services.json
evergreen inventory functions.json app-engine-versions.json gke-clusters.json cloud-run-services.json
```

**Fields read**

| Export | Fields | PURL |
| --- | --- | --- |
| `gcloud functions list --format=json` | `name`, `runtime` (1st gen) or `buildConfig.runtime` (2nd gen) | `pkg:generic/google-cloud-functions-runtime/<runtime>` |
| `gcloud app versions list --format=json` | `name`, `runtime` | `pkg:generic/google-appengine-runtime/<runtime>` |
| `gcloud container clusters list --format=json` | `name`, `currentMasterVersion`, `currentNodeVersion` | `pkg:generic/google-gke` |
| `gcloud run services list --format=json` | `metadata.name`, `spec.template.spec.containers[].image` | `pkg:docker/library/<image>` |

`name` supplies the resource: the last path segment, never the project id or number. A Cloud Functions or App Engine runtime item reports the runtime as part of PURL, so the pointer marks the exact field the runtime was read from. A GKE cluster produces one item for the control-plane version and, when it differs, one for the node version; `releaseChannel` does not change the verdict, because the rules state both the end of standard support and the end of extended support.

Cloud Run has no managed language runtime. The importer reads only container images and only those that name a public Docker Hub base image (`node:20`, `python:3.12-slim`, or `library/node:20`): an image with a registry host or a namespace (`gcr.io/…`, `us-docker.pkg.dev/…`, `bitnami/node`) is skipped, as is an image with no tag, a digest-only reference, or a tag that does not start with a digit. A short image name maps to `pkg:docker/library/<name>` with the tag as the version.

**Rules matched**

- `registry/serverless.json`: Google Cloud Functions and App Engine runtime rules, sourced to Google's runtime support schedules.
- `registry/kubernetes.json`: GKE minor-version rules, sourced to the GKE release schedule.
- `registry/container.json`: base-image rules for Cloud Run images.

**What is not judged**

- Runtime *generations* and stack images (`google-22`, `google-24-full`); only the runtime ID is checked.
- Operating-system packages inside a function or container image.
- Image digests, private images, and image names that are not public base images.
- Anything not written literally in the export: a reference, a variable, or a value the export does not include is not resolved.

**Fixtures**

`tests/fixtures/inventory/gcp/` holds one sanitized sample per document type, and `examples/inventory/` holds the two exports the README uses. They were produced by the commands above and then reduced to the fields this importer reads, with every project id, number, service account, URL, and environment value replaced by a placeholder. They were not captured from a live Google Cloud project; the shapes follow the documented output of `gcloud` JSON formatting.
