import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CREDENTIAL_PROXY_CANARY_INPUT,
  CREDENTIAL_PROXY_ENDPOINT,
  CREDENTIAL_PROXY_MODEL,
  CREDENTIAL_PROXY_PROVIDER,
  CREDENTIAL_PROXY_REQUEST_LIMIT,
  CREDENTIAL_PROXY_TIMEOUT_MS,
  CREDENTIAL_PROXY_TOKEN_CEILING,
  createHostCredentialProxy,
} from '../../../experimental/governance-impact/lib/credential-proxy.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const FIXED_ENVIRONMENT_NAMES = [
  'GOVERNSEED_BENCHMARK_ID',
  'GOVERNSEED_PROXY_SOCKET',
  'GOVERNSEED_RUN_ID',
  'GOVERNSEED_TASK_ID',
];
const TEXT_FORMAT = {
  type: 'json_schema',
  name: 'governseed_runtime_canary',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['runtime_canary'],
    properties: { runtime_canary: { type: 'string', enum: ['PASS'] } },
  },
};

function policy() {
  return {
    attemptId: 'g2-repair-5-transport',
    benchmarkId: 'GS-OSS-2026-08-02-V8',
    runId: 'g2-repair-5-run',
    taskId: 'runtime-identity-canary',
    provider: CREDENTIAL_PROXY_PROVIDER,
    model: CREDENTIAL_PROXY_MODEL,
    upstream: CREDENTIAL_PROXY_ENDPOINT,
    maxRequestBytes: 1_048_576,
    maxResponseBytes: 4_194_304,
    requestLimit: CREDENTIAL_PROXY_REQUEST_LIMIT,
    timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
    tokenCeiling: CREDENTIAL_PROXY_TOKEN_CEILING,
  };
}

function body() {
  return {
    model: CREDENTIAL_PROXY_MODEL,
    input: CREDENTIAL_PROXY_CANARY_INPUT,
    max_output_tokens: CREDENTIAL_PROXY_TOKEN_CEILING,
    text: { format: TEXT_FORMAT },
    metadata: {
      benchmark_id: 'GS-OSS-2026-08-02-V8',
      run_id: 'g2-repair-5-run',
      task_id: 'runtime-identity-canary',
    },
  };
}

function providerResponse() {
  return {
    id: 'resp_repair_5',
    object: 'response',
    status: 'completed',
    model: CREDENTIAL_PROXY_MODEL,
    error: null,
    incomplete_details: null,
    output: [{ content: [{ type: 'output_text', text: '{"runtime_canary":"PASS"}' }] }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
}

function temporarySocket(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'governseed-g2-transport-'));
  const socketPath = path.join(directory, 'proxy.sock');
  t.after(async () => {
    await import('node:fs/promises').then(({ rm }) => rm(directory, { recursive: true, force: true }));
  });
  return socketPath;
}

function requestProxy(socketPath, requestBody = body()) {
  const bytes = Buffer.from(JSON.stringify(requestBody));
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      method: 'POST',
      path: '/v1/responses',
      headers: { 'content-type': 'application/json', 'content-length': bytes.length },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.once('end', () => resolve({ statusCode: response.statusCode, body: Buffer.concat(chunks) }));
    });
    request.once('error', reject);
    request.end(bytes);
  });
}

async function startProxy(t, upstreamTransport) {
  const socketPath = temporarySocket(t);
  const proxy = createHostCredentialProxy({
    policy: policy(),
    socketPath,
    socketOwnerUid: process.getuid?.() ?? 0,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: 'synthetic-host-only-key',
    dependencies: { upstreamTransport },
  });
  await proxy.start();
  t.after(() => proxy.close().catch(() => {}));
  return { proxy, socketPath };
}

test('transport policy is exact and model aliases/fallbacks are absent', () => {
  const source = readFileSync(path.join(ROOT, 'experimental/governance-impact/lib/credential-proxy.mjs'), 'utf8');
  assert.equal(CREDENTIAL_PROXY_PROVIDER, 'OpenAI');
  assert.equal(CREDENTIAL_PROXY_MODEL, 'gpt-5.6-luna');
  assert.equal(CREDENTIAL_PROXY_REQUEST_LIMIT, 1);
  assert.equal(CREDENTIAL_PROXY_TIMEOUT_MS, 30000);
  assert.equal(CREDENTIAL_PROXY_ENDPOINT, 'https://api.openai.com/v1/responses');
  assert.doesNotMatch(source, /\/v1\/models|\blatest\b|fallback[_ -]?model|modelFallback/iu);
});

test('valid fixed request injects credential only at host-side upstream boundary', async (t) => {
  let upstreamRequest;
  const { proxy, socketPath } = await startProxy(t, async (request) => {
    upstreamRequest = request;
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'synthetic-id' },
      body: Buffer.from(JSON.stringify(providerResponse())),
    };
  });
  const response = await requestProxy(socketPath);
  assert.equal(response.statusCode, 200);
  assert.equal(upstreamRequest.url, CREDENTIAL_PROXY_ENDPOINT);
  assert.equal(upstreamRequest.headers.authorization, 'Bearer synthetic-host-only-key');
  assert.equal(Object.hasOwn(upstreamRequest.headers, 'openai-project'), false);
  assert.equal(proxy.getSummary().upstreamAttemptCount, 1);
  assert.equal(proxy.getSummary().successfulReceiptCount, 1);
});

test('arbitrary input and client credential headers are rejected before upstream', async (t) => {
  let calls = 0;
  const { socketPath } = await startProxy(t, async () => {
    calls += 1;
    return { statusCode: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(JSON.stringify(providerResponse())) };
  });
  const badBody = { ...body(), input: 'arbitrary input' };
  const badRequest = await requestProxy(socketPath, badBody);
  assert.equal(badRequest.statusCode, 400);
  assert.equal(calls, 0);
});

test('proxy summary separates client, attempt, response, and receipt counters', async (t) => {
  const { proxy, socketPath } = await startProxy(t, async () => {
    throw new Error('synthetic transport failure');
  });
  const response = await requestProxy(socketPath);
  await proxy.close();
  assert.equal(response.statusCode, 502);
  assert.deepEqual(proxy.getSummary(), {
    schemaVersion: 3,
    clientRequestObservedCount: 1,
    upstreamAttemptCount: 1,
    upstreamResponseCount: 0,
    successfulReceiptCount: 0,
    lastSafeStage: 'CLOSED',
    lastSafeErrorCode: 'PROXY_UPSTREAM_FAILED',
    socketAcceptedConnection: true,
    proxyCleanupObserved: true,
    providerHttpStatus: null,
    providerErrorType: null,
    providerErrorCode: null,
    requestObservationState: 'UPSTREAM_ATTEMPTED',
    failureClassification: null,
  });
  assert.doesNotMatch(JSON.stringify(proxy.getSummary()), /synthetic transport failure|synthetic-host-only-key|runtime_canary/u);
});

test('measured container environment is the four fixed non-secret names', () => {
  const prep = JSON.parse(readFileSync(path.join(ROOT, 'benchmarks/external-oss-v8/control/G2/runtime-canary-prep/prep.json'), 'utf8'));
  assert.deepEqual([...prep.container.processEnvironmentNames].sort(), [...FIXED_ENVIRONMENT_NAMES].sort());
  assert.equal(prep.container.network, 'none');
  assert.equal(prep.container.readOnlyRoot, true);
  assert.equal(prep.container.nonRootUidGid, 'host-proxy-uid:host-proxy-gid (recorded at runtime; must be non-root)');
});
