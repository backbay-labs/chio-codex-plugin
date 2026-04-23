---
name: chio-status
description: Print the status of the current chio-bonded Codex session — policy path, prompt/plan hashes, receipt count, capability id, passport.
---

When the user asks for "/chio", "chio status", or otherwise wants to know
the current chio-bonded session state, run:

```bash
chio-codex status
```

This reads plugin-local state and returns a multiline summary. It does
not mutate anything.
