import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
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
} from '../../../../experimental/governance-impact/lib/credential-proxy.mjs';

const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const RUN_ID = 'repair-1-run';
const TASK_ID = 'repair-1-task';
const MODEL = CREDENTIAL_PROXY_MODEL;
const HOST_KEY = 'synthetic-host-only-key';
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

function identity(overrides = {}) {
  return {
    benchmark_id: BENCHMARK_ID,
    run_id: RUN_ID,
    task_id: TASK_ID,
    ...overrides,
  };
}

function requestBody(overrides = {}) {
  return {
    model: MODEL,
    input: 'synthetic repair request',
    max_output_tokens: CREDENTIAL_PROXY_TOKEN_CEILING,
    text: { format: TEXT_FORMAT },
    metadata: identity(),
    ...overrides,
  };
}

function responseBody(overrides = {}) {
  return {
    id: 'resp_repair_1',
    model: MODEL,
    output: [],
    usage: { input_tokens: 2, output_tokens: 3, total_tokens: 5 },
    ...overrides,
  };
}

function makePolicy(overrides = {}) {
  return {
    attemptId: 'a'.repeat(64),
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

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'gs8-repair-1-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function requestProxy(socketPath, options = {}) {
  const body = options.rawBody ?? JSON.stringify(options.body ?? requestBody());
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      method: 'POST',
      path: '/v1/responses',
      headers: {
        'content-type': 'application/json',
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

async function startProxy(t, overrides = {}) {
  const root = temporaryRoot(t);
  const socketPath = path.join(root, 'p.sock');
  const receipts = [];
  const calls = [];
  const proxy = createHostCredentialProxy({
    policy: makePolicy(overrides.policy),
    socketPath,
    socketOwnerUid: process.getuid?.() ?? 0,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: HOST_KEY,
    receiptSink: (value) => receipts.push(value),
    dependencies: {
      upstreamTransport: overrides.upstreamTransport ?? (async (request) => {
        calls.push(request);
        return {
          statusCode: 200,
          headers: {
            'content-type': 'application/json',
            'x-request-id': 'request-id-synthetic',
          },
          body: Buffer.from(JSON.stringify(responseBody())),
        };
      }),
      ...(overrides.dependencies ?? {}),
    },
  });
  await proxy.start();
  t.after(() => proxy.close().catch(() => {}));
  return { proxy, root, socketPath, receipts, calls };
}

async function waitForAbsent(target) {
  for (let turn = 0; turn < 50; turn += 1) {
    if (!fs.existsSync(target)) return true;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return false;
}

test('normal completion retains only hashed receipt fields and removes socket on explicit cleanup', async (t) => {
  const { proxy, root, socketPath, receipts, calls } = await startProxy(t);
  const response = await requestProxy(socketPath);
  assert.equal(response.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].modelId, MODEL);
  assert.equal(typeof receipts[0].requestSha256, 'string');
  assert.equal(typeof receipts[0].responseSha256, 'string');
  assert.equal(JSON.stringify(receipts).includes('synthetic repair request'), false);
  assert.equal(JSON.stringify(receipts).includes(HOST_KEY), false);
  await proxy.close();
  assert.equal(await waitForAbsent(socketPath), true);
  assert.equal(fs.existsSync(root), true);
  assert.deepEqual(fs.readdirSync(root), []);
  await assert.rejects(requestProxy(socketPath));
});

test('second client is rejected and cleanup is automatic', async (t) => {
  const { socketPath, calls } = await startProxy(t);
  assert.equal((await requestProxy(socketPath)).statusCode, 200);
  const second = await requestProxy(socketPath);
  assert.equal(JSON.parse(second.body.toString('utf8')).error.code, 'PROXY_REQUEST_QUOTA_EXCEEDED');
  assert.equal(calls.length, 1);
  assert.equal(await waitForAbsent(socketPath), true);
  await assert.rejects(requestProxy(socketPath));
});

test('wrong benchmark, run, or task identity is rejected before the mock provider', async (t) => {
  for (const change of [
    { benchmark_id: 'GS-OSS-OTHER-V8' },
    { run_id: 'other-run' },
    { task_id: 'other-task' },
  ]) {
    await t.test(Object.keys(change)[0], async (t) => {
      const { socketPath, calls } = await startProxy(t);
      const response = await requestProxy(socketPath, {
        body: { ...requestBody(), metadata: identity(change) },
      });
      assert.equal(response.statusCode, 400);
      assert.equal(calls.length, 0);
      assert.equal(await waitForAbsent(socketPath), true);
    });
  }
});

test('request timeout closes the proxy and leaves no socket', async (t) => {
  let timeoutCallback;
  let now = 10_000;
  const { socketPath } = await startProxy(t, {
    dependencies: {
      clock: {
        now: () => now,
        setTimeout(callback) {
          timeoutCallback = callback;
          return 1;
        },
        clearTimeout() {},
      },
      upstreamTransport: async () => new Promise(() => {}),
    },
  });
  const responsePromise = requestProxy(socketPath).catch(() => null);
  for (let turn = 0; turn < 50 && timeoutCallback === undefined; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.equal(typeof timeoutCallback, 'function');
  now = 40_001;
  timeoutCallback();
  await responsePromise;
  assert.equal(await waitForAbsent(socketPath), true);
});

test('client disconnect and client crash trigger fail-closed cleanup', async (t) => {
  const first = await startProxy(t, { upstreamTransport: async () => new Promise(() => {}) });
  const request = http.request({
    socketPath: first.socketPath,
    method: 'POST',
    path: '/v1/responses',
    headers: { 'content-type': 'application/json' },
  });
  request.once('error', () => {});
  const connected = new Promise((resolve) => {
    request.once('socket', (socket) => socket.once('connect', resolve));
  });
  request.flushHeaders();
  await connected;
  request.write('{"model":');
  await new Promise((resolve) => setImmediate(resolve));
  request.destroy();
  await waitForAbsent(first.socketPath);
  assert.equal(fs.existsSync(first.socketPath), false);

  const second = await startProxy(t, { upstreamTransport: async () => new Promise(() => {}) });
  const script = [
    "const http=require('node:http');",
    `const r=http.request({socketPath:${JSON.stringify(second.socketPath)},method:'POST',path:'/v1/responses',headers:{'content-type':'application/json'}},()=>{});`,
    `r.end(${JSON.stringify(JSON.stringify(requestBody()))});`,
    'setTimeout(()=>process.exit(17),20);',
  ].join('');
  const { spawn } = await import('node:child_process');
  const child = spawn(process.execPath, ['-e', script], { stdio: 'ignore' });
  await new Promise((resolve) => child.once('close', resolve));
  assert.equal(await waitForAbsent(second.socketPath), true);
});

test('proxy server error fails closed and removes its socket', async (t) => {
  let suppliedServer;
  let socketExists = false;
  const root = temporaryRoot(t);
  const socketPath = path.join(root, 'p.sock');
  const fakeFs = {
    chmod: async () => {},
    async lstat() {
      if (!socketExists) throw Object.assign(new Error('absent'), { code: 'ENOENT' });
      return {
        isSocket: () => true,
        mode: 0o140600,
        uid: process.getuid?.() ?? 0,
        gid: process.getgid?.() ?? 0,
      };
    },
    async unlink() {
      socketExists = false;
    },
  };
  const proxy = createHostCredentialProxy({
    policy: makePolicy(),
    socketPath,
    socketOwnerUid: process.getuid?.() ?? 0,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: HOST_KEY,
    dependencies: {
      fs: fakeFs,
      createServer(listener) {
        const server = new EventEmitter();
        server.listen = () => {
          socketExists = true;
          queueMicrotask(() => server.emit('listening'));
        };
        server.close = (callback) => {
          socketExists = false;
          callback();
        };
        server.closeIdleConnections = () => {};
        server.closeAllConnections = () => {};
        suppliedServer = server;
        void listener;
        return server;
      },
    },
  });
  await proxy.start();
  suppliedServer.emit('error', new Error('synthetic proxy crash'));
  assert.equal(await waitForAbsent(socketPath), true);
  await proxy.close();
});

test('proxy crash fails closed for an in-flight client', async (t) => {
  let suppliedServer;
  const { socketPath } = await startProxy(t, {
    upstreamTransport: async () => new Promise(() => {}),
    dependencies: {
      createServer(listener) {
        suppliedServer = http.createServer(listener);
        return suppliedServer;
      },
    },
  });
  const responsePromise = requestProxy(socketPath).catch((error) => error);
  await new Promise((resolve) => setImmediate(resolve));
  suppliedServer.emit('error', new Error('synthetic proxy crash'));
  const result = await responsePromise;
  assert.equal(result instanceof Error, true);
  assert.equal(await waitForAbsent(socketPath), true);
});
