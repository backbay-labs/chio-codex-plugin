---
name: chio-guard-pause
description: Temporarily (and advisorily) pause a named arc guard in plugin-local state.
---

When the user asks "/chio-guard-pause <guard>", run:

```bash
chio-codex guard-pause <guard> [--ttl <duration>]
```

Note: this is a local advisory record only. Arc enforces guards at the
kernel level; to actually suppress enforcement you must push the pause
through the active policy or a trust-plane override. The subcommand
prints this caveat so users aren't misled.
