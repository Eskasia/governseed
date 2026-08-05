import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  sha256ExactUtf8,
  validateEvent,
  validatePolicy,
  verifyApiComment,
  verifyBranch,
  verifyControlPlane,
  verifySequence,
} from '../../scripts/lib/candidate-control-plane.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const POLICY_PATH = path.join(ROOT, 'benchmarks/external-oss-v8/control/policy/candidate-control-plane-policy.json');
const POLICY_SCHEMA_PATH = path.join(ROOT, 'benchmarks/external-oss-v8/control/policy/candidate-control-plane-policy.schema.json');
const EVENT_SCHEMA_PATH = path.join(ROOT, 'benchmarks/external-oss-v8/control/policy/external-comment-event.schema.json');
const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));

function clone(value) {
  return structuredClone(value);
}

function actionBoundary(providerRequest = 'NOT_RUN') {
  return {
    providerRequest,
    workflowDispatch: 'NOT_RUN',
    prReadiness: 'NOT_RUN',
    merge: 'NOT_RUN',
    formalLock: 'NOT_RUN',
    pilot: 'NOT_RUN',
    confirmatoryExecution: 'NOT_RUN',
    scoring: 'NOT_RUN',
    benchmarkAcceptance: 'NOT_RUN',
  };
}

function eventFor(body = 'append-only event', sequence = 1, previousEvent = null) {
  const id = 5190734870 + sequence;
  const timestamp = `2026-08-05T10:42:${String(20 + sequence).padStart(2, '0')}Z`;
  return {
    schemaVersion: 1,
    policyId: policy.policyId,
    sequence,
    eventType: sequence === 1 ? 'OWNER_DECISION' : 'CONTROL_BINDING',
    candidate: {
      repository: policy.scope.repository,
      pullRequest: policy.scope.pullRequest,
      baseSha: policy.candidateFreeze.baseSha,
      headSha: policy.candidateFreeze.headSha,
      treeSha: policy.candidateFreeze.treeSha,
      validationRun: policy.candidateFreeze.validationRun,
    },
    comment: {
      id,
      url: `https://github.com/Eskasia/governseed/issues/88#issuecomment-${id}`,
      author: 'Eskasia',
      authorAssociation: 'OWNER',
      createdAt: timestamp,
      updatedAt: timestamp,
      bodySha256: sha256ExactUtf8(body),
    },
    previousEvent,
    actionBoundary: actionBoundary(),
  };
}

function apiComment(event, body = 'append-only event') {
  return {
    id: event.comment.id,
    html_url: event.comment.url,
    user: { login: event.comment.author },
    author_association: event.comment.authorAssociation,
    created_at: event.comment.createdAt,
    updated_at: event.comment.updatedAt,
    body,
  };
}

function assertRecursivelyClosed(schema, location = '$') {
  if (!schema || typeof schema !== 'object') return;
  if (schema.type === 'object') assert.equal(schema.additionalProperties, false, `${location} must be closed`);
  for (const key of ['properties', '$defs']) {
    for (const [name, child] of Object.entries(schema[key] ?? {})) assertRecursivelyClosed(child, `${location}.${key}.${name}`);
  }
  if (schema.items) assertRecursivelyClosed(schema.items, `${location}.items`);
  for (const [index, child] of (schema.anyOf ?? []).entries()) assertRecursivelyClosed(child, `${location}.anyOf[${index}]`);
}

test('policy and event schemas are recursively closed', () => {
  assertRecursivelyClosed(JSON.parse(fs.readFileSync(POLICY_SCHEMA_PATH, 'utf8')));
  assertRecursivelyClosed(JSON.parse(fs.readFileSync(EVENT_SCHEMA_PATH, 'utf8')));
});

test('committed policy is valid and rejects an additional field', () => {
  assert.deepEqual(validatePolicy(policy), []);
  assert.match(validatePolicy({ ...policy, unexpected: true }).join('\n'), /closed-shape/u);
  const missing = clone(policy);
  delete missing.bodyHash;
  assert.match(validatePolicy(missing).join('\n'), /closed-shape/u);
});

test('exact API body bytes verify without a shell delimiter', () => {
  const event = eventFor();
  assert.deepEqual(verifyControlPlane({
    policy,
    event,
    apiComment: apiComment(event),
    observedHead: policy.candidateFreeze.headSha,
    observedTree: policy.candidateFreeze.treeSha,
  }), []);
});

test('a digest computed with a CLI-added LF is rejected', () => {
  const event = eventFor();
  event.comment.bodySha256 = sha256ExactUtf8('append-only event\n');
  assert.match(verifyApiComment(event, apiComment(event)).join('\n'), /sha256-mismatch/u);
});

test('metadata drift and edited comments fail closed', () => {
  const event = eventFor();
  const drifted = apiComment(event);
  drifted.user.login = 'someone-else';
  assert.match(verifyApiComment(event, drifted).join('\n'), /user\.login:mismatch/u);
  event.comment.updatedAt = '2026-08-05T10:43:59Z';
  assert.match(validateEvent(event, policy).join('\n'), /edited/u);
});

