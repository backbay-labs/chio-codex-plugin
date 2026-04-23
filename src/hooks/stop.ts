#!/usr/bin/env node
/**
 * Codex Stop hook.
 *
 * Fires when a Codex session ends. If --chio-publish was requested (via
 * env vars set by the `chio-codex` wrapper), we promote the run to a
 * citizen: mint an Agent Passport (did:chio:...), pin the policy, and
 * emit a Citizen descriptor on stdout. If --chio-evidence was requested,
 * we dump a signed evidence bundle.
 *
 * Exit 0. Never blocks.
 */

import { readFileSync } from "node:fs";
import { getBond, clearBond } from "../chio/state.js";
import { buildBridge } from "../chio/bridge.js";
import { publishCitizen, renderCitizen } from "../chio/publish.js";

interface StopInput {
  session_id?: string;
  transcript_path?: string | null;
  cwd?: string;
  reason?: string;
}

async function main(): Promise<void> {
  let input: StopInput;
  try {
    input = JSON.parse(readFileSync(0, "utf8")) as StopInput;
  } catch {
    process.exit(0);
  }

  const bond = getBond(input.session_id);
  if (!bond) process.exit(0);

  const bridge = buildBridge();

  if (bond.publishName) {
    try {
      const opts: Parameters<typeof publishCitizen>[2] = {
        name: bond.publishName,
        policyPath: bond.policyPath,
      };
      if (bond.publishDescription) opts.description = bond.publishDescription;
      if (bond.publishSchedule) opts.schedule = bond.publishSchedule;
      const citizen = await publishCitizen(bridge, bond, opts);
      process.stdout.write("\n" + renderCitizen(citizen) + "\n");
    } catch (err) {
      process.stderr.write(
        `[chio] publish failed: ${(err as Error).message}\n`,
      );
    }
  }

  if (bond.evidencePath) {
    try {
      await bridge.exportEvidence({
        since: new Date(bond.bondedAt),
        outPath: bond.evidencePath,
      });
      process.stdout.write(
        `[chio] evidence bundle: ${bond.evidencePath}\n`,
      );
    } catch (err) {
      process.stderr.write(
        `[chio] evidence export failed: ${(err as Error).message}\n`,
      );
    }
  }

  // Keep the bond so /chio-approve etc. can still resolve post-Stop. A
  // future --chio-revoke-on-stop flag could clear it here.
  if (process.env["CHIO_CLEAR_ON_STOP"] === "1" && bond.sessionId) {
    clearBond(bond.sessionId);
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
