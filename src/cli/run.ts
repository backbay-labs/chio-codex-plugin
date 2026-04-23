import { spawn } from "node:child_process";
import { upsertBond } from "../chio/state.js";

/**
 * `chio-codex run --policy <p> [--publish <n>] [--description ...]
 *                 [--schedule <cron>] [--evidence <path>] [--plan-first]
 *                 -- codex ...args`
 *
 * Launches Codex as a child process with the plugin's hooks active (they
 * must already be installed via the plugin manifest). We:
 *
 *   1. Parse --policy / --publish / --schedule / --evidence / --plan-first
 *      flags.
 *   2. Export them to the env Codex inherits so our SessionStart hook can
 *      materialize a SessionBond with the right fields.
 *   3. If --plan-first: prepend a plan-block instruction into the last
 *      positional arg (the prompt).
 *   4. Spawn codex, relay stdio, return its exit code.
 */
export async function runCmd(args: string[]): Promise<number> {
  let policy: string | undefined;
  let publish: string | undefined;
  let description: string | undefined;
  let schedule: string | undefined;
  let evidence: string | undefined;
  let planFirst = false;

  const passthrough: string[] = [];
  let sawDashDash = false;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === undefined) continue;
    if (sawDashDash) {
      passthrough.push(a);
      continue;
    }
    if (a === "--") {
      sawDashDash = true;
      continue;
    }
    if (a === "--policy") {
      policy = args[++i];
    } else if (a === "--publish") {
      publish = args[++i];
    } else if (a === "--description") {
      description = args[++i];
    } else if (a === "--schedule") {
      schedule = args[++i];
    } else if (a === "--evidence") {
      evidence = args[++i];
    } else if (a === "--plan-first") {
      planFirst = true;
    } else {
      passthrough.push(a);
    }
  }

  if (passthrough.length === 0) {
    throw new Error(
      "chio-codex run: missing codex invocation; example: " +
        "chio-codex run --policy ./mig.yaml -- codex 'migrate mongo->postgres'",
    );
  }

  // If the wrapper was invoked with --plan-first, augment the last
  // positional arg of the codex invocation (assumed to be the prompt) so
  // Codex emits its plan in a fenced ```plan block before tool calls.
  if (planFirst && passthrough.length > 0) {
    const idx = passthrough.length - 1;
    const original = passthrough[idx] ?? "";
    passthrough[idx] = planFirstWrap(original);
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (policy) env["CHIO_POLICY_PATH"] = policy;
  if (publish) env["CHIO_PUBLISH_NAME"] = publish;
  if (description) env["CHIO_PUBLISH_DESCRIPTION"] = description;
  if (schedule) env["CHIO_PUBLISH_SCHEDULE"] = schedule;
  if (evidence) env["CHIO_EVIDENCE_PATH"] = evidence;

  // If the user also supplied a session id (rare), materialize the bond
  // up front. Normally SessionStart does this once codex reports session_id.
  const sessionId = process.env["CODEX_SESSION_ID"];
  if (sessionId && policy) {
    const bond: Parameters<typeof upsertBond>[0] = {
      sessionId,
      policyPath: policy,
      bondedAt: new Date().toISOString(),
    };
    if (publish) bond.publishName = publish;
    if (description) bond.publishDescription = description;
    if (schedule) bond.publishSchedule = schedule;
    if (evidence) bond.evidencePath = evidence;
    upsertBond(bond);
  }

  const bin = passthrough[0];
  if (typeof bin !== "string") {
    throw new Error("chio-codex run: missing codex binary path");
  }
  const rest = passthrough.slice(1);

  return new Promise((resolve) => {
    const child = spawn(bin, rest, { stdio: "inherit", env });
    child.on("close", (code) => resolve(code ?? 0));
    child.on("error", (err) => {
      console.error(`chio-codex run: failed to spawn codex: ${err.message}`);
      resolve(127);
    });
  });
}

export function planFirstWrap(prompt: string): string {
  const prefix =
    "Before any tool call, emit a concise plan as a fenced code block " +
    "tagged `plan` with one step per line. Do not start any tool call " +
    "until that block is printed.\n\n";
  return prefix + prompt;
}
