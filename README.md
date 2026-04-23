# @chio/codex-plugin

Chio plugin for the OpenAI Codex CLI. Every Codex plan-then-act loop runs
through the chio kernel: seven guards, signed receipts, attested plans,
and optional promotion to a named citizen with a `did:chio:` passport.

## Layout

```
chio-codex-plugin/
  .codex-plugin/plugin.json   # real Codex plugin manifest (name, version,
                              # description, skills dir, interface)
  .codex/hooks.json           # real Codex hooks config — PreToolUse,
                              # PostToolUse, UserPromptSubmit, Stop,
                              # SessionStart
  skills/                     # one SKILL.md per /chio-* action; Codex
                              # discovers these from plugin.json's
                              # `skills: "./skills/"`
  src/
    hooks/                    # pretooluse.ts, posttooluse.ts,
                              # userpromptsubmit.ts, stop.ts,
                              # sessionstart.ts — compiled to dist/hooks/*.mjs
    cli/                      # `chio-codex` subcommand handlers
    chio/                     # bridge builder, plan fingerprinting,
                              # publish flow, session state
  examples/migration.policy.yaml
```

The manifest filename / location (`/.codex-plugin/plugin.json`) and hooks
config location (`.codex/hooks.json`) follow the published Codex docs:

- https://developers.openai.com/codex/plugins/build
- https://developers.openai.com/codex/hooks

## Install

```bash
# Build
bun install
bun run build

# Register with Codex (adjust to your Codex install path)
mkdir -p ~/.codex/plugins/chio-codex
cp -R . ~/.codex/plugins/chio-codex
ln -sf ~/.codex/plugins/chio-codex/.codex/hooks.json ~/.codex/hooks.json

# Or, if your layout already honors .codex/hooks.json at the repo root,
# just copy the repo there.
```

## Usage

Basic bonded run:

```bash
chio-codex run --policy ./examples/migration.policy.yaml \
  -- codex "migrate our mongo users to postgres, dry-run first"
```

Plan-first attestation (recommended for any task whose plan you want
fingerprinted before the first tool call):

```bash
chio-codex run --policy ./examples/migration.policy.yaml --plan-first \
  -- codex "migrate our mongo users to postgres, dry-run first"
```

Publish the run as a named, scheduled citizen with a `did:chio:` passport:

```bash
chio-codex run --policy ./examples/migration.policy.yaml \
  --publish "weekly-mongo-sync" \
  --description "sync updates from mongo to postgres" \
  --schedule "0 3 * * 1" \
  -- codex "sync updates from mongo to postgres"
# on Stop:
#   published  · weekly-mongo-sync
#   passport   · did:chio:9f2c…<64-hex>
#   policy     · ./examples/migration.policy.yaml
#   schedule   · cron: 0 3 * * 1
```

**Scheduling note.** chio exposes no `chio schedule` subcommand yet; the
Citizen descriptor returns the cron expression and the pinned policy
path, and expects the operator to wire an external cron job that invokes
`chio run --policy <path> -- codex "..."` on the target cadence. When
chio lands a first-class scheduler, Stop will delegate to it.

Dump a signed evidence bundle on Stop:

```bash
chio-codex run --policy ./examples/migration.policy.yaml \
  --evidence ./run-evidence.json \
  -- codex "..."
```

## Slash-style actions

Codex doesn't register arbitrary `/foo` commands in the plugin manifest
the way Claude Code does — the official command surface is skills. The
plugin therefore surfaces every slash-style action two ways:

1. As a skill (`skills/chio-*/SKILL.md`) that instructs Codex to call
   `chio-codex <subcommand>` via its shell tool (arc will mediate the
   call through its guards exactly like any other shell invocation).
2. As a direct `chio-codex` CLI subcommand the user can invoke from any
   terminal, inside or outside a Codex session.

