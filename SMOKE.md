# chio-codex-plugin · live smoke

Live end-to-end smoke for `@chio/codex-plugin@0.1.0` against:

- `codex-cli 0.121.0`
- `arc-cli 0.1.0` (release build at `standalone/arc/target/release/arc`)
- `@chio/bridge@0.1.0` (from `../chio-bridge/dist/`)
- `chio-test-harness` (ports rewritten to trust=8944, mcp=8935 for ST.2.3 isolation)

Runner: `./smoke.sh` (≤5 min, idempotent). Log: `smoke-results/smoke-<ts>.log`.

## Run

```bash
./smoke.sh
# 11/11 passed in ~15 s
```

## Claim ↔ proof table

| # | README claim                                                      | Smoke proof                                                                                                                                              |
|---|-------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------|
| 1 | Plugin installs into a Codex plugin dir via `.codex-plugin/plugin.json` + hooks pointer | Step 1: `codex exec` with `RUST_LOG=codex_core::plugins=warn` emits no `failed to load plugin` warning for `chio-codex@chio-smoke` once hooks.json and the `hooks` pointer are in place. |
| 2 | SessionStart hook auto-bonds against `$CHIO_POLICY_PATH`          | Step 3: `dist/hooks/sessionstart.mjs` writes `~/.codex/plugins/chio-codex/state.json` with `sessionId`, `policyPath`, `bondedAt`.                          |
| 3 | UserPromptSubmit SHA-256-fingerprints canonical `{cwd, model, prompt}` into `SessionBond.promptHash` (64-hex, no truncation) | Step 4: `promptHash=56d828dd2771aeb0eb9221835a38a1a890177b0cebf9f1e7a323311878d7ff5f` (64 hex chars). |
| 4 | PreToolUse routes every tool through `ChioBridge.check`; allow → exit 0 empty stdout | Step 5: `echo` allowed; hook stderr `[chio] allow: verdict=allow`; stdout empty; exit 0.                                                                   |
| 5 | Deny path returns real Codex contract `{hookSpecificOutput.permissionDecision:"deny", permissionDecisionReason}` | Step 6: `delete_file /etc/hosts` returns `{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"chio deny: requested tool delete_file on server * is not in capability scope"}}`. Guard name: arc `tool_access` + `forbidden_paths`. |
| 6 | Velocity-guard exhaustion under `tiny-budget.yaml` produces cancel verdict | Step 7: 5 `paid_action({usd:50})` tool calls through MCP edge; iter 4 + 5 return `guard "velocity" denied the request` (2 cancel verdicts; matches SMOKE_HARNESS_VERIFY.md iter-4 pattern). |
| 7 | `--publish` mints a real `did:arc:...` Agent Passport (NOT `did:chio:...`) | Step 8: `chio-codex publish smoke-test-citizen` → `did:arc:ef8c2c815f196e769caf5a88546e52822a1c6c68d06f2fd4b001232ef6fc34f9`. |
| 8 | Passport round-trips through the trust plane lifecycle registry | Step 8b: `GET /v1/passport/statuses` returns the DID with `status:"active"`. |
| 9 | `receipt-export` emits an offline-verifiable evidence bundle     | Step 9: `chio-codex receipt-export 1h` writes `smoke-results/evidence.json`; `bridge.verifyReceipt` passes Ed25519 on 1/1 receipts.                      |
| 10 | `revoke` tears down the bond; subsequent tool calls fail closed | Step 10: `chio-codex revoke` clears the bond from state.json; next `PreToolUse` (with no default policy configured) returns `permissionDecision:"deny"` with reason "no capability bonded for this Codex session and no default policy configured". |

## Live transcript excerpt (latest green run)

