#!/usr/bin/env node
/** Operator fixture for an attempted parallel native Codex MCP batch.
 * The installed launcher, native Seatbelt policy, gateway and kernel are real.
 * Only the fixed upstream model response is replaced. This is supplemental
 * protocol-boundary evidence, not live-model acceptance or a throughput test.
 */
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash, randomUUID} from 'node:crypto';
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {basename, dirname, isAbsolute, join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const self = fileURLToPath(import.meta.url);
const archiveSha = 'ac4f14ee4073abdc0c9ff2b4771e99adf7a871d084a9b488513f5d28eae56874';
const upstream = 'https://chatgpt.com/backend-api/codex/responses';
const sha = data => createHash('sha256').update(data).digest('hex');
const fileSha = path => sha(readFileSync(path));
const save = (path, value) => writeFileSync(path, JSON.stringify(value, null, 2) + '\n', {mode: 0o600});

function sse(items, id) {
  const response = {id, object: 'response', status: 'completed', output: items,
    usage: {input_tokens: 1, output_tokens: 1, total_tokens: 2}};
  const events = [{type: 'response.created', response: {id, status: 'in_progress', output: []}},
    ...items.map((item, output_index) => ({type: 'response.output_item.done', output_index, item})),
    {type: 'response.completed', response}];
  return events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join('');
}

function pairedCalls(spec) {
  return spec.calls.map((call, index) => ({type: 'function_call', id: `fc_parallel_${index}`,
    call_id: `call_parallel_${index}`, namespace: 'mcp__chio', name: 'write_file',
    arguments: JSON.stringify({path: call.path, content: call.content})}));
}

function extractOutcome(value) {
  for (let depth = 0; depth < 6; depth++) {
    if (typeof value === 'string') {
      try { value = JSON.parse(value); } catch { return undefined; }
    } else if (Array.isArray(value) && value.length === 1 && typeof value[0]?.text === 'string') {
      value = value[0].text;
    } else if (value && Array.isArray(value.content)) value = value.content;
    else break;
  }
  return value && typeof value === 'object' && typeof value.state === 'string' ? value : undefined;
}

function installFixture(specPath) {
  const spec = JSON.parse(readFileSync(specPath, 'utf8'));
  if (spec.schema !== 'chio.codex.parallel-probe.v1' || spec.calls?.length !== 2
    || !spec.calls.every(call => /^\/workspace\/codex-forced-parallel-[a-f0-9-]+-[ab]\.txt$/.test(call.path)
      && typeof call.content === 'string' && call.content.length < 256)
    || !isAbsolute(spec.log) || !/^http:\/\/127\.0\.0\.1:\d+\/$/.test(spec.kernelEndpoint)) {
    throw new Error('Explicit bounded parallel fixture required');
  }
  const originalFetch = globalThis.fetch;
  let requests = 0;
  let stage = 'discover';
  const record = value => appendFileSync(spec.log, JSON.stringify({at: new Date().toISOString(),
    monotonicNs: process.hrtime.bigint().toString(), ...value}) + '\n', {mode: 0o600});
  globalThis.fetch = async function(input, init) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url === upstream) {
      const body = JSON.parse(String(init?.body));
      requests++;
      if (requests > 6 || body.model !== 'gpt-5.5' || body.parallel_tool_calls !== false) {
        throw new Error('Unexpected model request in bounded parallel fixture');
      }
      const outputs = (body.input ?? []).filter(item => item.type === 'function_call_output')
        .map(item => {const outcome = extractOutcome(item.output); return {callId: item.call_id,
          state: outcome?.state, evidence: outcome?.evidence, requestId: outcome?.requestId,
          outputSha256: sha(JSON.stringify(item.output))};});
      record({phase: 'provider-request', request: requests, parallel_tool_calls: body.parallel_tool_calls,
        tools: body.tools, toolOutputs: outputs,
        searchHistory: (body.input ?? []).filter(item => ['tool_search_call', 'tool_search_output'].includes(item.type))});
      let items;
      if (stage === 'discover') {
        items = [{type: 'tool_search_call', id: 'ts_parallel', call_id: 'search_parallel',
          execution: 'client', arguments: {query: 'chio write_file', limit: 1}, status: 'completed'}];
        stage = 'batch';
      } else if (stage === 'batch') {
        const discovered = (body.input ?? []).filter(item => item.type === 'tool_search_output').flatMap(item => item.tools ?? []);
        const namespace = [...body.tools ?? [], ...discovered].find(tool => tool.type === 'namespace' && tool.name === 'mcp__chio');
        if (!namespace?.tools?.some(tool => tool.type === 'function' && tool.name === 'write_file')) {
          record({phase: 'fixture-precondition-failed', reason: 'Native discovery did not advertise mcp__chio.write_file'});
          return Response.json({error: {type: 'invalid_request_error', message: 'Native discovery did not advertise mcp__chio.write_file'}}, {status: 400});
        }
        items = pairedCalls(spec);
        record({phase: 'parallel-batch-injected', responseId: `resp_parallel_${requests}`, calls: items,
          note: 'Both calls delivered in one response despite unchanged parallel_tool_calls=false'});
        stage = 'finish';
      } else {
        items = [{type: 'message', id: 'msg_parallel_done', role: 'assistant',
          content: [{type: 'output_text', text: 'Fixture finished. The recorded tool results establish the outcome.'}]}];
      }
      return new Response(sse(items, `resp_parallel_${requests}`),
        {status: 200, headers: {'content-type': 'text/event-stream'}});
    }
    if (/^https:\/\/(api\.openai\.com|chatgpt\.com)\//.test(url)) {
      throw new Error('Alternate provider route is outside this local fixture');
    }
    // Observe request/response ordering without changing kernel bytes or headers.
    let kernelCall;
    if (url.startsWith(spec.kernelEndpoint) && typeof init?.body === 'string') {
      try { const body = JSON.parse(init.body); if (body.method === 'tools/call') {
        kernelCall = {rpcId: body.id, tool: body.params?.name, path: body.params?.arguments?.path};
        record({phase: 'kernel-call-start', ...kernelCall});
      }} catch { /* Non-JSON transport is left unchanged. */ }
    }
    const response = await originalFetch.call(this, input, init);
    if (kernelCall) record({phase: 'kernel-call-response-headers', ...kernelCall, status: response.status});
    return response;
  };
  record({phase: 'fixture-installed', pid: process.pid, upstreamNetworkDisabled: true,
    note: 'Only the operator launcher inherits this preload; the native child has a fixed environment'});
}

