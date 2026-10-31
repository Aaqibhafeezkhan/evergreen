---
title: Showcase
---

# Showcase

Short, copy-pasteable ways to show what Evergreen found. Every command runs locally against files on disk; nothing is uploaded and no scan uses the network. The examples use the deliberately outdated project at `examples/demo` in this repository.

## Mermaid support windows

```bash
npx evergreen-deprecation scan --format mermaid --as-of 2026-10-30 examples/demo
```

Prints a fenced `mermaid` block containing a Gantt chart: one section per ecosystem and one bar per subject from the day the scan observed it to its deadline. A subject that has already ended is a `crit` milestone at its deadline; one that ends within 30 days is a `crit` bar. A `today` milestone follows `--as-of`. Paste the whole block into a README, an issue, or a pull request comment and GitHub renders the chart without an image file.

```mermaid
gantt
    title Evergreen support windows
    dateFormat YYYY-MM-DD
    axisFormat %Y-%m
    todayMarker off

    section github-actions
    Unsupported actions/checkout runtime :crit, milestone, bar0, 2026-09-23, 0d

    section nodejs
    Node.js 19 is end-of-life :crit, milestone, bar1, 2023-06-01, 0d
    Node.js 18 is end-of-life :crit, milestone, bar2, 2025-04-30, 0d
    Node.js 20 is end-of-life :crit, milestone, bar3, 2026-04-30, 0d

    section npm
    request is deprecated :crit, milestone, bar4, 2020-02-11, 0d

    section today
    today 2026-10-30 : milestone, marker, 2026-10-30, 0d
```

`--as-of <YYYY-MM-DD>` moves the bars and the `today` milestone together, so the same date always prints the same chart. The chart draws at most 40 bars and ends with a line such as `and 3 more`; `--format json` still lists every finding. Use it when a pull request or a README should show when support for what the repository uses runs out.

The same chart is available for the look-ahead window:

```bash
npx evergreen-deprecation forecast --format mermaid --as-of 2026-10-30 examples/demo
```

`forecast --format mermaid` draws one bar per dated event in the forecast window, grouped by ecosystem, instead of only the findings in this repository.

The GitHub Action's pull request comment is raw Markdown, so a Mermaid block renders there too. The built-in comment does not include the chart or accept a comment template yet, so paste the command's output into a comment, or add a workflow step that writes it.
