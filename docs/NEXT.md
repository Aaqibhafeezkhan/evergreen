---
title: Post-launch notes and next roadmap
---

# Post-launch notes and next roadmap

## v0.1 launch findings

- Real-repository validation found lifecycle declarations in both application and library compatibility ranges; reports must keep distinguishing compatibility ranges from pinned production runtimes.
- Zero-finding repositories are essential regression cases, not empty data. Twelve of the twenty pinned repositories exercise that path.
- GitHub Actions runtime retirement produced the largest cluster of findings, confirming that workflow declarations are a useful first-run experience.
- Scan latency was small relative to repository download time, so future performance work should preserve local, single-pass analysis before adding concurrency.
- npm publication requires maintainer authentication or a configured trusted publisher; release automation should not store long-lived credentials in the repository.

## Next roadmap

1. Expand the evidence registry with maintainer-reviewed lifecycle rules and freshness metadata.
2. Add ecosystem adapters based on contributor demand, starting with container base images and Java toolchains.
3. Improve monorepo discovery while preserving deterministic, bounded traversal.
4. Add machine-readable suppression reasons and expiry dates to baselines.
5. Automate the pinned public-corpus run on a scheduled workflow without turning network availability into a pull-request gate.

Scope changes continue to require an explicit decision record. Community requests should start as a focused issue with a reproducible fixture and authoritative lifecycle source.
