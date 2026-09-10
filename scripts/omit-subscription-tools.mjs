// Qualification-only catalog omission in the trusted parent. Native Codex and
// its real model provider run unchanged. Never load this in production.
import http from 'node:http';
import { appendFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute } from 'node:path';

const log = process.env.CHIO_SILENT_OMISSION_LOG;
if (!log || !isAbsolute(log)) throw new Error('An explicit isolated omission log is required');
const record = value => appendFileSync(log, JSON.stringify({ at: new Date().toISOString(), parentPid: process.pid, ...value }) + '\n', { mode: 0o600 });
const digest = value => createHash('sha256').update(value).digest('hex');
const originalEnd = http.ServerResponse.prototype.end;
http.ServerResponse.prototype.end = function (chunk, ...rest) {
  if (this.req?.url === '/mcp') {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    let body;
    try { body = JSON.parse(bytes.toString('utf8')); } catch {}
    if (body?.result?.serverInfo?.name === 'chio-protected-gateway') {
      record({ stage: 'normal-initialize-forwarded', responseId: body.id,
        protocolVersion: body.result.protocolVersion, serverInfo: body.result.serverInfo,
        originalSha256: digest(bytes), deliveredSha256: digest(bytes) });
    }
    if (Array.isArray(body?.result?.tools)) {
      const originalToolNames = body.result.tools.map(tool => tool.name);
      if (!originalToolNames.includes('write_file')) throw new Error('Expected the actual Chio catalog before omission');
      const replacement = Buffer.from(JSON.stringify({ ...body, result: { ...body.result, tools: [] } }));
      record({ stage: 'empty-tool-catalog-delivered', responseId: body.id,
        originalToolNames, deliveredToolNames: [], originalSha256: digest(bytes), deliveredSha256: digest(replacement) });
      if (this.hasHeader('content-length')) this.setHeader('content-length', replacement.length);
      return originalEnd.call(this, replacement, ...rest);
    }
  }
  return originalEnd.call(this, chunk, ...rest);
};

// Observe only public tool descriptors and discovery history. Do not retain
// headers, provider credentials, complete model history or upstream responses.
const originalFetch = globalThis.fetch;
globalThis.fetch = async function (input, init) {
  const url = String(input instanceof Request ? input.url : input);
  if (url === 'https://chatgpt.com/backend-api/codex/responses') {
    const body = JSON.parse(init?.body);
    record({ stage: 'real-provider-request', model: body.model,
      toolNames: body.tools.map(tool => tool.name ?? tool.type),
      discoveredToolNames: body.input.filter(item => item.type === 'tool_search_output')
        .flatMap(item => item.tools.map(tool => tool.name ?? tool.type)) });
  }
  return originalFetch(input, init);
};
