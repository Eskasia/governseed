import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import test from 'node:test';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW_PATH = join(
  REPO_ROOT,
  '.github/workflows/external-oss-v8-runtime-identity.yml',
);
const IMAGE_LOCK_PATH = join(
  REPO_ROOT,
  'benchmarks/external-oss-v7/runtime-image/image-lock.json',
);
const CLIENT_PATH = join(
  REPO_ROOT,
  'benchmarks/external-oss-v8/control/G2/runtime-canary-prep/canary-client.mjs',
);
const PROXY_PATH = join(
  REPO_ROOT,
  'experimental/governance-impact/lib/credential-proxy.mjs',
);
const REQUEST_SCHEMA_PATH = join(
  REPO_ROOT,
  'benchmarks/external-oss-v8/credential-transport/repair-2/request.schema.json',
);
const RESPONSE_SCHEMA_PATH = join(
  REPO_ROOT,
  'benchmarks/external-oss-v8/credential-transport/repair-2/response.schema.json',
);
const PROVIDER_RESPONSE_CONTRACT_PATH = join(
  REPO_ROOT,
  'benchmarks/external-oss-v8/credential-transport/repair-2/provider-response-validation.json',
);
const NORMALIZED_RESPONSE_SCHEMA_PATH = join(
  REPO_ROOT,
  'benchmarks/external-oss-v8/credential-transport/repair-2/normalized-proxy-response.schema.json',
);

const EXACT_IMAGE =
  'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5';
const MODEL_ID = 'gpt-5.6-luna';
const ALLOWED_ENVIRONMENT_NAMES = [
  'GOVERNSEED_BENCHMARK_ID',
  'GOVERNSEED_PROXY_SOCKET',
  'GOVERNSEED_RUN_ID',
  'GOVERNSEED_TASK_ID',
];

async function readText(path) {
  return readFile(path, 'utf8');
}

