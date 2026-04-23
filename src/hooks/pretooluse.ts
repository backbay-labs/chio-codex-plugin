#!/usr/bin/env node
/**
 * Codex PreToolUse hook.
 *
 * Hook contract (developers.openai.com/codex/hooks):
 *   - stdin: single JSON object with at minimum
 *       { session_id, transcript_path, cwd, hook_event_name, model,
 *         turn_id, tool_name, tool_input }
 *   - deny path: exit 0, stdout JSON =
 *       { "hookSpecificOutput": {
 *           "hookEventName": "PreToolUse",
 *           "permissionDecision": "deny",
 *           "permissionDecisionReason": "<human-readable reason>" } }
 *     (alt form: { "decision": "block", "reason": "<...>" })
 *   - allow/continue path: exit 0 with no stdout (Codex proceeds).
 *   - exit 2: also a block; reason goes to stderr.
 *
 * Fail-closed: any unexpected error → deny with reason
 * "chio unavailable: <detail>". We never let a tool through on error; a
 * deny here stops the tool call *before* it executes and records the
 * deny reason in the transcript Codex sees.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildBridge, getDefaultPolicyPath } from "../chio/bridge.js";
import { getBond, patchBond } from "../chio/state.js";
import { PENDING_DIR } from "../chio/paths.js";
import type { Verdict } from "@chio/bridge";

interface PreToolUseInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  hook_event_name?: string;
  model?: string;
  turn_id?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_use_id?: string;
}

function deny(reason: string): never {
  const payload = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: reason,
    },
  };
  process.stdout.write(JSON.stringify(payload));
  process.exit(0);
}

function allow(info?: string): never {
  if (info) process.stderr.write(`[chio] allow: ${info}\n`);
  process.exit(0);
}

async function main(): Promise<never> {
  let input: PreToolUseInput;
  try {
    input = JSON.parse(readFileSync(0, "utf8")) as PreToolUseInput;
  } catch (err) {
    return deny(
      `chio unavailable: malformed hook input (${(err as Error).message})`,
    );
  }

  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName.length === 0) {
    return deny("chio unavailable: hook input missing tool_name");
  }

  const bond = getBond(input.session_id);
  const policyPath = bond?.policyPath ?? getDefaultPolicyPath();
  if (!bond && !policyPath) {
    return deny(
      "no capability bonded for this Codex session and no default policy " +
        "configured; run `codex --chio --policy <path>` or set CHIO_POLICY_PATH",
    );
  }

  const bridge = buildBridge();
  const { server, local } = splitToolName(toolName);

  let verdict: Verdict;
  try {
    verdict = await bridge.check({
      tool: local,
      params: input.tool_input,
      ...(server ? { serverId: server } : {}),
      ...(policyPath ? { policyPath } : {}),
    });
  } catch (err) {
    return deny(`chio unavailable: ${(err as Error).message}`);
  }

  // Cache the receipt so PostToolUse can verify its signature and persist it.
  // Codex doesn't thread state between hooks, so we key by tool_use_id when
  // present, else by turn_id + timestamp.
  if (verdict.receipt) {
    try {
      mkdirSync(PENDING_DIR, { recursive: true });
      const id =
        input.tool_use_id ??
        `${input.turn_id ?? "turn"}-${Date.now()}`;
      const pendingPath = join(PENDING_DIR, `${id}.json`);

      // Embed the plan hash (and prompt hash) in the receipt metadata we
      // cache, so evidence exports can trace act→plan→prompt. This is the
      // plan-attestation integration point per our Option A design: we
      // stash metadata alongside the receipt in the pending dir rather
      // than mutating the signed receipt body.
      const wrapped = {
        receipt: verdict.receipt,
        chio_plan_attestation: bond
          ? {
              plan_hash: bond.planHash ?? null,
              prompt_hash: bond.promptHash ?? null,
              policy_path: bond.policyPath,
            }
          : null,
      };
      writeFileSync(pendingPath, JSON.stringify(wrapped));
    } catch (err) {
      process.stderr.write(
        `[chio] failed to cache receipt: ${(err as Error).message}\n`,
      );
    }
  }

  // Remember the last receipt id so /chio-approve can reference it.
  if (bond && verdict.receipt?.id) {
    patchBond(bond.sessionId, { lastReceiptId: verdict.receipt.id });
  }

  if (verdict.decision === "deny" || verdict.decision === "cancelled") {
    const guard = verdict.guard ? ` [guard: ${verdict.guard}]` : "";
    const reason = verdict.reason ?? "denied by chio";
    return deny(`chio ${verdict.decision}: ${reason}${guard}`);
  }

  return allow(`verdict=${verdict.decision}`);
}

function splitToolName(name: string): { server?: string; local: string } {
  // Codex MCP-routed tools may use a server::tool or mcp:<server>:<tool>
  // naming; arc's `--server` flag accepts an id separately from the tool
  // name, so split here to mirror Claude Code's mcp__<server>__<tool>
  // convention.
  let m = name.match(/^mcp__([^_]+(?:_[^_]+)*)__(.+)$/);
  if (m && m[1] && m[2]) return { server: m[1], local: m[2] };
  m = name.match(/^mcp:([^:]+):(.+)$/);
  if (m && m[1] && m[2]) return { server: m[1], local: m[2] };
  m = name.match(/^([a-zA-Z0-9_.-]+)::(.+)$/);
  if (m && m[1] && m[2]) return { server: m[1], local: m[2] };
  return { local: name };
}

main().catch((err: unknown) => {
  deny(`chio unavailable: unexpected (${(err as Error).message})`);
});
