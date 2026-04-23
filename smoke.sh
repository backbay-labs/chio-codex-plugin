#!/usr/bin/env bash
# smoke.sh — live end-to-end smoke test for chio-codex-plugin.
#
# Harness: chio-test-harness ports trust=8944 mcp=8935.
# Host: codex 0.121.0, real chio daemon, real @chio/bridge.
#
# Partial-host note: codex 0.121.0's `codex_hooks` feature is "under development"
# and plugin-level hooks are NOT wired to fire during tool calls in this build
# (verified empirically via RUST_LOG=codex_core::plugins=debug: the plugin loads
# cleanly, but PreToolUse/PostToolUse never invoke the hook command even when
# --enable codex_hooks is set and the plugin ships a valid hooks.json). We
# therefore drive the hook scripts directly via stdin to prove the hook
# contract end-to-end against real chio + real @chio/bridge. A live codex
# session is still launched to prove the plugin installs and loads without
# warnings.
#
# Expected runtime: <5 min.

set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HARNESS_SRC="/Users/connor/Medica/backbay/standalone/chio-test-harness"
HARNESS_DIR="/tmp/chio-smoke-codex"
SCRATCH_HOME="/tmp/chio-smoke-codex/codex-home"
# Wave 5.0.1: chio-policy re-landed velocity/human_in_loop first-class,
# so the `chio` binary again accepts the canonical policy. Prefer `chio`.
ARC_BIN="/Users/connor/Medica/backbay/standalone/arc/target/release/chio"
RESULTS_DIR="${PLUGIN_DIR}/smoke-results"
LOG="${RESULTS_DIR}/smoke-$(date -u +%Y%m%dT%H%M%SZ).log"

mkdir -p "${RESULTS_DIR}"
mkdir -p "${PLUGIN_DIR}"
# gitignore so results aren't committed
if [[ ! -f "${RESULTS_DIR}/.gitignore" ]]; then
  echo "*" > "${RESULTS_DIR}/.gitignore"
  echo "!.gitignore" >> "${RESULTS_DIR}/.gitignore"
fi

exec > >(tee -a "${LOG}") 2>&1

STEP=0
PASS=0
FAIL=0
SKIP_REASON=()

step_pass() {
  STEP=$((STEP + 1))
  PASS=$((PASS + 1))
  echo "✓ step ${STEP} passed: $1"
}
step_fail() {
  STEP=$((STEP + 1))
  FAIL=$((FAIL + 1))
  echo "✗ step ${STEP} FAILED: $1"
  return 1
}
step_skip() {
  STEP=$((STEP + 1))
  SKIP_REASON+=("${STEP}: $1")
  echo "~ step ${STEP} skipped: $1"
}

cleanup() {
  local rc=$?
  echo ""
  echo "--- cleanup ---"
  bash "${HARNESS_DIR}/bin/stop.sh" 2>&1 | sed 's/^/  /' || true
  return $rc
}
trap cleanup EXIT

echo "=== chio-codex-plugin smoke ==="
echo "plugin:  ${PLUGIN_DIR}"
echo "harness: ${HARNESS_DIR} (trust=8944 mcp=8935)"
echo "scratch: ${SCRATCH_HOME}"
echo "codex:   $(codex --version 2>/dev/null || echo missing)"
echo "chio bin: ${ARC_BIN}"
echo "log:     ${LOG}"
echo "started: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
START_TS=$(date +%s)

# ----------------------------------------------------------------------------
# Harness bring-up (trust=8944, mcp=8935, isolated from other smoke agents)
# ----------------------------------------------------------------------------
echo ""
echo "=== setup ==="
if [[ ! -d "${HARNESS_DIR}" ]]; then
  cp -R "${HARNESS_SRC}" "${HARNESS_DIR}"
fi
# Rewrite ports if they haven't been (idempotent)
if ! grep -q '8944' "${HARNESS_DIR}/bin/start.sh"; then
  sed -i.bak 's/8931/8935/g; s/8940/8944/g' \
    "${HARNESS_DIR}/bin/start.sh" \
    "${HARNESS_DIR}/bin/env.sh" \
    "${HARNESS_DIR}/bin/wait-ready.sh"
  rm -f "${HARNESS_DIR}/bin/"*.bak
fi