function runChild(script, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], options);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test('runtime image binding is the exact locked V7 image', async () => {
  const lock = JSON.parse(await readText(IMAGE_LOCK_PATH));
  const workflow = await readText(WORKFLOW_PATH);

  assert.equal(lock.baseImages.node.lockedReference, EXACT_IMAGE);
  assert.match(workflow, /lockedImage/);
  assert.match(workflow, new RegExp(EXACT_IMAGE.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')));
  assert.match(workflow, /RUNTIME_IMAGE_IDENTITY_MISMATCH/);
  assert.match(workflow, /image-lock\.json/);
});

test('runtime image preflight uses the exact Node executable and version', async () => {
  const workflow = await readText(WORKFLOW_PATH);

  assert.match(workflow, /docker run --rm --network none --read-only/);
  assert.match(workflow, /--entrypoint \/usr\/local\/bin\/node/);
  assert.match(workflow, /\/usr\/local\/bin\/node.*--version/s);
  assert.match(workflow, /v26\.3\.0/);
  assert.doesNotMatch(workflow, /\/usr\/bin\/node/);
});

test('the image base environment is distinct from the scrubbed canary process environment', async () => {
  const workflow = await readText(WORKFLOW_PATH);

  assert.match(workflow, /base-image-env-names/);
  assert.match(workflow, /--entrypoint \/usr\/bin\/env/);
  assert.match(workflow, /RUNTIME_IMAGE" -i/);
  assert.match(workflow, /canary-process-env-names/);
  assert.match(workflow, /GOVERNSEED_PROXY_SOCKET/);
  assert.doesNotMatch(workflow, /names\.join\([^\n]*allowedEnvironmentNames/);
  assert.doesNotMatch(workflow, /Config\.Env.*exactly four|exactly four.*Config\.Env/i);
});

test('the repaired canary request uses Responses text.format structured output', async () => {
  const client = await import(new URL('../control/G2/runtime-canary-prep/canary-client.mjs', import.meta.url));
  const request = client.buildCanaryRequest({
    benchmarkId: 'GS-OSS-2026-08-02-V8',
    runId: 'synthetic-run',
    taskId: 'synthetic-task',
  });

  assert.equal(request.model, MODEL_ID);
  assert.equal(request.max_output_tokens, 8192);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.name, 'governseed_runtime_canary');
  assert.equal(request.text.format.strict, true);
  assert.deepEqual(request.text.format.schema, {
    type: 'object',
    additionalProperties: false,
    required: ['runtime_canary'],
    properties: {
      runtime_canary: { type: 'string', enum: ['PASS'] },
    },
  });
  assert.equal('response_format' in request, false);
  assert.equal('json_schema' in request, false);
});

test('request, provider, and normalized schemas separate the provider response contract', async () => {
  const [requestSchemaText, responseSchemaText, providerContractText, normalizedSchemaText, proxyText] = await Promise.all([
    readText(REQUEST_SCHEMA_PATH),
    readText(RESPONSE_SCHEMA_PATH),
    readText(PROVIDER_RESPONSE_CONTRACT_PATH),
    readText(NORMALIZED_RESPONSE_SCHEMA_PATH),
    readText(PROXY_PATH),
  ]);
  const requestSchema = JSON.parse(requestSchemaText);
  const responseSchema = JSON.parse(responseSchemaText);
  const providerContract = JSON.parse(providerContractText);
  const normalizedSchema = JSON.parse(normalizedSchemaText);

  assert.equal(requestSchema.properties.text.properties.format.properties.type.const, 'json_schema');
  assert.deepEqual(
    requestSchema.properties.text.properties.format.properties.schema.properties.required.const,
    ['runtime_canary'],
  );
  assert.deepEqual(
    requestSchema.properties.text.properties.format.properties.schema.properties.properties.properties.runtime_canary.properties.enum.const,
    ['PASS'],
  );
  assert.equal('response_format' in requestSchema.properties, false);
  assert.deepEqual(requestSchema.properties.input.const, 'Return exactly the JSON object {"runtime_canary":"PASS"}.');
  assert.deepEqual(responseSchema.required, ['model', 'output_text', 'usage']);
  assert.equal(responseSchema.properties.model.const, MODEL_ID);
  assert.deepEqual(normalizedSchema.required, ['model', 'output_text', 'usage']);
  assert.equal(providerContract.additionalTopLevelFieldsAllowed, true);
  assert.equal(providerContract.normalizedResponseSchemaPath, 'benchmarks/external-oss-v8/credential-transport/repair-2/normalized-proxy-response.schema.json');
  assert.deepEqual(providerContract.requiredFields, {
    id: 'non-empty-string',
    object: 'response',
    status: 'completed',
    model: MODEL_ID,
    error: null,
    incomplete_details: null,
    output: 'array',
    usage: 'object',
  });
  assert.match(proxyText, /text.*format/s);
  assert.match(proxyText, /CREDENTIAL_PROXY_CANARY_INPUT/);
});

test('the runtime canary records a real UDS connection with scrubbed environment names', async () => {
  const socketDirectory = await mkdtemp(join(tmpdir(), 'governseed-g2-uds-'));
  const socketPath = join(socketDirectory, 'proxy.sock');
  let requestCount = 0;
  const server = createServer((request, response) => {
    requestCount += 1;
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const parsed = JSON.parse(body);
      assert.equal(parsed.model, MODEL_ID);
      assert.equal(parsed.text.format.name, 'governseed_runtime_canary');
      assert.equal('response_format' in parsed, false);
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({
        model: MODEL_ID,
        output_text: '{"runtime_canary":"PASS"}',
        usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
      }));
    });
  });

  try {
    await new Promise((resolve) => server.listen(socketPath, resolve));
    const client = await import(new URL('../control/G2/runtime-canary-prep/canary-client.mjs', import.meta.url));
    assert.deepEqual(client.scrubbedEnvironmentNames(Object.fromEntries(
      ALLOWED_ENVIRONMENT_NAMES.map((name) => [name, `synthetic-${name}`]),
    )), ALLOWED_ENVIRONMENT_NAMES);
    const output = await client.runCanary({
      socketPath,
      benchmarkId: 'GS-OSS-2026-08-02-V8',
      runId: 'synthetic-run',
      taskId: 'synthetic-task',
    });
    assert.equal(output.udsConnection, 'PASS');
    assert.equal(output.responseModelId, MODEL_ID);
    assert.equal(output.responseEnvelopeValid, true);
    assert.equal(output.normalizedResponseValid, true);
    assert.equal(requestCount, 1);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(socketDirectory, { recursive: true, force: true });
  }
});

