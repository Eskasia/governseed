import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'external-oss-v8-runtime-identity.yml');
const CREDENTIAL_ROOT = path.join(ROOT, 'benchmarks', 'external-oss-v8', 'credential-transport');
const REPAIR_ROOT = path.join(CREDENTIAL_ROOT, 'repair-1');
const REPAIR_2_ROOT = path.join(CREDENTIAL_ROOT, 'repair-2');
const RUNTIME_ROOT = path.join(ROOT, 'benchmarks', 'external-oss-v8', 'runtime-identity');
const PREP_ROOT = path.join(ROOT, 'benchmarks', 'external-oss-v8', 'control', 'G2', 'runtime-canary-prep');
const CLIENT_PATH = path.join(PREP_ROOT, 'canary-client.mjs');
const PROXY_PATH = path.join(PREP_ROOT, 'host-proxy.mjs');

const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const MODEL_ID = 'gpt-5.6-luna';
const DESIGN_SHA256 = '7974cae887830af31da8245569b106ec97509a1d65a1d9a7668b17b18741e9a0';
const PROXY_SHA256 = '07d0b6b6f37254dd81215f7e3e3b07336af6428f96f057e6bc5192f26870b8b1';
const REPAIR_2_DESIGN_SHA256 = '434da5f42ae9d5752b5db6641557cec6a3893a22988225947458d287d516d995';
const REPAIR_2_PROXY_SHA256 = '0d77d9f7d74daffae64d30169755b049aa00f0c9d536c3cb228b755878c57eea';
const REPAIR_2_REQUEST_SHA256 = '630ee0eb7b1ca458b1562a676f318430b675b92b005a98c958cb3226b65afb51';
const REPAIR_2_RESPONSE_SHA256 = '5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e';
const REPAIR_2_PROVIDER_RESPONSE_VALIDATION_SHA256 = '5b36f410ebc898a34eb2d4e67814441c78d5331e1d0764750aeb98c9bfb7f528';
const REPAIR_2_NORMALIZED_RESPONSE_SCHEMA_SHA256 = '5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e';
const REPAIR_2_REVIEW_PACKET_SHA256 = '25021a1855112475fa4508e3ae8862cea756cbcb9f42c12d3a37a790a896ec5d';
const REPAIR_2_PENDING_TEMPLATE_SHA256 = 'fd5b14e37b8fc41c0f538db3482199624325fbff6f13d9112584dffa0aab5d79';
const REQUEST_SHA256 = 'ef900421bc69efb718952f9204990d656981893afeb9ec77a20e6268df24015e';
const RESPONSE_SHA256 = 'e0e781bcad97ec7a9a00f84bec593d4926e1b3fda40ec40d43f2d79a38e96556';
const MERGE_COMMIT = '8b04ef20a19fa4b764a839b2aa8d6e77e64866eb';
const APPROVAL_COMMENT_URL = 'https://github.com/Eskasia/governseed/pull/75#issuecomment-5157792741';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function moduleUrl(filePath) {
  return pathToFileURL(filePath).href;
}

test('formal human approval record is exact and linked to sanitized source evidence', () => {
  const approval = readJson(path.join(CREDENTIAL_ROOT, 'human-approval.json'));
  const source = readJson(path.join(CREDENTIAL_ROOT, 'human-approval-source.json'));

  assert.deepEqual(approval, {
    schemaVersion: 1,
    benchmarkId: BENCHMARK_ID,
    approvalStatus: 'APPROVED',
    approvedBy: 'Eskasia',
    approvedAt: '2026-08-02T12:15:00Z',
    approvedDesignSha256: DESIGN_SHA256,
    approvedProxySha256: PROXY_SHA256,
    approvedModelId: MODEL_ID,
    scope: ['credential-transport', 'runtime-identity-canary', 'v8-pilot'],
    limitationsAcknowledged: true,
    approvalEvidence: {
      type: 'github-comment',
      reference: APPROVAL_COMMENT_URL,
      commentId: 5157792741,
      commentAuthor: 'Eskasia',
      commentCreatedAt: '2026-08-02T12:16:58Z',
    },
  });
  assert.equal(source.verificationStatus, 'VERIFIED');
  assert.equal(source.repository, 'Eskasia/governseed');
  assert.equal(source.pullRequest, 75);
  assert.equal(source.mergeCommit, MERGE_COMMIT);
  assert.equal(source.commentId, 5157792741);
  assert.equal(source.commentUrl, APPROVAL_COMMENT_URL);
  assert.equal(source.commentAuthor, 'Eskasia');
  assert.equal(source.commentCreatedAt, '2026-08-02T12:16:58Z');
  assert.deepEqual(source.bodyClaims, {
    benchmarkId: BENCHMARK_ID,
    approvedModelId: MODEL_ID,
    aliasAllowed: false,
    fallbackAllowed: false,
    approvedDesignSha256: DESIGN_SHA256,
    approvedProxySha256: PROXY_SHA256,
    scope: ['credential-transport', 'runtime-identity-canary', 'v8-pilot'],
    approvalDoesNotMeanGatePass: true,
    runtimeIdentityCanaryStillPending: true,
    independentSolAcceptanceStillPending: true,
  });
  assert.equal(source.credentialPresent, false);
  assert.equal(Object.hasOwn(source, 'body'), false);
  assert.doesNotMatch(JSON.stringify(source), /sk-[A-Za-z0-9_-]{16,}/u);
});

