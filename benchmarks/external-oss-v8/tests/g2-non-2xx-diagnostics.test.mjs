import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const WORKFLOW = path.join(ROOT, '.github/workflows/external-oss-v8-runtime-identity.yml');
const DIAGNOSTIC_SCHEMA = path.join(
  ROOT,
  'benchmarks/external-oss-v8/control/G2/runtime-canary-prep/non-2xx-diagnostic.schema.json',
);
const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const RUN_ID = 'non-2xx-diagnostic-synthetic-run';
const TASK_ID = 'runtime-identity-canary';
const ATTEMPT_ROOT = path.join(
  ROOT,
  'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-7',
);

function sha256(filePath) {
  return createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function extractNodeScript(workflow, stepName) {
  const start = workflow.indexOf(stepName);
  assert.notEqual(start, -1);
  const heredoc = workflow.indexOf("<<'NODE'", start);
  const bodyStart = workflow.indexOf('\n', heredoc) + 1;
  const bodyEnd = workflow.indexOf('\n          NODE', bodyStart);
  assert.notEqual(heredoc, -1);
  assert.notEqual(bodyEnd, -1);
  return workflow.slice(bodyStart, bodyEnd).replace(/^ {10}/gmu, '');
}

function policy() {
  return {
    attemptId: 'non-2xx-diagnostic-attempt',
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
    text: {
      format: {
        type: 'json_schema',
        name: 'governseed_runtime_canary',
        strict: true,
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['runtime_canary'],
          properties: { runtime_canary: { type: 'string', enum: ['PASS'] } },
        },
      },
    },
    metadata: {
      benchmark_id: BENCHMARK_ID,
      run_id: RUN_ID,
      task_id: TASK_ID,
    },
  };
}

function requestProxy(socketPath) {
  const bytes = Buffer.from(JSON.stringify(requestBody()));
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
      response.resume();
      response.once('end', () => resolve(response.statusCode));
    });
    request.once('error', reject);
    request.end(bytes);
  });
}

function temporarySocket(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'governseed-g2-non-2xx-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return path.join(root, 'proxy.sock');
}

async function non2xxSummary(t, { statusCode, type, code, extra = {} }) {
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
        body: Buffer.from(JSON.stringify({
          error: {
            type,
            code,
            message: 'forbidden raw provider message sk-secret-value',
            ...extra,
          },
          forbidden_top_level: 'raw provider body',
        })),
      }),
    },
  });
  await proxy.start();
  assert.equal(await requestProxy(socketPath), 502);
  await proxy.close();
  return proxy.getSummary();
}

test('NON_2XX diagnostics retain only allowlisted provider fields and deterministic classification', async (t) => {
  const cases = [
    [401, 'authentication_error', 'invalid_api_key', 'AUTHENTICATION'],
    [403, 'permission_error', null, 'AUTHORIZATION'],
    [404, 'invalid_request_error', 'model_not_found', 'MODEL_OR_ENDPOINT'],
    [429, 'rate_limit_error', 'insufficient_quota', 'RATE_LIMIT_OR_QUOTA'],
    [400, 'invalid_request_error', 'unsupported_value', 'INVALID_REQUEST'],
    [500, 'server_error', null, 'UPSTREAM_SERVER'],
  ];
  for (const [statusCode, type, code, failureClassification] of cases) {
    await t.test(String(statusCode), async (t) => {
      const summary = await non2xxSummary(t, { statusCode, type, code });
      assert.equal(summary.schemaVersion, 3);
      assert.equal(summary.providerHttpStatus, statusCode);
      assert.equal(summary.providerErrorType, type);
      assert.equal(summary.providerErrorCode, code);
      assert.equal(summary.requestObservationState, 'UPSTREAM_RESPONSE_OBSERVED');
      assert.equal(summary.failureClassification, failureClassification);
      assert.equal(summary.upstreamAttemptCount, 1);
      assert.equal(summary.upstreamResponseCount, 1);
      assert.equal(summary.successfulReceiptCount, 0);
      const serialized = JSON.stringify(summary);
      for (const forbidden of [
        'forbidden raw provider message',
        'sk-secret-value',
        'raw provider body',
        'message',
        'forbidden_top_level',
      ]) assert.equal(serialized.includes(forbidden), false);
    });
  }
});

