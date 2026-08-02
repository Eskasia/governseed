import assert from 'node:assert/strict';
import fs from 'node:fs';
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
} from '../lib/credential-proxy.mjs';

const SECRET = 'synthetic-host-secret-not-for-container';
const POLICY = {
  attemptId: 'a'.repeat(64),
  benchmarkId: 'GS-OSS-2026-08-02-V8',
  runId: 'negative-run',
  taskId: 'negative-task',
  provider: CREDENTIAL_PROXY_PROVIDER,
  model: CREDENTIAL_PROXY_MODEL,
  upstream: CREDENTIAL_PROXY_ENDPOINT,
  maxRequestBytes: 1_024,
  maxResponseBytes: 1_024,
  requestLimit: CREDENTIAL_PROXY_REQUEST_LIMIT,
  timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
  tokenCeiling: CREDENTIAL_PROXY_TOKEN_CEILING,
};

function socketPath(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'credential-proxy-negative-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'proxy.sock');
}

test('configuration errors expose no secret, path, or provider header', () => {
  assert.throws(
    () => createHostCredentialProxy({
      policy: { ...POLICY, model: 'latest' },
      socketPath: `/tmp/${SECRET}.sock`,
      upstreamKey: SECRET,
    }),
    (error) => {
      assert.equal(error.code, 'PROXY_POLICY_INVALID');
      assert.equal(String(error).includes(SECRET), false);
      assert.equal(JSON.stringify(error).includes(SECRET), false);
      return true;
    },
  );
});

test('public proxy object and sanitized logger never reflect the host credential', async (t) => {
  const logs = [];
  const proxy = createHostCredentialProxy({
    policy: POLICY,
    socketPath: socketPath(t),
    upstreamKey: SECRET,
    logger: (entry) => logs.push(entry),
    dependencies: {
      upstreamTransport: async () => {
        throw new Error('private upstream detail');
      },
    },
  });
  await proxy.start();
  await proxy.close();
  const rendered = `${JSON.stringify(proxy)}${JSON.stringify(logs)}`;
  assert.equal(rendered.includes(SECRET), false);
  assert.equal(rendered.includes('private upstream detail'), false);
});

test('socket identity mismatch fails closed before a proxy can start', async (t) => {
  const target = socketPath(t);
  const proxy = createHostCredentialProxy({
    policy: POLICY,
    socketPath: target,
    socketOwnerUid: (process.getuid?.() ?? 0) + 1,
    socketOwnerGid: process.getgid?.() ?? 0,
    upstreamKey: SECRET,
  });
  await assert.rejects(
    proxy.start(),
    (error) => error.code === 'PROXY_SOCKET_IDENTITY_INVALID',
  );
  assert.equal(fs.existsSync(target), false);
});

test('receipt sink failure is fail-closed and does not persist raw request data', async (t) => {
  const target = socketPath(t);
  const proxy = createHostCredentialProxy({
    policy: POLICY,
    socketPath: target,
    upstreamKey: SECRET,
    receiptSink: () => {
      throw new Error('private sink detail');
    },
  });
  await proxy.start();
  await proxy.close();
  assert.equal(fs.existsSync(target), false);
});

test('source has no direct workspace/artifact write surface or console logging', () => {
  const source = fs.readFileSync(
    path.resolve('experimental/governance-impact/lib/credential-proxy.mjs'),
    'utf8',
  );
  assert.doesNotMatch(source, /\bconsole\s*\./u);
  assert.doesNotMatch(source, /(?:writeFile|appendFile|createWriteStream).*upstreamKey/us);
  assert.doesNotMatch(source, /OPENAI_API_KEY|OPENAI_BASE_URL|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN/u);
});