test('approved hashes are recomputed from the merged main tree', () => {
  assert.equal(sha256File(path.join(REPAIR_ROOT, 'design.json')), DESIGN_SHA256);
  assert.equal(sha256File(path.join(REPAIR_ROOT, 'request.schema.json')), REQUEST_SHA256);
  assert.equal(sha256File(path.join(REPAIR_ROOT, 'response.schema.json')), RESPONSE_SHA256);
  const approval = readJson(path.join(CREDENTIAL_ROOT, 'human-approval.json'));
  assert.equal(approval.approvedDesignSha256, DESIGN_SHA256);
  assert.equal(approval.approvedProxySha256, PROXY_SHA256);
  const repair2Packet = readJson(path.join(REPAIR_2_ROOT, 'review-packet.json'));
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'design.json')), REPAIR_2_DESIGN_SHA256);
  assert.equal(sha256File(path.join(ROOT, 'experimental', 'governance-impact', 'lib', 'credential-proxy.mjs')), REPAIR_2_PROXY_SHA256);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'request.schema.json')), REPAIR_2_REQUEST_SHA256);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'response.schema.json')), REPAIR_2_RESPONSE_SHA256);
  assert.equal(
    sha256File(path.join(REPAIR_2_ROOT, 'provider-response-validation.json')),
    REPAIR_2_PROVIDER_RESPONSE_VALIDATION_SHA256,
  );
  assert.equal(
    sha256File(path.join(REPAIR_2_ROOT, 'normalized-proxy-response.schema.json')),
    REPAIR_2_NORMALIZED_RESPONSE_SCHEMA_SHA256,
  );
  assert.equal(repair2Packet.hashes.providerResponseValidationSha256, REPAIR_2_PROVIDER_RESPONSE_VALIDATION_SHA256);
  assert.equal(repair2Packet.hashes.normalizedResponseSchemaSha256, REPAIR_2_NORMALIZED_RESPONSE_SCHEMA_SHA256);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'review-packet.json')), REPAIR_2_REVIEW_PACKET_SHA256);
  assert.equal(
    sha256File(path.join(CREDENTIAL_ROOT, 'human-approval-repair-2.template.json')),
    REPAIR_2_PENDING_TEMPLATE_SHA256,
  );
  assert.equal(repair2Packet.hashes.designSha256, REPAIR_2_DESIGN_SHA256);
  assert.equal(repair2Packet.hashes.proxySourceSha256, REPAIR_2_PROXY_SHA256);
  assert.notEqual(approval.approvedProxySha256, repair2Packet.hashes.proxySourceSha256);
});

test('human approval schema admits the exact GitHub comment evidence shape', () => {
  const schema = readJson(path.join(CREDENTIAL_ROOT, 'human-approval.schema.json'));
  const evidence = schema.properties.approvalEvidence;
  assert.equal(evidence.additionalProperties, false);
  assert.deepEqual(evidence.required, [
    'type',
    'reference',
    'commentId',
    'commentAuthor',
    'commentCreatedAt',
  ]);
  assert.ok(evidence.properties.type.enum.includes('github-comment'));
  assert.equal(evidence.properties.commentId.type, 'integer');
  assert.equal(evidence.properties.commentAuthor.type, 'string');
  assert.match(evidence.properties.commentCreatedAt.pattern, /T/iu);
});

