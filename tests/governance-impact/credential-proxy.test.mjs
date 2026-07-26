import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CREDENTIAL_PROXY_ATTEMPT_HEADER,
  CREDENTIAL_PROXY_PATH,
  createHostCredentialProxy,
  describeCredentialProxyPolicy,
  hashCredentialProxyPolicy,
} from '../../scripts/lib/governance-impact-credential-proxy.mjs';

const ATTEMPT_ID = 'attempt-synthetic-001';
const ATTEMPT_BEARER = 'attempt-bearer-synthetic-001';
const UPSTREAM_KEY = 'upstream-key-synthetic-001';
const MODEL = 'gpt-fixed-synthetic';
const UPSTREAM = 'https://api.example.invalid/v1/responses';

function policy(overrides = {}) {
  return {
    attemptId: ATTEMPT_ID,
    model: MODEL,
    upstream: UPSTREAM,
    maxRequestBytes: 1_024,
    maxResponseBytes: 1_024,
    maxRequests: 1,
    deadlineMs: 10_000,
    ...overrides,
  };
}

function temporarySocket(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-proxy-'));
  const socketPath = path.join(directory, 'proxy.sock');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return socketPath;
}

async function requestProxy(socketPath, options = {}) {
  const rawBody = options.rawBody ?? JSON.stringify(
    options.body ?? {
      model: MODEL,
      input: 'synthetic request',
      store: false,
      stream: true,
    },
  );
  const headers = {
    authorization: options.authorization ?? `Bearer ${ATTEMPT_BEARER}`,
    [CREDENTIAL_PROXY_ATTEMPT_HEADER]: options.attemptId ?? ATTEMPT_ID,
    'content-type': options.contentType ?? 'application/json',
    'content-length': Buffer.byteLength(rawBody),
    ...options.headers,
  };

  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      method: options.method ?? 'POST',
      path: options.path ?? CREDENTIAL_PROXY_PATH,
      headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    request.on('error', reject);
    request.end(rawBody);
  });
}

async function runningProxy(t, options = {}) {
  const socketPath = options.socketPath ?? temporarySocket(t);
  const upstreamCalls = [];
  const logs = [];
  const upstreamTransport = options.upstreamTransport ?? (async (request) => {
    upstreamCalls.push(request);
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"id":"response-synthetic"}'),
    };
  });
  const proxy = createHostCredentialProxy({
    policy: policy(options.policy),
    socketPath,
    attemptBearer: options.attemptBearer ?? ATTEMPT_BEARER,
    upstreamKey: options.upstreamKey ?? UPSTREAM_KEY,
    logger: options.logger ?? ((event) => logs.push(event)),
    dependencies: {
      upstreamTransport,
      ...options.dependencies,
    },
  });
  await proxy.start();
  t.after(async () => {
    await proxy.close();
  });
  return { proxy, socketPath, upstreamCalls, logs };
}

test('policy hash is canonical and excludes attempt-scoped and host-only values', () => {
  const first = policy();
  const reordered = {
    deadlineMs: first.deadlineMs,
    maxRequests: first.maxRequests,
    maxResponseBytes: first.maxResponseBytes,
    maxRequestBytes: first.maxRequestBytes,
    upstream: first.upstream,
    model: first.model,
    attemptId: 'different-attempt',
  };

  assert.equal(hashCredentialProxyPolicy(first), hashCredentialProxyPolicy(reordered));
  assert.notEqual(
    hashCredentialProxyPolicy(first),
    hashCredentialProxyPolicy({ ...first, model: 'different-model' }),
  );
});

test('durable policy pins non-storage, client-only tools, and identifier stripping', () => {
  assert.deepEqual(describeCredentialProxyPolicy(policy()), {
    schemaVersion: 2,
    method: 'POST',
    path: '/v1/responses',
    model: MODEL,
    upstream: UPSTREAM,
    maxRequestBytes: 1_024,
    maxResponseBytes: 1_024,
    maxRequests: 1,
    deadlineMs: 10_000,
    maxConcurrency: 1,
    request: {
      store: false,
      stream: true,
      background: false,
      continuationMode: 'client-replay',
      serverStateFields: [],
      serverStateReferenceFields: [],
      remoteInputUrls: false,
      toolSearchExecution: 'client',
      allowedToolTypes: [
        'apply_patch',
        'custom',
        'function',
        'local_shell',
        'tool_search',
      ],
      strippedIdentifierFields: [
        'client_metadata',
        'metadata',
        'prompt_cache_key',
        'prompt_cache_retention',
        'safety_identifier',
        'user',
      ],
    },
  });
});

