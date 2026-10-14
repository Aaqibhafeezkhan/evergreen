# Security policy

## Supported versions

Security fixes are provided for the latest published release.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting for this repository. Do not open a public issue containing exploit details, private source code, credentials, or tokens.

Include the affected version, impact, reproduction, and any suggested mitigation. You should receive an acknowledgement within seven days.

## Trust model

Evergreen treats scanned repository contents as untrusted data. Core scans run locally, registry entries are data rather than executable plugins, and the MCP server uses local stdio. Migration verification commands are suggestions and are never executed by Evergreen automatically. Review commands and code changes under the normal authorization policy of your environment.
