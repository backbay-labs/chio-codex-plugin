#!/usr/bin/env python3
"""Offline disposable candidate upgrade, real-host use, removal, and reinstall.

The older archive is a retained local candidate, not a published release. This
does not claim registry publication or qualification of the public installer.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import time

p = argparse.ArgumentParser(description=__doc__)
p.add_argument('--operator-state', type=Path, required=True)
p.add_argument('--previous-archive', type=Path, required=True)
p.add_argument('--archive', type=Path, required=True)
p.add_argument('--reference-package', type=Path, required=True)
p.add_argument('--model-auth-file', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
a.output.mkdir(mode=0o700, parents=True, exist_ok=False)
prefix = a.output / 'consumer'; prefix.mkdir()
package = prefix / 'node_modules/@chio/codex-plugin'
operator = json.loads((a.operator_state / 'operator.json').read_text())
results = []


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n'); path.chmod(0o600)


def observe():
    code = "const f=require('fs'),c=require('crypto');let files={};for(const n of f.readdirSync('/observe'))if(f.lstatSync('/observe/'+n).isFile())files[n]=c.createHash('sha256').update(f.readFileSync('/observe/'+n)).digest('hex');console.log(JSON.stringify({files,audit:c.createHash('sha256').update(f.readFileSync('/audit/dispatch.jsonl')).digest('hex')}))"
    return json.loads(subprocess.check_output(['docker', 'run', '--rm', '--network', 'none', '--read-only',
        '--mount', f"type=volume,src={operator['volume']},dst=/observe,readonly", '--mount',
        f"type=volume,src={operator['auditVolume']},dst=/audit,readonly", '--entrypoint', 'node', operator['image'], '-e', code], text=True))


def execute(label, command):
    started = time.monotonic()
    result = subprocess.run(command, capture_output=True, text=True, timeout=250)
    (a.output / (label + '.stdout')).write_text(result.stdout)
    (a.output / (label + '.stderr')).write_text(result.stderr)
    value = {'case': label, 'exitCode': result.returncode, 'elapsedSecondsIncludingProviderWhenUsed': time.monotonic() - started}
    results.append(value); save(a.output / 'results.json', results)
    if result.returncode: raise RuntimeError(label + ' failed')
    return value


def install(label, archive):
    before = observe()
    result = execute(label, ['npm', 'install', '--prefix', str(prefix), '--cache', str(a.output / (label + '-empty-cache')),
        '--offline', '--ignore-scripts', '--no-audit', '--no-fund', str(archive)])
    assert before == observe(), 'installation changed protected resource'
    result['archiveSha256'] = digest(archive)
    result['launcherSha256'] = digest(package / 'dist/cli/restricted.js')
    result['protectedResourceUnchanged'] = True
    save(a.output / 'results.json', results)


save(a.output / 'identity.json', {'claim': 'local retained candidate upgrade/removal, not public release delivery',
    'archiveSha256': digest(a.archive), 'previousArchiveSha256': digest(a.previous_archive),
    'kernelSha256': operator['kernelSha256'], 'image': operator['image'], 'volume': operator['volume']})
install('install-previous-candidate', a.previous_archive)
old_hash = digest(package / 'dist/cli/restricted.js')
install('upgrade-to-current-candidate', a.archive)
assert old_hash != digest(package / 'dist/cli/restricted.js'), 'upgrade did not change runtime'
assert digest(package / 'dist/cli/restricted.js') == digest(a.reference_package / 'dist/cli/restricted.js')
execute('current-help', ['node', str(package / 'dist/cli/main.js'), '--help'])
execute('upgraded-real-host', ['python3', str(Path(__file__).with_name('qualify-http-host.py')),
    '--operator-state', str(a.operator_state), '--package-dir', str(package), '--output', str(a.output / 'upgraded-workflow'),
    '--model-auth-file', str(a.model_auth_file), '--cases', 'useful'])
before = observe(); save(a.output / 'before-removal.json', before)
execute('remove-current-candidate', ['npm', 'uninstall', '--prefix', str(prefix), '--cache', str(a.output / 'removal-cache'),
    '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '@chio/codex-plugin'])
assert not package.exists() and not (prefix / 'node_modules/.bin/chio-codex').exists()
assert before == observe(), 'removal changed protected resource'
save(a.output / 'after-removal.json', observe())
install('reinstall-current-candidate', a.archive)
assert digest(package / 'dist/cli/restricted.js') == digest(a.reference_package / 'dist/cli/restricted.js')
execute('reinstalled-real-host', ['python3', str(Path(__file__).with_name('qualify-http-host.py')),
    '--operator-state', str(a.operator_state), '--package-dir', str(package), '--output', str(a.output / 'reinstalled-workflow'),
    '--model-auth-file', str(a.model_auth_file), '--cases', 'useful'])
save(a.output / 'summary.json', {'passed': True, 'skips': 0, 'scope': 'retained local candidate upgrade and reinstall',
    'operatorInterventions': ['install old candidate', 'upgrade to frozen current candidate', 'prepare fresh authority and run useful workflow',
        'uninstall inactive disposable consumer', 'reinstall frozen current candidate', 'prepare fresh authority and run useful workflow'],
    'packageDirectory': str(package), 'results': results})
print(json.dumps({'passed': True, 'output': str(a.output), 'cases': len(results)}))
