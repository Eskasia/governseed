import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return createHash('sha256')
    .update(readFileSync(path.join(ROOT, relativePath)))
    .digest('hex');
}

const design = readJson('benchmarks/external-oss-v8/credential-transport/design.json');
const reviewPacket = readJson(
  'benchmarks/external-oss-v8/credential-transport/review-packet.json',
);
const findings = readJson('benchmarks/external-oss-v8/control/G2/credential-transport-findings.json');
const inherited = readJson('benchmarks/external-oss-v8/control/G2/inherited-evidence.json');

test('G2 design has a closed fail-closed transport contract', () => {
  assert.equal(design.schemaVersion, 1);
  assert.equal(design.benchmarkId, 'GS-OSS-2026-08-02-V8');
  assert.equal(design.evidenceClass, 'external-observational');
  assert.equal(design.status, 'HARD_BLOCKED');
  assert.equal(design.transport.type, 'host-side-narrow-credential-proxy');
  assert.equal(design.transport.provider, 'OpenAI');
  assert.equal(design.transport.endpoint, 'https://api.openai.com/v1/responses');
  assert.equal(design.transport.method, 'POST');
  assert.deepEqual(design.transport.allowedClientHeaders, ['content-type']);
  assert.deepEqual(
    design.transport.hostInjectedHeaders,
    ['accept', 'authorization', 'content-type'],
  );
  assert.equal(design.transport.maxRequestBytes, 1_048_576);
  assert.equal(design.transport.maxResponseBytes, 4_194_304);
  assert.equal(design.transport.requestTimeoutMs, 30_000);
  assert.equal(design.transport.maxRequestsPerRun, 1);
  assert.equal(design.transport.maxTotalTokens, 8_192);
});

test('G2 schema files are closed at their transport boundaries', () => {
  const request = readJson('benchmarks/external-oss-v8/credential-transport/request.schema.json');
  const response = readJson('benchmarks/external-oss-v8/credential-transport/response.schema.json');
  const canary = readJson('benchmarks/external-oss-v8/runtime-identity/canary-response.schema.json');
  assert.equal(request.type, 'object');
  assert.equal(request.additionalProperties, false);
  assert.equal(response.type, 'object');
  assert.equal(response.additionalProperties, false);
  assert.equal(canary.type, 'object');
  assert.equal(canary.additionalProperties, false);
  assert.deepEqual(canary.required, ['runtime_canary']);
  assert.equal(canary.properties.runtime_canary.const, 'PASS');
});

test('human approval schema is closed and binds the required scope', () => {
  const approval = readJson(
    'benchmarks/external-oss-v8/credential-transport/human-approval.schema.json',
  );
  assert.equal(approval.type, 'object');
  assert.equal(approval.additionalProperties, false);
  assert.deepEqual(approval.required, [
    'schemaVersion',
    'benchmarkId',
    'approvalStatus',
    'approvedBy',
    'approvedAt',
    'approvedDesignSha256',
    'approvedProxySha256',
    'approvedModelId',
    'scope',
    'limitationsAcknowledged',
    'approvalEvidence',
  ]);
  assert.equal(approval.properties.approvalStatus.const, 'APPROVED');
  assert.equal(approval.properties.limitationsAcknowledged.const, true);
});

test('runtime identity receipt schema is closed and claim-bounded', () => {
  const receipt = readJson(
    'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.schema.json',
  );
  assert.equal(receipt.type, 'object');
  assert.equal(receipt.additionalProperties, false);
  assert.equal(receipt.properties.status.const, 'READY');
  assert.equal(receipt.properties.claimDisposition.const, 'RUNTIME_IDENTITY_ONLY');
  assert.equal(receipt.properties.containerCredentialNamesObserved.const, false);
  assert.equal(receipt.properties.networkNoneObserved.const, true);
});

test('G2 human approval is required and is not fabricated', () => {
  assert.equal(design.humanApproval.required, true);
  assert.equal(design.humanApproval.present, false);
  assert.equal(design.transport.modelBinding.candidate, null);
  assert.equal(design.transport.modelBinding.selectionStatus, 'PENDING_HUMAN_SELECTION');
  assert.equal(existsSync(path.join(
    ROOT,
    'benchmarks/external-oss-v8/credential-transport/human-approval.json',
  )), false);
});

test('review packet records the current G2 test count and Sol disposition', () => {
  assert.equal(reviewPacket.g2Tests.proxyChecks, 22);
  assert.equal(reviewPacket.g2Tests.schemaChecks, 9);
  assert.equal(reviewPacket.g2Tests.passed, 31);
  assert.equal(reviewPacket.g2Tests.failed, 0);
  assert.equal(reviewPacket.solTechnicalRecommendation, 'REJECT');
  assert.equal(
    reviewPacket.proxyRelayPath,
    'experimental/governance-impact/uds-relay.mjs',
  );
});

test('G2 findings cover all requested proxy checks', () => {
  assert.equal(findings.checks.length, 22);
  assert.deepEqual(findings.summary, {
    total: 22,
    pass: 9,
    blocked: 13,
    notRun: 0,
  });
  assert.equal(new Set(findings.checks.map((entry) => entry.id)).size, 22);
  assert.ok(findings.checks.every((entry) => ['PASS', 'BLOCKED'].includes(entry.result)));
  assert.ok(findings.checks.some((entry) => entry.result === 'BLOCKED'));
});

test('G1 inherited evidence is independently hash-revalidated', () => {
  assert.equal(inherited.g1.runId, 30739570734);
  assert.equal(inherited.g1.status, 'ACCEPTED');
  assert.equal(inherited.revalidation.sourceCount, 30);
  assert.equal(inherited.revalidation.totalRevalidatedSources, 31);
  assert.equal(inherited.revalidation.allMatches, true);
  assert.equal(inherited.revalidation.immutableG1EvidenceChanged, false);
  assert.ok(inherited.reviewContext.revalidatedContentHash);
  for (const entry of [inherited.reviewContext, ...inherited.sources]) {
    assert.equal(entry.revalidatedContentHash, true, entry.path ?? entry.sourcePath);
    const relativePath = entry.sourcePath ?? entry.path;
    assert.equal(sha256(relativePath), entry.sourceSha256, relativePath);
  }
});

test('runtime identity workflow and receipt are absent before human approval', () => {
  assert.equal(existsSync(path.join(
    ROOT,
    '.github/workflows/external-oss-v8-runtime-identity.yml',
  )), false);
  assert.equal(existsSync(path.join(
    ROOT,
    'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json',
  )), false);
});
