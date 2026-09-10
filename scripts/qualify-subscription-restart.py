#!/usr/bin/env python3
"""Restart one explicitly selected owner and prove its original pending run stays fenced."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

p = argparse.ArgumentParser(description=__doc__)
for flag in ['operator-state', 'gateway-config', 'package-dir', 'model-auth-file', 'owner-lifecycle', 'output']:
    p.add_argument('--' + flag, type=Path, required=True)
a = p.parse_args(); a.output.mkdir(mode=0o700)
operator = json.loads((a.operator_state / 'operator.json').read_text())
config = json.loads(a.gateway_config.read_text())
assert config['execution']['endpoint'].rstrip('/') == f"http://127.0.0.1:{operator['port']}"
journal = Path(config['journalDir'])
original = {path.name: path.read_bytes() for path in journal.glob('*.json')}
pending = [json.loads(value) for value in original.values() if json.loads(value)['state'] in ['pending', 'unknown']]
assert len(pending) == 1 and pending[0]['request']['tool'] == 'write_file'
target = pending[0]['request']['arguments']['path']
config_hash = hashlib.sha256(a.gateway_config.read_bytes()).hexdigest()


def save(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n'); path.chmod(0o600)


def observe():
    code = "const f=require('fs'),c=require('crypto');let files={};for(const n of f.readdirSync('/observe'))if(f.lstatSync('/observe/'+n).isFile())files[n]=c.createHash('sha256').update(f.readFileSync('/observe/'+n)).digest('hex');console.log(JSON.stringify({files,dispatch:f.readFileSync('/audit/dispatch.jsonl','utf8').trim().split('\\n').filter(Boolean).map(JSON.parse)}))"
    return json.loads(subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--read-only',
        '--mount', f"type=volume,src={operator['volume']},dst=/observe,readonly", '--mount',
        f"type=volume,src={operator['auditVolume']},dst=/audit,readonly", '--entrypoint', 'node', operator['image'], '-e', code], text=True))


started = time.monotonic()
before = observe(); save(a.output / 'before.json', before)
old_pid = int((a.operator_state / 'kernel.pid').read_text())
restart = subprocess.run(['python3', str(a.owner_lifecycle), 'restart', '--state-dir', str(a.operator_state)],
    capture_output=True, text=True, timeout=30)
save(a.output / 'owner-restart.json', {'exitCode': restart.returncode, 'stdout': restart.stdout, 'stderr': restart.stderr,
    'oldPid': old_pid, 'newPid': int((a.operator_state / 'kernel.pid').read_text())})
restart.check_returncode()
assert observe() == before, 'owner restart changed protected resources'
assert {path.name: path.read_bytes() for path in journal.glob('*.json')} == original
host = a.output / 'host'
run_started = time.monotonic()
run = subprocess.run(['node', str(a.package_dir / 'dist/cli/main.js'), 'restricted', '--gateway-config', str(a.gateway_config),
    '--codex-binary', '/opt/homebrew/bin/codex', '--evidence-dir', str(host), '--model-auth-file', str(a.model_auth_file),
    '--prompt', f'Call Chio write_file exactly once for {target} with content "must never replace after owner restart". Stop on refusal.'],
    capture_output=True, text=True, timeout=205)
host_elapsed = time.monotonic() - run_started
host.mkdir(mode=0o700, exist_ok=True)
(host / 'driver.stdout').write_text(run.stdout); (host / 'driver.stderr').write_text(run.stderr)
after = observe(); save(a.output / 'after.json', after)
launch = json.loads((host / 'launch.json').read_text())
assert run.returncode != 0 and launch['execution_outcome']['notDispatched'] >= 1 and after == before
assert hashlib.sha256(a.gateway_config.read_bytes()).hexdigest() == config_hash
assert {path.name: path.read_bytes() for path in journal.glob('*.json')} == original
save(a.output / 'result.json', {'passed': True, 'launcherExitCode': run.returncode, 'newDispatchRows': 0,
    'originalGatewayConfigUnchanged': True, 'originalJournalBytesUnchanged': True,
    'sessionId': config['execution']['sessionId'], 'configurationSha256': config_hash,
    'journalSha256': {name: hashlib.sha256(value).hexdigest() for name, value in original.items()},
    'kernelSha256': operator['kernelSha256'], 'target': target, 'executionOutcome': launch['execution_outcome'],
    'elapsedSecondsIncludingProviderAndRestart': time.monotonic() - started,
    'hostElapsedSecondsIncludingProvider': host_elapsed,
    'operatorInterventions': ['restart the exclusive resource owner preserving its stores', 'launch same original authority and journal'],
    'scope': 'same original post-effect pending journal remains fenced after actual owner and host restart'})
print(json.dumps({'passed': True, 'newDispatchRows': 0, 'output': str(a.output)}))