test('valid request uses only the fixed upstream route and host credential', async (t) => {
  const { proxy, socketPath, upstreamCalls } = await runningProxy(t);

  const response = await requestProxy(socketPath);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.toString('utf8'), '{"id":"response-synthetic"}');
  assert.equal(upstreamCalls.length, 1);
  assert.equal(upstreamCalls[0].url, UPSTREAM);
  assert.equal(upstreamCalls[0].method, 'POST');
  assert.deepEqual(upstreamCalls[0].headers, {
    accept: 'application/json, text/event-stream',
    authorization: `Bearer ${UPSTREAM_KEY}`,
    'content-type': 'application/json',
  });
  assert.deepEqual(JSON.parse(upstreamCalls[0].body.toString('utf8')), {
    model: MODEL,
    input: 'synthetic request',
    store: false,
    stream: true,
  });
  assert.equal(JSON.stringify(proxy).includes(UPSTREAM_KEY), false);
  assert.equal(JSON.stringify(proxy).includes(ATTEMPT_BEARER), false);
});

test('text/event-stream reaches the client before the upstream stream ends', async (t) => {
  let markFirstProduced;
  const firstProduced = new Promise((resolve) => {
    markFirstProduced = resolve;
  });
  let releaseSecond;
  const secondAllowed = new Promise((resolve) => {
    releaseSecond = resolve;
  });
  const { socketPath } = await runningProxy(t, {
    upstreamTransport: async () => ({
      statusCode: 200,
      headers: { 'content-type': 'text/event-stream' },
      body: (async function* body() {
        markFirstProduced();
        yield Buffer.from('data: first\n\n');
        await secondAllowed;
        yield Buffer.from('data: second\n\n');
      }()),
    }),
  });

  const chunks = [];
  let response;
  const completed = new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      method: 'POST',
      path: CREDENTIAL_PROXY_PATH,
      headers: {
        authorization: `Bearer ${ATTEMPT_BEARER}`,
        [CREDENTIAL_PROXY_ATTEMPT_HEADER]: ATTEMPT_ID,
        'content-type': 'application/json',
      },
    }, (incoming) => {
      response = incoming;
      incoming.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      incoming.on('end', resolve);
    });
    request.on('error', reject);
    request.end(JSON.stringify({
      model: MODEL,
      input: 'synthetic request',
      store: false,
      stream: true,
    }));
  });

  await firstProduced;
  for (let turn = 0; turn < 10 && chunks.length === 0; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const progressive = chunks.length > 0;
  releaseSecond();
  await completed;

  assert.equal(progressive, true);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['content-type'], 'text/event-stream');
  assert.equal(response.headers['content-length'], undefined);
  assert.equal(
    Buffer.concat(chunks).toString('utf8'),
    'data: first\n\ndata: second\n\n',
  );
});

test('upstream request removes client identifiers and permits only client-executed tools', async (t) => {
  const { socketPath, upstreamCalls } = await runningProxy(t);
  const response = await requestProxy(socketPath, {
    body: {
      model: MODEL,
      input: 'synthetic request',
      store: false,
      stream: true,
      background: false,
      prompt_cache_key: 'must-not-cross-the-proxy',
      client_metadata: {
        thread_id: 'must-not-cross-the-proxy',
      },
      tools: [
        { type: 'function', name: 'synthetic_function', parameters: {} },
        { type: 'custom', name: 'synthetic_custom' },
        { type: 'local_shell' },
        { type: 'apply_patch' },
        { type: 'tool_search', execution: 'client' },
      ],
    },
  });

  assert.equal(response.statusCode, 200);
  assert.equal(upstreamCalls.length, 1);
  assert.deepEqual(JSON.parse(upstreamCalls[0].body.toString('utf8')), {
    model: MODEL,
    input: 'synthetic request',
    store: false,
    stream: true,
    background: false,
    tools: [
      { type: 'function', name: 'synthetic_function', parameters: {} },
      { type: 'custom', name: 'synthetic_custom' },
      { type: 'local_shell' },
      { type: 'apply_patch' },
      { type: 'tool_search', execution: 'client' },
    ],
  });
});

