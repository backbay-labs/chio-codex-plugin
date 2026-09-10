# Restricted Codex candidate

This mode runs Codex 0.153.4 with gpt-5.5 and one fixed Chio MCP gateway. It has
completed a real host file-write/read workflow through the kernel, a forbidden
write denial, unreachable-kernel refusal, and native patch/configuration-write
prevention. **I01-I08 are not all accepted.** The accepted scope and failures are
tracked in `acceptance/2026-09-09/RESTRICTED.md` and the artifact-specific
`acceptance/2026-09-09/final/FOLLOWUP.md`.

## Resource boundary

The protected filesystem must belong to the Chio kernel's tool server, under a
different resource boundary from the agent. The tested setup used a Docker volume
mounted only in the kernel's filesystem tool container. Codex had no mount,
Docker socket, shell, direct network tool, browser, app connector or delegation
route to that resource. The local working directory and Codex profile were fresh
and disposable. Codex native patch attempts were rejected by its read-only
sandbox, including an attempted deletion of private operator configuration.

The launcher explicitly disables shell, unified execution, agent delegation,
plugins/hooks, browser/computer tools, image tools and hosted web search. It
ignores user config and exec rules, uses a fresh working directory, fixes the MCP
server configuration, and rejects arbitrary host arguments. `apply_patch` remains
in the host tool catalog, but writing is disabled at its read-only effect boundary.
A required MCP server prevents startup when the packaged gateway fails to load.
MCP tools are explicitly allowed by Codex's `approve` setting for this one server;
Chio decides resource authority and performs the operation. No local precheck is
used to authorize unrestricted local execution.

The operator is trusted to choose the kernel endpoint, bearer token, signer and
resource container configuration. Moving protected resources into the host's
accessible filesystem, exposing Docker/shell tools, enabling another MCP server,
changing the model, or running ordinary `chio-codex run` does not preserve this
candidate boundary. Those modes require independent qualification.

## Build and package

The source includes a pinned bridge tarball and lockfile. It needs no private
sibling repository.

```bash
npm ci
npm test
npm run typecheck
npm run pack:release -- /absolute/output-directory
```

Direct `npm pack` intentionally refuses to create an unbundled candidate. The
staged artifact contains production dependencies. Install the returned tarball
into a fresh directory using `npm install --offline --ignore-scripts /path/to/package.tgz`.
Do not publish it as accepted until all required host gates pass and the complete
kernel/plugin/bridge artifact combination is identified.

## Operator configuration and run

The kernel must support `chio.mcp.execution-context.v1` and execution-evidence
version 1, delegated session credentials, and delivery acknowledgement version 1. The original public CLI 0.1.0 is not a qualified replacement. Prepare a
private JSON request (file mode 0600) with these fields:

```json
{
  "endpoint": "http://127.0.0.1:PORT",
  "bearerToken": "OPERATOR-BOOTSTRAP-TOKEN",
  "adminToken": "DISTINCT-OPERATOR-ADMIN-TOKEN",
  "credentialTtlSeconds": 900,
  "trustedSigners": ["64-HEX-TRUSTED-KERNEL-PUBLIC-KEY"],
  "serverId": "fs",
  "sessionId": "operator-selected-new-run-id",
  "journalDir": "/absolute/private/new-journal-directory",
  "allowedTools": ["read_text_file", "write_file", "edit_file", "list_directory"]
}
```

`endpoint` must use HTTPS or loopback HTTP. The bootstrap and distinct admin
credentials belong to the operator; keep this request outside the host-readable
process boundary. Preparation exchanges them for an expiring credential limited
to the established kernel session and selected tools. Only that delegated bearer
is written to the gateway configuration. `credentialTtlSeconds` is an integer
from 1 through 3600. The prepared public credential metadata records its expiry
and scope. A missing credential-exchange surface is a compatibility failure, not
permission to retain the bootstrap token in a host gateway.

Prepare a fresh kernel session without executing a tool, then launch:

```bash
chio-codex prepare-gateway /absolute/private-request.json /absolute/new-gateway.json
chio-codex restricted \
  --gateway-config /absolute/new-gateway.json \
  --evidence-dir /absolute/new-evidence-directory \
  --prompt 'Write /workspace/example.txt through Chio, then read it back.'
```

