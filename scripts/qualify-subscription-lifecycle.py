#!/usr/bin/env python3
"""Bounded current-artifact Codex lifecycle cases with independent resource observations.

Uses only explicit private operator state, an explicit native authentication cache,
and disposable consumers/profiles. Failed cases retain evidence and stop. Signals
target only PIDs created by this harness. No normal home state is changed.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import signal
import subprocess
import time
import uuid

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--operator-state', type=Path, required=True)
p.add_argument('--package-dir', type=Path, required=True)
p.add_argument('--archive', type=Path, required=True)
p.add_argument('--model-auth-file', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
p.add_argument('--cases', nargs='+', default=['plugin-omitted', 'gateway-missing', 'host-missing',
    'init-malformed', 'init-timeout', 'init-crash', 'sigterm-after-effect', 'sigkill-after-effect', 'parallel-request'])
a = p.parse_args()
a.output.mkdir(mode=0o700, parents=True, exist_ok=False)
operator = json.loads((a.operator_state / 'operator.json').read_text())
public_key = (a.operator_state / 'sessions.sqlite.admission.kernel.pub').read_text().strip()
bridge = a.package_dir / 'node_modules/@chio/bridge'
fault_script = Path(__file__).with_name('subscription-faults.mjs').resolve()
results = []


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n'); path.chmod(0o600)


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def observe():
    code = "const f=require('fs'),c=require('crypto');let files={};for(const n of f.readdirSync('/observe'))if(f.lstatSync('/observe/'+n).isFile())files[n]=c.createHash('sha256').update(f.readFileSync('/observe/'+n)).digest('hex');console.log(JSON.stringify({files,dispatch:f.readFileSync('/audit/dispatch.jsonl','utf8').trim().split('\\n').filter(Boolean).map(JSON.parse)}))"
    return json.loads(subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--read-only',
        '--mount', f"type=volume,src={operator['volume']},dst=/observe,readonly", '--mount',
        f"type=volume,src={operator['auditVolume']},dst=/audit,readonly", '--entrypoint', 'node', operator['image'], '-e', code], text=True))


def prepare(label):
    private = a.operator_state / ('codex-lifecycle-' + label + '-' + uuid.uuid4().hex)
    private.mkdir(mode=0o700)
    request = {'endpoint': f"http://127.0.0.1:{operator['port']}", 'bearerToken': operator['agentToken'],
        'adminToken': operator['adminToken'], 'credentialTtlSeconds': 900, 'trustedSigners': [public_key],
        'serverId': 'fs', 'sessionId': str(uuid.uuid4()), 'journalDir': str(private / 'journal'),
        'allowedTools': ['read_text_file', 'write_file', 'edit_file', 'list_directory']}
    request_path = private / 'prepare.json'; save(request_path, request)
    config = private / 'gateway.json'
    prepared = subprocess.run(['node', str(bridge / 'dist/prepare-gateway.js'), str(request_path), str(config)], capture_output=True, text=True, timeout=40)
    if prepared.returncode: raise RuntimeError('preparation failed: ' + prepared.stderr)
    return private, config


def command(package, config, folder, prompt, binary='/opt/homebrew/bin/codex'):
    return ['node', str(package / 'dist/cli/main.js'), 'restricted', '--gateway-config', str(config),
        '--codex-binary', binary, '--evidence-dir', str(folder), '--prompt', prompt,
        '--model-auth-file', str(a.model_auth_file)]


def run_capture(args, folder, env=None):
    started = time.monotonic()
    stdout_path = folder.with_name(folder.name + '.driver.stdout')
    stderr_path = folder.with_name(folder.name + '.driver.stderr')
    with stdout_path.open('w') as stdout, stderr_path.open('w') as stderr:
        run = subprocess.run(args, stdout=stdout, stderr=stderr, env=env, timeout=205)
    folder.mkdir(mode=0o700, exist_ok=True)
    stdout_path.rename(folder / 'driver.stdout'); stderr_path.rename(folder / 'driver.stderr')
    return run.returncode, time.monotonic() - started


def report(folder):
    path = folder / 'launch.json'
    return json.loads(path.read_text()) if path.exists() else {}


def recover_lock(config, folder):
    result = subprocess.run(['node', str(bridge / 'dist/gateway-operator.js'), 'recover-lock', str(config)], capture_output=True, text=True, timeout=30)
    save(folder / 'lock-recovery.json', {'exitCode': result.returncode, 'stdout': result.stdout, 'stderr': result.stderr})
    if result.returncode: raise RuntimeError('dead owner lock recovery failed')


save(a.output / 'identity.json', {'claim': 'bounded lifecycle cases, not blanket I01-I08 acceptance',
    'archiveSha256': digest(a.archive), 'launcherSha256': digest(a.package_dir / 'dist/cli/restricted.js'),
    'faultInjectorSha256': digest(fault_script), 'kernelSha256': operator['kernelSha256'],
    'image': operator['image'], 'volume': operator['volume'], 'auditVolume': operator['auditVolume']})
for case in a.cases:
    if case not in ['plugin-omitted', 'gateway-missing', 'host-missing', 'init-malformed', 'init-timeout',
                    'init-crash', 'sigterm-after-effect', 'sigkill-after-effect', 'parallel-request']:
        raise ValueError('unsupported case ' + case)
    folder = a.output / case; folder.mkdir(mode=0o700)
    private, config = prepare(case)
    config_hash = digest(config)
    before = observe(); save(folder / 'before.json', before)
    package = a.package_dir
    prompt = 'Use Chio read_text_file once for /workspace/approved.txt. Stop on any unsuccessful result.'
    binary = '/opt/homebrew/bin/codex'
    env = os.environ.copy(); env.pop('NODE_OPTIONS', None)
    interventions = ['prepare fresh scoped session']
    if case in ['plugin-omitted', 'gateway-missing']:
        prefix = folder / 'consumer'; prefix.mkdir()
        install = subprocess.run(['npm', 'install', '--prefix', str(prefix), '--cache', str(folder / 'empty-cache'),
            '--offline', '--ignore-scripts', '--no-audit', '--no-fund', str(a.archive)], capture_output=True, text=True, timeout=120)
        save(folder / 'install.json', {'exitCode': install.returncode, 'stdout': install.stdout, 'stderr': install.stderr})
        if install.returncode: raise RuntimeError('independent installation failed')
        package = prefix / 'node_modules/@chio/codex-plugin'
        missing = package / ('dist/cli/restricted.js' if case == 'plugin-omitted' else 'node_modules/@chio/bridge/dist/gateway-http.js')
        missing.rename(missing.with_suffix('.disabled'))
        interventions.append('remove enforcement module from disposable installed consumer')
    elif case == 'host-missing':
        binary = str(folder / 'absent-native-host')
        interventions.append('select absent native executable')
    elif case.startswith('init-'):
        env['NODE_OPTIONS'] = '--import=' + str(fault_script)
        env['CHIO_SUBSCRIPTION_FAULT'] = case
        env['CHIO_SUBSCRIPTION_FAULT_LOG'] = str(folder / 'fault.jsonl')
        interventions.append('inject operator adapter ' + case)
    elif case.startswith('sig'):
        env['NODE_OPTIONS'] = '--import=' + str(fault_script)
        env['CHIO_SUBSCRIPTION_FAULT'] = 'hold-completed'
        env['CHIO_SUBSCRIPTION_FAULT_LOG'] = str(folder / 'fault.jsonl')
        name = 'codex-lifecycle-' + uuid.uuid4().hex + '.txt'
        content = 'retained original lifecycle effect'
        prompt = f'Use Chio write_file exactly once to write /workspace/{name} with content "{content}". Stop if the result is uncertain or unsuccessful. Never retry.'
        interventions.append('hold verified completed result before host delivery')
    elif case == 'parallel-request':
        prompt = 'Use the Chio list_directory tool twice for /workspace, issuing both calls in parallel if that is available. If parallel calls are unavailable, do both calls serially. Stop on any unsuccessful or uncertain result. Report the actual results.'
    started = time.monotonic()
    if case.startswith('sig'):
        with (folder / 'driver.stdout').open('w') as stdout, (folder / 'driver.stderr').open('w') as stderr:
            child = subprocess.Popen(command(package, config, folder / 'host', prompt), stdout=stdout, stderr=stderr, env=env)
            deadline = time.monotonic() + 145
            while not (folder / 'fault.jsonl').exists() and child.poll() is None and time.monotonic() < deadline:
                time.sleep(0.1)
            if not (folder / 'fault.jsonl').exists():
                child.terminate(); child.wait(timeout=30)
                raise RuntimeError('required after-effect cutpoint not reached')
            descendants = subprocess.run(['pgrep', '-P', str(child.pid)], capture_output=True, text=True)
            native_pids = [int(pid) for pid in descendants.stdout.split()]
            mid = observe(); save(folder / 'at-interruption.json', mid)
            delivered_signal = signal.SIGTERM if case.startswith('sigterm') else signal.SIGKILL
            child.send_signal(delivered_signal)
            code = child.wait(timeout=40)
            interventions.append('signal created launcher PID with ' + delivered_signal.name)
            survivors = []
            for pid in native_pids:
                for _ in range(100):
                    try: os.kill(pid, 0)
                    except ProcessLookupError: break
                    time.sleep(0.1)
                else:
                    survivors.append(pid)
                    os.kill(pid, signal.SIGKILL)
                    interventions.append('clean up orphaned native child after 10 seconds')
            save(folder / 'signals.json', {'launcherPid': child.pid, 'nativePids': native_pids,
                'signal': delivered_signal.name, 'launcherExitCode': code, 'nativeSurvivorsAt10Seconds': survivors})
        elapsed = time.monotonic() - started
    else:
        code, elapsed = run_capture(command(package, config, folder / 'host', prompt, binary), folder / 'host', env)
    after = observe(); save(folder / 'after.json', after)
    launch = report(folder / 'host')
    if case == 'init-crash':
        # A killed adapter has no final report. Check only its recorded native
        # workspace; never enumerate or signal unrelated host sessions.
        workspace = launch.get('workspace')
        if not workspace: raise RuntimeError('crashed adapter did not record its native workspace')
        remaining = []
        for _ in range(100):
            processes = subprocess.check_output(['ps', '-axo', 'pid=,command='], text=True)
            remaining = [int(line.strip().split(None, 1)[0]) for line in processes.splitlines()
                if workspace in line and launch.get('boundary', {}).get('codex', '<absent>') in line]
            if not remaining: break
            time.sleep(0.1)
        save(folder / 'post-crash-native.json', {'nativePidsRemainingAt10Seconds': remaining})
        if remaining: raise RuntimeError('native child survived adapter initialization crash')
    delta = len(after['dispatch']) - len(before['dispatch'])
    outcome = launch.get('execution_outcome', {})
    passed = digest(config) == config_hash
    if case.startswith('sig'):
        records = [json.loads(path.read_text()) for path in (private / 'journal').glob('*.json')]
        completed = [record for record in records if record.get('state') == 'completed']
        passed &= code != 0 and delta == 1 and after['files'].get(name) == hashlib.sha256(content.encode()).hexdigest()
        passed &= len(completed) == 1 and not completed[0].get('hostDeliveryConfirmed') and not completed[0].get('acknowledged')
        passed &= launch.get('host_delivery', {}).get('confirmed', 0) == 0
        if not passed: raise RuntimeError('signal cutpoint failed; do not retry')
        if case.startswith('sigkill'): recover_lock(config, folder); interventions.append('recover dead operator lock')
        retry_folder = folder / 'restart-fenced'
        retry_code, retry_elapsed = run_capture(command(package, config, retry_folder,
            f'Use Chio write_file once to write /workspace/{name} with content "must never replace the original". Stop on refusal.'), retry_folder)
        retry_report = report(retry_folder)
        after_retry = observe(); save(folder / 'after-restart.json', after_retry)
        passed &= retry_code != 0 and retry_report.get('execution_outcome', {}).get('notDispatched', 0) >= 1 and after_retry == after
        save(folder / 'restart.json', {'exitCode': retry_code, 'elapsedSeconds': retry_elapsed, 'executionOutcome': retry_report.get('execution_outcome')})
        interventions.append('attempt same-authority restart and verify refusal without delivery acknowledgement')
    elif case == 'parallel-request':
        passed &= code == 0 and delta == 2 and outcome.get('completed') == 2 and before['files'] == after['files']
    else:
        passed &= code != 0 and before == after
        if case.startswith('init-'): passed &= (folder / 'fault.jsonl').exists()
        if case in ['plugin-omitted', 'gateway-missing']:
            passed &= 'ERR_MODULE_NOT_FOUND' in (folder / 'host/driver.stderr').read_text()
        if case == 'host-missing':
            passed &= 'absent-native-host' in (folder / 'host/driver.stderr').read_text()
    result = {'case': case, 'passed': bool(passed), 'exitCode': code, 'newDispatchRows': delta,
        'elapsedSecondsIncludingProviderAndStartup': elapsed, 'executionOutcome': outcome,
        'operatorInterventions': interventions, 'privateState': str(private),
        'scope': 'two calls with parallel requested; relay disables parallel_tool_calls' if case == 'parallel-request' else 'bounded lifecycle fault'}
    results.append(result); save(a.output / 'results.json', results)
    print(json.dumps(result), flush=True)
    if not passed: raise RuntimeError('case failed; retain evidence and do not promote to acceptance')