test('bounded client-replay continuation supports a two-request tool loop', async (t) => {
  const { socketPath, upstreamCalls } = await runningProxy(t, {
    policy: { maxRequests: 2 },
  });
  const first = await requestProxy(socketPath, {
    body: {
      model: MODEL,
      input: 'call the synthetic client tool',
      store: false,
      stream: true,
      tools: [{
        type: 'function',
        name: 'synthetic_tool',
        parameters: { type: 'object', properties: {} },
      }],
    },
  });
  const second = await requestProxy(socketPath, {
    body: {
      model: MODEL,
      input: [
        {
          type: 'function_call',
          call_id: 'call_synthetic_1',
          name: 'synthetic_tool',
          arguments: '{}',
        },
        {
          type: 'function_call_output',
          call_id: 'call_synthetic_1',
          output: '{"ok":true}',
        },
      ],
      store: false,
      stream: true,
      tools: [{
        type: 'function',
        name: 'synthetic_tool',
        parameters: { type: 'object', properties: {} },
      }],
    },
  });

  assert.equal(first.statusCode, 200);
  assert.equal(second.statusCode, 200);
  assert.equal(upstreamCalls.length, 2);
  assert.equal(
    JSON.parse(upstreamCalls[1].body.toString('utf8')).input[1].type,
    'function_call_output',
  );
});

