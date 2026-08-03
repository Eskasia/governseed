import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(process.cwd());
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
);
const sha256 = (relativePath) => createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, relativePath)))
  .digest('hex');

test('repair-2 packet, schemas, immutable evidence, and source contract are consistent', () => {
  const packet = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/review-packet.json');
  const design = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/design.json');
  const requestSchema = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/request.schema.json');
  const responseSchema = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/response.schema.json');
  const providerResponseValidation = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/provider-response-validation.json');
  const normalizedResponseSchema = readJson('benchmarks/external-oss-v8/credential-transport/repair-2/normalized-proxy-response.schema.json');
  const pendingApproval = readJson('benchmarks/external-oss-v8/credential-transport/human-approval-repair-2.template.json');
  const oldApproval = readJson('benchmarks/external-oss-v8/credential-transport/human-approval.json');
  const inherited = readJson('benchmarks/external-oss-v8/control/G2/repair-1/inherited-evidence.json');
  const prep = readJson('benchmarks/external-oss-v8/control/G2/runtime-canary-prep/prep.json');
  const receiptTemplate = readJson('benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.template.json');

  assert.equal(packet.benchmarkId, 'GS-OSS-2026-08-02-V8');
  assert.equal(packet.gate, 'G2');
  assert.equal(packet.repair, 'repair-2');
  assert.equal(packet.status, 'PENDING_HUMAN_REAPPROVAL');
  assert.equal(packet.technicalDisposition, 'TECHNICALLY_REPAIRED_PENDING_HUMAN_REAPPROVAL');
  assert.equal(packet.overallGate, 'BLOCKED');
  assert.deepEqual(packet.modelBinding, {
    provider: 'OpenAI',
    modelId: 'gpt-5.6-luna',
    aliasAllowed: false,
    fallbackAllowed: false,
    exact: true,
    status: 'PENDING_HUMAN_REAPPROVAL',
    aliasesForbidden: ['latest', 'gpt-5.6', 'Luna', 'Sol'],
  });
  assert.deepEqual(packet.transport.requestAllowedFields, [
    'model',
    'input',
    'max_output_tokens',
    'text',
    'metadata',
  ]);
  assert.equal(packet.transport.structuredOutputPath, 'text.format');
  assert.equal(packet.transport.forbiddenRequestField, 'response_format');
  assert.equal(packet.transport.requestLimit, 1);
  assert.equal(packet.transport.timeoutMs, 30_000);
  assert.equal(packet.providerRequests, 0);
  assert.equal(packet.humanApproval.status, 'PENDING_HUMAN_REVIEW');
  assert.equal(packet.humanApproval.appliesTo, 'repair-2 hashes only');
  assert.equal(oldApproval.approvalStatus, 'APPROVED');
  assert.equal(oldApproval.approvedDesignSha256, packet.previousRepair.designSha256);
  assert.equal(oldApproval.approvedProxySha256, packet.previousRepair.proxySha256);
  assert.notEqual(oldApproval.approvedDesignSha256, packet.hashes.designSha256);
  assert.notEqual(oldApproval.approvedProxySha256, packet.hashes.proxySourceSha256);

  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(responseSchema.additionalProperties, false);
  assert.equal(requestSchema.properties.model.const, 'gpt-5.6-luna');
  assert.equal(responseSchema.properties.model.const, 'gpt-5.6-luna');
  assert.equal(requestSchema.properties.input.const, 'Return exactly the JSON object {"runtime_canary":"PASS"}.');
  assert.equal(requestSchema.properties.text.properties.format.properties.name.const, 'governseed_runtime_canary');
  assert.equal(requestSchema.properties.text.properties.format.properties.strict.const, true);
  assert.deepEqual(
    requestSchema.properties.text.properties.format.properties.schema.properties.required.const,
    ['runtime_canary'],
  );
  assert.deepEqual(responseSchema.required, ['model', 'output_text', 'usage']);
  assert.equal(responseSchema.properties.usage.additionalProperties, false);
  assert.deepEqual(normalizedResponseSchema.required, ['model', 'output_text', 'usage']);
  assert.equal(providerResponseValidation.additionalTopLevelFieldsAllowed, true);
  assert.equal(providerResponseValidation.usage.additionalFieldsAllowed, true);
  assert.equal(providerResponseValidation.requiredFields.status, 'completed');
  assert.equal(prep.status, 'READY_FOR_HUMAN_REAPPROVAL');
  assert.equal(prep.runtimeImage.lockedReference, 'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5');
  assert.equal(prep.runtimeImage.executablePath, '/usr/local/bin/node');
  assert.equal(prep.runtimeImage.version, 'v26.3.0');
  assert.equal(prep.responsesRequestFormat.path, 'text.format');
  assert.equal(receiptTemplate.modelId, 'gpt-5.6-luna');
  assert.equal(receiptTemplate.providerRequests, 0);
  assert.equal(receiptTemplate.runtimeCanary, 'NOT_RUN');

  for (const [field, expectedPath] of [
    ['designSha256', packet.hashes.designPath],
    ['requestSchemaSha256', packet.hashes.requestSchemaPath],
    ['responseSchemaSha256', packet.hashes.responseSchemaPath],
    ['providerResponseValidationSha256', packet.hashes.providerResponseValidationPath],
    ['providerResponseValidationSourceSha256', packet.hashes.providerResponseValidationSourcePath],
    ['normalizedResponseSchemaSha256', packet.hashes.normalizedResponseSchemaPath],
    ['proxySourceSha256', packet.hashes.proxySourcePath],
    ['canaryClientSha256', packet.hashes.canaryClientPath],
    ['workflowSha256', packet.hashes.workflowPath],
  ]) {
    assert.equal(sha256(expectedPath), packet.hashes[field], `hash drift: ${expectedPath}`);
  }
  for (const entry of inherited.immutableEvidence) {
    assert.equal(sha256(entry.path), entry.sha256, `immutable evidence changed: ${entry.path}`);
  }

  for (const [snapshotPath, activePath] of [
    [packet.attempt2Artifacts.designPath, packet.hashes.designPath],
    [packet.attempt2Artifacts.requestSchemaPath, packet.hashes.requestSchemaPath],
    [packet.attempt2Artifacts.providerResponseValidationPath, packet.hashes.providerResponseValidationPath],
    [packet.attempt2Artifacts.normalizedResponseSchemaPath, packet.hashes.normalizedResponseSchemaPath],
    [packet.attempt2Artifacts.responseSchemaPath, packet.hashes.responseSchemaPath],
    [packet.attempt2Artifacts.proxySourcePath, packet.hashes.proxySourcePath],
    [packet.attempt2Artifacts.providerResponseValidationSourcePath, packet.hashes.providerResponseValidationSourcePath],
    [packet.attempt2Artifacts.canaryClientPath, packet.hashes.canaryClientPath],
    [packet.attempt2Artifacts.workflowPath, packet.hashes.workflowPath],
    [packet.attempt2Artifacts.reviewPacketPath, 'benchmarks/external-oss-v8/credential-transport/repair-2/review-packet.json'],
    [packet.attempt2Artifacts.reviewPacketMarkdownPath, 'benchmarks/external-oss-v8/credential-transport/repair-2/review-packet.md'],
  ]) {
    assert.equal(sha256(snapshotPath), sha256(activePath), `attempt-2 snapshot drift: ${snapshotPath}`);
  }

  const source = fs.readFileSync(path.join(ROOT, packet.hashes.proxySourcePath), 'utf8');
  assert.doesNotMatch(source, /OPENAI_API_KEY|OPENAI_BASE_URL|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN/u);
  assert.doesNotMatch(source, /sk-[A-Za-z0-9]{20,}/u);
  assert.doesNotMatch(source, /Bearer\s+[A-Za-z0-9_-]{32,}/u);
  assert.equal(fs.existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2.json')), true);
  assert.equal(fs.existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json')), false);
  assert.equal(design.modelBinding.modelId, 'gpt-5.6-luna');
  assert.equal(pendingApproval.approvalStatus, 'PENDING_HUMAN_REVIEW');
});
