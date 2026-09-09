import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The selected model must expose ordinary MCP tools. Code-mode-only models
// need separate qualification and cannot silently replace this host contract.
export const RESTRICTED_MODEL = "gpt-5.5";
export const RESTRICTED_HOST_VERSION = "codex-cli 0.153.4";
export const DISABLED_FEATURES = [
  "shell_tool", "unified_exec", "multi_agent", "multi_agent_v2", "apps",
  "plugins", "browser_use", "browser_use_external", "computer_use", "code_mode",
  "code_mode_only", "in_app_browser", "image_generation", "view_image", "artifact",
  "goals", "sleep_tool", "memories", "tool_suggest", "recommended_plugins",
  "remote_plugin", "enable_mcp_apps", "browser_use_full_cdp_access",
  "request_permissions_tool", "skill_search", "skill_mcp_dependency_install",
  "hooks", "shell_snapshot", "in_app_local_automation",
] as const;

interface RestrictedOptions { gatewayConfig: string; authFile: string; codexBinary: string; evidenceDir: string; prompt: string }

export function prepareGatewayCmd(args: string[]): number {
  if (args.length !== 2 || args.some(path => !isAbsolute(path))) throw new Error("prepare-gateway: requires /absolute/private-request.json /absolute/new-config.json");
  const script = join(dirname(fileURLToPath(import.meta.resolve("@chio/bridge/package.json"))), "dist", "prepare-gateway.js");
  const result = spawnSync(process.execPath, [script, ...args], { stdio: "inherit", timeout: 40_000 });
  return result.status ?? 1;
}

function parseArgs(args: string[]): RestrictedOptions {
  const values = new Map<string, string>();
  const known = new Set(["--gateway-config", "--auth-file", "--codex-binary", "--evidence-dir", "--prompt"]);
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i], value = args[i + 1];
    if (!flag || !known.has(flag) || !value || value.startsWith("--") || values.has(flag)) {
      throw new Error("restricted: use --gateway-config FILE --evidence-dir NEW-DIR --prompt TEXT; arbitrary host arguments are not supported");
    }
    values.set(flag, value);
  }
  const gatewayConfig = values.get("--gateway-config");
  const evidenceDir = values.get("--evidence-dir");
  const prompt = values.get("--prompt");
  if (!gatewayConfig || !evidenceDir || !prompt || !isAbsolute(gatewayConfig) || !isAbsolute(evidenceDir)) throw new Error("restricted: absolute gateway config, new evidence directory and prompt are required");
  return { gatewayConfig, evidenceDir, prompt,
    authFile: values.get("--auth-file") ?? join(process.env["CODEX_HOME"] ?? join(homedir(), ".codex"), "auth.json"),
    codexBinary: values.get("--codex-binary") ?? "codex" };
}

/** Fixed configuration, never supplemented with agent-provided host flags. */
export function restrictedHostArgs(workspace: string, gateway: string, config: string, prompt: string): string[] {
  const server = `mcp_servers={chio={command=${JSON.stringify(process.execPath)},args=[${JSON.stringify(gateway)},${JSON.stringify(config)}],required=true,startup_timeout_sec=10,tool_timeout_sec=40,default_tools_approval_mode="approve",enabled_tools=["read_text_file","write_file","edit_file","list_directory"]}}`;
  const args = ["exec", "--strict-config", "--ignore-user-config", "--ignore-rules", "--ephemeral", "--sandbox", "read-only", "--skip-git-repo-check", "-C", workspace, "--model", RESTRICTED_MODEL, "--json",
    "-c", 'approval_policy="never"', "-c", 'web_search="disabled"', "-c", "agents.enabled=false", "-c", server];
  for (const feature of DISABLED_FEATURES) args.push("--disable", feature);
  args.push("--", prompt);
  return args;
}