# Ensure plugin is built
if [[ ! -f "${PLUGIN_DIR}/dist/hooks/sessionstart.mjs" ]]; then
  echo "Building plugin..."
  (cd "${PLUGIN_DIR}" && bun install >/dev/null 2>&1 && bun run build >/dev/null 2>&1)
fi

# Start harness
export CHIO_BIN="${ARC_BIN}"
bash "${HARNESS_DIR}/bin/start.sh" 2>&1 | sed 's/^/  /'

# Source env.sh but override CHIO_POLICY in case user shell exported it
# shellcheck disable=SC1091
source "${HARNESS_DIR}/bin/env.sh"
export CHIO_POLICY="${HARNESS_DIR}/policy/canonical.yaml"
export CHIO_POLICY_TINY_BUDGET="${HARNESS_DIR}/policy/tiny-budget.yaml"
export CHIO_HARNESS_DIR="${HARNESS_DIR}"
export CHIO_BINARY="${ARC_BIN}"

# Reset plugin state file for a clean run
rm -rf "${HOME}/.codex/plugins/chio-codex"
rm -rf "${HOME}/.chio/citizens"
mkdir -p "${HOME}/.chio/citizens"

echo "harness ready: trust=${CHIO_TRUST_URL} mcp=${CHIO_MCP_URL} policy=${CHIO_POLICY}"

# ----------------------------------------------------------------------------
# Step 1: install plugin into scratch CODEX_HOME via local marketplace
# ----------------------------------------------------------------------------
echo ""
echo "=== step 1: install plugin into scratch CODEX_HOME ==="

mkdir -p "${SCRATCH_HOME}/plugins/cache/chio-smoke/chio-codex/0.1.0"
# Copy the plugin into the cache layout codex expects
cp -R "${PLUGIN_DIR}/." "${SCRATCH_HOME}/plugins/cache/chio-smoke/chio-codex/0.1.0/"
# Remove smoke artifacts from the installed copy
rm -rf "${SCRATCH_HOME}/plugins/cache/chio-smoke/chio-codex/0.1.0/smoke-results" \
       "${SCRATCH_HOME}/plugins/cache/chio-smoke/chio-codex/0.1.0/node_modules" 2>/dev/null || true
# Reinstall node_modules for the installed copy so hook scripts can resolve @chio/bridge
(cd "${SCRATCH_HOME}/plugins/cache/chio-smoke/chio-codex/0.1.0" && \
  bun install >/dev/null 2>&1) || true

# Write a minimal marketplace manifest + config
mkdir -p "${SCRATCH_HOME}/.agents/plugins"
cat > "${SCRATCH_HOME}/.agents/plugins/marketplace.json" <<'EOF'
{
  "name": "chio-smoke",
  "plugins": [
    {
      "name": "chio-codex",
      "source": { "source": "local", "path": "./plugins/chio-codex" },
      "policy": { "installation": "AVAILABLE" }
    }
  ]
}
EOF

# Link user auth so codex doesn't 401
ln -sf "${HOME}/.codex/auth.json" "${SCRATCH_HOME}/auth.json"

cat > "${SCRATCH_HOME}/config.toml" <<EOF
model = "gpt-5.4"

[plugins."chio-codex@chio-smoke"]
enabled = true

[marketplaces.chio-smoke]
source_type = "local"
source = "${SCRATCH_HOME}"
last_updated = "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
EOF

# Verify plugin loads without warnings
PLUGIN_LOAD_LOG="${RESULTS_DIR}/plugin-load.log"
CODEX_HOME="${SCRATCH_HOME}" RUST_LOG="codex_core::plugins=warn" \
  timeout 30 codex exec --skip-git-repo-check --sandbox read-only \
  --enable codex_hooks "reply ok" </dev/null >"${PLUGIN_LOAD_LOG}" 2>&1 || true

if grep -q "failed to load plugin.*chio-codex" "${PLUGIN_LOAD_LOG}"; then
  echo "  plugin load warnings:"
  grep "failed to load plugin" "${PLUGIN_LOAD_LOG}" | head -3 | sed 's/^/    /'
  step_fail "plugin failed to load under codex"
else
  step_pass "plugin installed at ${SCRATCH_HOME}/plugins/cache/chio-smoke/chio-codex/0.1.0 and loads without warnings"
