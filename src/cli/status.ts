import { getSoleBond, readState } from "../chio/state.js";

export async function statusCmd(): Promise<string> {
  const bond = getSoleBond();
  if (!bond) {
    const state = readState();
    const ids = Object.keys(state.bonds);
    if (ids.length === 0) return "chio · no active bond · run `chio-codex bond --policy <path>`";
    return `chio · ${ids.length} active bonds: ${ids.join(", ")}`;
  }
  const lines = [
    `chio · bonded`,
    `  session        ${bond.sessionId}`,
    `  policy         ${bond.policyPath}`,
    `  bonded_at      ${bond.bondedAt}`,
    `  prompt_hash    ${bond.promptHash ?? "(none)"}`,
    `  plan_hash      ${bond.planHash ?? "(none)"}`,
    `  receipts       ${bond.receiptCount ?? 0}`,
    `  last_receipt   ${bond.lastReceiptId ?? "(none)"}`,
    `  capability     ${bond.capabilityId ?? "(none)"}`,
    `  passport       ${bond.passport?.did ?? "(none)"}`,
  ];
  if (bond.publishName) lines.push(`  publish        ${bond.publishName}`);
  if (bond.publishSchedule) lines.push(`  schedule       ${bond.publishSchedule}`);
  if (bond.budgetCapUsd !== undefined) lines.push(`  budget_cap     $${bond.budgetCapUsd}`);
  return lines.join("\n");
}