export async function restrictedCmd(args: string[]): Promise<number> {
  const options = parseArgs(args);
  const config = lstatSync(options.gatewayConfig);
  if (!config.isFile() || config.isSymbolicLink() || (config.mode & 0o077) !== 0) throw new Error("restricted: gateway configuration must be a private operator-owned regular file");
  if (config.uid !== process.getuid?.()) throw new Error("restricted: gateway configuration owner differs from the operator");
  const host = spawnSync(options.codexBinary, ["--version"], { encoding: "utf8", timeout: 10_000 });
  if (host.status !== 0 || host.stdout.trim() !== RESTRICTED_HOST_VERSION) throw new Error(`restricted: requires ${RESTRICTED_HOST_VERSION}; this host is not qualified`);
  const gateway = join(dirname(fileURLToPath(import.meta.resolve("@chio/bridge/package.json"))), "dist", "gateway.js");
  if (!lstatSync(gateway).isFile()) throw new Error("restricted: packaged gateway is missing");
  mkdirSync(options.evidenceDir, { mode: 0o700 });
  const runtime = mkdtempSync(join(tmpdir(), "chio-codex-restricted-"));
  const profile = join(runtime, "profile"), workspace = join(runtime, "workspace");
  mkdirSync(profile, { mode: 0o700 }); mkdirSync(workspace, { mode: 0o700 });
  const auth = join(profile, "auth.json");
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH", "USER", "LOGNAME", "SHELL", "LANG", "TMPDIR"]) if (process.env[key]) env[key] = process.env[key];
  env["CODEX_HOME"] = profile;
  const command = restrictedHostArgs(workspace, gateway, resolve(options.gatewayConfig), options.prompt);
  const report: Record<string, unknown> = { host: RESTRICTED_HOST_VERSION, model: RESTRICTED_MODEL, runtime, workspace, profile,
    gateway_sha256: createHash("sha256").update(readFileSync(gateway)).digest("hex"),
    config_sha256: createHash("sha256").update(readFileSync(options.gatewayConfig)).digest("hex"),
    command, acceptance: "candidate: independent effect verification required", started_at: new Date().toISOString() };
  writeFileSync(join(options.evidenceDir, "launch.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  process.stderr.write(`Restricted candidate evidence: ${options.evidenceDir}\n`);
  try {
    copyFileSync(options.authFile, auth); chmodSync(auth, 0o600);
    const code = await new Promise<number>((done) => {
      const child = spawn(options.codexBinary, command, { env, stdio: ["ignore", "pipe", "pipe"] });
      let forceStop: NodeJS.Timeout | undefined;
      const deadline = setTimeout(() => {
        report["timed_out"] = true;
        child.kill("SIGTERM");
        forceStop = setTimeout(() => child.kill("SIGKILL"), 5_000);
      }, 180_000);
      const stdout: Buffer[] = [], stderr: Buffer[] = [];
      child.stdout.on("data", data => { stdout.push(data); process.stdout.write(data); });
      child.stderr.on("data", data => { stderr.push(data); process.stderr.write(data); });
      const forward = (signal: NodeJS.Signals) => child.kill(signal);
      const term = () => forward("SIGTERM"), interrupt = () => forward("SIGINT");
      process.once("SIGTERM", term); process.once("SIGINT", interrupt);
      child.once("error", error => { stderr.push(Buffer.from(error.message)); });
      child.once("close", (status, signal) => {
        clearTimeout(deadline); if (forceStop) clearTimeout(forceStop);
        process.removeListener("SIGTERM", term); process.removeListener("SIGINT", interrupt);
        writeFileSync(join(options.evidenceDir, "stdout.jsonl"), Buffer.concat(stdout), { mode: 0o600 });
        writeFileSync(join(options.evidenceDir, "stderr.txt"), Buffer.concat(stderr), { mode: 0o600 });
        report["exit_code"] = status; report["signal"] = signal; report["finished_at"] = new Date().toISOString();
        writeFileSync(join(options.evidenceDir, "launch.json"), JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
        done(status ?? 1);
      });
    });
    return code;
  } finally {
    try { unlinkSync(auth); } catch { /* Authentication may not have been copied. */ }
  }
}