```
=== step 3: SessionStart → bond ===
[chio] bonded session smoke-codex-1776719374 under /tmp/chio-smoke-codex/policy/canonical.yaml
✓ step 3 passed

=== step 4: UserPromptSubmit → plan fingerprint ===
[chio] prompt fingerprint: 56d828dd2771aeb0eb9221835a38a1a890177b0cebf9f1e7a323311878d7ff5f
✓ step 4 passed (64-hex)

=== step 6: PreToolUse DENY (delete_file /etc/hosts) ===
stdout: {"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny",
         "permissionDecisionReason":"chio deny: requested tool delete_file on server * is not in capability scope"}}
✓ step 6 passed

=== step 7: budget exhaust via MCP edge + tiny-budget ===
iter 1: {"result":{"content":[{"text":"charged 50 USD"}],"isError":false, ...}}
iter 2: {"result":{"content":[{"text":"charged 50 USD"}],"isError":false, ...}}
iter 3: {"result":{"content":[{"text":"charged 50 USD"}],"isError":false, ...}}
iter 4: {"result":{"content":[{"text":"guard denied the request: guard \"guard-pipeline\" error (fail-closed):
                            guard denied the request: guard \"velocity\" denied the request"}],"isError":true}}
iter 5: same velocity cancel
✓ step 7 passed (2 cancel verdicts)

=== step 8: publish citizenship (did:arc passport) ===
published · smoke-test-citizen
passport  · did:arc:ef8c2c815f196e769caf5a88546e52822a1c6c68d06f2fd4b001232ef6fc34f9
policy    · /tmp/chio-smoke-codex/policy/canonical.yaml
✓ step 8 passed

=== step 8b: verify passport via trust plane ===
trust plane response: passport status = 'active'
✓ step 9 passed

=== step 9: receipt export ===
chio · evidence bundle written (1 receipt)
bridge.verifyReceipt: 1/1
✓ step 10 passed

=== step 10: revoke → fail-closed ===
post-revoke pretooluse: {"hookSpecificOutput":{"permissionDecision":"deny",
  "permissionDecisionReason":"no capability bonded for this Codex session and no default policy configured;
   run `codex --chio --policy <path>` or set CHIO_POLICY_PATH"}}
✓ step 11 passed

total steps: 11  passed: 11  failed: 0  runtime: 14s
```

## Plugin patches made while smoking

Two plugin bugs were surfaced and fixed in-place (minimal patches):

1. **`.codex-plugin/plugin.json:12`** — added `"hooks": "./hooks.json"` pointer.
   Codex's real plugin manifest contract (per `plugin-creator` scaffold embedded in
   the `codex` binary at `/Users/runner/work/codex/codex/codex-rs/core/src/plugins/manifest.rs`)
   requires this pointer for hooks to load; without it the hooks file is ignored.

2. **`hooks.json`** (new, at plugin root) — copied from the legacy `.codex/hooks.json`
   location. Codex's manifest resolves `hooks` relative to the plugin root and the
   canonical location per the plugin-creator reference is `<plugin>/hooks.json` (not
   `<plugin>/.codex/hooks.json` as the Wave 1 rewrite assumed). The `.codex/hooks.json`
   copy is kept for backward-compat but is no longer authoritative.

3. **`package.json` `files[]`** — added `hooks.json` so the published tarball
   ships the root-level hooks file.

## Important host caveat — codex 0.121.0 hooks are not yet wired end-to-end

`codex features list` reports `codex_hooks = under development, false`. Empirical
verification with a minimal probe plugin (`/tmp/chio-codex-probe`) that logs every
hook fire to a temp file showed:

- With `--enable codex_hooks`, `codex exec` loads the plugin without `failed to load`
  warnings, and the plugin is listed as active in the session.
- However, when codex executes `shell` or any other tool during a turn, the hook
  commands declared in `hooks.json` are **not invoked** (no stdout, no log line, no
  stderr from the hook command; no spawn attempt visible under
  `RUST_LOG=codex_hooks=trace,codex_core::plugins=debug`).

This matches the "under development" feature flag: the hook dispatcher is scaffolded
(schema, enum variants, error strings all present in the binary) but not yet
connected to the tool-call lifecycle in 0.121.0. Waiting for a Codex release that
promotes `codex_hooks` to `experimental` or `stable` is the only way to exercise the
hooks via a full LLM-driven loop.

Consequently, steps 3–6 and 10 of this smoke drive the plugin's hook scripts
directly via stdin JSON per the documented hook contract. This is the "partial host"
fallback path the smoke brief explicitly allows, and it proves the hook contract
end-to-end against real `arc` + real `@chio/bridge` — only the *Codex-side trigger*
is bypassed. Steps 1–2, 7–9, and the `--publish` round-trip are driven against
real `codex` / real arc daemon with no bypass.

## Files

- `smoke.sh` (executable, `set -euo pipefail`, idempotent, <20 s wall-clock).
- `smoke-results/` (gitignored; latest `.log` + `evidence.json` + `verify-receipts.mjs`).
- `hooks.json` (plugin-root canonical hooks file).
- Patched `.codex-plugin/plugin.json`, `package.json`.
