import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  CREDENTIAL_PROXY_ATTEMPT_HEADER,
  CREDENTIAL_PROXY_PATH,
  createHostCredentialProxy,
  describeCredentialProxyPolicy,
} from '../../../experimental/governance-impact/lib/credential-proxy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const PROXY_SOURCE = readFileSync(
  path.join(ROOT, 'experimental/governance-impact/lib/credential-proxy.mjs'),
  'utf8',
);
const FACADE_SOURCE = readFileSync(
  path.join(ROOT, 'experimental/governance-impact/lib/oci-proxy-facade.mjs'),
  'utf8',
);
const FINDINGS = JSON.parse(readFileSync(
  path.join(ROOT, 'benchmarks/external-oss-v8/control/G2/credential-transport-findings.json'),
  'utf8',
));

const ATTEMPT_ID = 'a'.repeat(64);
const ATTEMPT_BEARER = 'synthetic-attempt-bearer';
const UPSTREAM_KEY = 'synthetic-host-key';
const MODEL = 'synthetic-approved-candidate-pending-human';
const FIXED_ENDPOINT = 'https://api.openai.com/v1/responses';
const ARBITRARY_ENDPOINT = 'https://api.example.invalid/v1/responses';

function finding(id) {
  const value = FINDINGS.checks.find((entry) => entry.id === id);
  assert.ok(value, `missing G2 finding ${id}`);
  return value;
}

function temporarySocket(t) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'governseed-v8-g2-'));
  const socketPath = path.join(directory, 'proxy.sock');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return socketPath;
}

function requestProxy(socketPath, options = {}) {
  const rawBody = options.rawBody ?? JSON.stringify(options.body ?? {
    model: MODEL,
    input: 'synthetic request',
    store: false,
    stream: true,
  });
  const headers = {
    [CREDENTIAL_PROXY_ATTEMPT_HEADER]: options.attemptId ?? ATTEMPT_ID,
    'content-type': options.contentType ?? 'application/json',
    'content-length': Buffer.byteLength(rawBody),
    ...options.headers,
  };
  if (options.authorization !== null) {
    headers.authorization = options.authorization ?? `Bearer ${ATTEMPT_BEARER}`;
  }
  return new Promise((resolve, reject) => {
    const request = http.request({
      socketPath,
      method: options.method ?? 'POST',
      path: options.path ?? CREDENTIAL_PROXY_PATH,
      headers,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: Buffer.concat(chunks),
      }));
    });
    request.on('error', reject);
    request.end(rawBody);
  });
}

async function runningProxy(t, overrides = {}) {
  const socketPath = temporarySocket(t);
  const upstreamCalls = [];
  const proxy = createHostCredentialProxy({
    policy: {
      attemptId: ATTEMPT_ID,
      model: MODEL,
      upstream: overrides.upstream ?? FIXED_ENDPOINT,
      maxRequestBytes: overrides.maxRequestBytes ?? 1024,
      maxResponseBytes: overrides.maxResponseBytes ?? 1024,
      maxRequests: overrides.maxRequests ?? 1,
      deadlineMs: overrides.deadlineMs ?? 1000,
    },
    socketPath,
    attemptBearer: ATTEMPT_BEARER,
    upstreamKey: UPSTREAM_KEY,
    dependencies: {
      upstreamTransport: overrides.upstreamTransport ?? (async (request) => {
        upstreamCalls.push(request);
        return {
          statusCode: 200,
          headers: { 'content-type': 'application/json' },
          body: Buffer.from('{"id":"synthetic-response"}'),
        };
      }),
    },
  });
  await proxy.start();
  t.after(() => proxy.close().catch(() => {}));
  return { proxy, socketPath, upstreamCalls };
}

function jsonError(response) {
  return JSON.parse(response.body.toString('utf8')).error.code;
}

test('G2 finding: credential is not allowed in the measured container environment', () => {
  assert.equal(finding('credential-not-in-container-environment').result, 'BLOCKED');
  assert.match(FACADE_SOURCE, /OPENAI_API_KEY/);
});

test('G2 finding: credential has no workspace persistence path', () => {
  assert.equal(finding('credential-not-in-workspace').result, 'PASS');
  assert.doesNotMatch(PROXY_SOURCE, /(?:writeFile|appendFile).*upstreamKey/us);
});

