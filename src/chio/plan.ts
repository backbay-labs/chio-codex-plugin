import { createHash } from "node:crypto";

/**
 * Plan attestation. Because the real Codex hook surface is
 * PreToolUse/PostToolUse/UserPromptSubmit/Stop (there is no `onPlan`
 * lifecycle event), we fingerprint at two real integration points:
 *
 *   1. UserPromptSubmit — the task prompt itself. We hash the canonical
 *      JSON shape { prompt, cwd, model } so the fingerprint is stable across
 *      invocations of the same task but discriminates across model / cwd.
 *      Stored into SessionBond.promptHash.
 *
 *   2. Optional plan-first mode (`--chio-plan-first`, documented in README).
 *      The wrapper/CLI prepends a system instruction asking Codex to emit
 *      its plan first as a text block we can intercept; we fingerprint that
 *      block and store it as SessionBond.planHash. PreToolUse embeds both
 *      hashes in the receipt metadata so downstream evidence bundles can
 *      prove plan/act correspondence.
 *
 * All hashes are full, uppercase-nibble-to-lower-hex 64-char SHA-256 digests.
 * No 16-char truncation: downstream verifiers reject anything shorter.
 */

export interface PlanFingerprintInput {
  prompt: string;
  cwd?: string;
  model?: string;
}

/**
 * Canonicalize according to JSON Canonicalization Scheme (RFC 8785): keys
 * sorted, no extraneous whitespace, utf-8. For our input shape this reduces
 * to manually writing sorted keys with JSON.stringify on string values.
 */
export function canonicalizePlanInput(input: PlanFingerprintInput): string {
  const keys: (keyof PlanFingerprintInput)[] = ["cwd", "model", "prompt"];
  const parts = keys
    .filter((k) => typeof input[k] === "string")
    .map((k) => `${JSON.stringify(k)}:${JSON.stringify(input[k])}`);
  return `{${parts.join(",")}}`;
}

export function fingerprintPrompt(input: PlanFingerprintInput): string {
  const canonical = canonicalizePlanInput(input);
  return sha256Hex(canonical);
}

/**
 * Fingerprint a raw plan text block emitted by Codex (when plan-first mode
 * is enabled). We normalize line endings and strip trailing whitespace so
 * cosmetic drift doesn't flag as plan drift, then hash the utf-8 bytes.
 */
export function fingerprintPlanText(planText: string): string {
  const normalized = planText.replace(/\r\n/g, "\n").trim();
  return sha256Hex(normalized);
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

/**
 * Extract a plan block from a Codex turn transcript. Plan-first mode asks
 * Codex to wrap its plan in a fenced block tagged "plan"; we accept that
 * shape and also a plain "Plan:\n..." prefix as a fallback.
 */
export function extractPlanBlock(text: string): string | undefined {
  const fenced = text.match(/```plan\s*\n([\s\S]*?)\n```/);
  if (fenced && typeof fenced[1] === "string") return fenced[1].trim();
  const prefixed = text.match(/(?:^|\n)Plan:\s*\n([\s\S]*?)(?:\n\n|$)/);
  if (prefixed && typeof prefixed[1] === "string") return prefixed[1].trim();
  return undefined;
}