test('append-only sequence binds the prior event and permits only the open tail to be unbound', () => {
  const first = eventFor();
  const second = eventFor('control binding', 2, {
    sequence: first.sequence,
    commentId: first.comment.id,
    bodySha256: first.comment.bodySha256,
  });
  assert.deepEqual(verifySequence(first, second, policy), []);
  const broken = clone(second);
  broken.previousEvent.bodySha256 = '0'.repeat(64);
  assert.match(verifySequence(first, broken, policy).join('\n'), /bodySha256:mismatch/u);
  assert.equal(policy.liveControlPlane.chain.tailMayRemainUnboundUntilNextEvent, true);
});

test('candidate freeze rejects head and tree drift', () => {
  assert.match(verifyBranch(policy, {
    observedHead: '0'.repeat(40),
    observedTree: policy.candidateFreeze.treeSha,
  }).join('\n'), /observedHead:freeze-drift/u);
  assert.match(verifyBranch(policy, {
    observedHead: policy.candidateFreeze.headSha,
    observedTree: '0'.repeat(40),
  }).join('\n'), /observedTree:freeze-drift/u);
});

test('candidate rejects live control paths and checkpoint rejects non-control paths', () => {
  const frozen = { observedHead: policy.candidateFreeze.headSha, observedTree: policy.candidateFreeze.treeSha };
  assert.match(verifyBranch(policy, {
    ...frozen,
    branchRole: 'candidate',
    changedPaths: ['benchmarks/external-oss-v8/control/loop/reconciliation/checker.json'],
  }).join('\n'), /candidate-control-write/u);
  assert.deepEqual(verifyBranch(policy, {
    ...frozen,
    branchRole: 'control-checkpoint',
    changedPaths: ['benchmarks/external-oss-v8/control/loop/reconciliation/checker.json'],
  }), []);
  assert.match(verifyBranch(policy, {
    ...frozen,
    branchRole: 'control-checkpoint',
    changedPaths: ['scripts/runtime.mjs'],
  }).join('\n'), /outside-checkpoint-scope/u);
});

test('closed event shape and action boundaries reject expansion', () => {
  const event = eventFor();
  assert.deepEqual(validateEvent(event, policy), []);
  assert.match(validateEvent({ ...event, extra: true }, policy).join('\n'), /closed-shape/u);
  const missing = clone(event);
  delete missing.comment;
  assert.match(validateEvent(missing, policy).join('\n'), /closed-shape/u);
  event.actionBoundary.merge = 'RUN';
  assert.match(validateEvent(event, policy).join('\n'), /actionBoundary\.merge/u);
});

test('each gated action is valid only on its matching event type', () => {
  const merge = eventFor();
  merge.eventType = 'MERGE';
  merge.actionBoundary.merge = 'AUTHORIZED_AND_RUN';
  assert.deepEqual(validateEvent(merge, policy), []);
  merge.eventType = 'OWNER_APPROVAL';
  assert.match(validateEvent(merge, policy).join('\n'), /merge:event-mismatch/u);

  const checker = eventFor();
  checker.eventType = 'CHECKER_VERDICT';
  checker.actionBoundary.providerRequest = 'ONE_AUTHORIZED_READ_ONLY_CHECKER';
  assert.deepEqual(validateEvent(checker, policy), []);
});

test('comment URL must resolve to the configured issue or pull request', () => {
  const event = eventFor();
  event.comment.url = `https://evil.example/issues/88#issuecomment-${event.comment.id}`;
  assert.match(validateEvent(event, policy).join('\n'), /comment\.url/u);
});

test('CLI parses raw API JSON in-process and reports PASS', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governseed-control-plane-'));
  const event = eventFor();
  const eventPath = path.join(directory, 'event.json');
  const commentPath = path.join(directory, 'comment.json');
  fs.writeFileSync(eventPath, JSON.stringify(event));
  fs.writeFileSync(commentPath, JSON.stringify(apiComment(event)));
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/verify-candidate-control-plane.mjs'),
    '--policy', POLICY_PATH,
    '--event', eventPath,
    '--comment-json', commentPath,
    '--observed-head', policy.candidateFreeze.headSha,
    '--observed-tree', policy.candidateFreeze.treeSha,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.deepEqual(JSON.parse(result.stdout), { schemaVersion: 1, status: 'PASS', errors: [] });
});

test('CLI reports a closed-shape FAIL instead of crashing on malformed event input', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governseed-control-plane-invalid-'));
  const event = eventFor();
  delete event.comment;
  const eventPath = path.join(directory, 'event.json');
  const commentPath = path.join(directory, 'comment.json');
  fs.writeFileSync(eventPath, JSON.stringify(event));
  fs.writeFileSync(commentPath, JSON.stringify({ body: 'irrelevant' }));
  const result = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/verify-candidate-control-plane.mjs'),
    '--policy', POLICY_PATH,
    '--event', eventPath,
    '--comment-json', commentPath,
    '--observed-head', policy.candidateFreeze.headSha,
    '--observed-tree', policy.candidateFreeze.treeSha,
  ], { encoding: 'utf8' });
  assert.equal(result.status, 1, result.stderr || result.stdout);
  const report = JSON.parse(result.stdout);
  assert.equal(report.status, 'FAIL');
  assert.ok(report.errors.some((error) => error.includes('closed-shape')));
});
