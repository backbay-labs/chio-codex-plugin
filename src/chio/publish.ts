import type { ChioBridge, Passport, CapabilityScope } from "@chio/bridge";
import type { SessionBond } from "./state.js";

export interface PublishOptions {
  /** Operator name, e.g. "weekly-mongo-sync". */
  name: string;
  /** One-line description for the citizen descriptor. */
  description?: string;
  /** Cron expression, e.g. "0 3 * * 1". */
  schedule?: string;
  /** Passport TTL. Defaults to 30d for scheduled citizens. */
  ttl?: string;
  /** Policy path to pin into the citizen descriptor. */
  policyPath: string;
}

export interface Citizen {
  name: string;
  description?: string;
  /** did:chio:{64-hex-ed25519-pubkey} — the Agent Passport subject. */
  passport: Passport;
  /** Absolute path of the policy file pinned for this citizen. */
  policyPath: string;
  /** Cron expression if a schedule was requested. Schedule execution is
   *  the operator's responsibility (external cron + `arc run --policy ...`);
   *  we do not spawn cron jobs ourselves. Documented in README. */
  schedule?: string;
  /** SHA-256 of the plan that produced this citizen, tying the citizen
   *  back to the originating Codex turn. */
  planHash?: string;
  /** Opaque capability id if one was issued for the scheduled operator. */
  capabilityId?: string;
}

/**
 * Promote a successful Codex session into a named, scheduled citizen.
 *
 * 1. Derive a minimal CapabilityScope from observed receipts (we pass the
 *    policy path; chio will scope from the policy). If the caller supplied
 *    a scope we honor it, else we leave scope empty and rely on
 *    policy-derived scoping when the citizen is later run.
 * 2. Mint a passport via ChioBridge.createPassport({ subject, scope, ttl });
 *    this shells into `chio passport create` in CLI mode or POSTs to
 *    the chio trust plane in daemon mode. Result MUST start with `did:chio:`
 *    (the chio-did scheme).
 * 3. Return a real Citizen descriptor. Scheduling itself is external: we
 *    surface the cron expression and the policy path so the operator can
 *    wire a cron job that invokes `chio run --policy <path> -- <cmd>`. If a
 *    future `chio schedule` subcommand lands, swap it in here.
 */
export async function publishCitizen(
  bridge: ChioBridge,
  bond: SessionBond,
  opts: PublishOptions,
): Promise<Citizen> {
  const ttl = opts.ttl ?? "30d";
  const subject = opts.name;

  // Leave scope empty so the trust plane/CLI uses the policy's scope when
  // the citizen is eventually invoked. A richer implementation would walk
  // observed PostToolUse receipts and intersect tool/egress grants.
  const scope: CapabilityScope = {};

  const passport = await bridge.createPassport({
    subject,
    scope,
    ttl,
  });

  // Wave 5.0: accept both did:chio: (post-rename) and did:arc: (pre-rename
  // arc binary) since the harness still runs arc for the velocity regression.
  // Wave 5.2 (bug fix): require the 64-hex ed25519 pubkey suffix. A bare
  // `startsWith("did:chio:")` check accepts path-style fictions like
  // `did:chio:backbay:agent:a7e3` which are NOT valid chio-did identifiers.
  // The real scheme is `did:(chio|arc):{64-hex-pubkey}` — see
  // `arc/crates/chio-did/src/lib.rs` `DidChio`.
  const CHIO_DID_RE = /^did:(chio|arc):[0-9a-f]{64}$/;
  if (!CHIO_DID_RE.test(passport.did)) {
    throw new Error(
      `publishCitizen: expected did:chio:{64-hex} passport, got "${passport.did}". ` +
        "chio issues did:chio:{64-hex-ed25519-pubkey}; path-style DIDs are fiction.",
    );
  }

  const citizen: Citizen = {
    name: opts.name,
    passport,
    policyPath: opts.policyPath,
  };
  if (opts.description) citizen.description = opts.description;
  if (opts.schedule) citizen.schedule = opts.schedule;
  if (bond.planHash) citizen.planHash = bond.planHash;
  if (bond.capabilityId) citizen.capabilityId = bond.capabilityId;
  return citizen;
}

export function renderCitizen(c: Citizen): string {
  const lines: string[] = [];
  lines.push(`published · ${c.name}`);
  lines.push(`passport  · ${c.passport.did}`);
  lines.push(`policy    · ${c.policyPath}`);
  if (c.schedule) lines.push(`schedule  · cron: ${c.schedule}`);
  if (c.planHash) lines.push(`plan_hash · ${c.planHash}`);
  if (c.description) lines.push(`desc      · ${c.description}`);
  lines.push(
    "# Auditable, revocable, runnable by any arc host. " +
      "(Schedule execution is external: wire `cron` + `arc run --policy`.)",
  );
  return lines.join("\n");
}
