import { getSoleBond, patchBond } from "../chio/state.js";

/**
 * `chio-codex approve <receipt-id>`
 *
 * Countersigns a gated receipt. In arc, "approval" is typically modeled as
 * a delegated-capability issuance on the trust plane; the current bridge
 * doesn't expose an explicit approve() method (see @chio/bridge surface),
 * so we record the intent and log. A future bridge.approve(receiptId)
 * would replace this body.
 */
export async function approveCmd(args: string[]): Promise<string> {
  const id = args[0];
  if (!id) throw new Error("chio-codex approve: <receipt-id> required");
  const bond = getSoleBond();
  if (!bond) return "chio · no active bond · nothing to approve against";
  patchBond(bond.sessionId, { lastReceiptId: id });
  return (
    `chio · approval recorded (local)\n` +
    `  receipt_id     ${id}\n` +
    `  note           Arc does not expose a receipt-approve REST verb; the\n` +
    `                 countersign path is capability attenuation at the trust\n` +
    `                 plane. For now this is a local record that the next\n` +
    `                 PreToolUse can consult when /chio-approve is wired in.`
  );
}
