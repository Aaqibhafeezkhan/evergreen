# Lifecycle inventory

`evergreen inventory <file>...` reports the lifecycle of what is deployed, not only what is in git. It reads the JSON (or text) exports that cloud and cluster tools already produce, such as `docker inspect`, `kubectl get -o json`, `terraform show -json`, and `aws lambda list-functions`. Each result names the exact place in the export the claim rests on: an RFC 6901 JSON Pointer, or `line:<n>` for a text export.

Evergreen never calls a cloud API, a cluster API, or Docker. You run the export command; Evergreen reads the file. The command is offline, deterministic, and reads only the files named on the command line.

```bash
evergreen inventory deployed.json --fail-on high
evergreen inventory *.json --json
evergreen inventory export.json --format <importer-id> --redact
```

Exit codes: `2` when a file is unrecognized or unreadable (the other files are still reported), `1` when an affected result reaches `--fail-on` (default: the config's `failOn`, else `high`), and `0` otherwise. `--format auto` (the default) tries every importer; `--format <importer-id>` restricts the run to one. `--redact` replaces each resource name with the first 12 hex characters of its SHA-256. The JSON document conforms to [`schemas/inventory.v1.schema.json`](../schemas/inventory.v1.schema.json).

## Privacy

An importer reads only the document it is given. It makes no network request, runs no command, and reads no other file. An item carries the resource's own short name and the version value; it never carries account ids, ARNs, subscription ids, project numbers, IP addresses, environment variables, mounts, or tags. Fields an importer does not name are ignored, so credentials in an export never reach the report.
