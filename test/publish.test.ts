import { test } from "node:test";
import assert from "node:assert/strict";
import { publishCitizen, renderCitizen } from "../src/chio/publish.ts";
import type { SessionBond } from "../src/chio/state.ts";

/**
 * Unit-level: drive publishCitizen against a hand-built mock ChioBridge
 * and prove the returned Citizen carries a real did:chio: passport.
 */

function makeBridge(opts: { did: string }): any {
  return {
    async createPassport(_opts: unknown) {
      return {
        did: opts.did,
        capabilityId: "cap_1",
        expiresAt: "2099-01-01T00:00:00Z",
        issuer: "did:chio:issuer",
      };
    },
  };
}

function makeBond(): SessionBond {
  return {
    sessionId: "sess-1",
    policyPath: "./examples/migration.policy.yaml",
    bondedAt: new Date().toISOString(),
    promptHash: "a".repeat(64),
    planHash: "b".repeat(64),
  };
}

test("publishCitizen returns a did:chio passport and full plan hash", async () => {
  const bridge = makeBridge({
    did: "did:chio:9f2ca1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e",
  });
  const citizen = await publishCitizen(bridge, makeBond(), {
    name: "weekly-mongo-sync",
    description: "sync updates from mongo to postgres",
    schedule: "0 3 * * 1",
    policyPath: "./examples/migration.policy.yaml",
  });
  assert.ok(citizen.passport.did.startsWith("did:chio:"));
  assert.equal(citizen.passport.did.length, "did:chio:".length + 64);
  assert.equal(citizen.schedule, "0 3 * * 1");
  assert.equal(citizen.policyPath, "./examples/migration.policy.yaml");
  // Full 64-hex plan hash, not 16-char truncated.
  assert.equal(citizen.planHash?.length, 64);
});

test("publishCitizen rejects did:chio: fiction", async () => {
  const bridge = makeBridge({ did: "did:chio:backbay:agent:a7e3" });
  await assert.rejects(
    publishCitizen(bridge, makeBond(), {
      name: "should-fail",
      policyPath: "./examples/migration.policy.yaml",
    }),
    /did:chio:/,
  );
});

test("renderCitizen includes did:chio passport and schedule", async () => {
  // 64-hex ed25519 pubkey (32 bytes) — the chio-did spec. Previous fixture
  // had 62 hex chars and was tolerated only because the validator used a
  // prefix-only check (`startsWith("did:chio:")`) that accepted any
  // length. The Wave 5.2 strict regex enforces the canonical length.
  const bridge = makeBridge({
    did: "did:chio:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
  });
  const citizen = await publishCitizen(bridge, makeBond(), {
    name: "cron-op",
    schedule: "*/5 * * * *",
    policyPath: "./p.yaml",
  });
  const rendered = renderCitizen(citizen);
  assert.match(rendered, /did:chio:1234567890abcdef/);
  assert.match(rendered, /cron: \*\/5 \* \* \* \*/);
  assert.match(rendered, /Schedule execution is external/);
});
