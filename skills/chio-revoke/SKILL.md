---
name: chio-revoke
description: Tear down the bonded chio capability and clear local session state.
---

When the user asks "/chio-revoke", run:

```bash
chio-codex revoke
```

Revokes via `ChioBridge.revoke({ capabilityId })` when an id is tracked,
then clears the local session bond.
