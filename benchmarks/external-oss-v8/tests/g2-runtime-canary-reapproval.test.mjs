import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CREDENTIAL_ROOT = 'benchmarks/external-oss-v8/credential-transport';
const APPROVAL = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5.json`;
const SOURCE = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5-source.json`;
const TEMPLATE = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5.template.json`;
const ADDENDUM = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5.addendum.json`;
const SCHEMA = `${CREDENTIAL_ROOT}/human-approval.schema.json`;
const PACKET = `${CREDENTIAL_ROOT}/repair-2/attempt-5/review-packet.json`;
const MANIFEST = `${CREDENTIAL_ROOT}/repair-2/attempt-5/technical-manifest.json`;
const CURRENT_MANIFEST = `${CREDENTIAL_ROOT}/repair-2/attempt-6/technical-manifest.json`;
const TECHNICAL_HEAD = 'b7e7d34e68031671dee41fe7fe13800accae3e51';
const PRE_APPROVAL_HEAD = '1a37ec4b92b8eafbae04e347ccad0788a2e99dca';
const COMMENT_BODY_SHA256 = '41a47521099af120135d4ddb65aa10cf6f4180b3271ed904cf95d277ecc58840';

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function bytes(relativePath) {
  return readFileSync(path.join(ROOT, relativePath));
}

function sha256(relativePath) {
  return createHash('sha256').update(bytes(relativePath)).digest('hex');
}

function gitBytes(revision, relativePath) {
  return execFileSync('git', ['show', `${revision}:${relativePath}`]);
}

test('attempt-5 approval record is closed-schema valid and uses effective GitHub time', () => {
  const schema = readJson(SCHEMA);
  const approval = readJson(APPROVAL);
  const source = readJson(SOURCE);
  assert.deepEqual(Object.keys(approval).sort(), Object.keys(schema.properties).sort());
  assert.deepEqual(
    Object.keys(approval.approvalEvidence).sort(),
    Object.keys(schema.properties.approvalEvidence.properties).sort(),
  );
  assert.equal(approval.schemaVersion, 1);
  assert.equal(approval.benchmarkId, 'GS-OSS-2026-08-02-V8');
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedBy, 'Eskasia');
  assert.match(approval.approvedAt, /^2026-08-04T08:15:01Z$/u);
  assert.equal(approval.approvedDesignSha256, '434da5f42ae9d5752b5db6641557cec6a3893a22988225947458d287d516d995');
  assert.equal(approval.approvedProxySha256, 'f9dd7b6a0778e69f123d060a8df8cef1ab97e63756e7f819cf70d8d6ed85790c');
  assert.equal(approval.approvedModelId, 'gpt-5.6-luna');
  assert.deepEqual(approval.scope, ['credential-transport', 'runtime-identity-canary', 'v8-pilot']);
  assert.equal(approval.limitationsAcknowledged, true);
  assert.equal(approval.approvalEvidence.type, 'github-comment');
  assert.equal(approval.approvalEvidence.reference, 'https://github.com/Eskasia/governseed/pull/80#issuecomment-5176356972');
  assert.equal(approval.approvalEvidence.commentId, 5176356972);
  assert.equal(approval.approvalEvidence.commentAuthor, 'Eskasia');
  assert.equal(approval.approvalEvidence.commentCreatedAt, '2026-08-04T08:15:01Z');
  assert.equal(source.approvedAtDeclared, '2026-08-04T08:09:00Z');
  assert.equal(source.approvalEffectiveAt, source.commentCreatedAt);
  assert.equal(source.approvalEffectiveAt, approval.approvedAt);
  assert.notEqual(source.approvedAtDeclared, source.approvalEffectiveAt);
});

