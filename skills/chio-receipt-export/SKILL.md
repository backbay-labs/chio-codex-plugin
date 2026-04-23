---
name: chio-receipt-export
description: Emit a signed, offline-verifiable evidence bundle over a time window.
---

When the user asks "/chio-receipt-export <window>" (e.g. `1h`, `24h`,
`session`), run:

```bash
chio-codex receipt-export <window> [--out <path>]
```

Delegates to `ChioBridge.exportEvidence` which POSTs to arc's trust-plane
`/v1/evidence/export`. Writes the bundle to the given path (default
`./chio-evidence-<ts>.json`).
