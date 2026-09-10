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
code = r'''import { restrictedHostArgs, resolveCodexNative } from "./dist/cli/restricted.js";
import { startGatewayHttp } from "@chio/bridge";
import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
const [workspace,configPath,profile,captureUrl,commandFile]=process.argv.slice(1);
const transport=await startGatewayHttp(JSON.parse(readFileSync(configPath,"utf8")));
try {
 const command=restrictedHostArgs(workspace,transport.url,"Report available tools.");
 command.splice(command.indexOf("--"),0,"-c",'model_provider="inventory"',"-c",'model_providers.inventory.name="inventory"',"-c",`model_providers.inventory.base_url="${captureUrl}"`,"-c",'model_providers.inventory.wire_api="responses"');
 writeFileSync(commandFile,JSON.stringify(command,null,2)+"\n");
 const env={PATH:process.env.PATH,CODEX_HOME:profile,CHIO_CODEX_GATEWAY_TOKEN:transport.token,OPENSSL_CONF:"/dev/null"};
 const child=spawn(resolveCodexNative("codex"),command,{env,stdio:["ignore","inherit","inherit"]});
 process.exitCode=await new Promise(resolve=>child.once("close",code=>resolve(code??1)));
} finally { await transport.close(); }
'''
try:
    result = subprocess.run(['node', '--input-type=module', '-e', code, str(workspace), str(args.gateway_config.resolve()), str(profile), f'http://127.0.0.1:{server.server_port}', str(args.output / 'command.json')], cwd=source, stdin=subprocess.DEVNULL, capture_output=True, text=True, timeout=60)
finally:
    server.shutdown()
(args.output / 'stdout.jsonl').write_text(result.stdout)
(args.output / 'stderr.txt').write_text(result.stderr)
record = {'kind': 'actual-host-tool-catalog', 'acceptance': False, 'model_endpoint': 'local diagnostic capture; no model/tool execution', 'host_exit': result.returncode, 'runtime': str(runtime)}
(args.output / 'record.json').write_text(json.dumps(record, indent=2) + '\n')
tools = json.loads((args.output / 'tools.json').read_text())
print(json.dumps([{'type': tool.get('type'), 'name': tool.get('name')} for tool in tools], indent=2))
