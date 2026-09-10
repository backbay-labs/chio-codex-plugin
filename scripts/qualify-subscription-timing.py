#!/usr/bin/env python3
"""Three paired native Chio/direct resource reads; exact transport stages only.

Starts one new healthy owner, retains one native capability scope, and never
modifies fault-owner state. The direct control is operator-only, uses the same
resource image and readonly volume, and has separate ephemeral audit storage.
These three observations are not an estimate of pure plugin overhead.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import selectors
import socket
import subprocess
import time
import uuid

p = argparse.ArgumentParser(description=__doc__)
for key in ['owner-launcher', 'state-dir', 'kernel', 'policy', 'package-dir', 'archive', 'model-auth-file', 'output']:
    p.add_argument('--' + key, type=Path, required=True)
p.add_argument('--kernel-sha256', required=True)
p.add_argument('--image', required=True)
p.add_argument('--volume', required=True)
a = p.parse_args()
a.output.mkdir(mode=0o700, parents=True, exist_ok=False)
bridge = a.package_dir / 'node_modules/@chio/bridge'
instrument = Path(__file__).with_name('subscription-timing.mjs').resolve()
target = '/workspace/timing.txt'
content = 'Three paired Codex native resource reads.\n'


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n'); path.chmod(0o600)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def checked(command, timeout=45):
    result = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if result.returncode: raise RuntimeError('explicit operator command failed: ' + result.stderr)
    return result


with socket.socket() as probe:
    probe.bind(('127.0.0.1', 0)); port = probe.getsockname()[1]
owner_command = ['python3', str(a.owner_launcher), 'start', '--state-dir', str(a.state_dir), '--kernel', str(a.kernel),
    '--kernel-sha256', a.kernel_sha256, '--image', a.image, '--volume', a.volume, '--port', str(port), '--policy', str(a.policy)]
save(a.output / 'owner-start.json', {'command': owner_command, 'stdout': checked(owner_command).stdout})
operator = json.loads((a.state_dir / 'operator.json').read_text())
prepare = {'endpoint': f'http://127.0.0.1:{port}', 'bearerToken': operator['agentToken'], 'adminToken': operator['adminToken'],
    'credentialTtlSeconds': 1800, 'trustedSigners': [(a.state_dir / 'sessions.sqlite.admission.kernel.pub').read_text().strip()],
    'serverId': 'fs', 'sessionId': str(uuid.uuid4()), 'journalDir': str(a.state_dir / 'journal'),
    'allowedTools': ['read_text_file', 'write_file', 'edit_file', 'list_directory']}
save(a.state_dir / 'prepare.json', prepare)
config_path = a.state_dir / 'gateway.json'
prepared = checked(['node', str(bridge / 'dist/prepare-gateway.js'), str(a.state_dir / 'prepare.json'), str(config_path)])
save(a.output / 'prepare-result.json', {'stdout': prepared.stdout})
config = json.loads(config_path.read_text()); config_hash = sha(config_path)
save(a.output / 'identity.json', {'artifactSha256': sha(a.archive), 'kernelSha256': a.kernel_sha256, 'image': a.image,
    'configurationSha256': config_hash, 'hostSessionId': config['sessionId'], 'sessionCredential': config['sessionCredential'],
    'launcherSha256': sha(a.package_dir / 'dist/cli/restricted.js'), 'bridgeGatewaySha256': sha(bridge / 'dist/gateway.js'),
    'instrumentSha256': sha(instrument), 'harnessSha256': sha(Path(__file__)), 'endpoint': prepare['endpoint'],
    'host': 'codex-cli 0.153.4', 'model': 'gpt-5.5', 'stateDir': str(a.state_dir), 'volume': a.volume,
    'scope': 'three same-file, same native authority read pairs; operator direct control has no kernel capability and a readonly resource mount'})


def native(name, tool, arguments):
    folder = a.output / name
    prompt = f'Call Chio {tool} exactly once with JSON arguments {json.dumps(arguments)}. Preserve strings exactly. Stop after its result. Do not retry or use any other tool.'
    command = ['node', '--import', str(instrument), str(a.package_dir / 'dist/cli/main.js'), 'restricted', '--gateway-config', str(config_path),
        '--codex-binary', '/opt/homebrew/bin/codex', '--evidence-dir', str(folder), '--model-auth-file', str(a.model_auth_file), '--prompt', prompt]
    timing_path = a.output / (name + '.timing.jsonl')
    env = os.environ.copy(); env.pop('NODE_OPTIONS', None)
    env.update(CHIO_TIMING_LOG=str(timing_path), CHIO_TIMING_KERNEL_ENDPOINT=prepare['endpoint'] + '/mcp')
    started = time.monotonic(); run = subprocess.run(command, capture_output=True, text=True, env=env, timeout=205)
    elapsed = time.monotonic() - started
    folder.mkdir(mode=0o700, exist_ok=True)
    (folder / 'driver.stdout').write_text(run.stdout); (folder / 'driver.stderr').write_text(run.stderr)
    save(folder / 'invocation.json', {'command': command, 'exitCode': run.returncode, 'elapsedSecondsIncludingProvider': elapsed})
    launch = json.loads((folder / 'launch.json').read_text())
    calls = [o['item'] for line in run.stdout.splitlines() if line.startswith('{') and (o := json.loads(line)).get('type') == 'item.completed' and o.get('item', {}).get('type') == 'mcp_tool_call']
    assert len(calls) == 1 and calls[0]['tool'] == tool and calls[0]['arguments'] == arguments
    assert run.returncode == 0 and launch['execution_outcome']['completed'] == 1 and launch['host_delivery']['confirmed'] == 1
    timings = [json.loads(line) for line in timing_path.read_text().splitlines()]
    assert len(timings) == 2 and {r['stage'] for r in timings} == {'kernel-fetch-to-SDK-terminal-consumption', 'native-gateway-request-to-response-end'}
    assert all(row['tool'] == tool and row['arguments'] == arguments for row in timings)
    return timings


def observe():
    script = "const f=require('fs');console.log(JSON.stringify({content:f.readFileSync('/workspace/timing.txt','utf8'),dispatch:f.readFileSync('/audit/dispatch.jsonl','utf8').trim().split('\\n').filter(Boolean).map(JSON.parse)}))"
    result = checked(['docker', 'run', '--rm', '--network', 'none', '--read-only', '--mount', f'type=volume,src={a.volume},dst=/workspace,readonly',
        '--mount', f"type=volume,src={operator['auditVolume']},dst=/audit,readonly", '--entrypoint', 'node', a.image, '-e', script])
    return json.loads(result.stdout)


native('seed', 'write_file', {'path': target, 'content': content})
before = observe(); save(a.output / 'before.json', before)
direct_command = ['docker', 'run', '--rm', '-i', '--network', 'none', '--read-only', '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges',
    '--mount', f'type=volume,src={a.volume},dst=/workspace,readonly', '--tmpfs', '/audit:rw,noexec,nosuid,size=16m,uid=1000,gid=1000',
    '--tmpfs', '/tmp:rw,noexec,nosuid,size=16m', a.image]
save(a.output / 'direct-command.json', direct_command)
pairs = []
with (a.output / 'direct.stderr').open('w') as stderr:
    direct = subprocess.Popen(direct_command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=stderr, text=True, bufsize=1)
    selector = selectors.DefaultSelector(); selector.register(direct.stdout, selectors.EVENT_READ)
    counter = 0

    def rpc(method, params):
        global counter
        counter += 1
        request = {'jsonrpc': '2.0', 'id': counter, 'method': method, 'params': params}
        started = time.monotonic_ns(); epoch = time.time_ns()
        direct.stdin.write(json.dumps(request) + '\n'); direct.stdin.flush()
        while True:
            assert selector.select(20), 'direct resource control timed out'
            line = direct.stdout.readline(); assert line, 'direct resource control exited'
            response = json.loads(line)
            if response.get('id') == counter: break
        finished = time.monotonic_ns()
        record = {'request': request, 'response': response, 'startedEpochNs': epoch, 'startedMonotonicNs': started, 'finishedMonotonicNs': finished,
            'elapsedMs': (finished - started) / 1e6, 'stage': 'warm-direct-MCP-stdin-write-to-parsed-response',
            'includes': ['Docker stdio transport', 'resource dispatch audit fsync', 'resource file read', 'JSON parsing'],
            'excludes': ['container startup', 'MCP initialize', 'model', 'kernel authorization or receipt', 'delivery ACK']}
        return record

    try:
        initialized = rpc('initialize', {'protocolVersion': '2024-11-05', 'capabilities': {}, 'clientInfo': {'name': 'operator-paired-read-control', 'version': '1'}})
        assert 'result' in initialized['response']; save(a.output / 'direct-initialize.json', initialized)
        direct.stdin.write(json.dumps({'jsonrpc': '2.0', 'method': 'notifications/initialized'}) + '\n'); direct.stdin.flush()
        for number in range(1, 4):
            if number == 2: control = rpc('tools/call', {'name': 'read_text_file', 'arguments': {'path': target}})
            timings = native(f'pair-{number}-native', 'read_text_file', {'path': target})
            if number != 2: control = rpc('tools/call', {'name': 'read_text_file', 'arguments': {'path': target}})
            assert control['response']['result'].get('isError', False) is False
            assert control['response']['result']['content'][0]['text'] == content
            save(a.output / f'pair-{number}-direct.json', control)
            gateway = next(row['elapsedMs'] for row in timings if row['stage'] == 'native-gateway-request-to-response-end')
            kernel = next(row['elapsedMs'] for row in timings if row['stage'] == 'kernel-fetch-to-SDK-terminal-consumption')
            pair = {'pair': number, 'order': 'direct then native' if number == 2 else 'native then direct',
                'nativeGatewayRequestToResponseEndMs': gateway, 'kernelFetchToSdkTerminalConsumptionMs': kernel,
                'warmDirectMcpStdioReadMs': control['elapsedMs'], 'gatewayMinusDirectMs': gateway - control['elapsedMs'],
                'kernelMinusDirectMs': kernel - control['elapsedMs'], 'interpretation': 'descriptive stage differences only, not pure plugin overhead'}
            pairs.append(pair); save(a.output / 'pairs.json', pairs); print(json.dumps(pair), flush=True)
    finally:
        direct.stdin.close()
        try: direct.wait(timeout=15)
        except subprocess.TimeoutExpired: direct.terminate(); direct.wait(timeout=10)
        selector.close()
after = observe(); save(a.output / 'after.json', after)
assert before['content'] == after['content'] == content
assert len(after['dispatch']) - len(before['dispatch']) == 3
assert all(row['tool'] == 'read_text_file' and row['path'] == target for row in after['dispatch'][len(before['dispatch']):])
records = [json.loads(f.read_text()) for f in Path(config['journalDir']).glob('*.json')]
assert len(records) == 4 and all(r['state'] == 'completed' and r['acknowledged'] and r['hostDeliveryConfirmed'] for r in records)
assert sha(config_path) == config_hash
save(a.output / 'result.json', {'passed': True, 'pairedReads': 3, 'nativeCompletedAndAcknowledged': 4, 'seedWrites': 1,
    'sameNativeAuthorityConfigurationPreserved': True, 'newObservedNativeReadDispatches': 3, 'fileUnchangedAcrossPairs': True,
    'operatorInterventions': ['create new healthy owner and original scoped authority', 'seed file through actual acknowledged native write',
        'start separate readonly direct MCP control', 'run three paired read observations', 'stop direct control'],
    'nativeToolInterval': 'The native JSONL lacks timestamps; the trusted parent HTTP request/result boundary is instrumented instead.',
    'limits': 'Three non-randomized observations on one local resource; unlike transports and clock implementations; not a population estimate, pure plugin cost or model-latency comparison.'})