test('closed request policy rejects wrong bearer, attempt, method, path, media type, and body', async (t) => {
  const cases = [
    {
      name: 'bearer',
      request: { authorization: 'Bearer wrong' },
      code: 'PROXY_AUTH_REJECTED',
    },
    {
      name: 'attempt',
      request: { attemptId: 'wrong-attempt' },
      code: 'PROXY_ATTEMPT_REJECTED',
    },
    {
      name: 'method',
      request: { method: 'PUT' },
      code: 'PROXY_METHOD_REJECTED',
    },
    {
      name: 'path',
      request: { path: '/v1/chat/completions' },
      code: 'PROXY_PATH_REJECTED',
    },
    {
      name: 'media type',
      request: { contentType: 'text/plain' },
      code: 'PROXY_CONTENT_TYPE_REJECTED',
    },
    {
      name: 'JSON syntax',
      request: { rawBody: '{"model":' },
      code: 'PROXY_BODY_INVALID',
    },
    {
      name: 'model body',
      request: {
        body: {
          model: 'wrong-model',
          input: 'synthetic request',
          store: false,
          stream: true,
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'missing non-storage contract',
      request: { body: { model: MODEL, input: 'synthetic request', stream: true } },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'stored response',
      request: {
        body: {
          model: MODEL,
          input: 'synthetic request',
          store: true,
          stream: true,
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'background response',
      request: {
        body: {
          model: MODEL,
          input: 'synthetic request',
          store: false,
          stream: true,
          background: true,
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'server-side conversation state',
      request: {
        body: {
          model: MODEL,
          input: 'synthetic request',
          store: false,
          stream: true,
          previous_response_id: 'resp_synthetic',
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'hosted remote tool',
      request: {
        body: {
          model: MODEL,
          input: 'synthetic request',
          store: false,
          stream: true,
          tools: [{ type: 'web_search' }],
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'server-executed tool search',
      request: {
        body: {
          model: MODEL,
          input: 'synthetic request',
          store: false,
          stream: true,
          tools: [{ type: 'tool_search', execution: 'server' }],
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'provider item reference',
      request: {
        body: {
          model: MODEL,
          input: [{ type: 'item_reference', id: 'item_synthetic' }],
          store: false,
          stream: true,
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'provider file reference',
      request: {
        body: {
          model: MODEL,
          input: [{
            role: 'user',
            content: [{
              type: 'input_file',
              file_id: 'file_synthetic',
            }],
          }],
          store: false,
          stream: true,
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'remote input URL',
      request: {
        body: {
          model: MODEL,
          input: [{
            role: 'user',
            content: [{
              type: 'input_image',
              image_url: 'https://example.invalid/synthetic.png',
            }],
          }],
          store: false,
          stream: true,
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
    {
      name: 'server-executed replayed tool search',
      request: {
        body: {
          model: MODEL,
          input: [{
            type: 'tool_search_call',
            execution: 'server',
            arguments: { query: 'synthetic' },
          }],
          store: false,
          stream: true,
        },
      },
      code: 'PROXY_BODY_MISMATCH',
    },
  ];

  for (const entry of cases) {
    await t.test(entry.name, async (t) => {
      const { socketPath, upstreamCalls } = await runningProxy(t);
      const response = await requestProxy(socketPath, entry.request);
      assert.equal(JSON.parse(response.body.toString('utf8')).error.code, entry.code);
      assert.equal(upstreamCalls.length, 0);
    });
  }
});

test('request and response byte quotas fail closed before bytes cross the boundary', async (t) => {
  await t.test('request bytes', async (t) => {
    const { socketPath, upstreamCalls } = await runningProxy(t, {
      policy: { maxRequestBytes: 48 },
    });
    const response = await requestProxy(socketPath, {
      body: {
        model: MODEL,
        input: 'x'.repeat(80),
        store: false,
        stream: true,
      },
    });
    assert.equal(
      JSON.parse(response.body.toString('utf8')).error.code,
      'PROXY_REQUEST_TOO_LARGE',
    );
    assert.equal(upstreamCalls.length, 0);
  });

  await t.test('response bytes', async (t) => {
    const { socketPath } = await runningProxy(t, {
      policy: { maxResponseBytes: 16 },
      upstreamTransport: async () => ({
        statusCode: 200,
        headers: { 'content-type': 'application/json' },
        body: Buffer.from(JSON.stringify({ output: 'x'.repeat(80) })),
      }),
    });
    const response = await requestProxy(socketPath);
    assert.equal(
      JSON.parse(response.body.toString('utf8')).error.code,
      'PROXY_RESPONSE_TOO_LARGE',
    );
  });
});

test('attempt bearer replay after the request quota is rejected', async (t) => {
  const { socketPath, upstreamCalls } = await runningProxy(t);

  assert.equal((await requestProxy(socketPath)).statusCode, 200);
  const replay = await requestProxy(socketPath);

  assert.equal(
    JSON.parse(replay.body.toString('utf8')).error.code,
    'PROXY_REQUEST_QUOTA_EXCEEDED',
  );
  assert.equal(upstreamCalls.length, 1);
});

test('expired attempt bearer is rejected using the injected clock', async (t) => {
  let now = 1_000;
  const clock = {
    now: () => now,
    setTimeout,
    clearTimeout,
  };
  const { socketPath, upstreamCalls } = await runningProxy(t, {
    policy: { deadlineMs: 50 },
    dependencies: { clock },
  });
  now = 1_051;

  const response = await requestProxy(socketPath);

  assert.equal(
    JSON.parse(response.body.toString('utf8')).error.code,
    'PROXY_DEADLINE_EXCEEDED',
  );
  assert.equal(upstreamCalls.length, 0);
});

test('deadline also terminates an authenticated request with an unfinished body', async (t) => {
  let deadlineCallback;
  const clock = {
    now: () => 1_000,
    setTimeout(callback) {
      deadlineCallback = callback;
      return 1;
    },
    clearTimeout() {},
  };
  const { socketPath, upstreamCalls } = await runningProxy(t, {
    policy: { deadlineMs: 50 },
    dependencies: { clock },
  });
  let request;
  const responsePromise = new Promise((resolve, reject) => {
    request = http.request({
      socketPath,
      method: 'POST',
      path: CREDENTIAL_PROXY_PATH,
      headers: {
        authorization: `Bearer ${ATTEMPT_BEARER}`,
        [CREDENTIAL_PROXY_ATTEMPT_HEADER]: ATTEMPT_ID,
        'content-type': 'application/json',
        'content-length': 256,
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    });
    request.on('error', reject);
  });
  request.write(`{"model":${JSON.stringify(MODEL)},"input":"`);

  try {
    for (let turn = 0; turn < 10 && deadlineCallback === undefined; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(typeof deadlineCallback, 'function');
    deadlineCallback();
    const response = await responsePromise;
    assert.equal(
      JSON.parse(response.toString('utf8')).error.code,
      'PROXY_DEADLINE_EXCEEDED',
    );
    assert.equal(upstreamCalls.length, 0);
  } finally {
    request.destroy();
    await responsePromise.catch(() => {});
  }
});

test('only one authenticated upstream request may be active', async (t) => {
  let releaseUpstream;
  let markStarted;
  const started = new Promise((resolve) => {
    markStarted = resolve;
  });
  const upstreamTransport = async () => {
    markStarted();
    await new Promise((resolve) => {
      releaseUpstream = resolve;
    });
    return {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"ok":true}'),
    };
  };
  const { socketPath } = await runningProxy(t, {
    policy: { maxRequests: 2 },
    upstreamTransport,
  });

  const first = requestProxy(socketPath);
  await started;
  const concurrent = await requestProxy(socketPath);
  releaseUpstream();

  assert.equal(
    JSON.parse(concurrent.body.toString('utf8')).error.code,
    'PROXY_CONCURRENCY_EXCEEDED',
  );
  assert.equal((await first).statusCode, 200);
});

test('close removes and proves absence of the Unix socket', async (t) => {
  const socketPath = temporarySocket(t);
  const { proxy } = await runningProxy(t, { socketPath });
  assert.equal(fs.lstatSync(socketPath).isSocket(), true);

  const proof = await proxy.close();

  assert.deepEqual(proof, { socketRemoved: true, requestCount: 0 });
  assert.equal(fs.existsSync(socketPath), false);
});

test('closed proxy proves a successful attempt safe without exposing request data', async (t) => {
  const { proxy, socketPath } = await runningProxy(t);
  assert.equal((await requestProxy(socketPath)).statusCode, 200);

  await proxy.close();
  assert.deepEqual(await proxy.proveSafe(), { attemptSafe: true });
});

test('request rejection removes the socket but makes the attempt ineligible', async (t) => {
  const socketPath = temporarySocket(t);
  const { proxy } = await runningProxy(t, { socketPath });
  const response = await requestProxy(socketPath, {
    authorization: 'Bearer rejected',
  });
  assert.equal(response.statusCode, 401);

  await proxy.close();
  assert.equal(fs.existsSync(socketPath), false);
  await assert.rejects(
    proxy.proveSafe(),
    (error) => error.code === 'PROXY_ATTEMPT_UNSAFE'
      && error.message === 'PROXY_ATTEMPT_UNSAFE'
      && JSON.stringify(error) === JSON.stringify({
        name: 'CredentialProxyError',
        code: 'PROXY_ATTEMPT_UNSAFE',
      }),
  );
});

test('upstream transport failure makes the closed attempt ineligible', async (t) => {
  const { proxy, socketPath } = await runningProxy(t, {
    upstreamTransport: async () => {
      throw new Error('private upstream detail');
    },
  });
  const response = await requestProxy(socketPath);
  assert.equal(response.statusCode, 502);

  await proxy.close();
  await assert.rejects(
    proxy.proveSafe(),
    (error) => error.code === 'PROXY_ATTEMPT_UNSAFE'
      && error.message === 'PROXY_ATTEMPT_UNSAFE'
      && !JSON.stringify(error).includes('private upstream detail'),
  );
});

test('an unused but cleanly closed proxy is safe delivery evidence', async (t) => {
  const { proxy } = await runningProxy(t);
  await proxy.close();
  assert.deepEqual(await proxy.proveSafe(), { attemptSafe: true });
});

test('server and filesystem lifecycle are dependency-injected', async () => {
  let socketExists = false;
  let serverClosed = false;
  let suppliedListener;
  let suppliedServer;
  const fakeFs = {
    async lstat() {
      if (!socketExists) {
        const error = new Error('absent');
        error.code = 'ENOENT';
        throw error;
      }
      return { isSocket: () => true };
    },
    async unlink() {
      socketExists = false;
    },
  };
  const createServer = (listener) => {
    suppliedListener = listener;
    const server = new EventEmitter();
    server.listen = () => {
      socketExists = true;
      queueMicrotask(() => server.emit('listening'));
    };
    server.close = (callback) => {
      serverClosed = true;
      callback();
    };
    suppliedServer = server;
    return server;
  };
  const proxy = createHostCredentialProxy({
    policy: policy(),
    socketPath: '/synthetic/proxy.sock',
    attemptBearer: ATTEMPT_BEARER,
    upstreamKey: UPSTREAM_KEY,
    dependencies: {
      createServer,
      fs: fakeFs,
      clock: { now: () => 1_000, setTimeout, clearTimeout },
      upstreamTransport: async () => {
        throw new Error('unused');
      },
    },
  });

  await proxy.start();
  assert.doesNotThrow(() => suppliedServer.emit('error', new Error('synthetic server failure')));
  const proof = await proxy.close();

  assert.equal(typeof suppliedListener, 'function');
  assert.equal(serverClosed, true);
  assert.equal(socketExists, false);
  assert.deepEqual(proof, { socketRemoved: true, requestCount: 0 });
});
