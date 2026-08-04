import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CREDENTIAL_ROOT = 'benchmarks/external-oss-v8/credential-transport';
const ATTEMPT_3_APPROVAL = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-3.json`;
const ATTEMPT_3_SOURCE = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-3-source.json`;
const ATTEMPT_3_PACKET = `${CREDENTIAL_ROOT}/repair-2/attempt-3/review-packet.json`;
const ATTEMPT_3_ADDENDUM = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-3.addendum.json`;
const ATTEMPT_3_FAILURE_ROOT = 'benchmarks/external-oss-v8/control/G2/runtime-canary-repair-3/run-30814159615';
const ATTEMPT_5_PACKET = `${CREDENTIAL_ROOT}/repair-2/attempt-5/review-packet.json`;
const ATTEMPT_5_APPROVAL = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5.json`;
const ATTEMPT_5_SOURCE = `${CREDENTIAL_ROOT}/human-approval-repair-2-attempt-5-source.json`;
const WORKFLOW = '.github/workflows/external-oss-v8-runtime-identity.yml';

function readJson(relativePath) {
  return JSON.parse(readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function originBytes(relativePath) {
  return execFileSync('git', ['show', `origin/main:${relativePath}`]);
}

test('attempt-3 manual approval/source and failed-run evidence remain immutable', () => {
  for (const relativePath of [
    ATTEMPT_3_APPROVAL,
    ATTEMPT_3_SOURCE,
    ATTEMPT_3_PACKET,
    ATTEMPT_3_ADDENDUM,
    `${ATTEMPT_3_FAILURE_ROOT}/run.json`,
    `${ATTEMPT_3_FAILURE_ROOT}/failure-artifact.json`,
    `${ATTEMPT_3_FAILURE_ROOT}/failure-review.md`,
  ]) assert.deepEqual(readFileSync(path.join(ROOT, relativePath)), originBytes(relativePath), relativePath);
});

test('attempt-3 approval does not authorize attempt-5 changed bindings', () => {
  const approval = readJson(ATTEMPT_3_APPROVAL);
  const packet = readJson(ATTEMPT_5_PACKET);
  const attempt5Approval = readJson(ATTEMPT_5_APPROVAL);
  const attempt5Source = readJson(ATTEMPT_5_SOURCE);
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedModelId, 'gpt-5.6-luna');
  assert.equal(packet.attempt, 5);
  assert.equal(packet.status, 'PENDING_HUMAN_REAPPROVAL');
  assert.match(workflow, /human-approval-repair-2-attempt-5\.template\.json/u);
  assert.match(workflow, /HUMAN_REAPPROVAL_REQUIRED/u);
  assert.equal(attempt5Approval.approvalStatus, 'APPROVED');
  assert.equal(attempt5Approval.approvedModelId, 'gpt-5.6-luna');
  assert.equal(attempt5Source.approvalEffectiveAt, attempt5Approval.approvedAt);
  assert.equal(existsSync(path.join(ROOT, ATTEMPT_5_APPROVAL)), true);
});

test('repair-5 keeps the inherited schema and exact model bindings while changing only repair sources', () => {
  const packet = readJson(ATTEMPT_5_PACKET);
  assert.equal(packet.modelBinding.provider, 'OpenAI');
  assert.equal(packet.modelBinding.modelId, 'gpt-5.6-luna');
  assert.equal(packet.modelBinding.aliasAllowed, false);
  assert.equal(packet.modelBinding.fallbackAllowed, false);
  assert.equal(packet.transport.requestLimit, 1);
  assert.equal(packet.transport.timeoutMs, 30000);
  assert.equal(packet.transport.structuredOutputPath, 'text.format');
  assert.equal(packet.hashes.designSha256, '434da5f42ae9d5752b5db6641557cec6a3893a22988225947458d287d516d995');
  assert.equal(packet.hashes.requestSchemaSha256, '630ee0eb7b1ca458b1562a676f318430b675b92b005a98c958cb3226b65afb51');
  assert.notEqual(packet.hashes.proxySourceSha256, '0d77d9f7d74daffae64d30169755b049aa00f0c9d536c3cb228b755878c57eea');
});

test('workflow does not use Models API, aliases, fallback, retries, or the old pending code', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  assert.doesNotMatch(workflow, /\/v1\/models/u);
  assert.doesNotMatch(workflow, /\blatest\b/u);
  assert.doesNotMatch(workflow, /gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(workflow, /fallback[_ -]?model|modelFallback|\b(?:retry|retries)\b/iu);
  assert.doesNotMatch(workflow, /VALIDATION_IN_PROGRESS/u);
});
