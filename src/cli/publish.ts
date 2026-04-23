import { getSoleBond } from "../chio/state.js";
import { buildBridge } from "../chio/bridge.js";
import { publishCitizen, renderCitizen } from "../chio/publish.js";

/**
 * `chio-codex publish <name> [--description ...] [--schedule "<cron>"]
 *                            [--ttl <duration>]`
 *
 * Promotes the current bonded session into a named citizen: mints an
 * Agent Passport (did:chio:...), pins the policy, emits a Citizen
 * descriptor on stdout. This is the exact same path Stop takes when
 * --chio-publish was set at run time; we expose it here so users can
 * publish after the fact from the CLI.
 */
export async function publishCmd(args: string[]): Promise<string> {
  const name = args[0];
  if (!name) throw new Error("chio-codex publish: <name> required");
  let description: string | undefined;
  let schedule: string | undefined;
  let ttl: string | undefined;
  for (let i = 1; i < args.length; i++) {
    if (args[i] === "--description") description = args[++i];
    else if (args[i] === "--schedule") schedule = args[++i];
    else if (args[i] === "--ttl") ttl = args[++i];
  }
  const bond = getSoleBond();
  if (!bond) throw new Error("chio-codex publish: no active bond");

  const bridge = buildBridge();
  const opts: Parameters<typeof publishCitizen>[2] = {
    name,
    policyPath: bond.policyPath,
  };
  if (description) opts.description = description;
  if (schedule) opts.schedule = schedule;
  if (ttl) opts.ttl = ttl;
  const citizen = await publishCitizen(bridge, bond, opts);
  return renderCitizen(citizen);
}
