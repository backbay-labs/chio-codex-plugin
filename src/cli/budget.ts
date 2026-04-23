import { getSoleBond, patchBond } from "../chio/state.js";

/**
 * `chio-codex budget <usd>`
 *
 * Sets a local budget cap. Arc's budgets live in the trust-plane (see
 * /v1/budgets in ARC_GROUND_TRUTH). Our local cap is advisory + reflected
 * in status; to enforce at the kernel level, plumb this through the arc
 * trust-plane budgets endpoints (future work).
 */
export async function budgetCmd(args: string[]): Promise<string> {
  const raw = args[0];
  if (raw === undefined) throw new Error("chio-codex budget: <usd> required");
  const usd = Number(raw);
  if (!Number.isFinite(usd) || usd < 0) {
    throw new Error(`chio-codex budget: invalid amount "${raw}"`);
  }
  const bond = getSoleBond();
  if (!bond) return "chio · no active bond · nothing to cap";
  patchBond(bond.sessionId, { budgetCapUsd: usd });
  return `chio · budget cap set to $${usd} (local advisory)`;
}
