import { getSoleBond, patchBond } from "../chio/state.js";

/**
 * `chio-codex guard-pause <guard-name> [--ttl <duration>]`
 *
 * Arc's default guard pipeline is fail-closed; "pausing" a guard is a
 * local advisory — we record the request in SessionBond.pausedGuards and
 * surface it in status. Actually suppressing a guard at run time requires
 * either a policy tweak (via arc's policy extensions) or an operator
 * override through the trust plane; this subcommand sets up the *intent*
 * and emits the operator-facing diff.
 */
export async function guardPauseCmd(args: string[]): Promise<string> {
  const [guard, ...rest] = args;
  if (!guard) throw new Error("chio-codex guard-pause: guard name required");
  let ttl = "10m";
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--ttl") ttl = rest[++i] ?? ttl;
  }
  const bond = getSoleBond();
  if (!bond) return "chio · no active bond · nothing to pause";
  const expires = new Date(Date.now() + parseDurationMs(ttl)).toISOString();
  const next = { ...(bond.pausedGuards ?? {}), [guard]: expires };
  patchBond(bond.sessionId, { pausedGuards: next });
  return (
    `chio · guard paused (advisory)\n` +
    `  guard          ${guard}\n` +
    `  expires_at     ${expires}\n` +
    `  note           arc enforces guards at the kernel; propagate this to your ` +
    `policy or trust-plane override to actually suppress it.`
  );
}

function parseDurationMs(d: string): number {
  const m = d.match(/^(\d+)([smhd])$/);
  if (!m || !m[1] || !m[2]) return 10 * 60 * 1000;
  const n = parseInt(m[1], 10);
  switch (m[2]) {
    case "s": return n * 1000;
    case "m": return n * 60 * 1000;
    case "h": return n * 60 * 60 * 1000;
    case "d": return n * 24 * 60 * 60 * 1000;
    default: return 10 * 60 * 1000;
  }
}
