# 0001 — TypeScript-first, local-first architecture

Status: accepted

## Decision

Evergreen v0.1 will use TypeScript on Node.js 22 or newer. The CLI, scan engine, built-in detectors, GitHub Action, and initial MCP server will share the same language and contracts.

The project will not require a hosted backend. Performance-sensitive analysis may later move to Rust behind the stable TypeScript interfaces, but only after measurement demonstrates a need.

## Why

TypeScript minimizes the path to npm distribution, GitHub Actions, MCP integration, and an approachable detector SDK. Local execution protects source privacy and keeps operating costs near zero.
