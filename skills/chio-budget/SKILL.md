---
name: chio-budget
description: Adjust the spend ceiling (USD) for the current chio-bonded session. Local advisory.
---

When the user asks "/chio-budget <usd>", run:

```bash
chio-codex budget <usd>
```

The cap is a local record. Hard enforcement lives at the chio trust-plane
(`/v1/budgets/...`); plumbing this through the bridge is future work.