test('the workflow runs the non-root canary with the socket owner identity and records UDS evidence', async () => {
  const workflow = await readText(WORKFLOW_PATH);

  assert.match(workflow, /PROXY_UID=.*id -u/);
  assert.match(workflow, /PROXY_GID=.*id -g/);
  assert.match(workflow, /--user "\$PROXY_UID:\$PROXY_GID"/);
  assert.match(workflow, /containerUidGid/);
  assert.match(workflow, /socketUidGid/);
  assert.match(workflow, /socketMode/);
  assert.match(workflow, /udsConnection.*PASS|UDS_CONNECTION_PASS/s);
  assert.doesNotMatch(workflow, /--user 65532:65532/);
  assert.doesNotMatch(workflow, /--privileged|--cap-add|chmod 0777|chmod 0666/);
});

test('the workflow always emits a redacted failure artifact with the required diagnosis fields', async () => {
  const workflow = await readText(WORKFLOW_PATH);
  const requiredFields = [
    'workflowRunId',
    'mainCommitSha',
    'failureStage',
    'failureCode',
    'providerRequestCount',
    'runtimeImage',
    'runtimeImageDigestMatch',
    'nodePathProbe',
    'containerUidGid',
    'socketUidGid',
    'socketMode',
    'credentialNamesObserved',
  ];

  assert.match(workflow, /failure-artifact\.json/);
  assert.match(workflow, /if: \$\{\{ always\(\) \}\}/);
  for (const field of requiredFields) {
    assert.match(workflow, new RegExp(field));
  }
  assert.match(workflow, /RUNTIME_IMAGE_IDENTITY_MISMATCH/);
  assert.match(workflow, /providerRequestCount.*0|providerRequests.*0/s);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY.*failure-artifact|Authorization.*failure-artifact/i);
});

test('the workflow cannot dispatch with the old approval after a binding change', async () => {
  const workflow = await readText(WORKFLOW_PATH);

  assert.match(workflow, /human-approval-repair-2\.template\.json/);
  assert.match(workflow, /HUMAN_REAPPROVAL_REQUIRED/);
  assert.match(workflow, /approvedDesignSha256/);
  assert.match(workflow, /approvedProxySha256/);
  for (const field of [
    'requestSchemaPath',
    'requestSchemaSha256',
    'responseSchemaPath',
    'responseSchemaSha256',
    'canaryClientPath',
    'canaryClientSha256',
    'workflowPath',
    'workflowSha256',
  ]) assert.match(workflow, new RegExp(field));
  assert.match(workflow, /providerRequests?\s*==?\s*0|providerRequestCount.*0/s);
});

test('the new repair packet hashes are computed from canonical JSON bytes', async () => {
  const packetPath = join(REPO_ROOT, 'benchmarks/external-oss-v8/credential-transport/repair-2/review-packet.json');
  const packetText = await readText(packetPath);
  const packet = JSON.parse(packetText);

  assert.equal(packet.status, 'PENDING_HUMAN_REAPPROVAL');
  assert.equal(packet.modelBinding.modelId, MODEL_ID);
  assert.equal(packet.providerRequests, 0);
  assert.equal(packet.humanApproval.status, 'PENDING_HUMAN_REVIEW');
  assert.equal(packet.humanApproval.appliesTo, 'repair-2 hashes only');
  assert.equal(
    packet.hashes.requestSchemaSha256,
    createHash('sha256')
      .update(await readText(join(REPO_ROOT, packet.hashes.requestSchemaPath)))
      .digest('hex'),
  );
});