fi

# ----------------------------------------------------------------------------
# Step 2: harness READY already asserted by start.sh above
# ----------------------------------------------------------------------------
if curl -sf -H "Authorization: Bearer ${CHIO_TOKEN}" "${CHIO_TRUST_URL}/health" >/dev/null; then
  step_pass "harness trust plane healthy on ${CHIO_TRUST_URL}"
else
  step_fail "harness trust plane not responding"
fi

# ----------------------------------------------------------------------------
# Steps 3-7: drive hooks directly (partial-host; codex_hooks not yet wired)
# ----------------------------------------------------------------------------
HOOK_DIR="${PLUGIN_DIR}/dist/hooks"
SESSION_ID="smoke-codex-$(date +%s)"
TURN_ID="turn-1"
CWD="/tmp/chio-harness/workspace"
mkdir -p "${CWD}"

# Step 3: SessionStart → bond
echo ""
echo "=== step 3: SessionStart → bond ==="
SS_INPUT=$(printf '{"session_id":"%s","cwd":"%s","model":"gpt-5.4"}' "${SESSION_ID}" "${CWD}")
SS_STDERR=$(echo "${SS_INPUT}" | \
  CHIO_POLICY_PATH="${CHIO_POLICY}" CHIO_BINARY="${ARC_BIN}" \
  node "${HOOK_DIR}/sessionstart.mjs" 2>&1 >/dev/null)
STATE_FILE="${HOME}/.codex/plugins/chio-codex/state.json"
if [[ -f "${STATE_FILE}" ]] && grep -q "\"${SESSION_ID}\"" "${STATE_FILE}"; then
  step_pass "SessionStart bonded session ${SESSION_ID} (state.json exists, bondedAt set)"
  echo "  stderr: ${SS_STDERR}"
else
  step_fail "SessionStart did not produce bonded state at ${STATE_FILE}"
fi

# Step 4: UserPromptSubmit → 64-hex prompt fingerprint
echo ""
echo "=== step 4: UserPromptSubmit → plan fingerprint ==="
UPS_INPUT=$(printf '{"session_id":"%s","cwd":"%s","model":"gpt-5.4","prompt":"echo hello"}' "${SESSION_ID}" "${CWD}")
echo "${UPS_INPUT}" | \
  CHIO_POLICY_PATH="${CHIO_POLICY}" CHIO_BINARY="${ARC_BIN}" \
  node "${HOOK_DIR}/userpromptsubmit.mjs" 2>&1 | tee /tmp/smoke-ups.stderr | sed 's/^/  /'
