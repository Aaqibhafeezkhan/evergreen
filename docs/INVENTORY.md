# Inventory

`evergreen inventory <file>...` reads exported cloud and cluster state and reports the objects that run an engine, runtime, cluster version, image, or operating system that has reached, or will reach, the end of its support. Every result names the exact JSON Pointer in the file the claim rests on. The command reads only the files you pass to it.

```bash
evergreen inventory example-export.json
evergreen inventory one.json two.json --json
evergreen inventory cache-clusters.json --format aws-rds --fail-on high
```

Evergreen never calls AWS, Google Cloud, Azure, Kubernetes, or Docker, and it never runs an export command for you. You run the provider's read-only export, and Evergreen reads the file offline. Files that no importer recognizes, and files that cannot be read, are listed and make the run exit `2`; the rest of the files are still reported.

## Privacy

Inventory reads the export files named on the command line and the bundled or pinned lifecycle rules. It opens no socket, starts no child process, and sends nothing anywhere. Only the fields an importer needs are read; an export can contain account ids, ARNs, endpoints, subnet ids, and tags, and none of them appear in the report. `--redact` additionally replaces every resource name with the first 12 hex characters of its SHA-256, for pasting a report into an issue.

The data model is deliberately narrow. An item is a resource's own short name, a version-less Package URL, the version value, and an RFC 6901 JSON Pointer to that value. A finding is the same lifecycle check `evergreen check` returns.

See [Privacy](PRIVACY.md) for the whole command and surface contract.

## Report shape

The JSON report is `evergreen.inventory.v1`, validated by [`schemas/inventory.v1.schema.json`](../schemas/inventory.v1.schema.json). `results` holds one entry per item and check; `unrecognized` lists the files no importer recognized. Items are sorted by file and pointer, so the same exports produce the same report.

A version with no rule is reported as `no-data`, never as safe. A rule for an announced date that has not happened yet is a `scheduled-end-of-life` finding at low severity, so it does not fail a `high` gate.

## Importers

Each importer recognizes one export format and reads only the fields its rules need. The first importer that recognizes a file lists its items. Each task in the inventory epic appends one entry to `src/inventory/index.ts` and one section here.

| Importer | Reads | Export command |
| --- | --- | --- |
| — | No built-in importer is registered yet. | — |
