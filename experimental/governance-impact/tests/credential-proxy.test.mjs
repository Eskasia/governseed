import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CREDENTIAL_PROXY_ENDPOINT,
  CREDENTIAL_PROXY_MODEL,
  CREDENTIAL_PROXY_PROVIDER,
  CREDENTIAL_PROXY_REQUEST_LIMIT,
  CREDENTIAL_PROXY_TIMEOUT_MS,
  CREDENTIAL_PROXY_TOKEN_CEILING,
  createHostCredentialProxy,
  describeCredentialProxyPolicy,
  hashCredentialProxyPolicy,
} from '../lib/credential-proxy.mjs';

const ATTEMPT_ID = 'a'.repeat(64);
const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const RUN_ID = 'synthetic-run-1';
const TASK_ID = 'synthetic-task-1';
const MODEL = CREDENTIAL_PROXY_MODEL;
const UPSTREAM_KEY = 'synthetic-host-only-key';
const TEXT_FORMAT = {
  type: 'json_schema',
  name: 'governseed_runtime_canary',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['runtime_canary'],
    properties: {
      runtime_canary: { type: 'string', enum: ['PASS'] },
    },
  },
};

function policy(overrides = {}) {
  return {
    attemptId: ATTEMPT_ID,
    benchmarkId: BENCHMARK_ID,
    runId: RUN_ID,
    taskId: TASK_ID,
    provider: CREDENTIAL_PROXY_PROVIDER,
    model: MODEL,
    upstream: CREDENTIAL_PROXY_ENDPOINT,
    maxRequestBytes: 1_048_576,
    maxResponseBytes: 4_194_304,
    requestLimit: CREDENTIAL_PROXY_REQUEST_LIMIT,
    timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
    tokenCeiling: CREDENTIAL_PROXY_TOKEN_CEILING,
    ...overrides,
  };
}

function requestBody(overrides = {}) {
  return {
    model: MODEL,
    input: 'synthetic request',
    max_output_tokens: CREDENTIAL_PROXY_TOKEN_CEILING,
    text: { format: TEXT_FORMAT },
    metadata: {
      benchmark_id: BENCHMARK_ID,
      run_id: RUN_ID,
      task_id: TASK_ID,
    },
    ...overrides,
  };
}

function responseBody(overrides = {}) {
  return {
    id: 'resp_synthetic',
    model: MODEL,
    output: [],
    usage: {
      input_tokens: 3,
      output_tokens: 5,
      total_tokens: 8,
    },
    ...overrides,
  };
}

function temporarySocket(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-proxy-v8-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'proxy.sock');
}

function requestProxy(socketPath, options = {}) {
  const body = options.rawBody ?? JSON.stringify(options.body ?? requestBody());
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      method: options.method ?? 'POST',
      path: options.path ?? '/v1/responses',
      headers: {
        'content-type': options.contentType ?? 'application/json',
        'content-length': Buffer.byteLength(body),
        ...options.headers,
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
    request.end(body);
  });
}

async function runningProxy(t, overrides = {}) {
  const socketPath = temporarySocket(t);
  const upstreamCalls = [];
  const receipts = [];
  const proxy = createHostCredentialProxy({
    policy: policy(overrides.policy),
    socketPath,
    socketOwnerUid: process.getuid?.() ?? 0,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: UPSTREAM_KEY,
    receiptSink: (value) => receipts.push(value),
    dependencies: {
      upstreamTransport: overrides.upstreamTransport ?? (async (request) => {
        upstreamCalls.push(request);
        return {
          statusCode: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'req_synthetic',
          },
          body: Buffer.from(JSON.stringify(responseBody())),
        };
      }),
      ...overrides.dependencies,
    },
  });
  await proxy.start();
  t.after(() => proxy.close().catch(() => {}));
  return { proxy, socketPath, upstreamCalls, receipts };
}

function jsonError(response) {
  return JSON.parse(response.body.toString('utf8')).error.code;
}

test('policy descriptor fixes provider, endpoint, one request, 30 seconds, and identity bindings', () => {
  const descriptor = describeCredentialProxyPolicy(policy());
  assert.equal(descriptor.provider, 'OpenAI');
  assert.equal(descriptor.upstream, CREDENTIAL_PROXY_ENDPOINT);
  assert.equal(descriptor.requestLimit, 1);
  assert.equal(descriptor.timeoutMs, 30_000);
  assert.equal(descriptor.tokenCeiling, 8_192);
  assert.deepEqual(descriptor.request.allowedFields, [
    'model',
    'input',
    'max_output_tokens',
    'text',
    'metadata',
  ]);
  assert.deepEqual(descriptor.request.metadataFields, [
    'benchmark_id',
    'run_id',
    'task_id',
  ]);
  assert.equal(descriptor.identityBinding.singleUse, true);
  assert.equal(hashCredentialProxyPolicy(policy()), hashCredentialProxyPolicy({
    ...policy(),
    attemptId: 'b'.repeat(64),
    runId: 'other-run',
    taskId: 'other-task',
  }));
});

test('arbitrary endpoint, non-exact model, request limit, and timeout are rejected', () => {
  for (const overrides of [
    { upstream: 'https://example.invalid/v1/responses' },
    { model: 'latest' },
    { model: 'gpt-5.6' },
    { model: 'gpt-5.6-luna-alias' },
    { requestLimit: 2 },
    { timeoutMs: 1 },
    { benchmarkId: undefined },
  ]) {
    assert.throws(
      () => describeCredentialProxyPolicy(policy(overrides)),
      (error) => error.code === 'PROXY_POLICY_INVALID',
    );
  }
});

