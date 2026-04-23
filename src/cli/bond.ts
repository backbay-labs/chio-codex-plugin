import { upsertBond } from "../chio/state.js";
import { buildBridge, getDefaultPolicyPath } from "../chio/bridge.js";

/**
 * `chio-codex bond [--policy <path>] [--session <id>] [--delegatable]`
 *
 * Issues a capability via ChioBridge (delegating to `arc` CLI or the arc
 * trust plane) and persists a SessionBond. If --session isn't given we
 * use CODEX_SESSION_ID from env or fall back to "cli" as a single-user
 * default so the state file has exactly one bond.
 */
export async function bondCmd(args: string[]): Promise<string> {
  let policyPath: string | undefined;
  let sessionId: string | undefined;
  let delegatable = false;
  let ttl = "30m";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--policy") policyPath = args[++i];
    else if (a === "--session") sessionId = args[++i];
    else if (a === "--delegatable") delegatable = true;
    else if (a === "--ttl") ttl = args[++i] ?? "30m";
  }
  policyPath ??= getDefaultPolicyPath();
  if (!policyPath) {
    throw new Error(
      "chio-codex bond: no --policy and no CHIO_POLICY_PATH configured",
    );
  }
  sessionId ??= process.env["CODEX_SESSION_ID"] ?? "cli";

  const bridge = buildBridge();
  const cap = await bridge.issueCapability({
    subject: sessionId,
    scope: {}, // arc derives tool/egress scope from the policy at run time
    ttl,
    delegatable,
  });

  upsertBond({
    sessionId,
    policyPath,
    bondedAt: new Date().toISOString(),
    capabilityId: cap.id,
  });

  return (
    `chio · bonded\n` +
    `  session        ${sessionId}\n` +
    `  policy         ${policyPath}\n` +
    `  capability     ${cap.id}\n` +
    `  ttl            ${ttl}`
  );
}