function observe(operator, calls) {
  const code = `const fs=require('fs'),crypto=require('crypto');const names=${JSON.stringify(calls.map(call => basename(call.path)))};
let files={};for(const name of names){const p='/observe/'+name;files[name]=fs.existsSync(p)?crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'):null;}
console.log(JSON.stringify({files,dispatch:fs.readFileSync('/audit/dispatch.jsonl','utf8').trim().split('\\n').filter(Boolean).map(JSON.parse)}));`;
  const args = ['run', '--rm', '--network', 'none', '--read-only', '--mount',
    `type=volume,src=${operator.volume},dst=/observe,readonly`, '--mount',
    `type=volume,src=${operator.auditVolume},dst=/audit,readonly`, '--entrypoint', 'node', operator.image, '-e', code];
  const result = spawnSync('docker', args, {encoding: 'utf8', timeout: 30000, maxBuffer: 8 * 1024 * 1024});
  if (result.status !== 0) throw new Error('Independent resource observer failed: ' + result.stderr);
  return JSON.parse(result.stdout);
}

function parseArgs(args) {
  const values = {};
  const required = ['--gateway-config', '--operator-state', '--model-auth-file', '--archive', '--package-dir', '--output'];
  for (let index = 0; index < args.length; index += 2) {
    if (!required.includes(args[index]) || !args[index + 1] || values[args[index]]) throw new Error('Required absolute arguments: ' + required.join(' '));
    values[args[index]] = args[index + 1];
  }
  if (required.some(key => !values[key] || !isAbsolute(values[key]))) throw new Error('Every required path must be absolute');
  return values;
}

