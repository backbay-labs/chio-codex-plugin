---
name: chio-publish
description: Promote the current chio-bonded Codex session into a named, scheduled citizen with an Agent Passport (did:chio:...).
---

When the user asks to "publish" the current run (turn this session into a
scheduled operator), run:

```bash
chio-codex publish <name> [--description "..."] [--schedule "0 3 * * 1"] [--ttl 30d]
```

Delegates to `ChioBridge.createPassport` and pins the current policy. The
return is a Citizen descriptor printed on stdout, including the
`did:chio:{hex}` passport subject.
