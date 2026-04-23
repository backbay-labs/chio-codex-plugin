import { clearBond, getSoleBond } from "../chio/state.js";
import { buildBridge } from "../chio/bridge.js";

/**
 * `chio-codex revoke`
 *
 * Revokes the bonded capability (if one was issued) and clears local
 * session state. Delegates to ChioBridge.revoke() when a capability id is
 * tracked.
 */
export async function revokeCmd(): Promise<string> {
  const bond = getSoleBond();
  if (!bond) return "chio · no active bond · nothing to revoke";
  const bridge = buildBridge();
  // ChioBridge.revoke takes a subject id (capability / passport did). We
  // pass the capability id we tracked; if instead a passport was issued
  // (via --publish), callers should revoke the passport did directly.
  if (bond.capabilityId) {
    try {
      await bridge.revoke(bond.capabilityId);
    } catch (err) {
      return (
        `chio · revoke partial: bridge threw "${(err as Error).message}"; ` +
        `clearing local state anyway`
      );
    }
  }
  clearBond(bond.sessionId);
  return `chio · revoked (capability=${bond.capabilityId ?? "n/a"}, session=${bond.sessionId})`;
}
