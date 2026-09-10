#!/usr/bin/env python3
"""Real Codex qualification of selected-owner SQLite storage failures.

Every cutpoint creates a fresh dedicated resource owner using the shared audited
helper. The positive, faulted, retried and restarted turns retain one original
gateway authority. No DB rows, journals, capability clocks or runtime code are
edited. A bounded SQLite write lock is the only storage fault.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import time

p = argparse.ArgumentParser(description=__doc__)
for flag in ['helper', 'owner-launcher', 'kernel', 'policy', 'operator-bridge', 'package-dir', 'archive', 'model-auth-file', 'output']:
    p.add_argument('--' + flag, type=Path, required=True)
p.add_argument('--kernel-sha256', required=True)
p.add_argument('--image', required=True)
p.add_argument('--cases', nargs='+', choices=['after-receipt', 'before-admission', 'after-admission'],
    default=['after-receipt', 'before-admission', 'after-admission'])
p.add_argument('--name-prefix', default='codex-final')
p.add_argument('--ports', nargs=3, type=int, default=[58517, 58518, 58519])
a = p.parse_args(); a.output.mkdir(mode=0o700, parents=True, exist_ok=False)
ports = dict(zip(['after-receipt', 'before-admission', 'after-admission'], a.ports))
results = []


def save(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n'); path.chmod(0o600)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def helper(*arguments):
    value = subprocess.run(['python3', str(a.helper), *arguments], capture_output=True, text=True, timeout=80)
    if value.returncode: raise RuntimeError('selected storage helper failed: ' + value.stderr)
    return json.loads(value.stdout) if value.stdout.strip() else None


def snapshot(name, label, folder):
    value = helper('snapshot', '--name', name, '--filename', label + '.json')
    original = Path(value['snapshot'])
    data = json.loads(original.read_text())
    save(folder / (label + '.json'), data)
    return data


def resource(data):
    return {key: data['observation'][key] for key in ['files', 'dispatch']}


def records(config):
    return {f.name: f.read_bytes() for f in Path(config['journalDir']).glob('*.json')}


def native(config_path, folder, target, content):
    prompt = f'Call the Chio write_file tool exactly once with path {json.dumps(target)} and content {json.dumps(content)}. Preserve both strings exactly. Stop after the returned result, especially if unsuccessful or uncertain. Do not retry, substitute a tool, or infer success from prose.'
    command = ['node', str(a.package_dir / 'dist/cli/main.js'), 'restricted', '--gateway-config', str(config_path),
        '--codex-binary', '/opt/homebrew/bin/codex', '--evidence-dir', str(folder),
        '--model-auth-file', str(a.model_auth_file), '--prompt', prompt]
    started = time.monotonic()
    env = os.environ.copy(); env.pop('NODE_OPTIONS', None)
    run = subprocess.run(command, capture_output=True, text=True, env=env, timeout=205)
    elapsed = time.monotonic() - started
    folder.mkdir(mode=0o700, exist_ok=True)
    (folder / 'driver.stdout').write_text(run.stdout); (folder / 'driver.stderr').write_text(run.stderr)
    save(folder / 'invocation.json', {'command': command, 'elapsedSecondsIncludingProvider': elapsed, 'exitCode': run.returncode})
    launch = json.loads((folder / 'launch.json').read_text()) if (folder / 'launch.json').exists() else {}
    calls = [e.get('item') for line in run.stdout.splitlines() if line.startswith('{')
        and (e := json.loads(line)).get('type') == 'item.completed' and e.get('item', {}).get('type') == 'mcp_tool_call']
    exact = [call for call in calls if call.get('server') == 'chio' and call.get('tool') == 'write_file'
        and call.get('arguments') == {'path': target, 'content': content}]
    save(folder / 'native-attempt.json', {'exactCompletedAttempts': len(exact), 'totalCompletedMcpCalls': len(calls),
        'target': target, 'content': content})
    assert len(exact) == 1 and len(calls) == 1, 'required exact real native call not observed'
    return run.returncode, launch, elapsed


save(a.output / 'identity.json', {'archiveSha256': sha(a.archive), 'launcherSha256': sha(a.package_dir / 'dist/cli/restricted.js'),
    'helperSha256AtStart': sha(a.helper), 'harnessSha256': sha(Path(__file__)), 'kernelSha256': a.kernel_sha256,
    'image': a.image, 'policySha256': sha(a.policy), 'host': 'codex-cli 0.153.4', 'model': 'gpt-5.5',
    'modelAuthentication': 'explicit native ChatGPT cache retained by operator launcher',
    'scope': 'actual native host and kernel SQLite lock faults, not simulated transport errors'})
for cutpoint in a.cases:
    started = time.monotonic()
    folder = a.output / cutpoint; folder.mkdir(mode=0o700)
    name = a.name_prefix + '-' + cutpoint
    manifest = helper('create', '--name', name, '--port', str(ports[cutpoint]), '--kernel', str(a.kernel),
        '--kernel-sha256', a.kernel_sha256, '--image', a.image, '--policy', str(a.policy),
        '--owner-launcher', str(a.owner_launcher), '--bridge', str(a.operator_bridge))
    save(folder / 'owner-manifest.json', manifest)
    config_path = Path(manifest['gatewayConfig']); config = json.loads(config_path.read_text()); config_hash = sha(config_path)
    public = Path(manifest['output']); state = Path(manifest['owner'])
    initial = snapshot(name, 'native-initial', folder)
    positive_code, positive_launch, positive_time = native(config_path, folder / 'positive', '/workspace/positive.txt', 'Codex positive fully acknowledged')
    assert positive_code == 0 and positive_launch['execution_outcome']['completed'] == 1 and positive_launch['host_delivery']['confirmed'] == 1
    retained = [json.loads(value) for value in records(config).values()]
    assert len(retained) == 1 and retained[0]['acknowledged'] and retained[0]['hostDeliveryConfirmed']
    positive = snapshot(name, 'native-positive-acked', folder)
    assert len(positive['observation']['dispatch']) == len(initial['observation']['dispatch']) + 1
    assert positive['observation']['files']['positive.txt'] == 'Codex positive fully acknowledged'
    target = '/workspace/before-fault.txt' if cutpoint == 'before-admission' else '/workspace/uncertain.txt'
    content = 'Codex retained fault effect ' + cutpoint
    fault_process = None
    with (folder / 'fault-controller.stdout').open('w') as stdout, (folder / 'fault-controller.stderr').open('w') as stderr:
        fault_process = subprocess.Popen(['python3', str(a.helper), 'fault', '--name', name, '--cutpoint', cutpoint,
            '--wait-seconds', '240', '--hold-seconds', '300'], stdout=stdout, stderr=stderr)
        try:
            if cutpoint == 'before-admission':
                deadline = time.monotonic() + 20
                while not (public / 'fault-locked.json').exists() and fault_process.poll() is None and time.monotonic() < deadline:
                    time.sleep(0.05)
                assert (public / 'fault-locked.json').exists(), 'before-admission lock did not arm'
            code, launch, elapsed = native(config_path, folder / 'faulted', target, content)
            assert (public / 'fault-locked.json').exists(), 'actual storage cutpoint was not reached'
            locked = json.loads((public / 'fault-locked.json').read_text()); assert locked['cutpoint'] == cutpoint
            save(folder / 'fault-locked.json', locked)
            faulted = snapshot(name, 'native-faulted-locked', folder)
        finally:
            helper('unlock', '--name', name)
            if fault_process.poll() is None: fault_process.wait(timeout=20)
    assert fault_process.returncode == 0
    save(folder / 'fault-released.json', json.loads((public / 'fault-released.json').read_text()))
    if (public / 'effect-before-fault.json').exists():
        save(folder / 'effect-before-fault.json', json.loads((public / 'effect-before-fault.json').read_text()))
    after_unlock = snapshot(name, 'native-after-unlock', folder)
    expected = 0 if cutpoint == 'before-admission' else 1
    observed_delta = len(faulted['observation']['dispatch']) - len(positive['observation']['dispatch'])
    assert code == 2 and launch['execution_outcome']['unknown'] == 1 and launch['host_delivery']['confirmed'] == 0
    assert observed_delta == expected and resource(after_unlock) == resource(faulted)
    if expected: assert faulted['observation']['files']['uncertain.txt'] == content
    else: assert 'before-fault.txt' not in faulted['observation']['files']
    original = records(config)
    states = [json.loads(value) for value in original.values()]
    assert len(states) == 2 and sum(record['state'] == 'unknown' for record in states) == 1
    save(folder / 'journal-summary.json', [{'requestId': record['requestId'], 'state': record['state'],
        'acknowledged': record.get('acknowledged'), 'hostDeliveryConfirmed': record.get('hostDeliveryConfirmed')} for record in states])
    retry_times = {}
    for label, retry_target, retry_content in [('same-action-retry', target, content),
            ('new-action-refused', '/workspace/must-stay-fenced.txt', 'must not execute after unknown')]:
        retry_code, retry_launch, retry_time = native(config_path, folder / label, retry_target, retry_content)
        assert retry_code == 3 and retry_launch['execution_outcome']['notDispatched'] == 1
        assert records(config) == original and resource(snapshot(name, 'native-' + label, folder)) == resource(faulted)
        retry_times[label] = retry_time
    restart = subprocess.run(['python3', str(a.owner_launcher), 'restart', '--state-dir', str(state)], capture_output=True, text=True, timeout=40)
    save(folder / 'owner-restart.json', {'exitCode': restart.returncode, 'stdout': restart.stdout, 'stderr': restart.stderr})
    restart.check_returncode()
    restarted = snapshot(name, 'native-owner-restarted', folder)
    assert resource(restarted) == resource(faulted)
    resumed_code, resumed_launch, resumed_time = native(config_path, folder / 'after-owner-restart', target, content)
    assert resumed_code == 3 and resumed_launch['execution_outcome']['notDispatched'] == 1
    final = snapshot(name, 'native-final', folder)
    assert resource(final) == resource(faulted) and records(config) == original and sha(config_path) == config_hash
    result = {'case': cutpoint, 'passed': True, 'positiveExitCode': positive_code, 'positiveCompletedAndAcknowledged': 1,
        'faultExitCode': code, 'faultOutcome': launch['execution_outcome'], 'newFaultDispatches': expected,
        'sameActionRetryNewDispatches': 0, 'newActionDispatches': 0, 'afterOwnerRestartDispatches': 0,
        'originalAuthorityAndJournalPreserved': True, 'configurationSha256': config_hash,
        'publicOwnerEvidence': str(public), 'positiveElapsedSeconds': positive_time, 'faultElapsedSeconds': elapsed,
        'retryElapsedSeconds': retry_times, 'afterRestartElapsedSeconds': resumed_time,
        'totalElapsedSecondsIncludingProviderSetupAndObservers': time.monotonic() - started,
        'operatorInterventions': ['create dedicated frozen owner with recorded resource reply barrier', 'prepare original scoped authority',
            'run and acknowledge native positive control', 'hold selected SQLite write lock', 'run native faulted call',
            'rollback fault transaction', 'retry same and new action under original authority', 'restart same owner',
            'retry original action under unchanged authority and journal']}
    results.append(result); save(a.output / 'results.json', results); print(json.dumps(result), flush=True)
