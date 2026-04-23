import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Passport } from "@chio/bridge";
import { STATE_PATH } from "./paths.js";

/**
 * A Codex session bonded to an arc policy. We persist just enough to let
 * cross-hook reads work (hooks are separate processes; Codex doesn't thread
 * mutable state for us) and to drive /chio slash commands, --chio-publish,
 * and --chio-evidence on Stop.
 */
export interface SessionBond {
  sessionId: string;
  policyPath: string;
  bondedAt: string;
  /** Full, untruncated SHA-256 of the canonical user prompt. */
  promptHash?: string;
  /** Full, untruncated SHA-256 of the canonical plan text, if one was
   *  captured via `--chio-plan-first` or inferred from the prompt. */
  planHash?: string;
  /** Raw plan text we fingerprinted (stored for evidence export). */
  planText?: string;
  /** Optional capability issued via --chio-bond. */
  capabilityId?: string;
  /** Optional Agent Passport if --chio-publish is set. */
  passport?: Passport;
  /** Names of guards paused by /chio-guard-pause and their expiries. */
  pausedGuards?: Record<string, string>;
  /** Budget ceiling in USD, if explicitly set via /chio-budget. */
  budgetCapUsd?: number;
  /** Publish flags captured at SessionStart so Stop can finalize. */
  publishName?: string;
  publishDescription?: string;
  publishSchedule?: string;
  evidencePath?: string;
  /** Running count of receipts observed in PostToolUse. */
  receiptCount?: number;
  /** Last receipt id for /chio-approve to reference. */
  lastReceiptId?: string;
}

export interface PluginState {
  bonds: Record<string, SessionBond>;
}

export function readState(): PluginState {
  try {
    const raw = readFileSync(STATE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<PluginState>;
    return { bonds: parsed.bonds ?? {} };
  } catch {
    return { bonds: {} };
  }
}

export function writeState(state: PluginState): void {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function upsertBond(bond: SessionBond): void {
  const state = readState();
  state.bonds[bond.sessionId] = bond;
  writeState(state);
}

export function clearBond(sessionId: string): void {
  const state = readState();
  delete state.bonds[sessionId];
  writeState(state);
}

export function getBond(sessionId: string | undefined): SessionBond | undefined {
  if (!sessionId) return undefined;
  const state = readState();
  return state.bonds[sessionId];
}

export function getSoleBond(): SessionBond | undefined {
  const state = readState();
  const entries = Object.values(state.bonds);
  if (entries.length === 1) return entries[0];
  return undefined;
}

export function patchBond(
  sessionId: string,
  patch: Partial<SessionBond>,
): SessionBond | undefined {
  const state = readState();
  const current = state.bonds[sessionId];
  if (!current) return undefined;
  const next: SessionBond = { ...current, ...patch };
  state.bonds[sessionId] = next;
  writeState(state);
  return next;
}
