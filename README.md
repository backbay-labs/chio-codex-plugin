# @chio/codex-plugin

Chio policy diagnostics and receipt collection for the Codex CLI.
**Complete kernel mediation is not accepted.** Real Codex 0.153.4 testing found
that hook crashes, missing scripts, malformed output, timeout and omitted hooks
permit file effects. The full record is in
[acceptance/2026-09-09/ACCEPTANCE.md](acceptance/2026-09-09/ACCEPTANCE.md).

The plugin can send tool events that Codex delivers to Chio for policy evaluation.
A successful precheck does not mean Chio owns execution or that a signed execution
result exists. Do not use this plugin alone as the security boundary for files,
secrets, shell commands or remote resources.

## Restricted execution candidate

A separate [restricted launcher](RESTRICTED.md) now uses a fixed Chio MCP gateway,
a fresh profile and working directory, disabled native shell/delegation/browser
paths, and enforced read-only native patches. Real kernel-backed file work and
denial have run successfully. Full gate acceptance remains open.

## Reproduce the current host contract

Requires Python 3, Node 22+, an installed Codex CLI, and access to a model in the
account. This uses real model sessions and can incur account usage.

```bash
./smoke.sh --model gpt-6-astra
```

The script creates private temporary profiles and disposable workspaces, copies
the configured Codex auth file only into those profiles, deletes those copies
after each case, and independently inspects the file effects. Normal Codex and
Chio state is never reset. Set `--auth-file /path/to/test/auth.json` to use a
designated login. `--output /path/to/new/evidence` retains the raw reports. Exit
status is unsuccessful when a forbidden effect occurs or useful work cannot run.
The fixture hook isolates the host contract; it is not I01-I08 acceptance for the
Chio kernel/plugin pair.

## Plugin contract

The manifest is `.codex-plugin/plugin.json`, and it references `./hooks.json`.
The file contains a `hooks` envelope with synchronous SessionStart,
UserPromptSubmit, PreToolUse, PostToolUse and Stop handlers. Codex supplies
`PLUGIN_ROOT` and `PLUGIN_DATA`. Hooks must be trusted through Codex's `/hooks`
interface. Installing a plugin does not automatically trust its hooks.
[OpenAI hooks reference](https://developers.openai.com/codex/hooks).

State uses `PLUGIN_DATA` when installed, then `CHIO_CODEX_STATE_DIR` when explicitly
set, then the current `CODEX_HOME` under `plugins/data/chio-codex`. This respects
isolated profiles. Do not place authority state or secrets in a workspace writable
by an untrusted agent; this package does not enforce that separation itself.

PreToolUse requires a matching session bond and an explicit `allow` decision.
Unknown/pending/cancelled/denied decisions and bridge errors produce deny JSON.
Codex must actually run the hook for that check to happen. A missing SessionStart
bond cannot be replaced by the default policy at tool time. Cached records use
exact session/tool IDs; they never borrow another parallel call's receipt.

PostToolUse records authorization correlation and signature integrity separately
from trusted caller/request and execution-result verification. These stronger
verification claims remain false until their trusted evidence is available.
Prompt/plan hashes stored beside a receipt are unsigned local metadata.

## Development and diagnostic commands

The candidate pins a bundled bridge artifact. Run `npm ci` from source and
`npm run pack:release -- /absolute/output` to produce the self-contained staged
package. Installation/delivery qualification is tracked in the acceptance record.

```bash
npm test
npm run typecheck
chio-codex status
chio-codex run --policy /absolute/path/policy.yaml -- codex 'your task'
```

`run` exports policy and session options. It does not establish an execution
sandbox or require that hooks loaded. All capability, approval, budget, guard
administration, passport and scheduled-citizen operations remain unqualified for
untrusted-agent authority. Do not expose operator administration as an agent
privilege.

## Recovery, upgrade and removal

Stop active diagnostic sessions before replacing artifacts. Retain receipt and
session records; an unknown external outcome must be reconciled at the resource
before any retry. Local bond removal cannot prove remote revocation. A failed
remote revoke reports that uncertainty while clearing the local bond.

Upgrade only using an identified plugin/bridge/kernel combination and rerun the
host probes and applicable integration gates. Trust review after a hook change
can leave it skipped, which does not block tool execution in the tested host.
Use `codex plugin remove chio-codex@<marketplace>` in the same isolated profile
for a plugin installed by Codex. Preserve evidence before removing that profile.
Do not delete normal `~/.codex/plugins` or `~/.chio/citizens` state.

Apache-2.0.
