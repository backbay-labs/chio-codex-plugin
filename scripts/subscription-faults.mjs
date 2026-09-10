// Operator-only bounded fault injection. Never loaded in the protected child.
import http from 'node:http';
import { appendFileSync } from 'node:fs';

const mode = process.env.CHIO_SUBSCRIPTION_FAULT;
const log = process.env.CHIO_SUBSCRIPTION_FAULT_LOG;
const permitted = ['init-malformed', 'init-timeout', 'init-crash', 'hold-completed'];
if (!permitted.includes(mode) || !log) throw new Error('explicit bounded fault required');
let injected = false;
const originalEnd = http.ServerResponse.prototype.end;
http.ServerResponse.prototype.end = function (chunk, ...rest) {
  if (!injected && this.req?.url === '/mcp') {
    let body;
    try { body = JSON.parse(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk)); } catch {}
    const initializing = body?.result?.serverInfo?.name === 'chio-protected-gateway';
    let completed = false;
    try {
      const outcome = JSON.parse(body?.result?.content?.[0]?.text);
      completed = outcome.state === 'completed' && outcome.evidence === 'verified';
    } catch {}
    if ((mode.startsWith('init-') && initializing) || (mode === 'hold-completed' && completed)) {
      injected = true;
      appendFileSync(log, JSON.stringify({mode, at: new Date().toISOString(), parentPid: process.pid,
        cutpoint: initializing ? 'before-initialize-response-delivery' : 'after-verified-effect-before-host-delivery'}) + '\n', {mode: 0o600});
      if (mode === 'init-crash') process.exit(86);
      if (mode === 'init-malformed') return originalEnd.call(this, '{"invalid":', ...rest);
      return this; // Intentionally retain the response until the host times out or is interrupted.
    }
  }
  return originalEnd.call(this, chunk, ...rest);
};
