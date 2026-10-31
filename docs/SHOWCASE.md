---
title: Showcase
---

# Showcase

Evergreen's output is meant to be shown. Each section below names the command, what it renders, and when to use it. Every command runs offline against files on disk; nothing is uploaded and no repository code runs.

## Animated forecast for a README

`evergreen forecast --svg --animate` draws the coming months as a self-contained SVG: one bar from today to each dated lifecycle event, in date order, and a today marker that pulses twice. Bars follow the severity lanes, the file reads in light and dark through `prefers-color-scheme`, and `prefers-reduced-motion: reduce` shows the final frame immediately. The SVG contains no script, no `<foreignObject>`, and no external references.

```bash
npx evergreen-deprecation forecast . --months 12 --svg --animate > docs/forecast.svg
```

Commit `docs/forecast.svg`, then embed it in the README:

```markdown
![Lifecycle forecast](docs/forecast.svg)
```

Use HTML when the image needs a width or a longer description:

```html
<img src="docs/forecast.svg" width="720" alt="Lifecycle forecast: dated end-of-life events in the next twelve months">
```

Without `--animate`, the command prints the marker-only timeline that the HTML report embeds, with no animation block. `--as-of <YYYY-MM-DD>` fixes the window when you need the file to stay byte-identical, for example in a test or a release note.

### Refresh it on a schedule

A scheduled GitHub Actions workflow can regenerate the file and commit it when the forecast changes. The scan is local, so the job only needs a checkout, Node.js 22, and `contents: write` to push the refreshed file.

```yaml
name: Refresh lifecycle forecast

on:
  schedule:
    - cron: "0 6 * * 1" # Mondays 06:00 UTC
  workflow_dispatch:

permissions:
  contents: write

jobs:
  forecast:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: 22
      - run: npx --yes evergreen-deprecation@0.8.0 forecast . --svg --animate > docs/forecast.svg
      - run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add docs/forecast.svg
          git diff --cached --quiet || git commit -m "docs: refresh the lifecycle forecast"
          git push
```

Pin the Evergreen release you use instead of always taking the latest. If the default branch is protected, open a pull request from the workflow instead of pushing to it. GitHub caches README images, so a refreshed file can take a few minutes to appear; the commit is the refresh.
