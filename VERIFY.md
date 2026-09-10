> Historical document. This is not current host or kernel acceptance. See
> [the 2026-09-09 acceptance record](acceptance/2026-09-09/ACCEPTANCE.md).

# VERIFY

```
$ tsc --noEmit
exit=0                                                       # strict + exactOptional OK

$ node --test ./test/*.test.ts
✔ fingerprintPrompt returns a full 64-hex SHA-256 digest
✔ fingerprintPrompt canonical order is stable across key order
✔ canonicalizePlanInput omits undefined fields
✔ fingerprintPlanText normalizes CRLF
✔ extractPlanBlock finds fenced plan block
✔ extractPlanBlock returns undefined when no plan is embedded
✔ sha256Hex matches the Node crypto reference
✔ PreToolUse deny emits Codex permissionDecision JSON and exits 0
✔ PreToolUse allow exits 0 with empty stdout
✔ PreToolUse fails closed on bridge throw
✔ publishCitizen returns a did:arc passport and full plan hash
✔ publishCitizen rejects did:chio: fiction
✔ renderCitizen includes did:arc passport and schedule
tests 13  pass 13  fail 0

# Schema sources verified by WebFetch against the live docs:
#   .codex-plugin/plugin.json       per developers.openai.com/codex/plugins/build
#       required: name, version, description, skills
#   .codex/hooks.json               per developers.openai.com/codex/hooks
#       events: SessionStart, PreToolUse, PostToolUse, UserPromptSubmit, Stop
#       deny: exit 0 + stdout hookSpecificOutput.permissionDecision="deny"
```

Product-copy vs docs note: the page promises slash commands `/chio`,
`/chio-bond`, etc. Codex plugins expose user-facing commands via `skills/`
markdown, not a slash-command registry. We surface each intent two ways
(SKILL.md + `chio-codex <subcmd>` CLI). Consider adjusting page copy to
reflect this, or tracking upstream if Codex ships a slash-command feature.
