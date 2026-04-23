#!/usr/bin/env node
/**
 * Codex PostToolUse hook.
 *
 * Contract: exit 0 on success; any blocking/transcript feedback is via
 * stderr plus an optional JSON on stdout for additionalContext. We never
 * block in PostToolUse — the tool has already run — we just verify and
 * persist the receipt.
 */

import { readFileSync, mkdirSync, readdirSync, renameSync, statSync } from "node:fs";
import { join } from "node:path";
import { PENDING_DIR, RECEIPT_CACHE_DIR, TRANSCRIPT_DIR } from "../chio/paths.js";
import { getBond, patchBond } from "../chio/state.js";
import { buildBridge } from "../chio/bridge.js";
import { appendFileSync } from "node:fs";
import type { ChioReceipt } from "@chio/bridge";

interface PostToolUseInput {
  session_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_output?: unknown;
  turn_id?: string;
}

interface PendingReceiptFile {
  receipt: ChioReceipt;
  chio_plan_attestation?: {
    plan_hash: string | null;
    prompt_hash: string | null;
    policy_path: string;
  } | null;
}

async function main(): Promise<void> {
  let input: PostToolUseInput;
  try {
    input = JSON.parse(readFileSync(0, "utf8")) as PostToolUseInput;
  } catch (err) {
    process.stderr.write(
      `[chio] posttooluse: malformed input (${(err as Error).message})\n`,
    );
    process.exit(0);
  }

  const bond = getBond(input.session_id);
  const pendingPath = findPendingReceipt(input);
  if (!pendingPath) {
    // No pending receipt: either pretool didn't emit one (non-bonded) or we
    // couldn't match. Not an error worth blocking over.
    process.exit(0);
  }

  let wrapped: PendingReceiptFile;
  try {
    wrapped = JSON.parse(readFileSync(pendingPath, "utf8")) as PendingReceiptFile;
  } catch (err) {
    process.stderr.write(
      `[chio] posttooluse: pending receipt unreadable (${(err as Error).message})\n`,
    );
    process.exit(0);
  }

  const bridge = buildBridge();
  let verified = false;
  try {
    verified = await bridge.verifyReceipt(wrapped.receipt);
  } catch (err) {
    process.stderr.write(
      `[chio] posttooluse: receipt verify threw (${(err as Error).message})\n`,
    );
  }
  if (!verified) {
    process.stderr.write(
      `[chio] posttooluse: receipt signature INVALID for ${wrapped.receipt.id}\n`,
    );
  }

  // Persist into the session receipt cache + transcript.
  try {
    mkdirSync(RECEIPT_CACHE_DIR, { recursive: true });
    mkdirSync(TRANSCRIPT_DIR, { recursive: true });
    const outName = `${wrapped.receipt.id}.json`;
    const outPath = join(RECEIPT_CACHE_DIR, outName);
    renameSync(pendingPath, outPath);

    const sid = input.session_id ?? "unknown";
    const transcriptPath = join(TRANSCRIPT_DIR, `${sid}.log`);
    const decision =
      typeof wrapped.receipt.decision === "string"
        ? wrapped.receipt.decision
        : (wrapped.receipt.decision as { kind?: string })?.kind ?? "unknown";
    const line = JSON.stringify({
      t: Date.now(),
      tool: input.tool_name ?? null,
      receipt_id: wrapped.receipt.id,
      decision,
      verified,
      plan_hash: wrapped.chio_plan_attestation?.plan_hash ?? null,
      prompt_hash: wrapped.chio_plan_attestation?.prompt_hash ?? null,
    });
    appendFileSync(transcriptPath, line + "\n");
  } catch (err) {
    process.stderr.write(
      `[chio] posttooluse: persist failed (${(err as Error).message})\n`,
    );
  }

  if (bond) {
    patchBond(bond.sessionId, {
      receiptCount: (bond.receiptCount ?? 0) + 1,
      lastReceiptId: wrapped.receipt.id,
    });
  }

  process.exit(0);
}

function findPendingReceipt(input: PostToolUseInput): string | undefined {
  if (input.tool_use_id) {
    const direct = join(PENDING_DIR, `${input.tool_use_id}.json`);
    try {
      statSync(direct);
      return direct;
    } catch {
      // fall through
    }
  }
  // Fallback: youngest pending file for this turn.
  try {
    const turn = input.turn_id;
    const entries = readdirSync(PENDING_DIR)
      .filter((f) => f.endsWith(".json"))
      .filter((f) => !turn || f.startsWith(turn))
      .map((f) => ({ f, m: statSync(join(PENDING_DIR, f)).mtimeMs }))
      .sort((a, b) => b.m - a.m);
    if (entries.length > 0 && entries[0]) return join(PENDING_DIR, entries[0].f);
  } catch {
    // pending dir missing
  }
  return undefined;
}

main().catch((err: unknown) => {
  process.stderr.write(
    `[chio] posttooluse: unexpected (${(err as Error).message})\n`,
  );
  process.exit(0);
});
