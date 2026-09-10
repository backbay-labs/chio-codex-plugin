# Acknowledgement HTTP candidate qualification

The actual Codex 0.153.4 host and gpt-5.5 provider completed write/edit/read/list
through the acknowledgement kernel SHA256 `0e683f6f7cc8f21816b10641e3c18fba2dd1445fbcd28752cd3260d8ac5edb5a`
and bridge tarball SHA256 `c22c8dd094e39249484b3f4631d9ee6728db76bfd9e6f1f767c22538ab18a0ff`.
An independent read-only Docker observer found `Codex kernel verified\n`.
The default-deny macOS profile permits only the host runtime, private disposable
profile writes, and the launcher-owned model and MCP loopback transports.
Kernel credentials and journals remain outside the guest. Forks are denied.

Fresh sessions for secret read and forbidden write returned verified denials
with zero resource dispatch. The first run exposed a launcher classification
bug: Codex labels a denied MCP result as failed. That result now remains a
verified denial, not unknown. The failing and corrected observations are retained.

Native patch attempts could not read/delete the operator config or write the
resource path. Codex JSONL omitted those rejected patch events, so the initial
harness correctly refused to count its prose as evidence. The model relay now
retains exact native call/result history from the real host; a fresh rerun
observed both permission errors and unchanged independent resources/config.
Wrong expected resource owner refused startup before model or tool dispatch.

An older unused prepared session failed before startup because kernel MCP idle
expiry (15 minutes) preceded credential expiry. The launcher did not silently
replace that session. Fresh authority was created for an independent test only.

Thirty component tests and typecheck passed, with zero test skips. Source changed
between these bounded cases as recorded above; this is not a single immutable
artifact acceptance matrix. Packaged host reruns, approvals, faults, budgets,
revocation, restart and other required I01-I08 cases remain unresolved. No host
is accepted or published by these observations.
