# Ordinary Codex hook diagnostics

These hooks send tool events delivered by Codex to Chio for policy evaluation
and receipt collection. A successful precheck does not establish that Chio owns
execution or has a signed execution result. Real Codex 0.153.4 testing observed
file effects after hook crashes, missing scripts, malformed output, timeout and
silent omission. See the [host-contract record](../acceptance/2026-09-09/ACCEPTANCE.md).
The separate [restricted launcher](../RESTRICTED.md) has its own resource boundary.

## Hook contract and trust

The [manifest](../.codex-plugin/plugin.json) references [hooks.json](../hooks.json),
which contains synchronous `SessionStart`, `UserPromptSubmit`, `PreToolUse`,
`PostToolUse` and `Stop` handlers. Codex supplies `PLUGIN_ROOT` and `PLUGIN_DATA`.
Hooks must be trusted through Codex's `/hooks` interface; installation does not
automatically grant trust. A skipped hook did not block execution in the tested
host.

State uses `PLUGIN_DATA` when installed, then an explicit `CHIO_CODEX_STATE_DIR`,
then `CODEX_HOME` under `plugins/data/chio-codex`. This honors isolated profiles.
The ordinary plugin does not itself keep authority state outside an agent-writable
workspace; that separation is an operator responsibility.

`PreToolUse` requires a matching session bond and an explicit `allow` decision.
Unknown, pending, cancelled and denied decisions, plus bridge errors, produce
deny JSON. This check depends on Codex actually running the hook. A missing
`SessionStart` bond cannot be replaced by default policy at tool time. Cached
records use exact session/tool IDs and cannot borrow another parallel call's
receipt.

`PostToolUse` records authorization correlation and signature integrity separately
from trusted caller/request and execution-result verification. The stronger
claims remain false until their trusted evidence is available. Prompt and plan
hashes stored beside a receipt are unsigned local metadata.

## Diagnostic commands

After building from source, an operator can inspect the current session or wrap
an already installed and trusted diagnostic plugin:

```sh
node ./dist/cli/main.js status
node ./dist/cli/main.js run --policy /absolute/path/policy.yaml -- codex 'your task'
```

`run` exports policy and session options. It does not establish an execution
sandbox or require hooks to load. Capability, approval, budget, guard
administration, passport and scheduled-citizen commands remain unqualified as
untrusted-agent authority. Operator administration must stay outside the agent's
privileges.

## Reproduce the host contract

The [probe](../scripts/probe-host-hooks.py) requires Python 3, Node 22+, an
installed Codex CLI and model access. It starts real model sessions:

```sh
./smoke.sh --model gpt-6-astra \
  --auth-file /absolute/private/test/auth.json \
  --output /absolute/new/host-contract-evidence
```

The probe creates private temporary profiles and disposable workspaces, copies
the designated auth file only into those profiles, deletes those copies after
each case and independently inspects file effects. Normal Codex and Chio state
is not reset. Exit status is unsuccessful when a forbidden effect occurs or
useful work cannot run. The fixture isolates the host hook contract; it is not
I01-I08 acceptance for a Chio kernel/plugin pair.

## Recovery, upgrade and removal

Stop active diagnostic sessions before replacing artifacts. Retain receipt and
session records; reconcile an unknown external outcome at the resource before
retrying. Local bond removal cannot prove remote revocation. A failed remote
revoke reports that uncertainty while clearing the local bond.

Upgrade using an identified plugin/bridge/kernel combination and repeat the
applicable host probes and integration gates. Changed hooks require renewed
trust review. For a plugin installed by Codex, use
`codex plugin remove chio-codex@<marketplace>` in the same isolated profile.
Preserve evidence before removing the profile. Do not delete normal
`~/.codex/plugins` or `~/.chio/citizens` state.

[Back to the README](../README.md#ordinary-codex-hooks).
