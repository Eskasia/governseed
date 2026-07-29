import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const RELAY_SCRIPT = path.resolve('scripts/governance-impact-uds-relay.mjs');
const ATTEMPT_ID = 'b'.repeat(64);
const BEARER = 'relay-attempt-bearer-synthetic';

function temporarySocket(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uds-relay-test-'));
  if (process.platform === 'win32') {
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    return String.raw`\\.\pipe\${path.basename(root)}-core`;
  }
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'core.sock');
}

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function listenUds(server, socketPath) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
}

async function closeServer(server) {
  await new Promise((resolve) => server.close(() => resolve()));
}

function waitForClose(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({
      exitCode: child.exitCode,
      signalCode: child.signalCode,
    });
  }
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('relay close timeout'));
    }, timeoutMs);
    child.once('close', (exitCode, signalCode) => {
      clearTimeout(timer);
      resolve({ exitCode, signalCode });
    });
  });
}

async function startRelay(t, socketPath, options = {}) {
  const port = options.port ?? await availablePort();
  const child = spawn(process.execPath, [RELAY_SCRIPT], {
    cwd: path.resolve('.'),
    shell: false,
    env: {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.write(`${JSON.stringify({
    socketPath,
    bearer: BEARER,
    attemptId: ATTEMPT_ID,
    port,
  })}\n`);
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
  await new Promise((resolve, reject) => {
    let ready = '';
    const timer = setTimeout(() => reject(new Error('relay READY timeout')), 2_000);
    const onData = (chunk) => {
      ready += chunk.toString('utf8');
      if (ready === 'READY\n') {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      } else if (!'READY\n'.startsWith(ready)) {
        clearTimeout(timer);
        reject(new Error(`unexpected relay protocol: ${ready}`));
      }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
    child.once('close', (code) => {
      if (ready !== 'READY\n') reject(new Error(`relay exited before READY: ${code}`));
    });
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.stdin.end();
    await waitForClose(child).catch(() => {});
  });
  return {
    child,
    port,
    stdout,
    stderr,
  };
}

async function requestRelay(port, options = {}) {
  const body = options.body ?? JSON.stringify({
    model: 'gpt-synthetic-fixed',
    store: false,
    stream: true,
    input: 'synthetic request',
  });
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method: options.method ?? 'POST',
      path: options.path ?? '/v1/responses',
      headers: {
        authorization: options.authorization ?? `Bearer ${BEARER}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        'x-untrusted-client-header': 'must-not-cross-uds',
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

test('relay ignores inherited secret env and requires one closed stdin configuration', async () => {
  const child = spawn(process.execPath, [RELAY_SCRIPT], {
    cwd: path.resolve('.'),
    shell: false,
    env: {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
      GOVERNANCE_IMPACT_PROXY_SOCKET: '/private/must-not-be-used.sock',
      GOVERNANCE_IMPACT_PROXY_BEARER: 'must-not-be-used',
      GOVERNANCE_IMPACT_PROXY_ATTEMPT_ID: ATTEMPT_ID,
      GOVERNANCE_IMPACT_PROXY_PORT: '43127',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
  child.stdin.end('{}\n');

  const closed = await waitForClose(child);
  assert.equal(closed.exitCode, 64);
  assert.equal(Buffer.concat(stdout).length, 0);
  assert.equal(Buffer.concat(stderr).length, 0);
});

test('relay forwards one exact request over UDS with reconstructed headers', async (t) => {
  const socketPath = temporarySocket(t);
  const upstreamRequests = [];
  const core = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    upstreamRequests.push({
      method: request.method,
      path: request.url,
      headers: request.headers,
      body: Buffer.concat(chunks),
    });
    const body = Buffer.from('{"id":"synthetic-response"}');
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': body.length,
      'x-private-upstream': 'must-not-cross-loopback',
    });
    response.end(body);
  });
  await listenUds(core, socketPath);
  t.after(() => closeServer(core));
  const relay = await startRelay(t, socketPath);

  const response = await requestRelay(relay.port);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.toString('utf8'), '{"id":"synthetic-response"}');
  assert.equal(response.headers['x-private-upstream'], undefined);
  assert.equal(upstreamRequests.length, 1);
  assert.equal(upstreamRequests[0].method, 'POST');
  assert.equal(upstreamRequests[0].path, '/v1/responses');
  assert.equal(upstreamRequests[0].headers.authorization, `Bearer ${BEARER}`);
  assert.equal(
    upstreamRequests[0].headers['x-governance-attempt-id'],
    ATTEMPT_ID,
  );
  assert.equal(upstreamRequests[0].headers['content-type'], 'application/json');
  assert.equal(upstreamRequests[0].headers['x-untrusted-client-header'], undefined);
  assert.deepEqual(
    JSON.parse(upstreamRequests[0].body.toString('utf8')),
    {
      model: 'gpt-synthetic-fixed',
      store: false,
      stream: true,
      input: 'synthetic request',
    },
  );
  assert.equal(Buffer.concat(relay.stderr).length, 0);

  relay.child.stdin.end();
  const closed = await waitForClose(relay.child);
  assert.equal(closed.exitCode, 0);
  assert.equal(Buffer.concat(relay.stdout).toString('utf8'), 'READY\n');
});

test('text/event-stream is forwarded progressively instead of buffered to completion', async (t) => {
  const socketPath = temporarySocket(t);
  let upstreamEnded = false;
  const core = http.createServer((_request, response) => {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write('data: first\n\n');
    setTimeout(() => {
      upstreamEnded = true;
      response.end('data: second\n\n');
    }, 100);
  });
  await listenUds(core, socketPath);
  t.after(() => closeServer(core));
  const relay = await startRelay(t, socketPath);

  const observed = await new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port: relay.port,
      method: 'POST',
      path: '/v1/responses',
      headers: {
        authorization: `Bearer ${BEARER}`,
        'content-type': 'application/json',
      },
    }, (response) => {
      const chunks = [];
      let firstArrivedBeforeUpstreamEnd = null;
      response.on('data', (chunk) => {
        if (firstArrivedBeforeUpstreamEnd === null) {
          firstArrivedBeforeUpstreamEnd = !upstreamEnded;
        }
        chunks.push(Buffer.from(chunk));
      });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        firstArrivedBeforeUpstreamEnd,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    request.once('error', reject);
    request.end(JSON.stringify({
      model: 'gpt-synthetic-fixed',
      store: false,
      stream: true,
      input: 'synthetic request',
    }));
  });

  assert.equal(observed.statusCode, 200);
  assert.equal(observed.firstArrivedBeforeUpstreamEnd, true);
  assert.equal(observed.body, 'data: first\n\ndata: second\n\n');
});

test('wrong bearer and path fail closed without reaching UDS', async (t) => {
  for (const entry of [
    {
      name: 'bearer',
      request: { authorization: 'Bearer wrong' },
      statusCode: 401,
      code: 'PROXY_AUTH_REJECTED',
    },
    {
      name: 'path',
      request: { path: '/v1/chat/completions' },
      statusCode: 404,
      code: 'PROXY_PATH_REJECTED',
    },
  ]) {
    await t.test(entry.name, async (t) => {
      const socketPath = temporarySocket(t);
      let upstreamRequests = 0;
      const core = http.createServer((_request, response) => {
        upstreamRequests += 1;
        response.end('{}');
      });
      await listenUds(core, socketPath);
      t.after(() => closeServer(core));
      const relay = await startRelay(t, socketPath);

      const response = await requestRelay(relay.port, entry.request);

      assert.equal(response.statusCode, entry.statusCode);
      assert.equal(
        JSON.parse(response.body.toString('utf8')).error.code,
        entry.code,
      );
      assert.equal(upstreamRequests, 0);
      const closed = await waitForClose(relay.child);
      assert.equal(closed.exitCode, 70);
      assert.equal(Buffer.concat(relay.stderr).length, 0);
    });
  }
});

test('UDS upstream failure is bounded, sanitized, and fatal to the relay', async (t) => {
  const socketPath = temporarySocket(t);
  const relay = await startRelay(t, socketPath);

  const response = await requestRelay(relay.port);

  assert.equal(response.statusCode, 502);
  assert.equal(
    JSON.parse(response.body.toString('utf8')).error.code,
    'PROXY_UPSTREAM_FAILED',
  );
  assert.equal(response.body.includes(Buffer.from(socketPath)), false);
  const closed = await waitForClose(relay.child);
  assert.equal(closed.exitCode, 70);
  assert.equal(Buffer.concat(relay.stderr).length, 0);
  assert.equal(Buffer.concat(relay.stdout).includes(Buffer.from(BEARER)), false);
  assert.equal(Buffer.concat(relay.stdout).includes(Buffer.from(ATTEMPT_ID)), false);
});

test('stdin EOF is the parent lifeline and closes the listener', async (t) => {
  const socketPath = temporarySocket(t);
  const core = http.createServer((_request, response) => response.end('{}'));
  await listenUds(core, socketPath);
  t.after(() => closeServer(core));
  const relay = await startRelay(t, socketPath);

  relay.child.stdin.end();

  const closed = await waitForClose(relay.child);
  assert.equal(closed.exitCode, 0);
  await assert.rejects(requestRelay(relay.port), (error) => (
    error?.code === 'ECONNREFUSED' || error?.code === 'ECONNRESET'
  ));
});