test('G2 finding: credential has no artifact persistence path', () => {
  assert.equal(finding('credential-not-in-artifact').result, 'PASS');
  assert.doesNotMatch(PROXY_SOURCE, /(?:artifact|receipt).*upstreamKey/iu);
});

test('fixed endpoint accepts a synthetic request without network access', async (t) => {
  const { socketPath, upstreamCalls } = await runningProxy(t);
  const response = await requestProxy(socketPath);
  assert.equal(finding('fixed-endpoint-accepts').result, 'PASS');
  assert.equal(response.statusCode, 200);
  assert.equal(upstreamCalls[0].url, FIXED_ENDPOINT);
  assert.equal(upstreamCalls[0].method, 'POST');
});

test('arbitrary endpoint remains accepted by the V4 policy surface', () => {
  assert.equal(finding('arbitrary-endpoint-rejects').result, 'BLOCKED');
  assert.doesNotThrow(() => describeCredentialProxyPolicy({
    attemptId: ATTEMPT_ID,
    model: MODEL,
    upstream: ARBITRARY_ENDPOINT,
    maxRequestBytes: 1024,
    maxResponseBytes: 1024,
    maxRequests: 1,
    deadlineMs: 1000,
  }));
});

test('fixed model accepts a synthetic request', async (t) => {
  const { socketPath } = await runningProxy(t);
  const response = await requestProxy(socketPath);
  assert.equal(finding('fixed-model-accepts').result, 'PASS');
  assert.equal(response.statusCode, 200);
});

test('model override remains possible without the human approval binding', () => {
  assert.equal(finding('model-override-rejects').result, 'BLOCKED');
  assert.doesNotThrow(() => describeCredentialProxyPolicy({
    attemptId: ATTEMPT_ID,
    model: 'synthetic-override',
    upstream: FIXED_ENDPOINT,
    maxRequestBytes: 1024,
    maxResponseBytes: 1024,
    maxRequests: 1,
    deadlineMs: 1000,
  }));
});

test('unknown request header is not rejected by the existing proxy', async (t) => {
  const { socketPath } = await runningProxy(t);
  const response = await requestProxy(socketPath, {
    headers: { 'x-g2-unknown': 'synthetic' },
  });
  assert.equal(finding('unknown-header-rejects').result, 'BLOCKED');
  assert.equal(response.statusCode, 200);
});

test('authorization is currently required from the client rather than injected invisibly by the host', async (t) => {
  const { socketPath } = await runningProxy(t);
  const response = await requestProxy(socketPath, { authorization: null });
  assert.equal(finding('authorization-host-injected').result, 'BLOCKED');
  assert.equal(response.statusCode, 401);
  assert.equal(jsonError(response), 'PROXY_AUTH_REJECTED');
});

test('oversized request is rejected before synthetic upstream transport', async (t) => {
  const { socketPath, upstreamCalls } = await runningProxy(t, { maxRequestBytes: 32 });
  const response = await requestProxy(socketPath, {
    body: { model: MODEL, input: 'x'.repeat(100), store: false, stream: true },
  });
  assert.equal(finding('oversized-request-rejects').result, 'PASS');
  assert.equal(jsonError(response), 'PROXY_REQUEST_TOO_LARGE');
  assert.equal(upstreamCalls.length, 0);
});

test('oversized response fails closed', async (t) => {
  const { socketPath } = await runningProxy(t, {
    maxResponseBytes: 16,
    upstreamTransport: async () => ({
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      body: Buffer.from('{"output":"xxxxxxxxxxxxxxxxxxxxxxxx"}'),
    }),
  });
  const response = await requestProxy(socketPath);
  assert.equal(finding('oversized-response-fails-closed').result, 'PASS');
  assert.equal(jsonError(response), 'PROXY_RESPONSE_TOO_LARGE');
});

test('malformed JSON is rejected', async (t) => {
  const { socketPath } = await runningProxy(t);
  const response = await requestProxy(socketPath, { rawBody: '{"model":' });
  assert.equal(finding('malformed-json-rejects').result, 'PASS');
  assert.equal(jsonError(response), 'PROXY_BODY_INVALID');
});

