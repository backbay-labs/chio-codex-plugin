import { getSoleBond } from "../chio/state.js";
import { buildBridge } from "../chio/bridge.js";
import { resolve } from "node:path";

/**
 * `chio-codex receipt-export <window> [--out <path>]`
 *
 * Window accepts 1h, 24h, session, etc. "session" spans from bondedAt to
 * now. Arc's trust plane exposes /v1/evidence/export (POST); ChioBridge
 * wraps that via bridge.exportEvidence({ since, outPath }).
 */
export async function receiptExportCmd(args: string[]): Promise<string> {
  const window = args[0] ?? "session";
  let outPath: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--out") outPath = args[++i];
  }
  const bond = getSoleBond();
  if (!bond) return "chio · no active bond · nothing to export";
  const since = computeSince(window, bond.bondedAt);
  const target = resolve(outPath ?? `./chio-evidence-${Date.now()}.json`);
  const bridge = buildBridge();
  const written = await bridge.exportEvidence({ since, outPath: target });
  return `chio · evidence bundle written\n  since          ${since.toISOString()}\n  out            ${written}`;
}

function computeSince(window: string, bondedAt: string): Date {
  if (window === "session") return new Date(bondedAt);
  const m = window.match(/^(\d+)([smhd])$/);
  if (!m || !m[1] || !m[2]) return new Date(bondedAt);
  const n = parseInt(m[1], 10);
  const factor =
    m[2] === "s" ? 1000
    : m[2] === "m" ? 60000
    : m[2] === "h" ? 3_600_000
    : 86_400_000;
  return new Date(Date.now() - n * factor);
}
