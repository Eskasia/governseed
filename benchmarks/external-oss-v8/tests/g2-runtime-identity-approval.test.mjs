import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CREDENTIAL_ROOT = 'benchmarks/external-oss-v8/credential-transport';
const PREP = 'benchmarks/external-oss-v8/control/G2/runtime-canary-prep/prep.json';
const WORKFLOW = '.github/workflows/external-oss-v8-runtime-identity.yml';
const PACKET = `${CREDENTIAL_ROOT}/repair-2/attempt-6/review-packet.json`;
const MANIFEST = `${CREDENTIAL_ROOT}/repair-2/attempt-6/technical-manifest.json`;
const TEMPLATE = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-6.template.json`;
const ADDENDUM = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-6.addendum.json`;
const APPROVED = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5.json`;
const APPROVED_SOURCE = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5-source.json`;
const ATTEMPT_4_APPROVAL = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-4.json`;
const ATTEMPT_4_SOURCE = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-4-source.json`;

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256(relativePath) {
  return createHash('sha256').update(readFileSync(path.join(ROOT, relativePath))).digest('hex');
}

function originBytes(relativePath) {
  return execFileSync('git', ['show', `origin/main:${relativePath}`]);
}

test('prior human approvals and sanitized source records remain immutable', () => {
  for (const relativePath of [
    `${CREDENTIAL_ROOT}/human-approval.json`,
    `${CREDENTIAL_ROOT}/human-approval-source.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2.json`,
    `${CREDENTIAL_ROOT}/human-approval-repair-2-source.json`,
    ATTEMPT_4_APPROVAL,
    ATTEMPT_4_SOURCE,
  ]) assert.deepEqual(readFileSync(path.join(ROOT, relativePath)), originBytes(relativePath), relativePath);
});

test('repair-6 preparation keeps attempt-5 approval immutable and binds current hashes', () => {
  const packet = readJson(PACKET);
  const addendum = readJson(ADDENDUM);
  const pending = readJson(TEMPLATE);
  const approval = readJson(APPROVED);
  const source = readJson(APPROVED_SOURCE);
  assert.deepEqual(packet.modelBinding, {
    provider: 'OpenAI',
    modelId: 'gpt-5.6-luna',
    aliasAllowed: false,
    fallbackAllowed: false,
  });
  assert.equal(packet.status, 'PENDING_HUMAN_REPAIR_6_REVIEW');
  assert.equal(packet.hashes.workflowSha256, sha256(WORKFLOW));
  assert.equal(packet.hashes.technicalManifestSha256, sha256(MANIFEST));
  assert.equal(addendum.workflowSha256, sha256(WORKFLOW));
  assert.equal(addendum.reviewPacketSha256, sha256(PACKET));
  assert.equal(addendum.technicalManifestSha256, sha256(MANIFEST));
  assert.equal(pending.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(pending.approvedBy, null);
  assert.equal(pending.approvedAt, null);
  assert.equal(pending.approvedProxySha256, packet.hashes.proxySourceSha256);
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedBy, 'Eskasia');
  assert.equal(approval.approvedAt, '2026-08-04T08:15:01Z');
  assert.equal(approval.approvedModelId, 'gpt-5.6-luna');
  assert.equal(approval.limitationsAcknowledged, true);
  assert.equal(approval.approvalEvidence.type, 'github-comment');
  assert.equal(approval.approvalEvidence.commentId, 5176356972);
  assert.equal(source.approvalEffectiveAt, approval.approvedAt);
  assert.equal(source.commentBodySha256.length, 64);
  assert.equal(existsSync(path.join(ROOT, APPROVED)), true);
});

test('exact model, transport, and runtime preparation remain provider-free', () => {
  const prep = readJson(PREP);
  const packet = readJson(PACKET);
  assert.deepEqual(prep.modelBinding, packet.modelBinding);
  assert.equal(prep.requestLimit, 1);
  assert.equal(prep.timeoutMs, 30000);
  assert.equal(prep.canaryInput, packet.transport.fixedInput);
  assert.equal(prep.providerRequests, 0);
  assert.equal(prep.runtimeCanary, 'NOT_RUN');
  assert.equal(packet.evidence.providerRequests, 0);
  assert.equal(packet.evidence.workflowDispatch, 'NOT_RUN');
  assert.equal(packet.evidence.runtimeCanary, 'NOT_RUN');
  assert.equal(packet.runtime.image, 'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5');
  assert.equal(packet.runtime.nodeExecutable, '/usr/local/bin/node');
  assert.equal(packet.runtime.nodeVersion, 'v26.3.0');
});

test('runtime workflow is manual, main-only, credential-hosted, and no model discovery', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.doesNotMatch(workflow, /^\s{2}(push|pull_request|workflow_call):/mu);
  assert.match(workflow, /AUTHORIZED_REF\s*!==\s*['"]refs\/heads\/main['"]/u);
  assert.match(workflow, /runs-on:\s*ubuntu-24\.04/u);
  assert.match(workflow, /persist-credentials:\s*false/u);
  assert.equal((workflow.match(/\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/gu) ?? []).length, 1);
  const canarySection = workflow.slice(workflow.indexOf('- name: Create isolated'), workflow.indexOf('- name: Stop host-side'));
  assert.doesNotMatch(canarySection, /(?:--env|-e)\s+OPENAI_API_KEY/u);
  assert.match(workflow, /--network none/u);
  assert.match(workflow, /--read-only/u);
  assert.match(workflow, /--user "\$PROXY_UID:\$PROXY_GID"/u);
  assert.match(workflow, /gpt-5\.6-luna/u);
  assert.doesNotMatch(workflow, /\/v1\/models|\blatest\b|gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(workflow, /fallback[_ -]?model|modelFallback|\b(?:retry|retries)\b/iu);
});

test('human approval schema remains closed and runtime receipt remains absent', () => {
  const schema = readJson(`${CREDENTIAL_ROOT}/human-approval.schema.json`);
  assert.equal(schema.properties.approvalEvidence.additionalProperties, false);
  assert.equal(schema.properties.approvalEvidence.properties.commentId.type, 'integer');
  assert.equal(existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json')), false);
});
