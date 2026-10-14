# Evergreen Agent Skill

Evergreen ships one portable skill at `skills/evergreen-deprecation/SKILL.md`. It follows the open Agent Skills directory format: standard YAML frontmatter plus Markdown instructions. There is no vendor-specific manifest, invocation policy, tool allowlist, script, or generated prompt.

## Design

The skill is intentionally an orchestration layer. It tells an agent when to discover, explain, migrate, and verify, then maps those intents to Evergreen's MCP tools or CLI commands. Lifecycle rules, evidence, affected-file calculation, migration steps, and verification behavior remain in the executable and versioned JSON contracts.

This split prevents prompt drift: improving a detector or migration packet changes every client without requiring a rewritten skill.

## Installation

The npm package includes the complete `skills/evergreen-deprecation` folder. Copy or link that folder into any skills-compatible host's configured skill directory. Directory discovery and enablement are host concerns; the skill itself does not assume a specific coding agent.

The host also needs one Evergreen execution path:

- the local `evergreen-mcp` stdio server; or
- the `evergreen` CLI available on `PATH`.

No account or API key is required.

## Evaluation

Trigger evaluation cases live in `skills/evergreen-deprecation/evals/cases.json`. They cover four intended requests and four nearby requests that should use another workflow. CI validates the portable frontmatter, small instruction surface, vendor neutrality, complete tool mapping, safety invariants, and both evaluation branches.

Independent forward tests exercise three different agent situations:

| Agent situation | Observable success criterion | Result |
| --- | --- | --- |
| Skill discovery | Classify every trigger and non-trigger case without reading expected answers. | 8/8 correct; one broad phrase tightened. |
| MCP-capable agent | Discover, explain, create context, migrate, and verify through the real stdio protocol in one session. | Passed with all five tools; checkout finding verified absent. |
| CLI-only agent | Complete the same lifecycle using only documented CLI fallbacks and a fresh final scan. | Passed; request migration changed only two packet files and ended with zero findings. |

Forward-test observations are recorded on the Week 11 GitHub issue when the phase is completed. Discovery testing narrowed an ambiguous generic migration trigger to migrations from Evergreen findings. CLI testing replaced the packet's `npx` rescan suggestion with the already-installed `evergreen` executable so verification remains offline-capable and version-consistent. MCP testing clarified that an empty usage list means there are no additional usages beyond the declaration, rather than implying that the declaration itself is not relevant.

## Limits and security assumptions

- Evergreen currently covers its documented GitHub Actions, Node.js, npm, and Python rules. The skill reports unsupported ecosystems instead of inventing migration advice.
- Dynamic references that detectors cannot classify remain explicit limitations.
- MCP verification needs the same server session that observed the finding. The CLI fallback uses a fresh scan and conservatively compares the rule and declaration path.
- The skill grants no permissions. Suggested verification commands remain subject to the host's normal authorization rules.
- The bundle contains no executable skill scripts and declares no pre-approved tools.
- Repository analysis remains local. The selected host receives structured Evergreen results, which can include paths and short source excerpts, so its own privacy policy still applies.
