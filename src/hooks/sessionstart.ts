#!/usr/bin/env node
/**
 * Codex SessionStart hook.
 *
 * Fires when Codex begins a new session. We lazily materialize a
 * SessionBond if a default policy is configured (via CHIO_POLICY_PATH or
 * CODEX_PLUGIN_OPTION_POLICY_PATH); the real `chio check` evaluation
 * happens later in PreToolUse. We also capture publish/evidence flags
 * from env (exported by the `chio-codex` wrapper CLI) so Stop can
 * finalize with the right parameters.
 *
 * Exit 0. Non-blocking.
 */

import { readFileSync } from "node:fs";
import { getDefaultPolicyPath } from "../chio/bridge.js";
import { upsertBond, getBond } from "../chio/state.js";

interface SessionStartInput {
  session_id?: string;
  cwd?: string;
  model?: string;
}

function main(): void {
  let input: SessionStartInput;
  try {
    input = JSON.parse(readFileSync(0, "utf8")) as SessionStartInput;
  } catch {
    process.exit(0);
  }

  if (!input.session_id) process.exit(0);
  if (getBond(input.session_id)) process.exit(0);

  const policyPath = getDefaultPolicyPath();
  if (!policyPath) process.exit(0);

  const bond: Parameters<typeof upsertBond>[0] = {
    sessionId: input.session_id,
    policyPath,
    bondedAt: new Date().toISOString(),
  };
  const publishName = process.env["CHIO_PUBLISH_NAME"];
  const publishDesc = process.env["CHIO_PUBLISH_DESCRIPTION"];
  const publishSchedule = process.env["CHIO_PUBLISH_SCHEDULE"];
  const evidencePath = process.env["CHIO_EVIDENCE_PATH"];
  if (publishName) bond.publishName = publishName;
  if (publishDesc) bond.publishDescription = publishDesc;
  if (publishSchedule) bond.publishSchedule = publishSchedule;
  if (evidencePath) bond.evidencePath = evidencePath;
  upsertBond(bond);

  process.stderr.write(
    `[chio] bonded session ${input.session_id} under ${policyPath}\n`,
  );
  process.exit(0);
}

try {
  main();
} catch {
  process.exit(0);
}