test('unknown provider type and code collapse to closed UNRECOGNIZED tokens', async (t) => {
  const summary = await non2xxSummary(t, {
    statusCode: 418,
    type: 'secret-custom-type',
    code: 'secret-custom-code',
  });
  assert.equal(summary.providerErrorType, 'UNRECOGNIZED');
  assert.equal(summary.providerErrorCode, 'UNRECOGNIZED');
  assert.equal(summary.failureClassification, 'OTHER_NON_2XX');
  assert.equal(JSON.stringify(summary).includes('secret-custom'), false);
});

test('NON_2XX diagnostic schema is closed and contains only authorized fields', () => {
  const schema = JSON.parse(fs.readFileSync(DIAGNOSTIC_SCHEMA, 'utf8'));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, [
    'providerHttpStatus',
    'providerErrorType',
    'providerErrorCode',
    'requestObservationState',
    'failureClassification',
  ]);
  assert.deepEqual(Object.keys(schema.properties), schema.required);
  const serialized = JSON.stringify(schema);
  for (const forbidden of [
    'body',
    'message',
    'prompt',
    'response',
    'headers',
    'credential',
    'environment',
    'secret',
  ]) assert.equal(serialized.toLowerCase().includes(`\"${forbidden}\"`), false);
});

test('failure artifact assembly exports safe diagnostics and explicit non-persistence claims', () => {
  const workflow = fs.readFileSync(WORKFLOW, 'utf8');
  for (const field of [
    'providerHttpStatus',
    'providerErrorType',
    'providerErrorCode',
    'requestObservationState',
    'failureClassification',
    'rawProviderResponsePersisted: false',
    'providerErrorTextPersisted: false',
    'providerHeadersPersisted: false',
    'authorizationDataPersisted: false',
    'environmentDumpPersisted: false',
    'credentialsPersisted: false',
  ]) assert.match(workflow, new RegExp(field, 'u'));
  assert.match(workflow, /test -s "\$RUN_ROOT\/proxy-receipt\.json"/u);
});

test('attempt-7 technical packet and active workflow validator bind the authorized repair only', (t) => {
  const workflow = fs.readFileSync(WORKFLOW, 'utf8');
  const manifestPath = path.join(ATTEMPT_ROOT, 'technical-manifest.json');
  const packetPath = path.join(ATTEMPT_ROOT, 'review-packet.json');
  const authorizationPath = path.join(ATTEMPT_ROOT, 'authorization-source.json');
  const failedRunPath = path.join(ATTEMPT_ROOT, 'failed-run-source.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  for (const entry of manifest.entries) {
    assert.equal(sha256(path.join(ROOT, entry.path)), entry.sha256, entry.path);
  }
  assert.equal(packet.hashes.workflowSha256, sha256(WORKFLOW));
  assert.equal(packet.hashes.technicalManifestSha256, sha256(manifestPath));
  assert.equal(packet.hashes.authorizationSourceSha256, sha256(authorizationPath));
  assert.equal(packet.hashes.failedRunSourceSha256, sha256(failedRunPath));
  assert.match(workflow, /Historical repair-6 validator retained but non-executable\n        if: \$\{\{ false \}\}/u);

  const runRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governseed-g2-binding-'));
  t.after(() => fs.rmSync(runRoot, { recursive: true, force: true }));
  const githubEnv = path.join(runRoot, 'github-env');
  const result = spawnSync(process.execPath, ['--input-type=module'], {
    cwd: ROOT,
    input: extractNodeScript(workflow, '- name: Validate diagnostic repair authorization and technical bindings'),
    encoding: 'utf8',
    env: {
      ...process.env,
      RUN_ROOT: runRoot,
      GITHUB_ENV: githubEnv,
      RUNTIME_IMAGE: 'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5',
    },
  });
  assert.equal(result.status, 0, result.stderr);
  const diagnostic = JSON.parse(fs.readFileSync(path.join(runRoot, 'validation-diagnostic.json'), 'utf8'));
  assert.equal(diagnostic.failureCode, 'BINDING_VALIDATION_PASS');
  assert.equal(diagnostic.providerRequestAttempt, 'NO');
  assert.equal(diagnostic.workflowDispatch, 'NOT_RUN');
});
