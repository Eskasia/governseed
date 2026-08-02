import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(process.cwd());
const MODEL = 'gpt-5.6-luna';
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
);
const sha256 = (relativePath) => createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, relativePath)))
  .digest('hex');

test('G2 model binding is exact and consistent across the approval-prep surface', () => {
  const design = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/design.json');
  const requestSchema = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/request.schema.json');
  const responseSchema = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/response.schema.json');
  const packet = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/review-packet.json');
  const approvalSchema = readJson('benchmarks/external-oss-v8/credential-transport/human-approval.schema.json');
  const approvalTemplate = readJson('benchmarks/external-oss-v8/credential-transport/human-approval.template.json');
  const receiptSchema = readJson('benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.schema.json');
  const verdict = readJson('benchmarks/external-oss-v8/control/G2/repair-1/sol-verdict.json');
  const evidence = readJson('benchmarks/external-oss-v8/control/G2/repair-1/sol-review-evidence.json');
  const source = [
    'experimental/governance-impact/lib/credential-proxy.mjs',
    'experimental/governance-impact/lib/oci-proxy-facade.mjs',
  ].map((relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8')).join('\n');

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
    Object.fromEntries(Object.keys(candidate).map((key) => [key, packet.contract.modelBinding[key]])),
    candidate,
  );
  assert.equal(design.modelBinding.exact, true);
  assert.equal(packet.contract.modelBinding.exact, true);
  assert.equal(design.modelBinding.status, 'LOCKED_PENDING_HUMAN_APPROVAL');
  assert.equal(packet.contract.modelBinding.status, 'LOCKED_PENDING_HUMAN_APPROVAL');

  assert.equal(requestSchema.properties.model.const, MODEL);
  assert.equal(responseSchema.properties.model.const, MODEL);
  assert.equal(approvalSchema.properties.approvedModelId.const, MODEL);
  assert.equal(receiptSchema.properties.modelId.const, MODEL);
  assert.equal(approvalTemplate.approvedModelId, MODEL);
  assert.equal(approvalTemplate.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(approvalTemplate.approvedBy, null);
  assert.equal(approvalTemplate.approvedAt, null);
  assert.equal(approvalTemplate.limitationsAcknowledged, false);

  assert.match(source, /CREDENTIAL_PROXY_MODEL\s*=\s*['"]gpt-5\.6-luna['"]/u);
  assert.doesNotMatch(source, /gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(source, /fallbackModel|modelFallback|latest/u);
  assert.equal(verdict.exactModelCandidate, MODEL);
  assert.equal(evidence.independentAssessment.exactModelCandidate, MODEL);
  assert.equal(verdict.providerRequestCount, 0);
  assert.equal(evidence.independentAssessment.providerRequests, 0);

  for (const [field, relativePath] of [
    ['designSha256', packet.hashes.designPath],
    ['requestSchemaSha256', packet.hashes.requestSchemaPath],
    ['responseSchemaSha256', packet.hashes.responseSchemaPath],
    ['proxySourceSha256', packet.hashes.proxySourcePath],
  ]) {
    assert.equal(packet.hashes[field], sha256(relativePath), `hash drift: ${relativePath}`);
    assert.equal(evidence.hashVerification[field], packet.hashes[field], `Sol hash drift: ${field}`);
  }
  assert.equal(verdict.reviewPacketSha256, sha256(
    'benchmarks/external-oss-v8/credential-transport/repair-1/review-packet.json',
  ));
  assert.equal(evidence.hashVerification.reviewPacketSha256, verdict.reviewPacketSha256);

  assert.equal(fs.existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/credential-transport/human-approval.json')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json')), false);
});
