# COMMITS.md — chio-codex-plugin

OpenAI Codex CLI plugin. Bonds every plan-then-act loop through the
chio kernel: seven guards, signed receipts, attested plans, optional
promotion to a named `did:chio:` citizen with a scheduled cadence.
Target first ship tag: `v0.2.0`.

---

## 1. chore: scaffold Codex plugin package

**Body.** `package.json` (`@chio/codex-plugin`, `bin: chio-codex`),
`.codex-plugin/plugin.json` manifest (Codex's official manifest
location per <https://developers.openai.com/codex/plugins/build>),
`.codex/hooks.json` (per
<https://developers.openai.com/codex/hooks>), `tsconfig.json`,
`LICENSE`, `.gitignore`, `bun.lock`. Wave 1.

**Files.**

- `package.json`, `bun.lock`
- `tsconfig.json`
- `LICENSE`, `.gitignore`
- `.codex-plugin/plugin.json`
- `.codex/hooks.json`
- `hooks.json` — root copy symlinked from `.codex/hooks.json` for
  alt Codex install layouts.

---

## 2. feat: hooks, skills, and chio-codex CLI against the real hook schema

**Body.** Five hook scripts (`pretooluse`, `posttooluse`,
`userpromptsubmit`, `stop`, `sessionstart`) compiled to
`dist/hooks/*.mjs`. Real Codex hook schema: single JSON object on
stdin with `session_id`, `transcript_path`, `cwd`,
`hook_event_name`, `model`, `turn_id`, plus event-specific
fields. PreToolUse denies with
`{hookSpecificOutput:{permissionDecision:"deny"}}`; non-blocking
events exit 0 on failure. Skills in `skills/chio-*/SKILL.md`
instruct Codex to call `chio-codex <subcommand>` via its shell
tool. `src/cli/main.ts` implements `run`, `bond`, `policy`,
`guard-pause`, `budget`, `approve`, `revoke`, `receipt-export`,
`publish`, `status`. Wave 1 rewrite against the host schema.

**Files.**

- `src/hooks/*.ts` — five hooks, all fail-closed on PreToolUse.
- `src/cli/*.ts` — the `chio-codex` subcommand surface.
- `src/chio/*.ts` — bridge builder, plan fingerprinting
  (SHA-256 over canonical JSON of `{cwd, model, prompt}`), publish
  flow, session state.
- `skills/*/SKILL.md`
- `examples/migration.policy.yaml`
- `scripts/mark-hooks-executable.mjs` — post-build chmod helper.

---

## 3. test: unit coverage plus chio-backed smoke

**Body.** Unit tests cover hook stdin parsing, fail-closed paths,
plan-hash canonicalisation, and `--publish` citizen descriptor
shape. `smoke.sh` runs the full `chio-codex run --plan-first`
loop against `chio-test-harness`: asserts bond, pre-tool deny on
`delete_file`, receipt export, plan hash embedded in receipt
cache metadata. Covers SMOKE.md's assertions. From Wave 1 test
suite + ST.2.x.

**Files.**

- `test/*.test.ts`
- `smoke.sh`
- `SMOKE.md`

---

## 4. feat: rename to chio, update bridge imports, extensions.chio policies

**Body.** Plugin rename from `arc-codex` to `chio-codex`, package
rename to `@chio/codex-plugin`, `did:chio:*` subject DIDs, bridge
construction through `ChioBridge.fromDaemon` / `fromCli`.
`examples/migration.policy.yaml` moves `velocity` and `human_in_loop`
under `extensions.chio.*` per the Wave 5.0.1 migration table in
`ARC_UPSTREAM_PROPOSAL.md`. Wave 5.0.

**Files.**

- `src/chio/*.ts` — rename of all `Arc*` identifiers.
- `examples/migration.policy.yaml`
- `.codex-plugin/plugin.json` — display name + bin slug bump.

---

## 5. ci: lint, typecheck, and chio-backed smoke

**Body.** GitHub Actions workflow parallel to the other plugins'
ci.yml: checks out bridge, test-harness, arc; runs `setup-chio`,
typecheck (non-blocking), unit tests, then `smoke.sh`. Wave 5.1.

**Files.**

- `.github/workflows/ci.yml`

---

## 6. ci: add SLSA L3 release workflow

**Body.** Tag-triggered `npm publish --provenance` to
`@<NPM_SCOPE>/codex-plugin` with SLSA L3 attestation. Wave 5.5.

**Files.**

- `.github/workflows/release.yml`

---

## 7. docs: README, VERIFY, and hook contract table

**Body.** Documents the Codex-specific quirks (no native slash
commands — commands surface as skills + a direct CLI; no `onPlan`
lifecycle — plans are fingerprinted at `UserPromptSubmit` and via
the `--plan-first` fenced-block convention), the scheduling
non-guarantee (chio has no `chio schedule` yet; Citizen descriptor
hands cron back to the operator), and the `extensions.chio.*`
policy migration. Wave 5.2.

**Files.**

- `README.md`
- `VERIFY.md`
