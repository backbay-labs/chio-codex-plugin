---
name: chio-policy
description: Print the active chio policy — parsed rule keys, extensions, and any lint findings.
---

When the user asks "/chio-policy" or wants to inspect the active policy,
run:

```bash
chio-codex policy
```

This prints the policy path, the HushSpec version, a compact summary of
`rules:` and `extensions:` blocks, and any lint errors/warnings from
`ChioBridge.lintPolicy`.
