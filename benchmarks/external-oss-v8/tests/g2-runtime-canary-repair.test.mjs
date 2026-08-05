import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = '.github/workflows/external-oss-v8-runtime-identity.yml';
const PACKET = 'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-6/review-packet.json';
const MANIFEST = 'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-6/technical-manifest.json';
const IMAGE = 'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5';
const MODEL = 'gpt-5.6-luna';
const FIXED_INPUT = 'Return exactly the JSON object {"runtime_canary":"PASS"}.';
const REPAIR_6_TECHNICAL_HEAD = 'db85da98b2337aafd488ed64421b01e3a21422c6';

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return createHash('sha256').update(readFileSync(path.join(ROOT, relativePath))).digest('hex');
}

test('runtime image and executable are exact and digest pinned', () => {
  const lock = readJson('benchmarks/external-oss-v7/runtime-image/image-lock.json');
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  assert.equal(lock.baseImages.node.lockedReference, IMAGE);
  assert.match(workflow, new RegExp(IMAGE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'));
  assert.match(workflow, /--entrypoint \/usr\/local\/bin\/node/u);
  assert.match(workflow, /v26\.3\.0/u);
});

test('fixed canary request binds exact model, prompt, and Responses text.format', async () => {
  const client = await import(new URL('../control/G2/runtime-canary-prep/canary-client.mjs', import.meta.url));
  const request = client.buildCanaryRequest({ benchmarkId: 'GS-OSS-2026-08-02-V8', runId: 'run', taskId: 'task' });
  assert.equal(request.model, MODEL);
  assert.equal(request.input, FIXED_INPUT);
  assert.equal(request.text.format.type, 'json_schema');
  assert.equal(request.text.format.name, 'governseed_runtime_canary');
  assert.equal(request.text.format.strict, true);
  assert.equal('response_format' in request, false);
});

test('request, provider, and normalized schemas remain separate', () => {
  const request = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/request.schema.json');
  const response = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/response.schema.json');
  const provider = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/provider-response-validation.json');
  const normalized = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/normalized-proxy-response.schema.json');
  assert.equal(request.properties.model.const, MODEL);
  assert.equal(request.properties.input.const, FIXED_INPUT);
  assert.equal('response_format' in request.properties, false);
  assert.deepEqual(response.required, ['model', 'output_text', 'usage']);
  assert.deepEqual(normalized.required, ['model', 'output_text', 'usage']);
  assert.equal(provider.normalizedResponseSchemaPath, 'benchmarks/external-oss-v8/credential-transport/repair-2/normalized-proxy-response.schema.json');
});

test('workflow contains fixed non-secret container boundary and stage-scoped evidence', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  assert.match(workflow, /--network none/u);
  assert.match(workflow, /--read-only/u);
  assert.match(workflow, /--cap-drop=ALL/u);
  assert.match(workflow, /--user "\$PROXY_UID:\$PROXY_GID"/u);
  assert.match(workflow, /--entrypoint \/usr\/bin\/env/u);
  assert.match(workflow, /base-image-env-names/u);
  assert.match(workflow, /canary-process-env-names/u);
  assert.match(workflow, /OPENAI_API_KEY: \$\{\{ secrets\.OPENAI_API_KEY \}\}/u);
  assert.doesNotMatch(workflow, /OPENAI_API_KEY.*failure-artifact|Authorization.*failure-artifact/iu);
});

test('workflow failure evidence uses separated counters and fixed taxonomy', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  for (const field of [
    'clientRequestObservedCount',
    'upstreamAttemptCount',
    'upstreamResponseCount',
    'successfulReceiptCount',
    'providerRequestAttempt',
    'CANARY_UPSTREAM_ATTEMPTED_NO_RESPONSE',
    'CANARY_PROVIDER_RESPONSE_INVALID',
    'CANARY_MODEL_ID_MISMATCH',
    'CANARY_OUTPUT_INVALID',
  ]) assert.match(workflow, new RegExp(field, 'u'));
  assert.match(workflow, /schemaVersion: 2/u);
  assert.doesNotMatch(workflow, /providerRequestCount/u);
});

test('attempt-6 packet and manifest remain a bound historical snapshot', () => {
  const packet = readJson(PACKET);
  const manifest = readJson(MANIFEST);
  for (const entry of manifest.entries) {
    const historical = createHash('sha256')
      .update(execFileSync('git', ['show', `${REPAIR_6_TECHNICAL_HEAD}:${entry.path}`], { cwd: ROOT }))
      .digest('hex');
    assert.equal(historical, entry.sha256, entry.path);
  }
  assert.equal(packet.modelBinding.provider, 'OpenAI');
  assert.equal(packet.modelBinding.modelId, MODEL);
  assert.equal(packet.modelBinding.aliasAllowed, false);
  assert.equal(packet.modelBinding.fallbackAllowed, false);
  assert.equal(packet.hashes.workflowSha256, manifest.entries.find((entry) => entry.path === WORKFLOW).sha256);
  assert.equal(packet.hashes.technicalManifestSha256, sha256(MANIFEST));
});
