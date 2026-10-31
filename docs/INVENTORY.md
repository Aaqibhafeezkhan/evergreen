# Inventory

`evergreen inventory <file>...` reads exported cloud and cluster state and reports the objects that run an engine, runtime, cluster version, image, or operating system that has reached, or will reach, the end of its support. Every result names the exact JSON Pointer in the file the claim rests on. The command reads only the files you pass to it.

```bash
evergreen inventory examples/inventory/aws-rds.json
evergreen inventory rds-instances.json rds-clusters.json --json
evergreen inventory cache-clusters.json --format aws-rds --fail-on high
```

Evergreen never calls AWS, Google Cloud, Azure, Kubernetes, or Docker, and it never runs an export command for you. You run the provider's read-only export, and Evergreen reads the file offline. Files that no importer recognizes, and files that cannot be read, are listed and make the run exit `2`; the rest of the files are still reported.

## Privacy

Inventory reads the export files named on the command line and the bundled or cached lifecycle rules. It opens no socket, starts no child process, and sends nothing anywhere. Only the fields an importer needs are read; an export can contain account ids, ARNs, endpoints, subnet ids, and tags, and none of them appear in the report. `--redact` additionally replaces every resource name with the first 12 hex characters of its SHA-256, for pasting a report into an issue.

The data model is deliberately narrow. An item is a resource's own short name, a version-less Package URL, the version value, and an RFC 6901 JSON Pointer to that value. A finding is the same lifecycle check `evergreen check` returns.

See [Privacy](PRIVACY.md) for the whole command and surface contract.

## Report shape

The JSON report is `evergreen.inventory.v1`, validated by [`schemas/inventory.v1.schema.json`](../schemas/inventory.v1.schema.json). `results` holds one entry per item and check; `unrecognized` lists the files no importer recognized. Items are sorted by file and pointer, so the same exports produce the same report.

A Package URL with no rule is reported as `no-data`; when a PURL has rules but none covers the version, the item is `not-affected`. Neither status is a statement that the version is safe. A rule for an announced date that has not happened yet is a `scheduled-end-of-life` finding at low severity, so it does not fail a `high` gate.

## Importers

| Importer | Reads | Export command |
| --- | --- | --- |
| `aws-rds` | AWS RDS instances, Aurora clusters, and ElastiCache cache clusters | `aws rds describe-db-instances`, `aws rds describe-db-clusters`, `aws elasticache describe-cache-clusters` |

## AWS RDS, Aurora, and ElastiCache

### Produce the export

Use the AWS CLI with JSON output and pass the file to `evergreen inventory`:

```bash
aws rds describe-db-instances --output json > rds-instances.json
aws rds describe-db-clusters --output json > rds-clusters.json
aws elasticache describe-cache-clusters --output json > cache-clusters.json

evergreen inventory rds-instances.json rds-clusters.json cache-clusters.json
```

The fixtures under `tests/fixtures/inventory/aws-rds/` are sanitized samples of these three documents: every account id, ARN, endpoint, and subnet id is a placeholder, and only the fields below are kept. They were assembled from the published output shape of `aws-cli` during review rather than captured from a live account.

### Fields read

| Document | Array | Engine field | Version field | Resource field |
| --- | --- | --- | --- | --- |
| `describe-db-instances` | `DBInstances` | `Engine` | `EngineVersion` | `DBInstanceIdentifier` |
| `describe-db-clusters` | `DBClusters` | `Engine` | `EngineVersion` | `DBClusterIdentifier` |
| `describe-cache-clusters` | `CacheClusters` | `Engine` | `EngineVersion` | `CacheClusterId` |

Everything else in the document is ignored: ARNs, endpoints, reader endpoints, hosted zone ids, subnet groups, VPC ids, security groups, tags, and parameter groups. An entry without a string `Engine`, `EngineVersion`, and resource field is skipped, never guessed.

### Engines and PURLs

| AWS engine | Provider PURL | Upstream PURL |
| --- | --- | --- |
| `postgres` | `pkg:generic/aws-rds/postgres` | `pkg:generic/postgresql` |
| `mysql` | `pkg:generic/aws-rds/mysql` | `pkg:generic/mysql` |
| `aurora-postgresql` | `pkg:generic/aws-aurora/postgresql` | `pkg:generic/postgresql` |
| `aurora-mysql`, `aurora` | `pkg:generic/aws-aurora/mysql` | none (see below) |
| `redis` | `pkg:generic/aws-elasticache/redis` | `pkg:generic/redis` |

Each recognized object produces two items when the version is also an upstream version, so the report shows both the provider's schedule and the upstream engine's schedule. AWS standard support and extended support dates differ from upstream end of life, and the rules are kept separate for that reason.

Aurora MySQL is the exception: its `EngineVersion` embeds the Aurora version, as in `8.0.mysql_aurora.3.10.0`, which is not an upstream MySQL release. Only the Aurora item is emitted rather than comparing that string to upstream MySQL rules.

Unknown engines are skipped: `mariadb`, `sqlserver-*`, `oracle-*`, `db2-*`, `memcached`, and `valkey` have no reviewed rule in this importer yet, so they produce no item and no claim.

### Rules matched

The rules live in [`registry/database.json`](../registry/database.json) under the provider PURLs, with the AWS release calendar as their source. "End of standard support" is recorded with the registry's `end-of-support` event; an announced date that is still in the future is recorded as `scheduled-end-of-life` at low severity until it passes. The summary of each rule says whether RDS Extended Support or ElastiCache Extended Support may keep the version running for a fee.

| Service | Versions with a rule (as of 2026-10-30) |
| --- | --- |
| RDS for PostgreSQL | 9.6, 10, 11, 12, 13 (ended); 14 (scheduled 2027-02-28) |
| RDS for MySQL | 5.7, 8.0 (ended) |
| Aurora PostgreSQL | 11, 12, 13 (ended); 14 (scheduled 2027-02-28) |
| Aurora MySQL | 1 (5.6), 2 (5.7) (ended) |
| ElastiCache Redis OSS | 4, 5 (ended 2026-01-31); 6 (scheduled 2027-01-31) |

A version outside these ranges is not reported as supported. When the provider PURL has rules for other versions, the item is `not-affected`: the check message says that rules exist and none covers this version. When the PURL has no rules at all, it is `no-data`. Neither status is a statement that the version is safe. This includes RDS for PostgreSQL 15 and later, RDS for MySQL 8.4 and later, Aurora PostgreSQL 15 and later, Aurora MySQL 3 and 8.4, and Redis OSS 7.x. Their announced end-of-standard-support dates are more than twelve months past the review date, so no rule is recorded yet under decision [0010](decisions/0010-scheduled-end-of-life.md); a later review adds them when the dates come within the window.

### What is not judged

The importer does not judge instance classes, storage, IOPS, parameter groups, patch levels within a supported minor version, certificate authorities, Multi-AZ or read-replica topology, backup retention, encryption, or licensing. It does not judge MariaDB, SQL Server, Oracle, Db2, Memcached, or Valkey. It does not verify that an export is complete or current. It does not read an AWS account, role, or region, and it cannot see an object that the export omits.