test('approval source binds the exact API comment hash and all attempt-5 claims', () => {
  const source = readJson(SOURCE);
  const packet = readJson(PACKET);
  assert.equal(source.commentId, 5176356972);
  assert.equal(source.commentAuthor, 'Eskasia');
  assert.equal(source.commentCreatedAt, '2026-08-04T08:15:01Z');
  assert.equal(source.commentUpdatedAt, '2026-08-04T08:15:01Z');
  assert.equal(source.commentBodySha256, COMMENT_BODY_SHA256);
  assert.equal(source.reviewedTechnicalHead, TECHNICAL_HEAD);
  assert.equal(source.reviewedTechnicalTreeSha, '2492683260127bc118f090a8f1808da367264dbc');
  assert.equal(source.finalEvidenceHead, PRE_APPROVAL_HEAD);
  assert.equal(source.finalEvidenceTreeSha, 'b5196c37d87ad121a5cc3693fac588b8c6567950');
  assert.equal(source.technicalManifestEntries, 13);
  assert.equal(source.workflowSha256, packet.hashes.workflowSha256);
  assert.equal(source.canaryClientSha256, packet.hashes.canaryClientSha256);
  assert.equal(source.hostProxySha256, packet.hashes.hostProxySha256);
  assert.equal(source.credentialProxySha256, packet.hashes.proxySourceSha256);
  assert.equal(source.reviewPacketSha256, sha256(PACKET));
  assert.equal(source.technicalManifestSha256, sha256(MANIFEST));
  assert.equal(source.bodyClaims.approvedModelId, 'gpt-5.6-luna');
  assert.equal(source.bodyClaims.aliasAllowed, false);
  assert.equal(source.bodyClaims.fallbackAllowed, false);
  assert.equal(source.bodyClaims.requestLimit, 1);
  assert.equal(source.bodyClaims.fixedCanaryInput, packet.transport.fixedInput);
  assert.equal(source.failedRun.runId, '30850478318');
  assert.equal(source.failedRun.providerRequestAttempt, 'INDETERMINATE');
  assert.equal(source.failedRun.rerunPermitted, false);
  assert.equal(source.newProviderRequestAuthorized, false);
  assert.equal(source.credentialPresent, false);
  assert.equal(source.rawApprovalBodyPersisted, false);
  assert.equal('body' in source, false);
});

test('pending template and addendum are byte-identical to the pre-approval inputs', () => {
  for (const relativePath of [TEMPLATE, ADDENDUM]) {
    assert.deepEqual(bytes(relativePath), gitBytes(PRE_APPROVAL_HEAD, relativePath), relativePath);
  }
  const pending = readJson(TEMPLATE);
  const addendum = readJson(ADDENDUM);
  assert.equal(pending.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(pending.approvedBy, null);
  assert.equal(pending.approvedAt, null);
  assert.equal(pending.limitationsAcknowledged, false);
  assert.equal(addendum.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(addendum.providerRequests, 0);
  assert.equal(addendum.workflowDispatch, 'NOT_RUN');
  assert.equal(addendum.runtimeCanary, 'NOT_RUN');
});

test('attempt-4 and earlier approval/source records remain byte-for-byte immutable', () => {
  for (const relativePath of [
    `${CREDENTIAL_ROOT}/human-approval.json`,
    `${CREDENTIAL_ROOT}/human-approval-source.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2-source.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-3.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-3-source.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-4.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-4-source.json`,
  ]) assert.deepEqual(bytes(relativePath), gitBytes('origin/main', relativePath), relativePath);
});

test('technical manifest and all 13 historical entries remain unchanged after approval', () => {
  assert.deepEqual(bytes(MANIFEST), gitBytes(TECHNICAL_HEAD, MANIFEST));
  const manifest = readJson(MANIFEST);
  assert.equal(manifest.entries.length, 13);
  assert.deepEqual(bytes(MANIFEST), gitBytes('origin/main', MANIFEST));
  const currentManifest = readJson(CURRENT_MANIFEST);
  assert.equal(currentManifest.entries.length, 13);
  for (const entry of currentManifest.entries) {
    const historical = createHash('sha256').update(gitBytes('origin/main', entry.path)).digest('hex');
    assert.equal(historical, entry.sha256, entry.path);
  }
});

test('approval records no runtime receipt, dispatch, provider request, or secret', () => {
  const source = readJson(SOURCE);
  const workflow = readFileSync(path.join(ROOT, '.github/workflows/external-oss-v8-runtime-identity.yml'), 'utf8');
  assert.equal(source.providerRequestAttempt, 'INDETERMINATE');
  assert.equal(source.newProviderRequestAuthorized, false);
  assert.equal(source.rerunPermitted, false);
  assert.equal(source.rawApprovalBodyPersisted, false);
  assert.equal(source.authorizationHeaderPersisted, false);
  assert.equal(source.apiKeyPersisted, false);
  assert.equal(existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json')), false);
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^\s{2}(push|pull_request|workflow_call):/mu);
});