The operator supplies `OPENAI_API_KEY` or `--model-key-file /absolute/private/key`.
The key stays in the launcher. Codex receives only an ephemeral local model
transport token; its relay accepts fixed-model inline Responses requests and
local tool declarations, rejecting hosted tools, account references and other
routes. Normal Codex account state is never copied. The sandbox permits outbound
connections only to this relay and the launcher-owned Chio HTTP transport.

`--codex-binary /absolute/codex` selects the installed host executable; its native
binary must match version 0.153.4 and SHA256
`b973d440acac501fd2594a43e7ca9ce41e0a65b9dfb28d0d7a7837c99e1261e3`.
The launcher records arguments, gateway/config hashes, output JSONL, exit status
and runtime paths. It has a three-minute deadline. Interruption or timeout
cannot be treated as a verified result.

`launch.json` preserves the raw host exit separately from `execution_outcome`.
The launcher exits 2 for unknown, unfinished or malformed protected results and
3 for denied, undispatched or failed protected work, and 4 for pending operator
approval. Host failures remain nonzero.
Exit 0 with no protected call is labelled `host_completed_without_protected_result`;
it is not a claim that resource work succeeded. These statuses use structured
host/tool events, never the model's final prose.

## Recovery and upgrades

Keep the private gateway configuration and journal outside agent-accessible
resources. A pending or unknown operation fences later dispatch, and the bridge
must not retry it under a fresh operation identity. Observe the actual resource,
reconcile with retained kernel receipts, and record the result before issuing new
authority. Do not delete a journal or stale lock to make a failed run green.

The gateway now runs in the launcher process with a local HTTP transport. It
durably saves verified completion before `chio/acknowledge`; the kernel fences
new requests until acknowledgement. The guest cannot read its configuration or
journal, connect directly to the kernel, fork descendants, or execute Node/shell.
Killing the launcher closes the resource route. A new host transport namespaces
its RPC counter while retaining the same authority and journal.

Inspect retained state with `chio-gateway-operator status CONFIG`. For a dead
launcher on the same machine, `chio-gateway-operator recover-lock CONFIG` safely
recovers only the process lock and preserves all operation fences. Unknown
outcomes require independent reconciliation; a fresh session is not recovery.
Kernel idle-session expiry is 15 minutes by default and can occur before the
delegated credential expires. An expired session remains terminal.

To require approval, the operator configures `approval.requiredTools`, `purpose`
and a bounded `ttlSeconds` in the private gateway file against a matching kernel
confirmation policy. A proposed tool returns `awaiting_approval` without dispatch.
The operator uses `approval-submit` and `approval-decide`; the host may then call
`chio_resume` with the original request ID, tool and exact arguments. Host-specific
approval qualification remains open until its recorded cases pass.

Stop sessions before an upgrade, retain evidence, replace the identified artifact,
and repeat all applicable gates. The fresh profile contains no persistent Codex
plugin installation to remove. Remove only the recorded temporary profile after
preserving its evidence and reconciling any unknown resource outcome. The normal
Codex profile and normal Chio citizen state are not removed or edited.

## Existing ChatGPT subscription login

The trusted operator launcher supports `--model-auth-file /absolute/private/codex-home/auth.json` instead of `--model-key-file`. This explicit choice overrides an inherited `OPENAI_API_KEY`. The file must be owned by the operator, mode 0600, outside the installation and writable guest trees. The native cache's access token and account identifier stay in the parent; the sandbox receives a temporary relay token only. The relay permits only validated inline Responses inference at the native Codex ChatGPT endpoint. It cannot access stored conversations, files, hosted tools or arbitrary account routes.

Use `codex login` with a dedicated private `CODEX_HOME`, or copy the existing native cache into that directory as described in [Codex authentication](https://learn.chatgpt.com/docs/auth). Keep that profile in one serialized operator workflow. Native Codex owns renewal; this launcher never calls the OAuth refresh endpoint or rewrites the login cache. If inference returns 401, use native Codex to renew that operator profile before launching new work. An unknown protected operation still requires the documented owner reconciliation; authentication renewal does not release its fence. See [native refresh guidance](https://learn.chatgpt.com/docs/auth/ci-cd-auth).

The 2026-09-09 subscription test used Codex 0.153.4 with model gpt-5.5. It performed real kernel-mediated write/read calls and a denied write. This removes the API-credit blocker for this mode; full I01-I08 acceptance remains open. Keep account caches out of release bundles and evidence.
