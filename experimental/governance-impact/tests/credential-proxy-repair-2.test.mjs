import assert from 'node:assert/strict';
import fs from 'node:fs';
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
} from '../lib/credential-proxy.mjs';
import {
  parseCanaryResponse,
  validateNormalizedProxyResponse,
} from '../../../benchmarks/external-oss-v8/control/G2/runtime-canary-prep/canary-client.mjs';

const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const RUN_ID = 'repair-2-attempt-2-run';
const TASK_ID = 'repair-2-attempt-2-task';
const HOST_KEY = 'synthetic-host-only-key';
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

function providerResponse() {
  return {
    id: 'resp_synthetic',
    object: 'response',
    status: 'completed',
    error: null,
    incomplete_details: null,
    model: CREDENTIAL_PROXY_MODEL,
    output: [{
      type: 'message',
      status: 'completed',
      content: [{ type: 'output_text', text: '{"runtime_canary":"PASS"}' }],
    }],
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
    created_at: 1_754_121_600,
    metadata: {},
    text: { format: { type: 'json_schema' } },
  };
}

function policy() {
  return {
    attemptId: 'a'.repeat(64),
    benchmarkId: BENCHMARK_ID,
    runId: RUN_ID,
    taskId: TASK_ID,
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

function requestBody(input = CREDENTIAL_PROXY_CANARY_INPUT) {
  return {
    model: CREDENTIAL_PROXY_MODEL,
    input,
    max_output_tokens: CREDENTIAL_PROXY_TOKEN_CEILING,
    text: { format: TEXT_FORMAT },
    metadata: {
      benchmark_id: BENCHMARK_ID,
      run_id: RUN_ID,
      task_id: TASK_ID,
    },
  };
}

function socketPath(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'g2-repair-2-attempt-2-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'proxy.sock');
}

function requestProxy(socket, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath: socket,
      method: 'POST',
      path: '/v1/responses',
      headers: {
        'content-type': 'application/json',
        'content-length': bytes.length,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    request.end(bytes);
  });
}

async function startProxy(t, overrides = {}) {
  const socket = socketPath(t);
  const calls = [];
  const receipts = [];
  const proxy = createHostCredentialProxy({
    policy: policy(),
    socketPath: socket,
    socketOwnerUid: process.getuid?.() ?? 0,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: HOST_KEY,
    receiptSink: (receipt) => receipts.push(receipt),
    dependencies: {
      upstreamTransport: async (request) => {
        calls.push(request);
        return {
          statusCode: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'provider-request-id',
          },
          body: Buffer.from(JSON.stringify(providerResponse())),
        };
      },
      ...overrides,
    },
  });
  await proxy.start();
  t.after(() => proxy.close().catch(() => {}));
  return { proxy, socket, calls, receipts };
}

function errorCode(response) {
  return JSON.parse(response.body.toString('utf8')).error.code;
}

test('proxy returns only the normalized minimal response and retains only redacted evidence', async (t) => {
  const { socket, calls, receipts } = await startProxy(t);
  const response = await requestProxy(socket, requestBody());
  assert.equal(response.statusCode, 200);
  const normalized = JSON.parse(response.body.toString('utf8'));
  assert.deepEqual(Object.keys(normalized).sort(), ['model', 'output_text', 'usage']);
  assert.equal(validateNormalizedProxyResponse(normalized), true);
  assert.deepEqual(parseCanaryResponse(normalized), { runtime_canary: 'PASS' });
  assert.equal(calls.length, 1);
  assert.deepEqual(JSON.parse(calls[0].body.toString('utf8')), requestBody());
  assert.equal(receipts.length, 1);
  assert.equal(JSON.stringify(receipts).includes('resp_synthetic'), false);
  assert.equal(JSON.stringify(receipts).includes('runtime_canary'), false);
  assert.equal(JSON.stringify(receipts).includes('provider-request-id'), false);
  assert.equal(JSON.stringify(receipts).includes(HOST_KEY), false);
  assert.deepEqual(Object.keys(receipts[0]).sort(), [
    'latencyMs',
    'modelId',
    'providerRequestIdHash',
    'requestBytes',
    'requestSha256',
    'responseBytes',
    'responseSha256',
    'schemaVersion',
    'statusCode',
    'tokenCounts',
  ]);
});

test('fixed canary input rejects every arbitrary input before provider transport', async (t) => {
  for (const input of [
    'other prompt',
    '',
    [],
    ['Return exactly the JSON object {"runtime_canary":"PASS"}.'],
    { value: CREDENTIAL_PROXY_CANARY_INPUT },
    `${CREDENTIAL_PROXY_CANARY_INPUT}\n`,
  ]) {
    await t.test(JSON.stringify(input), async (t) => {
      const { socket, calls } = await startProxy(t);
      const response = await requestProxy(socket, requestBody(input));
      assert.equal(errorCode(response), 'PROXY_BODY_MISMATCH');
      assert.equal(calls.length, 0);
    });
  }
});

test('normalized response rejects extra fields and non-exact canary text', () => {
  assert.equal(validateNormalizedProxyResponse({
    model: CREDENTIAL_PROXY_MODEL,
    output_text: '{"runtime_canary":"PASS"}',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
    output: [],
  }), false);
  assert.equal(parseCanaryResponse({
    model: CREDENTIAL_PROXY_MODEL,
    output_text: '{"runtime_canary":"FAIL"}',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }), null);
});
