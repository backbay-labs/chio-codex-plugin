#!/usr/bin/env python3
"""Capture the installed host's actual outgoing tool catalog, without tool calls.

This is a structural inventory, not model or kernel acceptance. A local model
endpoint retains only tool schemas, then returns an explicit diagnostic error.
It never receives account credentials or executes a requested tool.
"""
import argparse
import http.server
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--gateway-config', type=Path, required=True)
parser.add_argument('--output', type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(mode=0o700)
source = Path(__file__).resolve().parent.parent
runtime = Path(tempfile.mkdtemp(prefix='chio-codex-catalog-'))
profile, workspace = runtime / 'profile', runtime / 'workspace'
profile.mkdir(mode=0o700)
workspace.mkdir(mode=0o700)


class Capture(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        size = int(self.headers.get('Content-Length', '0'))
        if size > 4 * 1024 * 1024:
            self.send_error(413)
            return
        body = json.loads(self.rfile.read(size))
        (args.output / 'tools.json').write_text(json.dumps(body.get('tools'), indent=2) + '\n')
        self.send_response(400)
        self.send_header('Content-Type', 'application/json')
        self.end_headers()
        self.wfile.write(b'{"error":{"message":"tool inventory captured; no model/tool execution","type":"invalid_request_error"}}')

    def log_message(self, *items):
        pass


server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Capture)
threading.Thread(target=server.serve_forever, daemon=True).start()
code = '''import { restrictedHostArgs } from "./dist/cli/restricted.js";
import {dirname,join} from "node:path";
import {fileURLToPath} from "node:url";
const gateway=join(dirname(fileURLToPath(import.meta.resolve("@chio/bridge/package.json"))),"dist","gateway.js");
console.log(JSON.stringify(restrictedHostArgs(process.argv[1],gateway,process.argv[2],"Report available tools.")));
'''
command = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', code, str(workspace), str(args.gateway_config.resolve())], cwd=source, text=True))
index = command.index('--')
command[index:index] = ['-c', 'model_provider="inventory"', '-c', 'model_providers.inventory.name="inventory"', '-c', f'model_providers.inventory.base_url="http://127.0.0.1:{server.server_port}"', '-c', 'model_providers.inventory.wire_api="responses"']
env = {key: os.environ[key] for key in ['PATH', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'TMPDIR'] if key in os.environ}
env['CODEX_HOME'] = str(profile)
try:
    result = subprocess.run(['codex', *command], env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
finally:
    server.shutdown()
(args.output / 'stdout.jsonl').write_text(result.stdout)
(args.output / 'stderr.txt').write_text(result.stderr)
(args.output / 'command.json').write_text(json.dumps(command, indent=2) + '\n')
record = {'kind': 'actual-host-tool-catalog', 'acceptance': False, 'model_endpoint': 'local diagnostic capture; no model/tool execution', 'host_exit': result.returncode, 'runtime': str(runtime)}
(args.output / 'record.json').write_text(json.dumps(record, indent=2) + '\n')
tools = json.loads((args.output / 'tools.json').read_text())
print(json.dumps([{'type': tool.get('type'), 'name': tool.get('name')} for tool in tools], indent=2))