async function main() {
  if (process.argv[2] === '--self-test') {
    const spec = {calls: [{path: '/workspace/a', content: 'a'}, {path: '/workspace/b', content: 'b'}]};
    const items = pairedCalls(spec);
    assert.equal(items.length, 2); assert.notEqual(items[0].call_id, items[1].call_id);
    assert.ok(items.every(item => item.namespace === 'mcp__chio' && item.name === 'write_file'));
    const events = sse(items, 'self-test').trim().split('\n\n').map(line => JSON.parse(line.slice(6)));
    assert.equal(events.filter(event => event.type === 'response.output_item.done').length, 2);
    assert.equal(extractOutcome(JSON.stringify([{type: 'text', text: '{"state":"not_dispatched"}'}])).state, 'not_dispatched');
    console.log('Fixture shape and outcome parser self-tests passed; no host or kernel called'); return;
  }
  const args = parseArgs(process.argv.slice(2));
  if (fileSha(args['--archive']) !== archiveSha) throw new Error('Frozen artifact digest differs');
  const output = resolve(args['--output']);
  mkdirSync(dirname(output), {recursive: true, mode: 0o700}); mkdirSync(output, {mode: 0o700});
  const operator = JSON.parse(readFileSync(join(args['--operator-state'], 'operator.json'), 'utf8'));
  const endpoint = `http://127.0.0.1:${operator.port}/`;
  const gateway = JSON.parse(readFileSync(args['--gateway-config'], 'utf8'));
  if (new URL(gateway.execution.endpoint).href !== endpoint) throw new Error('Prepared session and designated observer kernel differ');
  const runId = randomUUID();
  const calls = ['a', 'b'].map(letter => ({path: `/workspace/codex-forced-parallel-${runId}-${letter}.txt`,
    content: `designated native parallel fixture ${runId} ${letter}`}));
  const spec = {schema: 'chio.codex.parallel-probe.v1', calls, kernelEndpoint: endpoint,
    log: join(output, 'fixture.jsonl')};
  const specPath = join(output, 'fixture.json'); save(specPath, spec);
  const before = observe(operator, calls); save(join(output, 'before.json'), before);
  if (Object.values(before.files).some(value => value !== null)) throw new Error('Designated target unexpectedly exists');
  const installedMain = join(args['--package-dir'], 'dist/cli/main.js');
  const command = [installedMain, 'restricted', '--gateway-config', args['--gateway-config'],
    '--model-auth-file', args['--model-auth-file'], '--evidence-dir', join(output, 'host'),
    '--prompt', 'Use the designated Chio file tools. Stop after the fixture returns both recorded outcomes. Never retry an uncertain effect.'];
  save(join(output, 'identity.json'), {claim: 'Supplemental forced model batch with actual native host, launcher, gateway, kernel and independent resource observer',
    liveModel: false, acceptance: false, archiveSha256: archiveSha, harnessSha256: fileSha(self),
    launcherSha256: fileSha(join(args['--package-dir'], 'dist/cli/restricted.js')),
    preparedConfigSha256: fileSha(args['--gateway-config']), kernelSha256: operator.kernelSha256,
    image: operator.image, volume: operator.volume, auditVolume: operator.auditVolume, calls,
    command: [process.execPath, ...command], startedAt: new Date().toISOString(),
    interventions: ['operator preload substitutes fixed model responses', 'one response intentionally contains two Chio calls']});
  const env = {...process.env, NODE_OPTIONS: '--import=' + pathToFileURL(self).href,
    CHIO_PARALLEL_FIXTURE_SPEC: specPath};
  const started = performance.now();
  const child = spawn(process.execPath, command, {env, stdio: ['ignore', 'pipe', 'pipe']});
  let timedOut = false;
  let forceStop;
  const timer = setTimeout(() => {timedOut = true; child.kill('SIGTERM');
    forceStop = setTimeout(() => child.kill('SIGKILL'), 5000);}, 195000);
  const stdout = [], stderr = [];
  child.stdout.on('data', data => stdout.push(data)); child.stderr.on('data', data => stderr.push(data));
  const exit = await new Promise((resolveExit, reject) => {child.once('error', reject); child.once('close', (code, signal) => resolveExit({code, signal}));});
  clearTimeout(timer); if (forceStop) clearTimeout(forceStop);
  writeFileSync(join(output, 'driver.stdout'), Buffer.concat(stdout), {mode: 0o600});
  writeFileSync(join(output, 'driver.stderr'), Buffer.concat(stderr), {mode: 0o600});
  const after = observe(operator, calls); save(join(output, 'after.json'), after);
  const fixture = existsSync(spec.log) ? readFileSync(spec.log, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
  const hostEvents = Buffer.concat(stdout).toString().split('\n').filter(Boolean).flatMap(line => {try{return [JSON.parse(line)];}catch{return [];}});
  const hostCalls = calls.map(call => {
    const startedIndex = hostEvents.findIndex(event => event.type === 'item.started' && event.item?.type === 'mcp_tool_call' && event.item.arguments?.path === call.path);
    const completedIndex = hostEvents.findIndex(event => event.type === 'item.completed' && event.item?.type === 'mcp_tool_call' && event.item.arguments?.path === call.path);
    const item = hostEvents[completedIndex]?.item;
    const outcome = extractOutcome(item?.result);
    const dispatches = after.dispatch.slice(before.dispatch.length).filter(event => event.path === call.path);
    const actualHash = after.files[basename(call.path)];
    return {path: call.path, startedIndex, completedIndex, state: outcome?.state, evidence: outcome?.evidence,
      requestId: outcome?.requestId, error: item?.error, dispatches: dispatches.length,
      expectedContentSha256: sha(call.content), actualContentSha256: actualHash,
      effectMatches: actualHash === sha(call.content)};
  });
  const nativeSerialized = hostCalls[0].completedIndex >= 0 && hostCalls[1].startedIndex > hostCalls[0].completedIndex;
  const firstKernelResponse = fixture.findIndex(event => event.phase === 'kernel-call-response-headers' && event.path === calls[0].path);
  const secondKernelStart = fixture.findIndex(event => event.phase === 'kernel-call-start' && event.path === calls[1].path);
  const kernelSerialized = firstKernelResponse >= 0 && secondKernelStart > firstKernelResponse;
  const bothCompleted = hostCalls.every(call => call.state === 'completed' && call.evidence === 'verified' && call.effectMatches && call.dispatches === 1);
  const secondBlocked = hostCalls[0].state === 'completed' && hostCalls[0].evidence === 'verified' && hostCalls[0].effectMatches && hostCalls[0].dispatches === 1
    && hostCalls[1].state === 'not_dispatched' && hostCalls[1].actualContentSha256 === null && hostCalls[1].dispatches === 0;
  const totalNewDispatches = after.dispatch.length - before.dispatch.length;
  const unrelatedDispatches = totalNewDispatches - hostCalls.reduce((count, call) => count + call.dispatches, 0);
  const injected = fixture.filter(event => event.phase === 'parallel-batch-injected').length === 1;
  const launchPath = join(output, 'host/launch.json');
  const launch = existsSync(launchPath) ? JSON.parse(readFileSync(launchPath, 'utf8')) : {};
  const completed = hostCalls.filter(call => call.state === 'completed' && call.evidence === 'verified').length;
  const deliveryConfirmed = launch.host_delivery?.confirmed === completed && launch.host_delivery?.failed === false;
  const passed = injected && !timedOut && unrelatedDispatches === 0 && deliveryConfirmed &&
    (bothCompleted && (nativeSerialized || kernelSerialized) && exit.code === 0 || secondBlocked && exit.code === 3);
  const summary = {acceptance: false, supplementalOnly: true, passed, exit, timedOut,
    durationSeconds: (performance.now() - started) / 1000, injectedTwoCallResponse: injected,
    nativeSerialized, kernelSerialized, bothCompleted, secondBlocked, unrelatedDispatches, hostCalls,
    deliveryConfirmed, hostDelivery: launch.host_delivery, executionOutcome: launch.execution_outcome,
    classification: secondBlocked ? 'second-call-blocked' : bothCompleted && nativeSerialized ? 'native-host-serialized'
      : bothCompleted && kernelSerialized ? 'kernel-dispatch-serialized' : 'unresolved',
    timingClaim: 'Observed fixture wallclock only; no live-model or overhead claim'};
  save(join(output, 'summary.json'), summary); console.log(JSON.stringify(summary, null, 2));
  process.exitCode = passed ? 0 : 1;
}

if (process.env.CHIO_PARALLEL_FIXTURE_SPEC && process.argv[1] && resolve(process.argv[1]) !== self) {
  installFixture(process.env.CHIO_PARALLEL_FIXTURE_SPEC);
} else if (process.argv[1] && resolve(process.argv[1]) === self) {
  await main();
}
