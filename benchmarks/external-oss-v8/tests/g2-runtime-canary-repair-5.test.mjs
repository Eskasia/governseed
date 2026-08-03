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
} from '../../../experimental/governance-impact/lib/credential-proxy.mjs';
import {
  classifyCanaryTransportError,
  runCanary,
} from '../control/G2/runtime-canary-prep/canary-client.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const WORKFLOW_PATH = path.join(ROOT, '.github/workflows/external-oss-v8-runtime-identity.yml');
const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const RUN_ID = 'repair-5-synthetic-run';
const TASK_ID = 'runtime-identity-canary';
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

function providerResponse({ model = CREDENTIAL_PROXY_MODEL, outputText = '{"runtime_canary":"PASS"}' } = {}) {
  return {
    id: 'resp_synthetic_repair_5',
    object: 'response',
    status: 'completed',
    model,
    error: null,
    incomplete_details: null,
    output: [{
      type: 'message',
      status: 'completed',
      content: [{ type: 'output_text', text: outputText }],
    }],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
}

function normalizedResponse({ model = CREDENTIAL_PROXY_MODEL, outputText = '{"runtime_canary":"PASS"}' } = {}) {
  return {
    model,
    output_text: outputText,
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  };
}

function policy() {
  return {
    attemptId: 'repair-5-attempt',
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

function requestBody() {
  return {
    model: CREDENTIAL_PROXY_MODEL,
    input: CREDENTIAL_PROXY_CANARY_INPUT,
    max_output_tokens: CREDENTIAL_PROXY_TOKEN_CEILING,
    text: { format: TEXT_FORMAT },
    metadata: {
      benchmark_id: BENCHMARK_ID,
      run_id: RUN_ID,
      task_id: TASK_ID,
    },
  };
}

function requestProxy(socketPath, body = requestBody()) {
  const bytes = Buffer.from(JSON.stringify(body));
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
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

function temporarySocket(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'governseed-g2-repair-5-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'proxy.sock');
}

async function startFakeUds(t, { statusCode = 200, body = normalizedResponse() } = {}) {
  const socketPath = temporarySocket(t);
  const server = http.createServer((request, response) => {
    request.resume();
    request.once('end', () => {
      const bytes = Buffer.from(JSON.stringify(body));
      response.writeHead(statusCode, {
        'content-type': 'application/json',
        'content-length': bytes.length,
      });
      response.end(bytes);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
    server.listen(socketPath);
  });
  t.after(() => new Promise((resolve) => server.close(() => resolve())));
  return socketPath;
}

test('upstream transport failure records attempt counters separately from receipts', async (t) => {
  const socketPath = temporarySocket(t);
  let upstreamCalls = 0;
  const proxy = createHostCredentialProxy({
    policy: policy(),
    socketPath,
    socketOwnerUid: process.getuid?.() ?? 0,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: 'synthetic-host-only-key',
    dependencies: {
      upstreamTransport: async () => {
        upstreamCalls += 1;
        throw new Error('synthetic upstream transport failure');
      },
    },
  });
  await proxy.start();
  const response = await requestProxy(socketPath);
  assert.equal(response.statusCode, 502);
  assert.equal(JSON.parse(response.body.toString()).error.code, 'PROXY_UPSTREAM_FAILED');
  await proxy.close();

  assert.equal(upstreamCalls, 1);
  assert.deepEqual(proxy.getSummary(), {
    schemaVersion: 2,
    clientRequestObservedCount: 1,
    upstreamAttemptCount: 1,
    upstreamResponseCount: 0,
    successfulReceiptCount: 0,
    lastSafeStage: 'CLOSED',
    lastSafeErrorCode: 'PROXY_UPSTREAM_FAILED',
    socketAcceptedConnection: true,
    proxyCleanupObserved: true,
  });
});

test('canary client emits a fixed sanitized summary for a missing UDS socket', async () => {
  const result = await runCanary({
    socketPath: path.join(os.tmpdir(), 'governseed-repair-5-missing.sock'),
    benchmarkId: BENCHMARK_ID,
    runId: RUN_ID,
    taskId: TASK_ID,
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    canaryAccepted: false,
    failureStage: 'uds-connect',
    errorCode: 'CANARY_SOCKET_CONNECT_FAILED',
    environmentVariableNames: [
      'GOVERNSEED_BENCHMARK_ID',
      'GOVERNSEED_PROXY_SOCKET',
      'GOVERNSEED_RUN_ID',
      'GOVERNSEED_TASK_ID',
    ],
    requestConstructed: true,
    proxyResponseObserved: false,
    statusCode: null,
    responseModelId: null,
    responseEnvelopeValid: false,
    normalizedResponseValid: false,
    udsConnection: 'FAIL',
  });
});

test('canary client maps fixed UDS and transport failure codes without raw errors', () => {
  assert.equal(classifyCanaryTransportError({ code: 'EACCES' }), 'CANARY_SOCKET_PERMISSION_DENIED');
  assert.equal(classifyCanaryTransportError({ code: 'ENOENT' }), 'CANARY_SOCKET_CONNECT_FAILED');
  assert.equal(classifyCanaryTransportError({ code: 'ECONNREFUSED' }), 'CANARY_SOCKET_CONNECT_FAILED');
  assert.equal(classifyCanaryTransportError({ code: 'ECONNRESET' }), 'CANARY_SOCKET_CONNECT_FAILED');
  assert.equal(classifyCanaryTransportError(new Error('CANARY_TIMEOUT')), 'CANARY_TIMEOUT');
  assert.equal(classifyCanaryTransportError(new Error('secret provider body')), 'CANARY_UNEXPECTED_RUNTIME_ERROR');
});

test('canary client classifies non-2xx, provider, model, normalized, and output failures', async (t) => {
  for (const statusCode of [400, 401, 429, 500]) {
    await t.test(`proxy response ${statusCode}`, async (t) => {
      const socketPath = await startFakeUds(t, {
        statusCode,
        body: { error: { code: 'PROXY_REQUEST_REJECTED' } },
      });
      const result = await runCanary({ socketPath, benchmarkId: BENCHMARK_ID, runId: RUN_ID, taskId: TASK_ID });
      assert.equal(result.errorCode, 'CANARY_PROXY_RESPONSE_NON_2XX');
      assert.equal(result.failureStage, 'proxy-request-validation');
      assert.equal(result.proxyResponseObserved, true);
      assert.equal(result.udsConnection, 'PASS');
    });
  }

  for (const [name, body, expectedCode] of [
    ['provider response invalid', { malformed: true }, 'CANARY_PROVIDER_RESPONSE_INVALID'],
    ['model identity mismatch', normalizedResponse({ model: 'gpt-5.6-other' }), 'CANARY_MODEL_ID_MISMATCH'],
    ['canary output invalid', normalizedResponse({ outputText: '{"runtime_canary":"FAIL"}' }), 'CANARY_OUTPUT_INVALID'],
  ]) {
    await t.test(name, async (t) => {
      const socketPath = await startFakeUds(t, { body });
      const result = await runCanary({ socketPath, benchmarkId: BENCHMARK_ID, runId: RUN_ID, taskId: TASK_ID });
      assert.equal(result.errorCode, expectedCode);
      assert.equal(result.canaryAccepted, false);
      assert.equal(result.requestConstructed, true);
      assert.equal(result.udsConnection, 'PASS');
      assert.equal(JSON.stringify(result).includes(CREDENTIAL_PROXY_CANARY_INPUT), false);
    });
  }

  await t.test('fixed legal response is accepted with exact model and normalized flags', async (t) => {
    const socketPath = await startFakeUds(t);
    const result = await runCanary({ socketPath, benchmarkId: BENCHMARK_ID, runId: RUN_ID, taskId: TASK_ID });
    assert.equal(result.canaryAccepted, true);
    assert.equal(result.errorCode, null);
    assert.equal(result.failureStage, null);
    assert.equal(result.responseModelId, 'gpt-5.6-luna');
    assert.equal(result.responseEnvelopeValid, true);
    assert.equal(result.normalizedResponseValid, true);
    assert.equal(result.udsConnection, 'PASS');
  });
});

test('upstream status matrix records one attempt, one response, and no receipt', async (t) => {
  for (const statusCode of [400, 401, 429, 500]) {
    await t.test(String(statusCode), async (t) => {
      const socketPath = temporarySocket(t);
      const proxy = createHostCredentialProxy({
        policy: policy(),
        socketPath,
        socketOwnerUid: process.getuid?.() ?? 0,
        socketOwnerGid: process.getgid?.() ?? 0,
        upstreamKey: 'synthetic-host-only-key',
        dependencies: {
          upstreamTransport: async () => ({
            statusCode,
            headers: { 'content-type': 'application/json' },
            body: Buffer.from(JSON.stringify(providerResponse())),
          }),
        },
      });
      await proxy.start();
      const result = await runCanary({ socketPath, benchmarkId: BENCHMARK_ID, runId: RUN_ID, taskId: TASK_ID });
      await proxy.close();
      assert.equal(result.canaryAccepted, false);
      assert.equal(result.udsConnection, 'PASS');
      assert.deepEqual(proxy.getSummary(), {
        schemaVersion: 2,
        clientRequestObservedCount: 1,
        upstreamAttemptCount: 1,
        upstreamResponseCount: 1,
        successfulReceiptCount: 0,
        lastSafeStage: 'CLOSED',
        lastSafeErrorCode: 'PROXY_UPSTREAM_FAILED',
        socketAcceptedConnection: true,
        proxyCleanupObserved: true,
      });
    });
  }
});

test('request limit is applied to upstream attempts and redacted summaries contain no secret or prompt', async (t) => {
  const socketPath = temporarySocket(t);
  let upstreamCalls = 0;
  const proxy = createHostCredentialProxy({
    policy: policy(),
    socketPath,
    socketOwnerUid: process.getuid?.() ?? 0,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: 'synthetic-host-only-key',
    dependencies: {
      upstreamTransport: async () => {
        upstreamCalls += 1;
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from(JSON.stringify(providerResponse())),
        };
      },
    },
  });
  await proxy.start();
  const first = await requestProxy(socketPath);
  const second = await requestProxy(socketPath);
  await proxy.close();
  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 429);
  assert.equal(upstreamCalls, 1);
  assert.equal(proxy.getSummary().upstreamAttemptCount, 1);
  assert.equal(proxy.getSummary().successfulReceiptCount, 1);
  assert.equal(JSON.stringify(proxy.getSummary()).includes('synthetic-host-only-key'), false);
  assert.equal(JSON.stringify(proxy.getSummary()).includes(CREDENTIAL_PROXY_CANARY_INPUT), false);
});

test('workflow tracks runtime stages and never reports a runtime failure as validation in progress', () => {
  const workflow = fs.readFileSync(WORKFLOW_PATH, 'utf8');
  for (const stage of [
    'binding-validation',
    'node-preflight',
    'image-pull',
    'harness-stage',
    'proxy-start',
    'container-create',
    'container-environment-validation',
    'uds-connect',
    'proxy-request-validation',
    'upstream-request',
    'provider-response-validation',
    'canary-output-validation',
    'evidence-assembly',
  ]) assert.match(workflow, new RegExp(stage, 'u'));
  for (const field of [
    'clientRequestObservedCount',
    'upstreamAttemptCount',
    'upstreamResponseCount',
    'successfulReceiptCount',
    'providerRequestAttempt',
    'RUNTIME_FAILURE_DIAGNOSTIC_INSUFFICIENT',
  ]) assert.match(workflow, new RegExp(field, 'u'));
  assert.doesNotMatch(workflow, /providerRequestCount\s*:\s*receipts\.length/u);
  assert.doesNotMatch(workflow, /failureStage:\s*diagnostic\.failureStage\s*\|\|\s*process\.env\.FAILURE_STAGE\s*\|\|\s*'binding-validation'/u);
});
