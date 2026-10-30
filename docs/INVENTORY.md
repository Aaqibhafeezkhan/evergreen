# Deployed inventory

What runs in production often drifts from what is in git: a Lambda created by hand, a cluster never upgraded, a database left on an old engine. `evergreen inventory <file>...` reads the exports that cloud, cluster, container, and host tools already produce, and reports end-of-life runtimes, engines, cluster versions, images, and operating systems that are running now.

Evergreen calls no provider API. You run the export command the provider documents, and Evergreen reads the file you produced. Every result names the exporter's exact place for the claim: an RFC 6901 JSON Pointer into a structured export, or `line:<n>` for a text export. The report is an `evergreen.inventory.v1` document with `--json`, and matches [`inventory.v1.schema.json`](../schemas/inventory.v1.schema.json).

An item whose PURL has no rule is reported as `no-data`. That means Evergreen has no reviewed lifecycle rule for it; it is not a statement that the resource is safe. Run `evergreen inventory <file>` with no `--fail-on` to inventory everything, and use `--fail-on` to gate a pipeline.

## Privacy

`inventory` reads only the files named on the command line. It makes no network request, runs no command, and reads no other file. It never calls a cloud, cluster, or registry API, and it does not resolve a host name. `--redact` replaces every resource name with the first 12 hex characters of its SHA-256 in text and JSON output, so a report can be shared without naming hosts, functions, or clusters. Importers keep account ids, ARNs, subscription ids, project numbers, and IP addresses out of every result.
