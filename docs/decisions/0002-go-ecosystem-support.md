# 0002 — Add Go as a first-class detector ecosystem

Status: accepted

Evergreen will add evidence-backed Go runtime, toolchain, and direct-module lifecycle detection in Phase 18 through the existing detector SDK. Repository scans will parse supported `go.mod` and `go.work` declarations locally and deterministically, without requiring the Go toolchain, network access, or a hosted Evergreen service; signals that cannot be supported by versioned authoritative evidence will remain explicit limitations rather than inferred findings.
