# Benchmarks

## Source usage analysis

Run `npm run benchmark:usage` to generate 200 TypeScript files in a temporary repository and scan them as one batch. Every file contains one aliased package import, one real method call, one comment lookalike, and one string lookalike.

The benchmark expects 400 true usages. It reports detected usages, precision, recall, and wall-clock scan time, and exits unsuccessfully unless precision and recall are both 1.0. The time is observational rather than a fixed CI gate because filesystem and runner performance vary.

On 2026-10-14, the benchmark detected all 400 usages with 1.0 precision and 1.0 recall in 29.64 ms on the development machine. Treat the duration as a reference point, not a cross-machine performance guarantee.

The benchmark corpus is intentionally controlled. The automated test suite separately covers JavaScript and TypeScript import forms, aliases, Python imports and calls, configuration keys, ignored dependency directories, and comment/string false positives.
