# Deployed inventory

What runs in production often drifts from what is in git: a Lambda created by hand, a cluster never upgraded, a database left on an old engine. `evergreen inventory <file>...` reads the exports that cloud, cluster, container, and host tools already produce, and reports end-of-life runtimes, engines, cluster versions, images, and operating systems that are running now.

Evergreen calls no provider API. You run the export command the provider documents, and Evergreen reads the file you produced. Every result names the exporter's exact place for the claim: an RFC 6901 JSON Pointer into a structured export, or `line:<n>` for a text export. The report is an `evergreen.inventory.v1` document with `--json`, and matches [`inventory.v1.schema.json`](../schemas/inventory.v1.schema.json).

An item whose PURL has no rule is reported as `no-data`. That means Evergreen has no reviewed lifecycle rule for it; it is not a statement that the resource is safe. Run `evergreen inventory <file>` with no `--fail-on` to inventory everything, and use `--fail-on` to gate a pipeline.

## Privacy

`inventory` reads only the files named on the command line. It makes no network request, runs no command, and reads no other file. It never calls a cloud, cluster, or registry API, and it does not resolve a host name. `--redact` replaces every resource name with the first 12 hex characters of its SHA-256 in text and JSON output, so a report can be shared without naming hosts, functions, or clusters. Importers keep account ids, ARNs, subscription ids, project numbers, and IP addresses out of every result.

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
