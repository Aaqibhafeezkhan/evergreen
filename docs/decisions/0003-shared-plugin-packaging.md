# 0003 — Generate host plugins from shared Evergreen assets

Status: accepted

## Decision

Evergreen will keep its portable Skill, npm runtime, detector rules, migration logic, and verification behavior as canonical shared sources. A deterministic assembly module will produce committed Codex and Claude plugin packages with thin host-specific manifests and identical generated Skill and MCP assets; CI will fail when either generated package drifts from those sources.

## Why

Codex and Claude use different manifest locations and metadata while sharing the same Agent Skill and local stdio MCP workflow. Separate generated adapters preserve native installation and submission formats without creating two implementations or hiding release changes inside an unreviewed build artifact.

## Consequences

Plugin versions release in lockstep with the `evergreen-deprecation` npm package and pin that exact runtime version. Evergreen maintainers own assembly and must regenerate both packages before a versioned release; host-specific presentation may vary, but lifecycle facts, detector behavior, migration steps, and verification logic cannot live in either adapter.
