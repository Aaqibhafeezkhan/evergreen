# Inventory

Evergreen judges what a repository declares. `evergreen inventory` judges what is actually deployed. It reads the export files cloud and cluster tools already produce — `terraform show -json`, `kubectl get -o json`, `aws lambda list-functions --output json`, `gcloud ... --format=json`, `az ... list`, `docker inspect`, and similar — and reports the runtimes, engines, images, and operating systems in them that have a lifecycle problem.

```bash
aws lambda list-functions --output json > lambda.json
evergreen inventory lambda.json
```

Evergreen never calls a cloud API. You run the export command; Evergreen reads the file. Each result names the export file and the JSON Pointer its claim rests on, so a person can open the file and see exactly where the finding comes from. Items no rule covers are reported as `no-data`, which is not a statement that they are safe.

| Flag | What it does |
| --- | --- |
| `--format auto\|<importer-id>` | Use only this importer. Default `auto`, which tries every built-in importer in turn. |
| `--json` | Print the `evergreen.inventory.v1` report, matching [`schemas/inventory.v1.schema.json`](../schemas/inventory.v1.schema.json). |
| `--fail-on <severity\|none>` | Exit `1` when an affected result is at or above this severity. Default: the config's `failOn`, else `high`. |
| `--redact` | Replace every resource name with the first 12 hex characters of its SHA-256, in text and JSON output. |

Exit codes: `2` when any file is unrecognized or unreadable (the other files are still reported), `1` when an affected result reaches `--fail-on`, and `0` otherwise.

## Privacy

`inventory` reads only the files you pass on the command line and the lifecycle rules bundled with (or verified for) Evergreen. It does not list directories, read environment variables, start a child process, open a socket, or call any cloud API, and it accepts no credentials. Every importer parses the export as data: nothing in it is executed. `resource` is the resource's own short name — never an account id, ARN, subscription id, project number, IP address, environment variable, or tag — and `--redact` hashes it when the report leaves your machine.

Exports still contain those identifiers elsewhere in the file, so review an export before you share it; Evergreen copies none of them into its output.

## Export files

Each section below documents one importer: the exact command that produces the export, the fields Evergreen reads, the lifecycle rules it matches, and what it does not judge. Fixtures live under `tests/fixtures/inventory/`, with every identifier replaced by a placeholder; the command and CLI version that produced them are recorded in the section.
