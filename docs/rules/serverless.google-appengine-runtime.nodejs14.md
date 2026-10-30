---
title: "App Engine Node.js 14 runtime is past end of support — dates, impact, migration"
description: "The App Engine standard environment runtime support schedule lists Node.js 14 (runtime ID nodejs14) with end of support on 2024-01-30 and deprecation on 2025-01-31."
canonical_url: "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.nodejs14.html"
image: "/assets/og/serverless.google-appengine-runtime.nodejs14.svg"
json_twin: "/rules/serverless.google-appengine-runtime.nodejs14.json"
---

# App Engine Node.js 14 runtime is past end of support

**End of support** as of 2024-01-30. Replacement: nodejs22 or nodejs24. Source: [App Engine standard environment runtime support schedule](https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule).

Check a version:

```bash
evergreen check pkg:generic/google-appengine-runtime/nodejs14
```

The App Engine standard environment runtime support schedule lists Node.js 14 (runtime ID nodejs14) with end of support on 2024-01-30 and deprecation on 2025-01-31. Google no longer provides patches or support for that runtime.

[Look up another package or runtime](../lookup.html) · <form action="../lookup.html" method="get" role="search"><input type="search" name="q" placeholder="Search packages and runtimes" aria-label="Package or runtime" /> <button type="submit">Search</button></form>

| | |
| --- | --- |
| Status | End of support |
| Severity | high |
| Ecosystem | `serverless` |
| Component | `pkg:generic/google-appengine-runtime/nodejs14` |
| Affected versions | `vers:semver/*` |
| Date from the source | 2024-01-30 |
| Replacement | nodejs22 or nodejs24 |
| Evidence last seen | 2026-10-30 |
| Reviewed | 2026-10-30 by arminazimi |
| Review due | 2027-01-28 (90 days after the last review) |
| Rule ID | `serverless.google-appengine-runtime.nodejs14` |

## Sources

- [App Engine standard environment runtime support schedule](https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule) (accessed 2026-10-30)

## Migration

**Constraints**

- Keep the App Engine service runtime on an ID Google still supports; the service must be redeployed as a new version to change it.
- Raising the runtime can require language and dependency changes; confirm the app runs on the replacement before shifting traffic.

**Steps**

1. **Raise the App Engine runtime.** Set the runtime to a supported runtime ID (see the replacement) in app.yaml and in the Terraform google_app_engine_standard_app_version.
2. **Deploy a new version.** Deploy the change as a new version and move traffic to it after it serves correctly.

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

This page is generated from [`registry/serverless.json`](https://github.com/arminazimi/evergreen/blob/main/registry/serverless.json), rule `serverless.google-appengine-runtime.nodejs14`, in the `evergreen.registry.v2` format ([how rules are written](../RULES.md)). A CLE (ECMA-428) export is not published yet. The same facts are embedded in this page as schema.org structured data.

<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "TechArticle",
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.nodejs14.html",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.nodejs14.html",
      "mainEntityOfPage": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.nodejs14.html",
      "headline": "App Engine Node.js 14 runtime is past end of support — dates, impact, migration",
      "description": "The App Engine standard environment runtime support schedule lists Node.js 14 (runtime ID nodejs14) with end of support on 2024-01-30 and deprecation on 2025-01-31.",
      "inLanguage": "en",
      "dateModified": "2026-10-30",
      "keywords": [
        "end-of-support",
        "serverless",
        "high"
      ],
      "about": {
        "@type": "Thing",
        "name": "App Engine Node.js 14 runtime is past end of support",
        "identifier": "pkg:generic/google-appengine-runtime/nodejs14"
      },
      "citation": [
        {
          "@type": "CreativeWork",
          "name": "App Engine standard environment runtime support schedule",
          "url": "https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule"
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
      "@id": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.nodejs14.html#faq",
      "url": "https://arminazimi.github.io/evergreen/rules/serverless.google-appengine-runtime.nodejs14.html",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is the lifecycle status of pkg:generic/google-appengine-runtime/nodejs14?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "End of support as of 2024-01-30. Affected versions: vers:semver/*. Source: App Engine standard environment runtime support schedule (https://cloud.google.com/appengine/docs/standard/lifecycle/support-schedule)."
          }
        },
        {
          "@type": "Question",
          "name": "What replaces pkg:generic/google-appengine-runtime/nodejs14?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "nodejs22 or nodejs24"
          }
        },
        {
          "@type": "Question",
          "name": "How do I check pkg:generic/google-appengine-runtime/nodejs14?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Run evergreen check pkg:generic/google-appengine-runtime/nodejs14."
          }
        }
      ]
    }
  ]
}
</script>