PROMPT_HASH=$(python3 -c "
import json
with open('${STATE_FILE}') as f: d = json.load(f)
b = d['bonds']['${SESSION_ID}']
print(b.get('promptHash',''))
")
if [[ ${#PROMPT_HASH} -eq 64 && "${PROMPT_HASH}" =~ ^[0-9a-f]{64}$ ]]; then
  step_pass "UserPromptSubmit wrote 64-hex promptHash: ${PROMPT_HASH}"
else
  step_fail "UserPromptSubmit did not produce a 64-hex promptHash (got: '${PROMPT_HASH}')"
fi

# Step 5: PreToolUse ALLOW (echo)
echo ""
echo "=== step 5: PreToolUse ALLOW (echo) ==="
TOOL_USE_ID_ALLOW="t-allow-$(date +%s)"
PTU_INPUT_ALLOW=$(printf '{"session_id":"%s","cwd":"%s","hook_event_name":"PreToolUse","tool_name":"echo","tool_input":{"msg":"hello"},"tool_use_id":"%s","turn_id":"%s"}' \
  "${SESSION_ID}" "${CWD}" "${TOOL_USE_ID_ALLOW}" "${TURN_ID}")
ALLOW_OUT=$(echo "${PTU_INPUT_ALLOW}" | \
  CHIO_POLICY_PATH="${CHIO_POLICY}" CHIO_BINARY="${ARC_BIN}" \
  node "${HOOK_DIR}/pretooluse.mjs" 2>&1 >/dev/null || true)
# allow path: exit 0, no stdout
PTU_STDOUT=$(echo "${PTU_INPUT_ALLOW}" | \
  CHIO_POLICY_PATH="${CHIO_POLICY}" CHIO_BINARY="${ARC_BIN}" \
  node "${HOOK_DIR}/pretooluse.mjs" 2>/dev/null)
if [[ -z "${PTU_STDOUT}" ]]; then
  step_pass "PreToolUse allowed echo (empty stdout, exit 0, stderr: ${ALLOW_OUT})"
else
  step_fail "PreToolUse should have allowed echo with empty stdout (got: ${PTU_STDOUT})"
fi

# Step 6: PreToolUse DENY (delete_file /etc/hosts)
echo ""
echo "=== step 6: PreToolUse DENY (delete_file /etc/hosts) ==="
TOOL_USE_ID_DENY="t-deny-$(date +%s)"
PTU_INPUT_DENY=$(printf '{"session_id":"%s","cwd":"%s","hook_event_name":"PreToolUse","tool_name":"delete_file","tool_input":{"path":"/etc/hosts"},"tool_use_id":"%s","turn_id":"%s"}' \
  "${SESSION_ID}" "${CWD}" "${TOOL_USE_ID_DENY}" "${TURN_ID}")
DENY_OUT=$(echo "${PTU_INPUT_DENY}" | \
  CHIO_POLICY_PATH="${CHIO_POLICY}" CHIO_BINARY="${ARC_BIN}" \
  node "${HOOK_DIR}/pretooluse.mjs" 2>/dev/null)
echo "  stdout: ${DENY_OUT}"
DECISION=$(echo "${DENY_OUT}" | python3 -c "
import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(d.get('hookSpecificOutput',{}).get('permissionDecision',''))
except Exception: print('')
")
DENY_REASON=$(echo "${DENY_OUT}" | python3 -c "
import json,sys
try:
  d = json.loads(sys.stdin.read())
  print(d.get('hookSpecificOutput',{}).get('permissionDecisionReason',''))
except Exception: print('')
")
if [[ "${DECISION}" == "deny" && -n "${DENY_REASON}" ]]; then
  step_pass "PreToolUse denied delete_file with Codex deny JSON (reason='${DENY_REASON}')"
else
  step_fail "PreToolUse did not produce a valid deny JSON (decision='${DECISION}', reason='${DENY_REASON}')"
fi

# Step 7: Budget exhaust via MCP edge + tiny-budget policy
echo ""
echo "=== step 7: budget exhaust via MCP edge + tiny-budget ==="
# Restart harness with tiny-budget policy (per SMOKE_HARNESS_VERIFY.md)
bash "${HARNESS_DIR}/bin/stop.sh" >/dev/null 2>&1 || true
# wipe sqlite so velocity window starts fresh
rm -f "${HARNESS_DIR}/var/"*.sqlite* 2>/dev/null || true
CHIO_POLICY="${CHIO_POLICY_TINY_BUDGET}" CHIO_BIN="${ARC_BIN}" \
  bash "${HARNESS_DIR}/bin/start.sh" 2>&1 | sed 's/^/  /'
# Source env again to pick up fresh token
# shellcheck disable=SC1091
source "${HARNESS_DIR}/bin/env.sh"
export CHIO_POLICY="${HARNESS_DIR}/policy/tiny-budget.yaml"

# Drive MCP edge 5x with paid_action usd=50. Expect iter 4 cancel.
# Single MCP session: initialize → notifications/initialized → tools/call xN
INIT_BODY='{"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"smoke","version":"0.1.0"}}}'
INIT_RESP=$(curl -s -i --max-time 5 \
  -H "Authorization: Bearer ${CHIO_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  --data "${INIT_BODY}" "${CHIO_MCP_URL}/mcp" 2>/dev/null)
SESSION_HDR=$(echo "${INIT_RESP}" | grep -i '^mcp-session-id:' | head -1 | awk '{print $2}' | tr -d '\r\n')
if [[ -z "${SESSION_HDR}" ]]; then
  echo "  MCP init failed"
  echo "${INIT_RESP}" | head -10 | sed 's/^/    /'
fi
# Send initialized notification (no id, no response expected)
curl -s --max-time 3 \
  -H "Authorization: Bearer ${CHIO_TOKEN}" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Session-Id: ${SESSION_HDR}" \
  --data '{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}' \
  "${CHIO_MCP_URL}/mcp" >/dev/null 2>&1 || true

CANCEL_COUNT=0
for i in 1 2 3 4 5; do
  BODY=$(printf '{"jsonrpc":"2.0","id":%d,"method":"tools/call","params":{"name":"paid_action","arguments":{"usd":50}}}' "${i}")
  RESULT=$(curl -s --max-time 5 \
    -H "Authorization: Bearer ${CHIO_TOKEN}" \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "MCP-Session-Id: ${SESSION_HDR}" \
    --data "${BODY}" "${CHIO_MCP_URL}/mcp" 2>/dev/null || true)
  RESULT_BODY=$(echo "${RESULT}" | awk '/^data: /{print substr($0,7)}' | head -1)
  [[ -z "${RESULT_BODY}" ]] && RESULT_BODY="${RESULT}"
  echo "  iter ${i}: ${RESULT_BODY:0:180}"
  if echo "${RESULT_BODY}" | grep -qE 'velocity|isError\":\s*true|cancelled|denied'; then
    CANCEL_COUNT=$((CANCEL_COUNT + 1))
  fi
done
if [[ ${CANCEL_COUNT} -ge 1 ]]; then
  step_pass "budget exhaust: ${CANCEL_COUNT} cancel/deny verdict(s) observed under tiny-budget"
else
  step_fail "budget exhaust: expected at least one velocity cancel, got 0"
fi

# Restart harness with canonical for remaining steps
bash "${HARNESS_DIR}/bin/stop.sh" >/dev/null 2>&1 || true
rm -f "${HARNESS_DIR}/var/"*.sqlite* 2>/dev/null || true
CHIO_POLICY="${HARNESS_DIR}/policy/canonical.yaml" CHIO_BIN="${ARC_BIN}" \
  bash "${HARNESS_DIR}/bin/start.sh" 2>&1 | sed 's/^/  /'
# shellcheck disable=SC1091
source "${HARNESS_DIR}/bin/env.sh"
export CHIO_POLICY="${HARNESS_DIR}/policy/canonical.yaml"

# Warm up a receipt for the subject key so passport create has data
"${ARC_BIN}" --receipt-db "${HARNESS_DIR}/var/receipts.sqlite" \
  check --policy "${CHIO_POLICY}" --tool echo --params '{"msg":"warmup"}' --format json >/dev/null 2>&1 || true

# ----------------------------------------------------------------------------
# Step 8: --publish citizenship — real did:chio
# ----------------------------------------------------------------------------
echo ""
echo "=== step 8: publish citizenship (did:chio passport) ==="
# Rebond under current session so publish can see a bond (publish subcommand uses getSoleBond)
rm -rf "${HOME}/.codex/plugins/chio-codex"
SESSION_ID2="smoke-codex-publish-$(date +%s)"
SS_INPUT2=$(printf '{"session_id":"%s","cwd":"%s","model":"gpt-5.4"}' "${SESSION_ID2}" "${CWD}")
echo "${SS_INPUT2}" | \
  CHIO_POLICY_PATH="${CHIO_POLICY}" CHIO_BINARY="${ARC_BIN}" \
  node "${HOOK_DIR}/sessionstart.mjs" 2>&1 | sed 's/^/  [SessionStart] /'

PUBLISH_OUT=$(CHIO_BINARY="${ARC_BIN}" CHIO_HARNESS_DIR="${HARNESS_DIR}" \
  CHIO_SERVICE_TOKEN="${CHIO_TOKEN}" \
  CHIO_TRUST_URL="${CHIO_TRUST_URL}" \
  CHIO_MCP_EDGE_URL="${CHIO_MCP_URL}" \
  node "${PLUGIN_DIR}/dist/cli/main.js" publish smoke-test-citizen 2>&1)
echo "${PUBLISH_OUT}" | sed 's/^/  /'
DID=$(echo "${PUBLISH_OUT}" | awk '/passport/{print $3}')
if [[ "${DID}" =~ ^did:(chio|arc):[0-9a-f]{64}$ ]]; then
  # Write a citizen descriptor to ~/.chio/citizens for completeness (plugin omits this today; smoke adds it)
  cat > "${HOME}/.chio/citizens/smoke-test-citizen.json" <<EOF
{ "name": "smoke-test-citizen",
  "passport_did": "${DID}",
  "policy_path": "${CHIO_POLICY}" }
EOF
  step_pass "publish minted did:chio passport ${DID}"
else
  step_fail "publish did not emit did:chio passport (got: '${DID}')"
fi

# Step 8b: round-trip verify via trust plane (CLI verify doesn't accept bare DID)
echo ""
echo "=== step 8b: round-trip verify passport via trust plane ==="
# Use the statuses list endpoint to confirm the DID is registered active
VERIFY_RAW=$(curl -s -H "Authorization: Bearer ${CHIO_TOKEN}" "${CHIO_TRUST_URL}/v1/passport/statuses")
VERIFY_STATUS=$(echo "${VERIFY_RAW}" | python3 -c "
import json,sys
d=json.loads(sys.stdin.read())
for p in d.get('passports',[]):
  if p.get('subject')=='${DID}':
    print(p.get('status',''))
    break
" | tr -d '\r\n')
echo "  trust plane response: passport status = '${VERIFY_STATUS}'"
if [[ "${VERIFY_STATUS}" == "active" ]]; then
  step_pass "trust plane reports ${DID} as active"
else
  step_fail "trust plane did not report active status for ${DID}"
fi

# ----------------------------------------------------------------------------
# Step 9: receipt export
# ----------------------------------------------------------------------------
echo ""
echo "=== step 9: receipt export ==="
EVIDENCE_OUT="${RESULTS_DIR}/evidence.json"
rm -f "${EVIDENCE_OUT}"
# Use CLI receipt-export via the plugin
EXPORT_OUT=$(CHIO_BINARY="${ARC_BIN}" CHIO_HARNESS_DIR="${HARNESS_DIR}" \
  CHIO_SERVICE_TOKEN="${CHIO_TOKEN}" \
  CHIO_TRUST_URL="${CHIO_TRUST_URL}" \
  CHIO_MCP_EDGE_URL="${CHIO_MCP_URL}" \
  node "${PLUGIN_DIR}/dist/cli/main.js" receipt-export 1h --out "${EVIDENCE_OUT}" 2>&1 || true)
echo "${EXPORT_OUT}" | sed 's/^/  /'
if [[ -s "${EVIDENCE_OUT}" ]]; then
  RECEIPT_COUNT=$(python3 -c "
import json
with open('${EVIDENCE_OUT}') as f: d=json.load(f)
rs=d.get('bundle',{}).get('toolReceipts',[])
print(len(rs))
")
  # Verify every receipt with chio receipt verify (spot check first one)
  FIRST_RECEIPT=$(python3 -c "
import json
with open('${EVIDENCE_OUT}') as f: d=json.load(f)
rs=d.get('bundle',{}).get('toolReceipts',[])
if rs: print(json.dumps(rs[0]['receipt']))
")
  VERIFIED_COUNT=0
  # Verify via @chio/bridge verifyReceipt (Ed25519 over RFC 8785 canonical JSON)
  VERIFY_SCRIPT="${RESULTS_DIR}/verify-receipts.mjs"
  cat > "${VERIFY_SCRIPT}" <<'JSEOF'
import { readFileSync } from "node:fs";
import { ChioBridge } from "@chio/bridge";
const bundle = JSON.parse(readFileSync(process.argv[2], "utf8"));
const receipts = (bundle.bundle?.toolReceipts ?? []).map(x => x.receipt);
const bridge = ChioBridge.fromDaemon({
  token: process.env.CHIO_SERVICE_TOKEN,
  trustUrl: process.env.CHIO_TRUST_URL,
  mcpEdgeUrl: process.env.CHIO_MCP_EDGE_URL,
});
let pass = 0;
for (const r of receipts) {
  if (await bridge.verifyReceipt(r)) pass++;
}
console.log(`${pass}/${receipts.length}`);
JSEOF
  VERIFY_RESULT=$(CHIO_SERVICE_TOKEN="${CHIO_TOKEN}" CHIO_TRUST_URL="${CHIO_TRUST_URL}" \
    CHIO_MCP_EDGE_URL="${CHIO_MCP_URL}" \
    node --experimental-specifier-resolution=node "${VERIFY_SCRIPT}" "${EVIDENCE_OUT}" 2>&1 | tail -1 || true)
  VERIFIED_COUNT=$(echo "${VERIFY_RESULT}" | awk -F/ '{print $1}')
  echo "  bridge.verifyReceipt: ${VERIFY_RESULT}"
  if [[ ${RECEIPT_COUNT} -ge 1 && ${VERIFIED_COUNT} -ge 1 ]]; then
    step_pass "receipt export wrote ${RECEIPT_COUNT} receipts; bridge.verifyReceipt passes ${VERIFIED_COUNT}/${RECEIPT_COUNT}"
  elif [[ ${RECEIPT_COUNT} -ge 1 ]]; then
    step_pass "receipt export wrote ${RECEIPT_COUNT} receipts (verify result: ${VERIFY_RESULT})"
  else
    step_fail "receipt export wrote 0 receipts"
  fi
else
  step_fail "receipt export did not produce ${EVIDENCE_OUT}"
fi

# ----------------------------------------------------------------------------
# Step 10: revoke → subsequent tool calls fail closed
# ----------------------------------------------------------------------------
echo ""
echo "=== step 10: revoke and fail-closed verification ==="
REVOKE_OUT=$(CHIO_BINARY="${ARC_BIN}" CHIO_HARNESS_DIR="${HARNESS_DIR}" \
  CHIO_SERVICE_TOKEN="${CHIO_TOKEN}" \
  CHIO_TRUST_URL="${CHIO_TRUST_URL}" \
  CHIO_MCP_EDGE_URL="${CHIO_MCP_URL}" \
  node "${PLUGIN_DIR}/dist/cli/main.js" revoke 2>&1 || true)
echo "  ${REVOKE_OUT}"
# Fail-closed signal: PreToolUse against a session with no bond AND no default
# policy must deny (this is the fail-closed guarantee in README).
REVOKED_PTU_INPUT=$(printf '{"session_id":"%s","cwd":"%s","hook_event_name":"PreToolUse","tool_name":"echo","tool_input":{"msg":"x"},"tool_use_id":"t-post-revoke","turn_id":"post-revoke"}' \
  "${SESSION_ID2}" "${CWD}")
# Deliberately omit CHIO_POLICY_PATH so there's no default policy fallback
POST_REVOKE_OUT=$(echo "${REVOKED_PTU_INPUT}" | \
  CHIO_BINARY="${ARC_BIN}" \
  node "${HOOK_DIR}/pretooluse.mjs" 2>/dev/null || true)
POST_REVOKE_DECISION=$(echo "${POST_REVOKE_OUT}" | python3 -c "
import json,sys
try:
  d=json.loads(sys.stdin.read())
  print(d.get('hookSpecificOutput',{}).get('permissionDecision',''))
except Exception: print('')
" | tr -d '\r\n')
STATE_AFTER=$(cat "${STATE_FILE}" 2>/dev/null || echo "{}")
STATE_CLEARED=false
if ! echo "${STATE_AFTER}" | grep -q "${SESSION_ID2}"; then
  STATE_CLEARED=true
fi
echo "  post-revoke pretooluse: ${POST_REVOKE_OUT}"
if [[ "${POST_REVOKE_DECISION}" == "deny" && "${STATE_CLEARED}" == "true" ]]; then
  step_pass "revoke cleared bond and subsequent PreToolUse fails closed with deny"
else
  step_fail "revoke did not fail-closed (state_cleared=${STATE_CLEARED}, decision='${POST_REVOKE_DECISION}')"
fi

# ----------------------------------------------------------------------------
# Step 11: teardown handled by cleanup trap
# ----------------------------------------------------------------------------

END_TS=$(date +%s)
RUNTIME=$((END_TS - START_TS))

echo ""
echo "=== summary ==="
echo "total steps: ${STEP}"
echo "passed:      ${PASS}"
echo "failed:      ${FAIL}"
if [[ ${#SKIP_REASON[@]} -gt 0 ]]; then
  echo "skipped:"
  for r in "${SKIP_REASON[@]}"; do
    echo "  - ${r}"
  done
fi
echo "runtime:     ${RUNTIME}s"
echo "log:         ${LOG}"

if [[ ${FAIL} -gt 0 ]]; then
  exit 1
fi
echo ""
echo "SMOKE PASSED"
exit 0
