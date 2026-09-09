import { test } from "node:test";
import assert from "node:assert/strict";
import { restrictedHostArgs, restrictedCmd, summarizeRestrictedOutcome } from "../dist/cli/restricted.js";

test("restricted host fixes the enforcing sandbox and sole MCP server without prompt flag injection", () => {
  const prompt = '--sandbox danger-full-access --config mcp_servers.evil.command="sh"';
  const args = restrictedHostArgs("/tmp/disposable", "/opt/plugin/gateway.js", "/operator/private.json", prompt);
  assert.equal(args.at(-1), prompt);
  assert.equal(args.filter(arg => arg === "--sandbox").length, 1);
  assert.equal(args[args.indexOf("--sandbox") + 1], "read-only");
  for (const flag of ["--strict-config", "--ignore-user-config", "--ignore-rules", "--ephemeral"]) assert.ok(args.includes(flag));
  for (const name of ["shell_tool", "unified_exec", "multi_agent", "plugins", "apps", "hooks", "computer_use", "view_image"]) {
    const index = args.indexOf(name); assert.equal(args[index - 1], "--disable");
  }
  const server = args.filter(arg => arg.startsWith("mcp_servers="));
  assert.equal(server.length, 1);
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
