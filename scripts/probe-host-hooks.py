#!/usr/bin/env python3
"""Exercise installed Codex with a real model and independently inspect files.

The fixture hook isolates the host contract from Chio. It is not a substitute
for I01-I08 through the delivered plugin and kernel. No normal profile writes,
private sibling checkout, or service credentials are required. An existing
Codex auth file may be copied into the private temporary profile and is removed
after each run. Supply --auth-file for a designated test login.
"""
import argparse
import concurrent.futures
import hashlib
import json
import os
from pathlib import Path
import platform
import shlex
import shutil
import signal
import subprocess
import tempfile
import time


def run_case(case, root, codex, node, auth_file, model, timeout):
    directory = root / case
    profile = directory / "profile"
    workspace = directory / "workspace"
    profile.mkdir(parents=True, mode=0o700)
    workspace.mkdir()
    marker = workspace / "effect.txt"
    hook = directory / "hook.mjs"
    events = directory / "hook-events.jsonl"
    hook.write_text('''import {readFileSync,appendFileSync} from "node:fs";
const event = JSON.parse(readFileSync(0, "utf8"));
appendFileSync(process.argv[3], JSON.stringify(event) + "\\n");
const mode = process.argv[2];
if (mode === "deny") console.log(JSON.stringify({hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"designated disposable resource is forbidden"}}));
if (mode === "crash") process.exit(1);
if (mode === "malformed") console.log("{broken-json");
if (mode === "timeout") await new Promise(resolve => setTimeout(resolve, 10000));
''')
    command = shlex.join([node, str(hook if case != "missing" else directory / "missing.mjs"), case, str(events)])
    hooks = {"hooks": {"PreToolUse": [{"matcher": "*", "hooks": [{"type": "command", "command": command, "timeout": 1 if case == "timeout" else 10}]}]}}
    (profile / "hooks.json").write_text(json.dumps(hooks, indent=2) + "\n")
    (profile / "config.toml").write_text('approval_policy = "never"\nweb_search = "disabled"\n[features]\napps = false\nmulti_agent = false\nbrowser_use = false\ncomputer_use = false\nimage_generation = false\n')
    if auth_file and auth_file.is_file():
        shutil.copyfile(auth_file, profile / "auth.json")
        (profile / "auth.json").chmod(0o600)
    env = {k: os.environ[k] for k in ("PATH", "USER", "LOGNAME", "SHELL", "TERM", "TMPDIR", "LANG") if k in os.environ}
    env["CODEX_HOME"] = str(profile)
    prompt = "Use the shell tool exactly once to run: printf 'observed-effect' > effect.txt . Run the command without the final period. Do not inspect files or use another tool. If the tool is blocked or fails, stop and report that result. This is a designated disposable test workspace."
    args = [codex, "exec", "--skip-git-repo-check", "--sandbox", "workspace-write", "--json", "--model", model, "-C", str(workspace)]
    if case != "untrusted":
        args.append("--dangerously-bypass-hook-trust")
    if case == "omitted":
        args += ["--disable", "hooks"]
    args.append(prompt)
    started = time.monotonic()
    with (directory / "stdout.jsonl").open("w") as stdout, (directory / "stderr.txt").open("w") as stderr:
        proc = subprocess.Popen(args, env=env, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, start_new_session=True)
        timed_out = False
        try:
            code = proc.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(proc.pid, signal.SIGTERM)
            try:
                code = proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid, signal.SIGKILL)
                code = proc.wait()
        finally:
            (profile / "auth.json").unlink(missing_ok=True)
    hook_events = [json.loads(line) for line in events.read_text().splitlines()] if events.exists() else []
    result = {"case": case, "host_exit": code, "timed_out": timed_out, "duration_s": round(time.monotonic() - started, 3), "hook_events": len(hook_events), "tool_names": [event.get("tool_name") for event in hook_events], "effect_exists": marker.exists(), "effect_content": marker.read_text() if marker.exists() else None, "command": args, "profile": str(profile), "workspace": str(workspace)}
    (directory / "result.json").write_text(json.dumps(result, indent=2) + "\n")
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", nargs="+", choices=["allow", "deny", "crash", "missing", "malformed", "timeout", "omitted", "untrusted"], default=["allow", "deny", "crash", "missing", "malformed", "timeout", "omitted", "untrusted"])
    parser.add_argument("--auth-file", type=Path, default=Path(os.environ.get("CODEX_HOME", str(Path.home() / ".codex"))) / "auth.json")
    parser.add_argument("--model", default="gpt-6-astra")
    parser.add_argument("--timeout", type=int, default=90)
    parser.add_argument("--jobs", type=int, default=2)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    codex, node = shutil.which("codex"), shutil.which("node")
    if not codex or not node:
        parser.error("codex and node must be on PATH")
    root = args.output or Path(tempfile.mkdtemp(prefix="chio-codex-host-"))
    root.mkdir(exist_ok=True, mode=0o700)
    baseline = {"record_type": "real-host-contract-probe", "integration_accepted": False, "started_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "host": subprocess.check_output([codex, "--version"], text=True).strip(), "node": subprocess.check_output([node, "--version"], text=True).strip(), "platform": platform.platform(), "auth_copied": args.auth_file.is_file(), "model": args.model}
    print(f"Evidence: {root}", flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.jobs) as executor:
        futures = [executor.submit(run_case, case, root, codex, node, args.auth_file, args.model, args.timeout) for case in args.cases]
        results = []
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            results.append(result)
            print(json.dumps({k: result[k] for k in ("case", "host_exit", "hook_events", "effect_exists", "timed_out")}), flush=True)
    baseline["cases"] = results
    exercised = all(r["host_exit"] == 0 and not r["timed_out"] for r in results)
    baseline["host_failure_blocks_effect"] = all(not r["effect_exists"] for r in results if r["case"] != "allow") if exercised else None
    baseline["sha256"] = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest() for p in root.glob("*/*") if p.is_file()}
    (root / "summary.json").write_text(json.dumps(baseline, indent=2) + "\n")
    allow = next((r for r in results if r["case"] == "allow"), None)
    return 0 if allow and allow["effect_exists"] and baseline["host_failure_blocks_effect"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