test('canary prep remains provider-free and has one exact model binding', () => {
  const prep = readJson(path.join(PREP_ROOT, 'prep.json'));
  assert.equal(prep.benchmarkId, BENCHMARK_ID);
  assert.deepEqual(prep.modelBinding, {
    provider: 'OpenAI',
    modelId: MODEL_ID,
    aliasAllowed: false,
    fallbackAllowed: false,
  });
  assert.equal(prep.endpoint, 'https://api.openai.com/v1/responses');
  assert.equal(prep.requestLimit, 1);
  assert.equal(prep.timeoutMs, 30000);
  assert.equal(prep.providerRequests, 0);
  assert.equal(prep.runtimeCanary, 'NOT_RUN');
  assert.equal(prep.status, 'READY_FOR_HUMAN_REAPPROVAL');
  assert.equal(prep.pilotIncluded, false);
  assert.equal(prep.g3Started, false);
  assert.equal(prep.codexIdentity, 'CODEX_BINARY_NOT_REQUIRED_FOR_PROVIDER_IDENTITY_CANARY');
  assert.deepEqual(prep.container.processEnvironmentNames, [
    'GOVERNSEED_PROXY_SOCKET',
    'GOVERNSEED_BENCHMARK_ID',
    'GOVERNSEED_RUN_ID',
    'GOVERNSEED_TASK_ID',
  ]);
  assert.equal(prep.container.network, 'none');
  assert.equal(prep.container.readOnlyRoot, true);
  assert.equal(prep.container.nonRootUidGid, 'host-proxy-uid:host-proxy-gid (recorded at runtime; must be non-root)');
  assert.deepEqual(prep.container.baseImageEnvironmentNamesMayInclude, ['PATH', 'NODE_VERSION']);
  assert.equal(prep.container.pidLimit, 256);
  assert.equal(prep.container.cpuLimit, 4);
  assert.equal(prep.container.memoryLimit, '15g');
});

