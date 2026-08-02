import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(process.cwd());
const MODEL = 'gpt-5.6-luna';
const REPAIR_2 = 'benchmarks/external-oss-v8/credential-transport/repair-2';
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
);
const sha256 = (relativePath) => createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, relativePath)))
  .digest('hex');

test('G2 repair-2 model binding is exact and consistent across every active surface', () => {
  const design = readJson(`${REPAIR_2}/design.json`);
  const requestSchema = readJson(`${REPAIR_2}/request.schema.json`);
  const responseSchema = readJson(`${REPAIR_2}/response.schema.json`);
  const packet = readJson(`${REPAIR_2}/review-packet.json`);
  const approvalSchema = readJson('benchmarks/external-oss-v8/credential-transport/human-approval.schema.json');
  const pendingApproval = readJson('benchmarks/external-oss-v8/credential-transport/human-approval-repair-2.template.json');
  const oldApproval = readJson('benchmarks/external-oss-v8/credential-transport/human-approval.json');
  const receiptSchema = readJson('benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.schema.json');
  const prep = readJson('benchmarks/external-oss-v8/control/G2/runtime-canary-prep/prep.json');
  const source = fs.readFileSync(path.join(ROOT, 'experimental/governance-impact/lib/credential-proxy.mjs'), 'utf8');

  const candidate = {
    provider: 'OpenAI',
    modelId: MODEL,
    aliasAllowed: false,
    fallbackAllowed: false,
  };
  assert.deepEqual(
    Object.fromEntries(Object.keys(candidate).map((key) => [key, design.modelBinding[key]])),
    candidate,
  );
  assert.deepEqual(
    Object.fromEntries(Object.keys(candidate).map((key) => [key, packet.modelBinding[key]])),
    candidate,
  );
  assert.deepEqual(prep.modelBinding, candidate);
  assert.equal(design.modelBinding.exact, true);
  assert.equal(packet.modelBinding.exact, true);
  assert.equal(design.modelBinding.status, 'PENDING_HUMAN_REAPPROVAL');
  assert.equal(packet.modelBinding.status, 'PENDING_HUMAN_REAPPROVAL');

  assert.equal(requestSchema.properties.model.const, MODEL);
  assert.equal(responseSchema.properties.model.const, MODEL);
  assert.equal(approvalSchema.properties.approvedModelId.const, MODEL);
  assert.equal(receiptSchema.properties.modelId.const, MODEL);
  assert.equal(pendingApproval.approvedModelId, MODEL);
  assert.equal(pendingApproval.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(pendingApproval.approvedBy, null);
  assert.equal(pendingApproval.approvedAt, null);
  assert.equal(pendingApproval.limitationsAcknowledged, false);
  assert.equal(oldApproval.approvalStatus, 'APPROVED');
  assert.equal(oldApproval.approvedBy, 'Eskasia');
  assert.equal(oldApproval.approvedModelId, MODEL);
  assert.notEqual(oldApproval.approvedDesignSha256, packet.hashes.designSha256);
  assert.notEqual(oldApproval.approvedProxySha256, packet.hashes.proxySourceSha256);

  assert.equal(requestSchema.properties.text.properties.format.properties.name.const, 'governseed_runtime_canary');
  assert.equal(requestSchema.properties.text.properties.format.properties.strict.const, true);
  assert.equal(requestSchema.properties.text.properties.format.properties.schema.properties.required.const[0], 'runtime_canary');
  assert.equal(responseSchema.properties.model.const, MODEL);
  assert.deepEqual(packet.transport.responseEnvelopeFields, ['id', 'model', 'output', 'usage']);
  assert.equal(packet.transport.responseModelId, MODEL);
  assert.equal(packet.transport.structuredOutputPath, 'text.format');
  assert.equal(packet.providerRequests, 0);
  assert.equal(prep.providerRequests, 0);
  assert.match(source, /CREDENTIAL_PROXY_MODEL\s*=\s*['"]gpt-5\.6-luna['"]/u);
  assert.doesNotMatch(source, /gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(source, /fallbackModel|modelFallback|latest|response_format/u);

  for (const [field, relativePath] of [
    ['designSha256', packet.hashes.designPath],
    ['requestSchemaSha256', packet.hashes.requestSchemaPath],
    ['responseSchemaSha256', packet.hashes.responseSchemaPath],
    ['proxySourceSha256', packet.hashes.proxySourcePath],
  ]) {
    assert.equal(packet.hashes[field], sha256(relativePath), `hash drift: ${relativePath}`);
  }
  assert.equal(fs.existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2.json')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json')), false);
});
