---
name: chio-bond
description: Issue a chio capability for this Codex session against a policy file. Persists the bond so every PreToolUse hook mediates through it.
---

When the user asks to "/chio-bond" or "bond this session to a policy",
call:

```bash
chio-codex bond --policy <path> [--ttl <duration>] [--delegatable]
```

If the user doesn't name a policy file, check `CHIO_POLICY_PATH` in env
first; if that's also unset, ask the user for a path. The subcommand
delegates to `arc` via @chio/bridge and prints the issued capability id.
