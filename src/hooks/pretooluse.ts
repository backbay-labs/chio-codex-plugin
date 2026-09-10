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
 * Caught application errors emit deny. Codex 0.153.4 continues on hook
 * loader failure, crash, timeout, malformed output and omission. This
 * diagnostic hook is not an enforcing resource boundary; the restricted
 * launcher uses a kernel-owned MCP resource instead.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { buildBridge } from "../chio/bridge.js";
import { getBond, patchBond } from "../chio/state.js";
import { PENDING_DIR } from "../chio/paths.js";
import { receiptKey } from "../chio/receiptKey.js";
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

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return deny("chio unavailable: hook input must be an object");
  }
  if (typeof input.session_id !== "string" || !input.session_id) {
    return deny("chio unavailable: hook input missing session_id");
  }
  if (typeof input.tool_use_id !== "string" || !input.tool_use_id) {
    return deny("chio unavailable: hook input missing tool_use_id");
  }
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName.length === 0) {
    return deny("chio unavailable: hook input missing tool_name");
  }

  const bond = getBond(input.session_id);
  const policyPath = bond?.policyPath;
  if (!bond || !policyPath) {
    return deny(
      "no bond for this Codex session; SessionStart must initialize the session " +
        "before tool checks (a default policy does not restore revoked authority)",
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

  // Cache authorization evidence only. This is not an execution receipt.
  // Untrusted host identifiers never become filesystem paths.
  if (verdict.receipt) {
    try {
      mkdirSync(PENDING_DIR, { recursive: true });
      const id = receiptKey(input.session_id, input.tool_use_id);
      const pendingPath = join(PENDING_DIR, `${id}.json`);

      // Embed the plan hash (and prompt hash) in the receipt metadata we
      // cache, so evidence exports can trace act→plan→prompt. This is the
      // plan-attestation integration point per our Option A design: we
      // stash metadata alongside the receipt in the pending dir rather
      // than mutating the signed receipt body.
      const wrapped = {
        receipt: verdict.receipt,
        session_id: input.session_id,
        tool_use_id: input.tool_use_id,
        tool_name: toolName,
        chio_plan_attestation: bond
          ? {
              plan_hash: bond.planHash ?? null,
              prompt_hash: bond.promptHash ?? null,
              policy_path: bond.policyPath,
            }
          : null,
      };
      writeFileSync(pendingPath, JSON.stringify(wrapped), { flag: "wx", mode: 0o600 });
    } catch (err) {
      return deny(`chio unavailable: failed to cache authorization evidence (${(err as Error).message})`);
    }
  }

  // Remember the last receipt id so /chio-approve can reference it.
  if (bond && verdict.receipt?.id) {
    patchBond(bond.sessionId, { lastReceiptId: verdict.receipt.id });
  }

  if (verdict.decision !== "allow") {
    const guard = verdict.guard ? ` [guard: ${verdict.guard}]` : "";
    const reason = verdict.reason ?? "denied by chio";
    return deny(`chio ${verdict.decision ?? "invalid verdict"}: ${reason}${guard}`);
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
