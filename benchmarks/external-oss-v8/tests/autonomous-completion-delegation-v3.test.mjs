import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyAutonomousCompletionDelegationV3 } from '../../../scripts/verify-autonomous-completion-delegation-v3.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MANIFEST = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v3.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('V3 preparation binds PR #98 and remains non-activatable before merge and exact target', () => {
  const result = verifyAutonomousCompletionDelegationV3(ROOT);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.manifest.receiptPersistenceRepairCandidate.pullRequest, 98);
  assert.equal(result.manifest.receiptPersistenceRepairCandidate.state, 'OPEN_DRAFT');
  assert.equal(result.manifest.receiptPersistenceRepairCandidate.mergeStatus, 'NOT_AUTHORIZED');
  assert.equal(result.manifest.activationProposal.authorizedMainCommit, null);
  assert.equal(result.manifest.activationProposal.authorizedMainTree, null);
  assert.equal(result.manifest.activationProposal.dispatchAuthorityActive, false);
});

test('V3 preserves both failed runs and charges both possibly consumed requests', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  assert.deepEqual(manifest.immutableFailedRunAccounting.runs.map((run) => run.runId), [31014045209, 31032816504]);
  assert.equal(manifest.immutableFailedRunAccounting.conservativeTotals.directProviderRequests, 2);
  assert.equal(manifest.immutableFailedRunAccounting.conservativeTotals.workflowDispatches, 2);
  assert.equal(manifest.immutableFailedRunAccounting.conservativeTotals.costUsd, 2);
  assert.equal(manifest.activationProposal.additionalDispatchMaximum, 1);
  assert.equal(manifest.activationProposal.additionalDirectProviderRequestMaximum, 1);
});

test('V3 fails closed because the only G2 checker name was consumed by PR #95', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  const conflict = manifest.checkerAndMergeConflict;
  assert.equal(conflict.requiredCheckerNameForG2Evidence, 'GS-AUTONOMOUS-G2-EVIDENCE-CHECKER');
  assert.equal(conflict.requiredCheckerAlreadyConsumed, true);
  assert.equal(conflict.consumptionEvidence.commentId, 5194383174);
  assert.equal(conflict.eligibleUnusedInheritedChecker, null);
  assert.equal(conflict.checkerReuseAllowed, false);
  assert.equal(conflict.checkerReplacementAllowed, false);
  assert.equal(conflict.mergePreconditionsSatisfied, false);
  assert.equal(conflict.preparationSelectsNeitherDecision, true);
});

test('V3 candidate hashes resolve to the exact frozen PR #98 branch', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  const candidate = manifest.receiptPersistenceRepairCandidate;
  const head = execFileSync('git', ['rev-parse', 'origin/repair/g2-diagnostic-receipt-persistence-v3'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', `${head}^{tree}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  const workflow = execFileSync('git', ['show', `${head}:.github/workflows/external-oss-v8-runtime-identity.yml`], { cwd: ROOT });
  const hostProxy = execFileSync('git', ['show', `${head}:benchmarks/external-oss-v8/control/G2/runtime-canary-prep/host-proxy.mjs`], { cwd: ROOT });
  assert.equal(head, candidate.headSha);
  assert.equal(tree, candidate.treeSha);
  assert.equal(sha256(workflow), candidate.workflowSha256);
  assert.equal(sha256(hostProxy), candidate.hostProxySha256);
});

test('V3 keeps workflow 322642963 non-dispatchable under the timeout conflict', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  assert.equal(manifest.workflowRevision.pairedEvaluator.id, 322642963);
  assert.equal(manifest.workflowRevision.pairedEvaluator.dispatchAuthorized, false);
  assert.match(manifest.workflowRevision.pairedEvaluator.blockingConflict, /600000 ms/u);
  assert.match(manifest.workflowRevision.pairedEvaluator.blockingConflict, /2700 seconds per arm/u);
});
