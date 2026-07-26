import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CREDENTIAL_PROXY_ATTEMPT_HEADER,
  CREDENTIAL_PROXY_PATH,
  createHostCredentialProxy,
} from '../../scripts/lib/governance-impact-credential-proxy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MODEL = 'gpt-private-negative';
const UPSTREAM = 'https://api.example.invalid/v1/responses';

function temporarySocket(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-proxy-private-'));
  const socketPath = path.join(directory, 'proxy.sock');
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return socketPath;
}

function requestProxy(socketPath, { bearer, attemptId, body }) {
  const rawBody = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      method: 'POST',
      path: CREDENTIAL_PROXY_PATH,
      headers: {
        authorization: `Bearer ${bearer}`,
        [CREDENTIAL_PROXY_ATTEMPT_HEADER]: attemptId,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(rawBody),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
    request.on('error', reject);
    request.end(rawBody);
  });
}

function proxyOptions(t, overrides = {}) {
  return {
    policy: {
      attemptId: overrides.attemptId,
      model: MODEL,
      upstream: UPSTREAM,
      maxRequestBytes: 2_048,
      maxResponseBytes: 2_048,
      maxRequests: 2,
      deadlineMs: 10_000,
    },
    socketPath: temporarySocket(t),
    attemptBearer: overrides.attemptBearer,
    upstreamKey: overrides.upstreamKey,
    logger: overrides.logger,
    dependencies: {
      upstreamTransport: overrides.upstreamTransport,
      ...overrides.dependencies,
    },
  };
}

test('responses, errors, logs, and returned API never reflect sensitive request surfaces', async (t) => {
  const attemptBearer = `bearer-${randomUUID()}`;
  const upstreamKey = `host-key-${randomUUID()}`;
  const attemptId = `attempt-${randomUUID()}`;
  const bodyCanary = `body-${randomUUID()}`;
  const upstreamErrorCanary = `upstream-error-${randomUUID()}`;
  const wrongBearer = `wrong-${randomUUID()}`;
  const logs = [];
  const options = proxyOptions(t, {
    attemptBearer,
    upstreamKey,
    attemptId,
    logger: (event) => logs.push(event),
    upstreamTransport: async () => {
      throw new Error(upstreamErrorCanary);
    },
  });
  const proxy = createHostCredentialProxy(options);
  await proxy.start();
  t.after(async () => proxy.close());

  const rejected = await requestProxy(options.socketPath, {
    bearer: wrongBearer,
    attemptId,
    body: {
      model: MODEL,
      input: bodyCanary,
      store: false,
      stream: true,
    },
  });
  const upstreamFailure = await requestProxy(options.socketPath, {
    bearer: attemptBearer,
    attemptId,
    body: {
      model: MODEL,
      input: bodyCanary,
      store: false,
      stream: true,
    },
  });
  const observed = [
    rejected,
    upstreamFailure,
    JSON.stringify(logs),
    JSON.stringify(proxy),
  ].join('\n');

  assert.equal(JSON.parse(rejected).error.code, 'PROXY_AUTH_REJECTED');
  assert.equal(JSON.parse(upstreamFailure).error.code, 'PROXY_UPSTREAM_FAILED');
  for (const canary of [
    attemptBearer,
    upstreamKey,
    attemptId,
    bodyCanary,
    upstreamErrorCanary,
    wrongBearer,
  ]) {
    assert.equal(observed.includes(canary), false);
  }
});

test('configuration failures expose only a stable code', () => {
  const secret = `secret-${randomUUID()}`;

  assert.throws(
    () => createHostCredentialProxy({
      policy: {
        attemptId: secret,
        model: MODEL,
        upstream: `https://${secret}@api.example.invalid/v1/responses`,
        maxRequestBytes: 1,
        maxResponseBytes: 1,
        maxRequests: 1,
        deadlineMs: 1,
      },
      socketPath: `/tmp/${secret}.sock`,
      attemptBearer: secret,
      upstreamKey: secret,
      dependencies: { upstreamTransport: async () => ({}) },
    }),
    (error) => {
      assert.equal(error.code, 'PROXY_POLICY_INVALID');
      assert.equal(String(error).includes(secret), false);
      assert.deepEqual(Object.keys(error).sort(), ['code', 'name']);
      return true;
    },
  );
});

test('cleanup uncertainty does not reflect filesystem errors or claim socket removal', async (t) => {
  const attemptBearer = `bearer-${randomUUID()}`;
  const upstreamKey = `host-key-${randomUUID()}`;
  const attemptId = `attempt-${randomUUID()}`;
  const cleanupCanary = `cleanup-${randomUUID()}`;
  let pretendSocketRemains = false;
  const fsApi = {
    async lstat(socketPath) {
      if (pretendSocketRemains) return { isSocket: () => true };
      return fs.promises.lstat(socketPath);
    },
    async unlink() {
      pretendSocketRemains = true;
      throw new Error(cleanupCanary);
    },
  };
  const options = proxyOptions(t, {
    attemptBearer,
    upstreamKey,
    attemptId,
    upstreamTransport: async () => ({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{}'),
    }),
    dependencies: { fs: fsApi },
  });
  const proxy = createHostCredentialProxy(options);
  await proxy.start();

  await assert.rejects(
    proxy.close(),
    (error) => {
      assert.equal(error.code, 'PROXY_CLEANUP_UNPROVEN');
      const rendered = String(error);
      assert.equal(rendered.includes(cleanupCanary), false);
      assert.equal(rendered.includes(options.socketPath), false);
      assert.equal(rendered.includes(attemptBearer), false);
      assert.equal(rendered.includes(upstreamKey), false);
      return true;
    },
  );
});

test('credential proxy source has no console logging or secret-bearing public fields', () => {
  const source = fs.readFileSync(
    path.join(ROOT, 'scripts/lib/governance-impact-credential-proxy.mjs'),
    'utf8',
  );
  assert.doesNotMatch(source, /\bconsole\s*\./u);
  assert.doesNotMatch(source, /this\.(?:attemptBearer|upstreamKey|authorization|body)\b/u);
});