test('unknown JSON field is accepted by the existing non-closed body validator', async (t) => {
  const { socketPath } = await runningProxy(t);
  const response = await requestProxy(socketPath, {
    body: {
      model: MODEL,
      input: 'synthetic request',
      store: false,
      stream: true,
      g2_unknown_field: 'synthetic',
    },
  });
  assert.equal(finding('unknown-json-field-rejects').result, 'BLOCKED');
  assert.equal(response.statusCode, 200);
});

test('run ID mismatch has no existing binding', async (t) => {
  const { socketPath } = await runningProxy(t);
  const response = await requestProxy(socketPath, {
    headers: { 'x-governance-run-id': 'synthetic-other-run' },
  });
  assert.equal(finding('run-id-mismatch-rejects').result, 'BLOCKED');
  assert.equal(response.statusCode, 200);
});

test('benchmark ID mismatch has no existing binding', async (t) => {
  const { socketPath } = await runningProxy(t);
  const response = await requestProxy(socketPath, {
    headers: { 'x-governance-benchmark-id': 'synthetic-other-benchmark' },
  });
  assert.equal(finding('benchmark-id-mismatch-rejects').result, 'BLOCKED');
  assert.equal(response.statusCode, 200);
});

test('socket owner and mode are not fixed by the core proxy contract', async (t) => {
  const { socketPath } = await runningProxy(t);
  const socketStat = statSync(socketPath);
  assert.equal(finding('socket-owner-and-mode-correct').result, 'BLOCKED');
  assert.equal(typeof socketStat.uid, 'number');
  assert.equal(typeof socketStat.gid, 'number');
  assert.doesNotMatch(PROXY_SOURCE, /chmod\([^\n]*0o600/u);
});

test('proxy crash has no G2 runtime fail-closed receipt', () => {
  assert.equal(finding('proxy-crash-fails-closed').result, 'BLOCKED');
  assert.match(PROXY_SOURCE, /server\.on\('error'/u);
  assert.doesNotMatch(PROXY_SOURCE, /runtime.*crash.*receipt/isu);
});

test('client disconnect is not an automatic socket cleanup contract', () => {
  assert.equal(finding('client-disconnect-cleans-up').result, 'BLOCKED');
  assert.doesNotMatch(PROXY_SOURCE, /request\.on\(['"]close['"]/u);
});

test('deadline abort does not itself prove run cleanup', () => {
  assert.equal(finding('timeout-cleans-up').result, 'BLOCKED');
  assert.match(PROXY_SOURCE, /PROXY_DEADLINE_EXCEEDED/u);
  assert.doesNotMatch(PROXY_SOURCE, /removeOwnedSocket\([^)]*handleRequest/isu);
});

test('raw prompt and response are not persisted by the existing proxy source', () => {
  assert.equal(finding('raw-prompt-response-not-persisted').result, 'PASS');
  assert.doesNotMatch(PROXY_SOURCE, /(?:writeFile|appendFile|createWriteStream)/u);
});

test('G2 evidence has no secret-shaped value', () => {
  const evidenceRoot = path.join(ROOT, 'benchmarks/external-oss-v8');
  const files = [];
  const collect = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) collect(fullPath);
      else if (fullPath.includes(`${path.sep}control${path.sep}G2${path.sep}`)
        || fullPath.includes(`${path.sep}credential-transport${path.sep}`)
        || fullPath.includes(`${path.sep}runtime-identity${path.sep}`)) files.push(fullPath);
    }
  };
  collect(evidenceRoot);
  const content = files.map((file) => readFileSync(file, 'utf8')).join('\n');
  assert.equal(finding('secret-scanner-pass').result, 'PASS');
  assert.doesNotMatch(content, /sk-[A-Za-z0-9]{20,}/u);
  assert.doesNotMatch(content, /Bearer\s+[A-Za-z0-9_=-]{32,}/u);
});

test('G2 proxy tests use synthetic data and no real task source', () => {
  const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  assert.equal(finding('proxy-tests-use-no-real-task').result, 'PASS');
  const taskPathPattern = new RegExp(['tasks/', 'TASK-', 'OSS'].join(''), 'iu');
  const seedArchivePattern = new RegExp(['seed', '.tgz'].join(''), 'iu');
  const oraclePattern = new RegExp(['hidden-', 'oracle'].join(''), 'iu');
  assert.doesNotMatch(source, taskPathPattern);
  assert.doesNotMatch(source, seedArchivePattern);
  assert.doesNotMatch(source, oraclePattern);
});