| Intent                          | Subcommand                                   |
|---------------------------------|----------------------------------------------|
| `/chio`                         | `chio-codex status`                          |
| `/chio-bond`                    | `chio-codex bond --policy <path>`            |
| `/chio-policy`                  | `chio-codex policy`                          |
| `/chio-guard-pause <g>`         | `chio-codex guard-pause <g> [--ttl <dur>]`   |
| `/chio-budget <usd>`            | `chio-codex budget <usd>`                    |
| `/chio-approve <receipt-id>`    | `chio-codex approve <receipt-id>`            |
| `/chio-revoke`                  | `chio-codex revoke`                          |
| `/chio-receipt-export <window>` | `chio-codex receipt-export <window>`         |
| `publish`                       | `chio-codex publish <name> [--schedule ...]` |

## Hook contract

Per https://developers.openai.com/codex/hooks:

- **stdin:** single JSON object with `session_id`, `transcript_path`,
  `cwd`, `hook_event_name`, `model`, `turn_id`, plus event-specific
  fields (e.g. `tool_name`, `tool_input` for `PreToolUse`).
- **PreToolUse deny:** exit 0 with stdout JSON
  `{ "hookSpecificOutput": { "hookEventName": "PreToolUse",
                              "permissionDecision": "deny",
                              "permissionDecisionReason": "..." } }`.
  Alternatively `{ "decision": "block", "reason": "..." }`.
- **Non-blocking events (PostToolUse, UserPromptSubmit, Stop,
  SessionStart):** exit 0; stderr is surfaced to the user transcript.

The plugin's hooks are **fail-closed**: any unexpected error in
PreToolUse denies the tool with reason `chio unavailable: <detail>`.
PostToolUse/UserPromptSubmit/Stop failures log to stderr but exit 0 so
they never trip a Codex session.

## Plan attestation

There is no `onPlan` lifecycle event in Codex. We attest plans at two
real integration points:

1. **UserPromptSubmit** — the first half. We SHA-256-hash the canonical
   JSON shape `{ cwd, model, prompt }` and store it into the SessionBond
   as `promptHash`. This fingerprint is embedded into every PreToolUse
   receipt's cache metadata.
2. **Plan-first mode** (`--plan-first`) — the second half. The `run`
   subcommand prepends an instruction asking Codex to emit its plan as a
   fenced ```plan``` block before any tool call. The UserPromptSubmit
   hook extracts that block and SHA-256-hashes it into `planHash`.
   Because the plan is visible in the prompt echo, no internal-only
   Codex lifecycle is required.

Plan drift surfaces as a post-hoc audit signal in evidence bundles: the
full plan hash travels alongside every receipt, and verifier tools can
compare the `planHash` observed at prompt time against the sequence of
tool calls actually emitted.

All hashes are full 64-hex-character SHA-256 digests over canonical JSON
/ normalized text. The receipt signature itself remains arc-native
Ed25519 over RFC 8785 canonical JSON (`ArcReceipt.signature`).

## Policy

Arc's HushSpec 0.1.0 has a closed `rules:` enum with
`deny_unknown_fields`. Per `ARC_UPSTREAM_PROPOSAL.md`'s migration table,
keys the product spec references but that arc hasn't promoted yet live
under `extensions.chio.*`:

- `extensions.chio.human_in_loop` (approval DSL)
- `extensions.chio.budget` (spend ceiling)

See `examples/migration.policy.yaml` for the canonical shape.

## Runtime

The plugin depends only on `@chio/bridge` (workspace). The bridge is the
only component that speaks to arc — it resolves daemon-mode vs CLI-mode
from env, normalizes endpoints (`chio trust serve` on 8940, `chio mcp
serve-http` on 8931), and exposes: `check`, `bond`, `revoke`, `receipts`,
`receiptStream`, `verifyReceipt`, `exportEvidence`, `issueCapability`,
`attenuate`, `createPassport`, `verifyPassport`, `loadPolicy`,
`lintPolicy`, `discoverMcpServers`, `wrapMcp`. No port 4821. No
`did:chio:` DIDs.

## License

Apache-2.0.

## CI

[![ci](https://github.com/owner/chio-codex-plugin/actions/workflows/ci.yml/badge.svg)](https://github.com/owner/chio-codex-plugin/actions/workflows/ci.yml)

Workflow: [`.github/workflows/ci.yml`](.github/workflows/ci.yml). Runs lint/typecheck (non-blocking in Wave 5.1), unit tests, and a chio-backed smoke pass. Swap `owner/...` once the GitHub org is live.