test('runtime identity workflow is manual, main-only, and keeps credentials outside containers', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(workflow, /^name: External OSS V8 Runtime Identity$/mu);
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^\s{2}(push|pull_request|workflow_call):/mu);
  assert.match(workflow, /github\.ref\s*==\s*['"]refs\/heads\/main['"]/u);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/u);
  assert.match(workflow, /environment:\n\s+name:\s+governseed-v8-runtime/u);
  assert.match(workflow, /fetch-depth:\s*0/u);
  assert.match(workflow, /persist-credentials:\s*false/u);
  assert.match(workflow, /merge-base['"],\s*['"]--is-ancestor/u);
  assert.equal((workflow.match(/\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/gu) ?? []).length, 1);
  assert.equal((workflow.match(/^\s+OPENAI_API_KEY:\s*\$\{\{/gmu) ?? []).length, 1);
  assert.doesNotMatch(workflow, /^\s{4}env:\n(?:^\s{6}.+\n)*/mu);
  const containerStep = workflow.slice(
    workflow.indexOf('- name: Run one isolated provider-identity canary'),
    workflow.indexOf('- name: Stop host-side credential proxy'),
  );
  assert.doesNotMatch(containerStep, /(?:--env|-e)\s+OPENAI_API_KEY/u);
  assert.match(workflow, /--network none/u);
  assert.match(workflow, /--read-only/u);
  assert.match(workflow, /--cap-drop=ALL/u);
  assert.match(workflow, /--security-opt no-new-privileges:true/u);
  assert.match(workflow, /--user "\$PROXY_UID:\$PROXY_GID"/u);
  assert.match(workflow, /--pids-limit 256/u);
  assert.match(workflow, /--cpus 4/u);
  assert.match(workflow, /--memory 15g/u);
  for (const name of [
    'GOVERNSEED_PROXY_SOCKET',
    'GOVERNSEED_BENCHMARK_ID',
    'GOVERNSEED_RUN_ID',
    'GOVERNSEED_TASK_ID',
  ]) assert.match(workflow, new RegExp(`--env ["']?${name}`, 'u'));
  assert.doesNotMatch(workflow, /\/v1\/models/u);
  assert.match(workflow, /https:\/\/api\.openai\.com\/v1\/responses/u);
  assert.match(workflow, /gpt-5\.6-luna/u);
  assert.match(workflow, /requestLimit|REQUEST_LIMIT/u);
  assert.match(workflow, /30000/u);
  assert.doesNotMatch(workflow, /(?:fallbackModel|modelFallback|fallback[_-]?model|latest|gpt-5\.6(?!-luna))/iu);
  assert.doesNotMatch(workflow, /\b(?:retry|retries)\b/iu);
  assert.doesNotMatch(workflow, /\bPilot\b|\bG3\b/iu);
  assert.doesNotMatch(workflow, /rawResponse|rawPrompt|response\.body/u);
  assert.match(workflow, /runtime-identity-raw\//u);
});

test('mock canary accepts only the fixed JSON object and redacts response content', async () => {
  assert.ok(existsSync(CLIENT_PATH), 'canary client is required before its behavior can be tested');
  const client = await import(moduleUrl(CLIENT_PATH));
  assert.equal(client.CANARY_INPUT, 'Return exactly the JSON object {"runtime_canary":"PASS"}.');
  assert.deepEqual(client.CANARY_OUTPUT, { runtime_canary: 'PASS' });
  const request = client.buildCanaryRequest({
    benchmarkId: BENCHMARK_ID,
    runId: 'run-1',
    taskId: 'runtime-identity-canary',
  });
  assert.equal(request.model, MODEL_ID);
  assert.equal(request.input, client.CANARY_INPUT);
  assert.equal(request.metadata.benchmark_id, BENCHMARK_ID);
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
  assert.equal(Object.hasOwn(request, 'response_format'), false);
  assert.deepEqual(client.parseCanaryResponse({
    model: MODEL_ID,
    output_text: '{"runtime_canary":"PASS"}',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }), client.CANARY_OUTPUT);
  assert.equal(client.parseCanaryResponse({
    model: MODEL_ID,
    output_text: '{"runtime_canary":"PASS","extra":"reject"}',
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  }), null);
  const redacted = client.sanitizeResponseMetadata({
    statusCode: 200,
    body: Buffer.from('{"runtime_canary":"PASS"}'),
    bodyObject: { runtime_canary: 'PASS' },
    authorization: 'Bearer secret',
    prompt: client.CANARY_INPUT,
    canaryAccepted: true,
  });
  assert.equal(redacted.statusCode, 200);
  assert.equal(redacted.canaryAccepted, true);
  assert.equal(Object.hasOwn(redacted, 'body'), false);
  assert.equal(Object.hasOwn(redacted, 'bodyObject'), false);
  assert.equal(Object.hasOwn(redacted, 'authorization'), false);
  assert.equal(Object.hasOwn(redacted, 'prompt'), false);
});

test('mock proxy receipt redaction keeps only the approved evidence fields', async () => {
  assert.ok(existsSync(PROXY_PATH), 'host proxy is required before its behavior can be tested');
  const proxy = await import(moduleUrl(PROXY_PATH));
  const redacted = proxy.sanitizeProxyReceipt({
    requestSha256: 'a'.repeat(64),
    responseSha256: 'b'.repeat(64),
    requestBytes: 123,
    responseBytes: 456,
    modelId: MODEL_ID,
    statusCode: 200,
    latencyMs: 12,
    tokenCounts: { input: 1, output: 2, total: 3 },
    providerRequestIdHash: 'c'.repeat(64),
    input: 'must-not-retain',
    output: 'must-not-retain',
    authorization: 'must-not-retain',
  });
  assert.deepEqual(redacted, {
    requestSha256: 'a'.repeat(64),
    responseSha256: 'b'.repeat(64),
    requestBytes: 123,
    responseBytes: 456,
    modelId: MODEL_ID,
    statusCode: 200,
    latencyMs: 12,
    tokenCounts: { input: 1, output: 2, total: 3 },
    providerRequestIdHash: 'c'.repeat(64),
  });
  assert.doesNotMatch(JSON.stringify(redacted), /must-not-retain/u);
});

test('mock canary rejects an exact-looking output delivered with a non-2xx status', async () => {
  const client = await import(moduleUrl(CLIENT_PATH));
  const directory = mkdtempSync(path.join(os.tmpdir(), 'governseed-v8-canary-'));
  const socketPath = path.join(directory, 'proxy.sock');
  const server = http.createServer((request, response) => {
    request.resume();
    request.once('end', () => {
      const body = Buffer.from(JSON.stringify({
        output: [{ content: [{ text: '{"runtime_canary":"PASS"}' }] }],
      }));
      response.writeHead(400, {
        'content-type': 'application/json',
        'content-length': body.length,
      });
      response.end(body);
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
  try {
    const result = await client.runCanary({
      socketPath,
      benchmarkId: BENCHMARK_ID,
      runId: 'mock-run',
      taskId: 'runtime-identity-canary',
    });
    assert.equal(result.statusCode, 400);
    assert.equal(result.canaryAccepted, false);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(directory, { recursive: true, force: true });
  }
});
