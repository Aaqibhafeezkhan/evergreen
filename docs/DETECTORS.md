# Detector authoring

Evergreen detectors are adapters at the detector SDK seam. They inspect a repository and return lifecycle findings; the scan engine handles detector attribution, sorting, reporting, and composition.

## Supported interface

Import the public SDK from `evergreen-deprecation/sdk`:

```ts
import {
  defineDetector,
  DETECTOR_API_VERSION,
  type Detector,
} from "evergreen-deprecation/sdk";
```

A compatible detector has one stable identifier and one operation:

```ts
export const detector = defineDetector({
  apiVersion: DETECTOR_API_VERSION,
  id: "example-ecosystem",
  async scan({ root }) {
    return [];
  },
}) satisfies Detector;
```

The interface guarantees:

- `root` is an absolute repository path.
- `id` uses lowercase letters, numbers, and single hyphens.
- `scan` returns findings without a `detector` field; the engine adds it from `id`.
- Findings must be deterministic for the same repository and bundled registry.
- Repository contents are untrusted input.
- The core contract provides no network capability. Detectors should use bundled, reviewed registry data so scans remain local and reproducible.
- An incompatible `apiVersion` fails before the detector scans.

See [`examples/detectors/todo-comments.ts`](../examples/detectors/todo-comments.ts) for a complete minimal adapter.

## Registry validation

Registry files use a versioned envelope:

```json
{
  "schemaVersion": "example.registry.v1",
  "rules": []
}
```

Use `validateRegistry` for the envelope and a detector-owned type guard for each rule:

```ts
const registry = validateRegistry(JSON.parse(contents), {
  schemaVersion: "example.registry.v1",
  isRule: (value): value is ExampleRule =>
    isDeprecationRule(value) && typeof value.package === "string",
});
```

Validation rejects a missing or unexpected schema version, a non-array `rules` value, and the first invalid rule with its array index. `isDeprecationRule` validates the fields shared by every Evergreen lifecycle rule.

## Compatibility policy

`evergreen.detector.v1` remains compatible throughout the `0.1.x` line. Additive fields will be optional. A future breaking interface will use a new API version so an old adapter fails clearly instead of producing unreliable findings.

Run `npm run check` against the minimum Evergreen version your detector supports. The repository compatibility suite exercises an external adapter, rejects an old API version, validates registry failure modes, and runs the published example through the same engine seam used by built-in detectors.
