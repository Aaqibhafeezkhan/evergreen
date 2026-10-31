---
title: "Is Terraform end of life? — versions, dates, sources"
description: "Some Terraform releases are end of life. The list() and map() functions were removed in Terraform 0.15. The source gives no day."
canonical_url: "https://arminazimi.github.io/evergreen/eol/terraform.html"
---

# Is Terraform end of life?

**Some Terraform releases are end of life.** The list() and map() functions were removed in Terraform 0.15. The source gives no day. This page lists 8 reviewed lifecycle rules for `pkg:generic/terraform`, with the status, date, and source for each.

Check a version:

```bash
evergreen check pkg:generic/terraform
```

[All product answers](index.html)

| Rule | Status | Date | Affected versions | Sources |
| --- | --- | --- | --- | --- |
| [The list() and map() functions were removed in Terraform 0.15](../rules/terraform.function.list-map.html) | Removed | The source gives no day | `vers:semver/>=0.15.0` | [Terraform 0.15 upgrade guide: legacy configuration language features](https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15), [Terraform tolist function](https://developer.hashicorp.com/terraform/language/functions/tolist), [Terraform tomap function](https://developer.hashicorp.com/terraform/language/functions/tomap) |
| [Terraform CLI 1.15 is no longer a supported release line](../rules/terraform.cli.end-of-support-1.15.html) | End of support | 2026-10-21 | `vers:semver/>=1.15.0\|<1.16.0` | [hashicorp/terraform release v1.17.0](https://github.com/hashicorp/terraform/releases/tag/v1.17.0), [hashicorp/terraform release v1.15.0](https://github.com/hashicorp/terraform/releases/tag/v1.15.0), [HashiCorp Terraform support policy](https://support.hashicorp.com/hc/en-us/articles/360021185113) |
| [Terraform CLI 1.14 is no longer a supported release line](../rules/terraform.cli.end-of-support-1.14.html) | End of support | 2026-08-26 | `vers:semver/>=1.14.0\|<1.15.0` | [endoflife.date: Terraform](https://endoflife.date/terraform), [hashicorp/terraform release v1.16.0](https://github.com/hashicorp/terraform/releases/tag/v1.16.0), [HashiCorp Terraform support policy](https://support.hashicorp.com/hc/en-us/articles/360021185113) |
| [Terraform CLI 1.13 is no longer a supported release line](../rules/terraform.cli.end-of-support-1.13.html) | End of support | 2026-04-29 | `vers:semver/>=1.13.0\|<1.14.0` | [endoflife.date: Terraform](https://endoflife.date/terraform), [hashicorp/terraform release v1.15.0](https://github.com/hashicorp/terraform/releases/tag/v1.15.0), [HashiCorp Terraform support policy](https://support.hashicorp.com/hc/en-us/articles/360021185113) |
| [Terraform CLI 1.12 is no longer a supported release line](../rules/terraform.cli.end-of-support-1.12.html) | End of support | 2025-11-19 | `vers:semver/>=1.12.0\|<1.13.0` | [endoflife.date: Terraform](https://endoflife.date/terraform), [hashicorp/terraform release v1.14.0](https://github.com/hashicorp/terraform/releases/tag/v1.14.0), [HashiCorp Terraform support policy](https://support.hashicorp.com/hc/en-us/articles/360021185113) |
| [Terraform CLI 1.11 is no longer a supported release line](../rules/terraform.cli.end-of-support-1.11.html) | End of support | 2025-08-20 | `vers:semver/>=1.11.0\|<1.12.0` | [endoflife.date: Terraform](https://endoflife.date/terraform), [hashicorp/terraform release v1.13.0](https://github.com/hashicorp/terraform/releases/tag/v1.13.0), [HashiCorp Terraform support policy](https://support.hashicorp.com/hc/en-us/articles/360021185113) |
| [Terraform CLI 1.10 is no longer a supported release line](../rules/terraform.cli.end-of-support-1.10.html) | End of support | 2025-05-14 | `vers:semver/>=1.10.0\|<1.11.0` | [endoflife.date: Terraform](https://endoflife.date/terraform), [hashicorp/terraform release v1.12.0](https://github.com/hashicorp/terraform/releases/tag/v1.12.0), [HashiCorp Terraform support policy](https://support.hashicorp.com/hc/en-us/articles/360021185113) |
| [Interpolation-only strings are deprecated](../rules/terraform.syntax.interpolation-only.html) | Deprecated | The source gives no day | `vers:semver/>=0.12.14` | [hashicorp/terraform release v0.12.14](https://github.com/hashicorp/terraform/releases/tag/v0.12.14), [Terraform 0.15 upgrade guide: legacy configuration language features](https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-15), [Terraform 0.12 upgrade guide: first-class expressions](https://developer.hashicorp.com/terraform/language/v1.1.x/upgrade-guides/0-12) |

## Data

This page is generated from the lifecycle registry (`registry/`), not written by hand. Regenerate it with `npm run build:answer-pages`. Each row links to the rule page and the authoritative source for that version.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "@id": "https://arminazimi.github.io/evergreen/eol/terraform.html#faq",
  "url": "https://arminazimi.github.io/evergreen/eol/terraform.html",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "Is Terraform end of life?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Some Terraform releases are end of life. The list() and map() functions were removed in Terraform 0.15. The source gives no day. This page lists 8 reviewed lifecycle rules for pkg:generic/terraform, with the status, date, and source for each."
      }
    },
    {
      "@type": "Question",
      "name": "How do I check Terraform?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Run evergreen check pkg:generic/terraform."
      }
    },
    {
      "@type": "Question",
      "name": "Where do the Terraform dates come from?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Each row links to a reviewed Evergreen rule and the authoritative sources for that version. The page is generated from the lifecycle registry."
      }
    }
  ]
}
</script>
