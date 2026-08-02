import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import test from 'node:test';

const RELAY_SCRIPT = path.resolve('experimental/governance-impact/uds-relay.mjs');

function temporarySocket(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'uds-relay-v8-'));
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

function waitForClose(child, timeoutMs = 2_000) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve({ exitCode: child.exitCode, signalCode: child.signalCode });
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

async function listenUds(server, socketPath) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
}

async function startRelay(t, socketPath) {
  const port = await availablePort();
  const child = spawn(process.execPath, [RELAY_SCRIPT], {
    cwd: path.resolve('.'),
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
  child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));
  child.stdin.write(`${JSON.stringify({ socketPath, port })}\n`);
  await new Promise((resolve, reject) => {
    let text = '';
    const timer = setTimeout(() => reject(new Error('relay READY timeout')), 2_000);
    const onData = (chunk) => {
      text += chunk.toString('utf8');
      if (text === 'READY\n') {
        clearTimeout(timer);
        child.stdout.off('data', onData);
        resolve();
      } else if (!'READY\n'.startsWith(text)) {
        clearTimeout(timer);
        reject(new Error('relay protocol invalid'));
      }
    };
    child.stdout.on('data', onData);
    child.once('error', reject);
  });
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) child.stdin.end();
    await waitForClose(child).catch(() => {});
  });
  return { child, port, stdout, stderr };
}

function requestRelay(port, options = {}) {
  const body = options.body ?? JSON.stringify({ synthetic: true });
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      method: options.method ?? 'POST',
      path: options.path ?? '/v1/responses',
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
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    request.end(body);
  });
}

test('relay reads only run-scoped UDS configuration and ignores inherited credential env', async () => {
  const child = spawn(process.execPath, [RELAY_SCRIPT], {
    cwd: path.resolve('.'),
    env: {
      PATH: '/usr/bin:/bin',
      LANG: 'C.UTF-8',
      OPENAI_API_KEY: 'must-not-be-used',
      OPENAI_BASE_URL: 'must-not-be-used',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  child.stdin.end('{}\n');
  const closed = await waitForClose(child);
  assert.equal(closed.exitCode, 64);
});

test('relay reconstructs only host-generated fixed headers over UDS', async (t) => {
  const socketPath = temporarySocket(t);
  const seen = [];
  const core = http.createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    seen.push({ headers: request.headers, body: Buffer.concat(chunks) });
    const body = Buffer.from(JSON.stringify({ ok: true }));
    response.writeHead(200, {
      'content-type': 'application/json',
      'content-length': body.length,
      'x-private-provider-header': 'must-not-cross',
    });
    response.end(body);
  });
  await listenUds(core, socketPath);
  t.after(() => new Promise((resolve) => core.close(resolve)));
  const relay = await startRelay(t, socketPath);
  const response = await requestRelay(relay.port);
  assert.equal(response.statusCode, 200, Buffer.concat(relay.stderr).toString('utf8'));
  assert.deepEqual(JSON.parse(response.body.toString('utf8')), { ok: true });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].headers.authorization, undefined);
  assert.equal(seen[0].headers['openai-organization'], undefined);
  assert.equal(seen[0].headers['x-governance-attempt-id'], undefined);
  assert.equal(seen[0].headers.accept, 'application/json');
  assert.equal(seen[0].headers['content-type'], 'application/json');
  assert.equal(seen[0].headers.host, 'localhost');
  assert.deepEqual(JSON.parse(seen[0].body.toString('utf8')), { synthetic: true });
  assert.equal(response.headers['x-private-provider-header'], undefined);
});

test('relay rejects client Authorization and arbitrary x-* headers', async (t) => {
  for (const headers of [
    { authorization: 'Bearer client-value' },
    { 'x-client-header': 'client-value' },
  ]) {
    await t.test(Object.keys(headers)[0], async (t) => {
      const socketPath = temporarySocket(t);
      const core = http.createServer(() => {
        throw new Error('must not reach UDS');
      });
      await listenUds(core, socketPath);
      t.after(() => new Promise((resolve) => core.close(resolve)));
      const relay = await startRelay(t, socketPath);
      const response = await requestRelay(relay.port, { headers });
      assert.equal(response.statusCode, 400);
      assert.equal(
        JSON.parse(response.body.toString('utf8')).error.code,
        'PROXY_HEADER_REJECTED',
      );
      const closed = await waitForClose(relay.child);
      assert.equal(closed.exitCode, 70);
    });
  }
});
