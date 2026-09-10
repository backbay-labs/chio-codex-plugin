#!/usr/bin/env node
/**
 * Chio wrapper CLI for Codex.
 *
 * Codex's plugin model (developers.openai.com/codex/plugins/build) doesn't
 * describe a bespoke slash-command registry in plugin.json (skills are the
 * official command-ish surface). Chio's slash-style actions are therefore
 * surfaced two ways:
 *
 *   1. As `chio-codex <subcommand>`, invoked from the user's shell
 *      (works inside or outside a Codex turn; reads/writes the same state
 *      the hooks do).
 *   2. As skill markdown files under `skills/` that tell Codex it can call
 *      these subcommands via shell.exec (Codex has a shell tool; arc will
 *      mediate the call through its guards just like any other shell
 *      invocation).
 *
 * Top-level shape:
 *   chio-codex run --policy <p> [--publish <n>] [--evidence <p>] -- codex ...
 *   chio-codex status
 *   chio-codex bond [--policy <p>]
 *   chio-codex policy
 *   chio-codex guard-pause <name> [--ttl <d>]
 *   chio-codex budget <usd>
 *   chio-codex approve <receipt-id>
 *   chio-codex revoke
 *   chio-codex receipt-export <window>
 *   chio-codex publish <name> [--description ...] [--schedule "<cron>"]
 *   chio-codex plan-first <prompt>         # emits a plan-annotated prompt
 */

import { statusCmd } from "./status.js";
import { bondCmd } from "./bond.js";
import { policyCmd } from "./policy.js";
import { guardPauseCmd } from "./guardPause.js";
import { budgetCmd } from "./budget.js";
import { approveCmd } from "./approve.js";
import { revokeCmd } from "./revoke.js";
import { receiptExportCmd } from "./receiptExport.js";
import { publishCmd } from "./publish.js";
import { runCmd } from "./run.js";
import { restrictedCmd, prepareGatewayCmd } from "./restricted.js";
import { planFirstCmd } from "./planFirst.js";

function usage(): string {
  return [
    "Usage: chio-codex <subcommand> [...args]",
    "",
    "  run            Run Codex with Chio bonded (wraps `codex ...` with policy, publish, evidence)",
    "  restricted     Candidate isolated Codex mode using only an operator-configured Chio MCP gateway",
    "  prepare-gateway Establish a private gateway configuration using the packaged bridge",
    "  status         Show the current bonded session",
    "  bond           Bond the current/given session to a policy (creates state)",
    "  policy         Print the active policy path and parsed summary",
    "  guard-pause    Temporarily pause a named arc guard",
    "  budget         Adjust the spend ceiling (USD)",
    "  approve        Countersign a gated receipt by id",
    "  revoke         Tear down the bonded capability",
    "  receipt-export Emit an offline-verifiable evidence bundle",
    "  publish        Promote the current run into a scheduled citizen (did:chio:...)",
    "  plan-first     Wrap a prompt with a plan-first instruction for plan attestation",
  ].join("\n");
}

async function main(): Promise<void> {
  const [, , sub, ...rest] = process.argv;
  try {
    switch (sub) {
      case "run":
        process.exit(await runCmd(rest));
      case "restricted":
        process.exit(await restrictedCmd(rest));
      case "prepare-gateway":
        process.exit(prepareGatewayCmd(rest));
      case "status":
        console.log(await statusCmd());
        return;
      case "bond":
        console.log(await bondCmd(rest));
        return;
      case "policy":
        console.log(await policyCmd());
        return;
      case "guard-pause":
        console.log(await guardPauseCmd(rest));
        return;
      case "budget":
        console.log(await budgetCmd(rest));
        return;
      case "approve":
        console.log(await approveCmd(rest));
        return;
      case "revoke":
        console.log(await revokeCmd());
        return;
      case "receipt-export":
        console.log(await receiptExportCmd(rest));
        return;
      case "publish":
        console.log(await publishCmd(rest));
        return;
      case "plan-first":
        console.log(planFirstCmd(rest));
        return;
      case undefined:
      case "-h":
      case "--help":
        console.log(usage());
        return;
      default:
        console.error(`chio-codex: unknown subcommand "${sub}"\n\n${usage()}`);
        process.exit(2);
    }
  } catch (err) {
    console.error(`chio-codex: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
