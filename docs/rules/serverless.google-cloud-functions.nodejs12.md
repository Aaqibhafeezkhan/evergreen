---
title: "Google Cloud Functions Node.js 12 runtime is end-of-life — dates, impact, migration"
description: "The Cloud Run functions runtime support schedule lists Node.js 12 (runtime ID nodejs12) as deprecated on 2024-01-30 and decommissioned on 2025-01-30."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs12.html"
image: "/assets/og/serverless.google-cloud-functions.nodejs12.svg"
json_twin: "/rules/serverless.google-cloud-functions.nodejs12.json"
---

# Google Cloud Functions Node.js 12 runtime is end-of-life

**End of life** as of 2025-01-30. Replacement: nodejs24 or nodejs26. Source: [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support).

Check a version:

```bash
evergreen check pkg:generic/google-cloud-functions-runtime/nodejs12
```

The Cloud Run functions runtime support schedule lists Node.js 12 (runtime ID nodejs12) as deprecated on 2024-01-30 and decommissioned on 2025-01-30. Google no longer provides maintenance for that runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of life |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/google-cloud-functions-runtime/nodejs12` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2025-01-30 |
| Replacement | nodejs24 or nodejs26 |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `serverless.google-cloud-functions.nodejs12` |

## Sources

- [Cloud Run functions runtime support](https://cloud.google.com/functions/docs/runtime-support) (accessed 2026-10-30)

## Migration

**Constraints**

- Keep every Terraform google_cloudfunctions*_function runtime on one Google Cloud Functions runtime ID that Google still supports.
- Raising the managed runtime can require language and dependency changes; confirm handlers run on the replacement before deploying.

**Steps**

1. **Raise the Google Cloud Functions runtime.** Change the reported runtime to a supported Google Cloud Functions runtime ID (see the replacement).
2. **Align other runtime surfaces.** Update every other Terraform google_cloudfunctions*_function runtime and deploy configuration that still pins the old runtime ID.

**Verification**

- `terraform init -backend=false && terraform validate`: Initialize without touching remote state and check that the configuration is valid.
- `terraform plan`: Review the plan and confirm the runtime change is the intended one.

## Detected by

The `serverless` detector. See [Detectors](../DETECTORS.md) and [Compatibility](../COMPATIBILITY.md).

## Related

### Same ecosystem

- [AWS Lambda .NET Core 3.1 runtime is end-of-life](serverless.aws-lambda.dotnetcore3.1.html)
- [AWS Lambda Node.js 12 runtime is end-of-life](serverless.aws-lambda.nodejs12.x.html)
- [AWS Lambda Node.js 14 runtime is end-of-life](serverless.aws-lambda.nodejs14.x.html)
- [AWS Lambda Python 3.7 runtime is end-of-life](serverless.aws-lambda.python3.7.html)
- [AWS Lambda Python 3.8 runtime is end-of-life](serverless.aws-lambda.python3.8.html)
- [AWS Lambda Ruby 2.7 runtime is end-of-life](serverless.aws-lambda.ruby2.7.html)
- [App Engine Go 1.11 runtime is past end of support](serverless.google-appengine-runtime.go111.html)
- [App Engine Go 1.12 runtime is past end of support](serverless.google-appengine-runtime.go112.html)


## Data

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.google-cloud-functions.nodejs12`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs12.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs12.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs12.html",
      "headline": "Google Cloud Functions Node.js 12 runtime is end-of-life — dates, impact, migration",
      "description": "The Cloud Run functions runtime support schedule lists Node.js 12 (runtime ID nodejs12) as deprecated on 2024-01-30 and decommissioned on 2025-01-30.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-life",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "Google Cloud Functions Node.js 12 runtime is end-of-life",
        "identifier": "pkg:generic/google-cloud-functions-runtime/nodejs12"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "Cloud Run functions runtime support",
          "url": "https://cloud.google.com/functions/docs/runtime-support"
        }
      ],
      "isBasedOn": "https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json",
      "publisher": {
        "@type": "Organization",
        "name": "Evergreen",
        "url": "https://arminazimi.github.io/evergreen"
      }
    },
    {
      "@type": "FAQPage",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs12.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-cloud-functions.nodejs12.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-cloud-functions-runtime/nodejs12?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of life as of 2025-01-30. Affected versions: vers:semver/*. Source: Cloud Run functions runtime support (https://cloud.google.com/functions/docs/runtime-support)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-cloud-functions-runtime/nodejs12?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "nodejs24 or nodejs26"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-cloud-functions-runtime/nodejs12?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-cloud-functions-runtime/nodejs12."
          }
        }
      ]
    }
  ]
}
</script>
