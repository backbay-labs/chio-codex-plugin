import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  cpSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, "..");

/**
 * Drives the compiled dist/hooks/pretooluse.mjs with a mocked @chio/bridge
 * resolved via a scratch workspace. Verifies:
 *
 *   1. On a "deny" verdict, the hook exits 0 and writes Codex's real
 *      permissionDecision JSON to stdout.
 *   2. On an "allow" verdict, the hook exits 0 with no stdout.
 *   3. On a thrown bridge error, the hook fails closed (deny with reason
 *      prefixed "chio unavailable").
 *
 * We inject the mock bridge by writing a tiny stub module and setting
 * NODE_PATH so `import "@chio/bridge"` resolves to it.
 */

function withMockBridge(
  verdictBody: string,
  fn: (env: NodeJS.ProcessEnv, hookPath: string) => void,
) {
  // We stage a mini plugin in a sandbox: copy the compiled hook into
  // sandbox/dist/hooks/pretooluse.mjs, copy paths.js/bridge.js/state.js
  // (plus their transitive compiled siblings), and mount a mock
  // @chio/bridge at sandbox/node_modules/@chio/bridge. Node resolves the
  // bare `@chio/bridge` import from the hook's ancestry, so the mock is
  // the only one found.
  const sandbox = mkdtempSync(join(tmpdir(), "chio-codex-hook-"));
  const distHookDir = join(sandbox, "dist", "hooks");
  const distChioDir = join(sandbox, "dist", "chio");
  mkdirSync(distHookDir, { recursive: true });
  mkdirSync(distChioDir, { recursive: true });

  // Copy compiled chio/ and hook, preserving .mjs.
  cpSync(join(projectRoot, "dist", "chio"), distChioDir, { recursive: true });
  cpSync(
    join(projectRoot, "dist", "hooks", "pretooluse.mjs"),
    join(distHookDir, "pretooluse.mjs"),
  );
  // Include the plain .js too for source-map references (not strictly needed).
  const jsSrc = join(projectRoot, "dist", "hooks", "pretooluse.js");
  if (existsSync(jsSrc)) {
    cpSync(jsSrc, join(distHookDir, "pretooluse.js"));
  }

  const pkgDir = join(sandbox, "node_modules", "@chio", "bridge");
  mkdirSync(pkgDir, { recursive: true });
  writeFileSync(
    join(pkgDir, "package.json"),
    JSON.stringify({
      name: "@chio/bridge",
      version: "0.0.0-mock",
      type: "module",
      main: "./index.mjs",
      exports: { ".": "./index.mjs" },
    }),
  );
  writeFileSync(
    join(pkgDir, "index.mjs"),
    `
export class ChioBridge {
  static fromCli() { return new ChioBridge(); }
  static fromDaemon() { return new ChioBridge(); }
  async check(_call) { ${verdictBody} }
  async verifyReceipt(_r) { return true; }
  async revoke(_id) { return; }
  async exportEvidence() { return "/tmp/evidence.json"; }
  async loadPolicy() { return { hushspec: "0.1.0", rules: {}, extensions: {} }; }
  async lintPolicy() { return { errors: [], warnings: [] }; }
  async issueCapability() { return { id: "cap_test", expires_at: 0 }; }
  async createPassport() {
    return {
      did: "did:chio:9f2ca1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e",
      capabilityId: "cap_test",
      expiresAt: "2099-01-01T00:00:00Z",
      issuer: "mock",
    };
  }
}
export default ChioBridge;
`,
  );

  // Isolate state: point HOME at sandbox so the plugin's STATE_DIR
  // (~/.codex/plugins/chio-codex/...) materializes inside the sandbox.
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CHIO_CODEX_STATE_DIR: join(sandbox, "state"),
    CHIO_POLICY_PATH: "/tmp/none.yaml",
  };
  delete env["CHIO_SERVICE_TOKEN"];
  try {
    fn(env, join(distHookDir, "pretooluse.mjs"));
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function runHook(
  stdin: object,
  env: NodeJS.ProcessEnv,
  hookPath: string,
): { stdout: string; stderr: string; code: number } {
  const sid = (stdin as {session_id?: string}).session_id;
  const stateDir = env["CHIO_CODEX_STATE_DIR"]!;
  mkdirSync(stateDir, {recursive: true});
  writeFileSync(join(stateDir, "state.json"), JSON.stringify({bonds: sid ? {[sid]: {sessionId: sid, policyPath: "/tmp/test-policy.yaml", bondedAt: "2026-09-09T00:00:00Z"}} : {}}));
  const res = spawnSync(process.execPath, [hookPath], {
    input: JSON.stringify({tool_use_id: "fixture-tool-id", ...stdin}),
    env,
    encoding: "utf8",
    timeout: 10_000,
  });
  return {
    stdout: res.stdout ?? "",
    stderr: res.stderr ?? "",
    code: res.status ?? -1,
  };
}

test("PreToolUse deny emits Codex permissionDecision JSON and exits 0", () => {
  withMockBridge(
    `return { decision: "deny", reason: "forbidden_paths hit", guard: "ForbiddenPathGuard" };`,
    (env, hookPath) => {
      const { stdout, code } = runHook(
        {
          session_id: "sess-deny",
          hook_event_name: "PreToolUse",
          tool_name: "shell",
          tool_input: { cmd: "rm -rf /" },
          turn_id: "t1",
        },
        env,
        hookPath,
      );
      assert.equal(code, 0, "deny must exit 0 per Codex hook contract");
      const payload = JSON.parse(stdout);
      assert.equal(
        payload.hookSpecificOutput?.hookEventName,
        "PreToolUse",
      );
      assert.equal(
        payload.hookSpecificOutput?.permissionDecision,
        "deny",
      );
      assert.match(
        payload.hookSpecificOutput?.permissionDecisionReason ?? "",
        /forbidden_paths hit/,
      );
    },
  );
});

test("PreToolUse allow exits 0 with empty stdout", () => {
  withMockBridge(
    `return { decision: "allow" };`,
    (env, hookPath) => {
      const { stdout, code } = runHook(
        {
          session_id: "sess-allow",
          hook_event_name: "PreToolUse",
          tool_name: "shell",
          tool_input: { cmd: "echo hello" },
          turn_id: "t2",
        },
        env,
        hookPath,
      );
      assert.equal(code, 0);
      assert.equal(stdout, "", `expected empty stdout, got ${JSON.stringify(stdout)}`);
    },
  );
});

test("PreToolUse fails closed on bridge throw", () => {
  withMockBridge(
    `throw new Error("daemon unreachable at http://127.0.0.1:8940");`,
    (env, hookPath) => {
      const { stdout, code } = runHook(
        {
          session_id: "sess-throw",
          hook_event_name: "PreToolUse",
          tool_name: "shell",
          tool_input: { cmd: "ls" },
          turn_id: "t3",
        },
        env,
        hookPath,
      );
      assert.equal(code, 0);
      const payload = JSON.parse(stdout);
      assert.equal(
        payload.hookSpecificOutput?.permissionDecision,
        "deny",
      );
      assert.match(
        payload.hookSpecificOutput?.permissionDecisionReason ?? "",
        /chio unavailable/,
      );
    },
  );
});

for (const decision of ["pending", "challenge", "defer", "unknown", undefined]) {
  test(`PreToolUse rejects non-allow decision ${decision}`, () => {
    withMockBridge(`return ${JSON.stringify({decision})};`, (env, hookPath) => {
      const result = runHook({session_id:"s", tool_name:"Bash", tool_input:{command:"true"}}, env, hookPath);
      assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
    });
  });
}

test("PreToolUse rejects missing session identity despite a default policy", () => {
  withMockBridge('return {decision:"allow"};', (env, hookPath) => {
    const result = runHook({tool_name:"Bash", tool_input:{command:"true"}}, env, hookPath);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
  });
});
