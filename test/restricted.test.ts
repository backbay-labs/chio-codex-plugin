import { test } from "node:test";
import assert from "node:assert/strict";
import { restrictedHostArgs, restrictedCmd } from "../dist/cli/restricted.js";

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