test('valid request injects provider Authorization and forwards only fixed headers/body', async (t) => {
  const { socketPath, upstreamCalls, receipts } = await runningProxy(t);
  const response = await requestProxy(socketPath);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body.toString('utf8')), responseBody());
  assert.equal(upstreamCalls.length, 1);
  assert.deepEqual(upstreamCalls[0].headers, {
    accept: 'application/json',
    authorization: `Bearer ${UPSTREAM_KEY}`,
    'content-type': 'application/json',
  });
  assert.deepEqual(JSON.parse(upstreamCalls[0].body.toString('utf8')), requestBody());
  assert.equal(receipts.length, 1);
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
  assert.equal(JSON.stringify(receipts).includes('synthetic request'), false);
  assert.equal(JSON.stringify(receipts).includes(UPSTREAM_KEY), false);
});

test('client Authorization, OpenAI headers, x-* headers, and unknown headers are rejected', async (t) => {
  for (const headers of [
    { authorization: 'Bearer client-value' },
    { 'openai-organization': 'client-value' },
    { 'openai-project': 'client-value' },
    { 'x-client-header': 'client-value' },
    { 'user-agent': 'client-value' },
  ]) {
    await t.test(Object.keys(headers)[0], async (t) => {
      const { socketPath, upstreamCalls } = await runningProxy(t);
      const response = await requestProxy(socketPath, { headers });
      assert.equal(response.statusCode, 400);
      assert.equal(jsonError(response), 'PROXY_HEADER_REJECTED');
      assert.equal(upstreamCalls.length, 0);
    });
  }
});

test('closed request fields and identity mismatches fail before provider transport', async (t) => {
  const cases = [
    { tools: [], code: 'PROXY_BODY_MISMATCH' },
    { response_format: { type: 'json_schema' }, code: 'PROXY_BODY_MISMATCH' },
    { text: { format: { ...TEXT_FORMAT, name: 'wrong_canary' } }, code: 'PROXY_BODY_MISMATCH' },
    { metadata: { benchmark_id: 'wrong', run_id: RUN_ID, task_id: TASK_ID }, code: 'PROXY_BODY_MISMATCH' },
    { metadata: { benchmark_id: BENCHMARK_ID, run_id: 'wrong', task_id: TASK_ID }, code: 'PROXY_BODY_MISMATCH' },
    { metadata: { benchmark_id: BENCHMARK_ID, run_id: RUN_ID, task_id: 'wrong' }, code: 'PROXY_BODY_MISMATCH' },
    { unknown: true, code: 'PROXY_BODY_MISMATCH' },
    { max_output_tokens: 1, code: 'PROXY_BODY_MISMATCH' },
  ];
  for (const bodyChange of cases) {
    await t.test(JSON.stringify(bodyChange), async (t) => {
      const { socketPath, upstreamCalls } = await runningProxy(t);
      const response = await requestProxy(socketPath, {
        body: { ...requestBody(), ...bodyChange },
      });
      assert.equal(jsonError(response), bodyChange.code);
      assert.equal(upstreamCalls.length, 0);
    });
  }
});

test('malformed, oversized, mismatched, and non-success provider responses fail closed', async (t) => {
  const cases = [
    { body: Buffer.from('{'), code: 'PROXY_RESPONSE_INVALID' },
    { body: Buffer.from(JSON.stringify({ ...responseBody(), model: 'other' })), code: 'PROXY_RESPONSE_INVALID' },
    { body: Buffer.from(JSON.stringify({ ...responseBody(), extra: true })), code: 'PROXY_RESPONSE_INVALID' },
    { body: Buffer.from(JSON.stringify({ ...responseBody(), usage: { input_tokens: 1, output_tokens: 1, total_tokens: 9 } })), code: 'PROXY_RESPONSE_INVALID' },
  ];
  for (const entry of cases) {
    await t.test(entry.code, async (t) => {
      const { socketPath } = await runningProxy(t, {
        upstreamTransport: async () => ({
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: entry.body,
        }),
      });
      const response = await requestProxy(socketPath);
      assert.equal(jsonError(response), entry.code);
    });
  }
  await t.test('non-success', async (t) => {
    const { socketPath } = await runningProxy(t, {
      upstreamTransport: async () => ({
        statusCode: 429,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify(responseBody())),
      }),
    });
    const response = await requestProxy(socketPath);
    assert.equal(jsonError(response), 'PROXY_UPSTREAM_FAILED');
  });
});

test('request limit rejects a second client and closes the run-scoped socket', async (t) => {
  const { socketPath, upstreamCalls } = await runningProxy(t);
  assert.equal((await requestProxy(socketPath)).statusCode, 200);
  const second = await requestProxy(socketPath);
  assert.equal(jsonError(second), 'PROXY_REQUEST_QUOTA_EXCEEDED');
  assert.equal(upstreamCalls.length, 1);
  for (let turn = 0; turn < 20 && fs.existsSync(socketPath); turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(fs.existsSync(socketPath), false);
});

test('socket is run-scoped, owned by the explicit UID/GID, and mode 0600', async (t) => {
  const { socketPath, proxy } = await runningProxy(t);
  const stat = await fs.promises.lstat(socketPath);
  assert.equal(stat.isSocket(), true);
  assert.equal(stat.uid, process.getuid?.() ?? 0);
  assert.equal(stat.gid, process.getgid?.() ?? 0);
  assert.equal(stat.mode & 0o777, 0o600);
  await proxy.close();
  assert.equal(fs.existsSync(socketPath), false);
});

test('closed proxy proves a clean unused attempt safe without exposing secret fields', async (t) => {
  const { proxy } = await runningProxy(t);
  await proxy.close();
  assert.deepEqual(await proxy.proveSafe(), { attemptSafe: true });
  assert.equal(JSON.stringify(proxy).includes(UPSTREAM_KEY), false);
});
