# Product brief

## Problem

Dependency update tools report that a new version exists. They rarely explain which future removal affects a repository, where the affected API is used, what evidence supports the claim, and how to verify a safe migration.

## Promise

Evergreen answers four questions:

1. What is becoming deprecated or unsupported?
2. Where does this repository depend on it?
3. When and how severely will it matter?
4. What context and verification steps are needed to migrate safely?

## Initial users

- Open-source maintainers
- Platform and developer-experience teams
- Developers operating long-lived repositories
- Coding agents performing dependency migrations

## Non-goals for v0.1

- Automatically changing production code
- A hosted dashboard or user accounts
- Generic dependency vulnerability scanning
- Guessing deprecations without an authoritative source
- Replacing package managers, Dependabot, or Renovate

## Three-month outcome

A developer can install Evergreen, scan a JavaScript, Python, or GitHub Actions repository, inspect evidence-backed findings, run it in CI, and give a structured migration packet to an AI coding agent.
