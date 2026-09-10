import { test } from "node:test";
import assert from "node:assert/strict";
import { restrictedHostArgs, restrictedCmd, summarizeRestrictedOutcome } from "../dist/cli/restricted.js";

test("restricted host fixes the enforcing sandbox and sole MCP server without prompt flag injection", () => {
  const prompt = '--sandbox danger-full-access --config mcp_servers.evil.command="sh"';
  const args = restrictedHostArgs("/tmp/disposable", "http://127.0.0.1:12345/mcp", prompt);
  assert.equal(args.at(-1), prompt);
  assert.equal(args.filter(arg => arg === "--sandbox").length, 1);
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  for (const flag of ["--strict-config", "--ignore-user-config", "--ignore-rules", "--ephemeral"]) assert.ok(args.includes(flag));
  for (const name of ["shell_tool", "unified_exec", "multi_agent", "plugins", "apps", "hooks", "computer_use", "view_image"]) {
    const index = args.indexOf(name); assert.equal(args[index - 1], "--disable");
  }
  const server = args.filter(arg => arg.startsWith("mcp_servers="));
  assert.equal(server.length, 1);
  assert.match(server[0]!, /bearer_token_env_var="CHIO_CODEX_GATEWAY_TOKEN"/);
  assert.doesNotMatch(server[0]!, /command=|args=|private.json/);
  assert.match(server[0]!, /required=true/);
  assert.match(server[0]!, /default_tools_approval_mode="approve"/);
});

test("restricted launcher rejects host override arguments before starting any host", async () => {
  await assert.rejects(restrictedCmd(["--sandbox", "danger-full-access"]), /arbitrary host arguments/);
  await assert.rejects(restrictedCmd(["--gateway-config", "/tmp/config", "--evidence-dir", "/tmp/evidence", "--prompt", "x", "--prompt", "y"]), /arbitrary host arguments/);
});

function completedCall(outcome: unknown) {
  return JSON.stringify({ type: "item.completed", item: { id: "call", type: "mcp_tool_call", server: "chio", status: "completed",
    result: { content: [{ type: "text", text: JSON.stringify(outcome) }] } } });
}

test("host exit zero does not turn an uncertain result into successful protected work", () => {
  for (const evidence of ["verified", "unverified"]) {
    const outcome = summarizeRestrictedOutcome(completedCall({ state: "unknown", evidence }), 0, null);
    assert.equal(outcome.exitCode, 2);
    assert.equal(outcome.status, "unknown");
    assert.equal(outcome.completed, 0);
  }
  assert.equal(summarizeRestrictedOutcome(completedCall({ state: "completed", evidence: "unverified" }), 0, null).exitCode, 2);
});

test("denial, non-dispatch and tool failure remain unsuccessful outcomes", () => {
  for (const value of [{ state: "denied", evidence: "verified" }, { state: "not_dispatched", evidence: "unverified" },
    { state: "completed", evidence: "verified", result: { isError: true } }]) {
    assert.equal(summarizeRestrictedOutcome(completedCall(value), 0, null).exitCode, 3);
  }
  assert.equal(summarizeRestrictedOutcome(completedCall({ state: "completed", evidence: "verified", result: { isError: false } }), 0, null).exitCode, 0);
});

test("unfinished, failed and malformed host events cannot claim verified success", () => {
  const pending = JSON.stringify({ type: "item.started", item: { id: "call", type: "mcp_tool_call", server: "chio" } });
  assert.equal(summarizeRestrictedOutcome(pending, 0, null).status, "unknown");
  assert.equal(summarizeRestrictedOutcome("malformed output", 0, null).exitCode, 2);
  assert.equal(summarizeRestrictedOutcome('{"type":"turn.failed"}', 0, null).exitCode, 1);
  assert.equal(summarizeRestrictedOutcome("", null, "SIGTERM").exitCode, 1);
  assert.equal(summarizeRestrictedOutcome('{"type":"turn.completed"}', 0, null).status, "host_completed_without_protected_result");
});

test("a deadline or operator interruption cannot inherit a trapped host exit zero", () => {
  const completed = completedCall({ state: "completed", evidence: "verified" });
  const outcome = summarizeRestrictedOutcome(completed, 0, null, true);
  assert.equal(outcome.completed, 1);
  assert.equal(outcome.status, "host_failed");
  assert.equal(outcome.exitCode, 1);
});


test("pending operator approval is explicit non-success without claiming uncertain dispatch", () => {
  const outcome = summarizeRestrictedOutcome(completedCall({state: "awaiting_approval"}), 0, null);
  assert.equal(outcome.exitCode, 4);
  assert.equal(outcome.unknown, 0);
  assert.equal(outcome.awaitingApproval, 1);
});


test("Codex failed MCP status preserves a verified kernel denial", () => {
  const event = JSON.parse(completedCall({state: "denied", evidence: "verified"}));
  event.item.status = "failed";
  const denied = summarizeRestrictedOutcome(JSON.stringify(event), 0, null);
  assert.equal(denied.denied, 1); assert.equal(denied.unknown, 0); assert.equal(denied.exitCode, 3);
  event.item.result.content[0].text = JSON.stringify({state: "completed", evidence: "verified"});
  assert.equal(summarizeRestrictedOutcome(JSON.stringify(event), 0, null).exitCode, 2);
});
