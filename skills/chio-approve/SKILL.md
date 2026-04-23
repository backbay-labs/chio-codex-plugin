---
name: chio-approve
description: Countersign a gated chio receipt by id.
---

When the user asks "/chio-approve <receipt-id>", run:

```bash
chio-codex approve <receipt-id>
```

Arc has no receipt-approve REST verb; the countersign path is capability
attenuation at the trust plane. This subcommand records the intent
locally so the next PreToolUse evaluation can consult it.
