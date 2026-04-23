#!/usr/bin/env node
/**
 * Codex UserPromptSubmit hook.
 *
 * Fires when the user sends a prompt (the task/turn). We fingerprint the
 * canonical prompt into SessionBond.promptHash. This is the first half of
 * plan attestation (Option A per the spec): there's no `onPlan` lifecycle
 * event in Codex, so the earliest stable anchor is the prompt. The plan
 * itself is captured later via plan-first mode (`--chio-plan-first`) or
 * by post-facto inference from the first tool-call stream.
 *
 * Exit 0. Non-blocking. Any failure → log to stderr.
 */

import { readFileSync } from "node:fs";
import { fingerprintPrompt, fingerprintPlanText, extractPlanBlock } from "../chio/plan.js";
import { getBond, patchBond } from "../chio/state.js";

interface UserPromptSubmitInput {
  session_id?: string;
  cwd?: string;
  model?: string;
  prompt?: string;
  user_prompt?: string;
  turn_id?: string;
}

function main(): void {
  let input: UserPromptSubmitInput;
  try {
    input = JSON.parse(readFileSync(0, "utf8")) as UserPromptSubmitInput;
  } catch (err) {
    process.stderr.write(
      `[chio] userpromptsubmit: malformed input (${(err as Error).message})\n`,
    );
    process.exit(0);
  }

  const prompt = input.prompt ?? input.user_prompt ?? "";
  if (!prompt || !input.session_id) {
    process.exit(0);
  }

  const bond = getBond(input.session_id);
  if (!bond) {
    // No bond → we still compute a hash into a shadow record for the case
    // where --chio is activated mid-session; but without a bond there's
    // nowhere to persist, so just log.
    const hash = fingerprintPrompt({
      prompt,
      ...(input.cwd ? { cwd: input.cwd } : {}),
      ...(input.model ? { model: input.model } : {}),
    });
    process.stderr.write(`[chio] prompt fingerprint (unbonded): ${hash}\n`);
    process.exit(0);
  }

  const promptHash = fingerprintPrompt({
    prompt,
    ...(input.cwd ? { cwd: input.cwd } : {}),
    ...(input.model ? { model: input.model } : {}),
  });

  // Plan-first mode: if the user (or a wrapper) has embedded a plan block
  // in the prompt (```plan\n...\n```), fingerprint it too. The plan hash,
  // when set, flows into every PreToolUse receipt's cached metadata.
  const planText = extractPlanBlock(prompt);
  const patch: Parameters<typeof patchBond>[1] = { promptHash };
  if (planText) {
    patch.planText = planText;
    patch.planHash = fingerprintPlanText(planText);
  }
  patchBond(bond.sessionId, patch);

  process.stderr.write(
    `[chio] prompt fingerprint: ${promptHash}` +
      (patch.planHash ? ` · plan fingerprint: ${patch.planHash}` : "") +
      "\n",
  );
  process.exit(0);
}

try {
  main();
} catch (err) {
  process.stderr.write(
    `[chio] userpromptsubmit: unexpected (${(err as Error).message})\n`,
  );
  process.exit(0);
}
