import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CREDENTIAL_ROOT = path.join(ROOT, 'benchmarks/external-oss-v8/credential-transport');
const CURRENT_WORKFLOW = '.github/workflows/external-oss-v8-runtime-identity.yml';
const ATTEMPT_4_APPROVAL = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-4.json';
const ATTEMPT_4_SOURCE = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-4-source.json';
const ATTEMPT_4_PACKET = 'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-4/review-packet.json';
const ATTEMPT_4_MANIFEST = 'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-4/technical-manifest.json';
const ATTEMPT_4_ADDENDUM = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-4.addendum.json';
const ATTEMPT_4_TEMPLATE = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-4.template.json';
const ATTEMPT_4_FAILURE_ROOT = 'benchmarks/external-oss-v8/control/G2/runtime-canary-repair-4/run-30824406710';
const ATTEMPT_5_PACKET = 'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-5/review-packet.json';
const ATTEMPT_5_MANIFEST = 'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-5/technical-manifest.json';
const ATTEMPT_5_TEMPLATE = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-5.template.json';
const ATTEMPT_5_ADDENDUM = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-5.addendum.json';
const ATTEMPT_5_APPROVAL = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-5.json';
const ATTEMPT_5_SOURCE = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-5-source.json';

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function sha256File(relativePath) {
  return createHash('sha256').update(readFileSync(path.join(ROOT, relativePath))).digest('hex');
}

function originBytes(relativePath) {
  return execFileSync('git', ['show', `origin/main:${relativePath}`]);
}

test('attempt-4 approval and evidence records remain byte-for-byte immutable', () => {
  for (const relativePath of [
    ATTEMPT_4_APPROVAL,
    ATTEMPT_4_SOURCE,
    ATTEMPT_4_PACKET,
    ATTEMPT_4_MANIFEST,
    ATTEMPT_4_ADDENDUM,
    ATTEMPT_4_TEMPLATE,
    `${ATTEMPT_4_FAILURE_ROOT}/run.json`,
    `${ATTEMPT_4_FAILURE_ROOT}/failure-artifact.json`,
    `${ATTEMPT_4_FAILURE_ROOT}/failure-review.md`,
  ]) {
    assert.deepEqual(readFileSync(path.join(ROOT, relativePath)), originBytes(relativePath), relativePath);
  }
});

test('attempt-4 approval remains approved but cannot authorize changed attempt-5 files', () => {
  const approval = readJson(ATTEMPT_4_APPROVAL);
  const workflow = readFileSync(path.join(ROOT, CURRENT_WORKFLOW), 'utf8');
  const packet = readJson(ATTEMPT_5_PACKET);
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedBy, 'Eskasia');
  assert.equal(packet.attempt, 5);
  assert.equal(packet.status, 'PENDING_HUMAN_REAPPROVAL');
  assert.match(workflow, /attempt-5\/technical-manifest\.json/u);
  assert.match(workflow, /human-approval-repair-2-attempt-5\.template\.json/u);
  assert.match(workflow, /HUMAN_REAPPROVAL_REQUIRED/u);
  assert.doesNotMatch(workflow, /providerRequestCount/u);
});

test('attempt-5 manifest is exact, current, and excludes evidence-only paths', () => {
  const manifest = readJson(ATTEMPT_5_MANIFEST);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.benchmarkId, 'GS-OSS-2026-08-02-V8');
  assert.equal(manifest.gate, 'G2');
  assert.equal(manifest.repair, 'repair-2');
  assert.equal(manifest.attempt, 5);
  assert.equal(manifest.entries.length, 13);
  for (const entry of manifest.entries) assert.equal(sha256File(entry.path), entry.sha256, entry.path);
  const paths = new Set(manifest.entries.map((entry) => entry.path));
  for (const excluded of [ATTEMPT_5_PACKET, ATTEMPT_5_MANIFEST, ATTEMPT_5_ADDENDUM, `${ATTEMPT_5_TEMPLATE}`]) {
    assert.equal(paths.has(excluded), false, excluded);
  }
});

test('attempt-5 approval record is verified without changing pending inputs', () => {
  const packet = readJson(ATTEMPT_5_PACKET);
  const pending = readJson(ATTEMPT_5_TEMPLATE);
  const addendum = readJson(ATTEMPT_5_ADDENDUM);
  const approval = readJson(ATTEMPT_5_APPROVAL);
  const source = readJson(ATTEMPT_5_SOURCE);
  assert.equal(packet.modelBinding.provider, 'OpenAI');
  assert.equal(packet.modelBinding.modelId, 'gpt-5.6-luna');
  assert.equal(packet.modelBinding.aliasAllowed, false);
  assert.equal(packet.modelBinding.fallbackAllowed, false);
  assert.equal(pending.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(pending.approvedBy, null);
  assert.equal(pending.approvedAt, null);
  assert.equal(pending.approvedModelId, 'gpt-5.6-luna');
  assert.equal(addendum.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(addendum.workflowDispatch, 'NOT_RUN');
  assert.equal(addendum.runtimeCanary, 'NOT_RUN');
  assert.equal(addendum.providerRequests, 0);
  assert.equal(addendum.newBindingHashes.reviewPacketSha256, sha256File(ATTEMPT_5_PACKET));
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedBy, 'Eskasia');
  assert.equal(approval.approvedModelId, 'gpt-5.6-luna');
  assert.equal(approval.limitationsAcknowledged, true);
  assert.equal(approval.approvalEvidence.commentId, 5176356972);
  assert.equal(source.commentBodySha256, '41a47521099af120135d4ddb65aa10cf6f4180b3271ed904cf95d277ecc58840');
  assert.equal(source.approvalEffectiveAt, approval.approvedAt);
  assert.equal(existsSync(path.join(ROOT, ATTEMPT_5_APPROVAL)), true);
});

test('workflow has exact image, node, model, staged failures, and no alternate model path', () => {
  const workflow = readFileSync(path.join(ROOT, CURRENT_WORKFLOW), 'utf8');
  assert.match(workflow, /node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5/u);
  assert.match(workflow, /--entrypoint \/usr\/local\/bin\/node/u);
  assert.match(workflow, /v26\.3\.0/u);
  assert.match(workflow, /gpt-5\.6-luna/u);
  assert.doesNotMatch(workflow, /\/v1\/models/u);
  assert.doesNotMatch(workflow, /\blatest\b/u);
  assert.doesNotMatch(workflow, /gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(workflow, /fallback[_ -]?model|modelFallback|\b(?:retry|retries)\b/iu);
  for (const stage of [
    'binding-validation',
    'node-preflight',
    'image-pull',
    'harness-stage',
    'proxy-start',
    'container-create',
    'container-environment-validation',
    'uds-connect',
    'proxy-request-validation',
    'upstream-request',
    'provider-response-validation',
    'canary-output-validation',
    'evidence-assembly',
  ]) assert.match(workflow, new RegExp(stage, 'u'));
});

test('old repair-4 source failure remains preserved and is not reinterpreted by repair-5', () => {
  const run = readJson(`${ATTEMPT_4_FAILURE_ROOT}/run.json`);
  const artifact = readJson(`${ATTEMPT_4_FAILURE_ROOT}/failure-artifact.json`);
  assert.equal(run.runId, '30824406710');
  assert.equal(run.providerRequestCount, 0);
  assert.equal(run.runtimeCanary, 'NOT_RUN');
  assert.equal(artifact.providerRequestCount, 0);
  assert.equal(artifact.failureCode, 'REPAIRED_BINDING_INVALID');
});
