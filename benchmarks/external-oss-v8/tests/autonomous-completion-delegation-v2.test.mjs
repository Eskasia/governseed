import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyAutonomousCompletionDelegationV2 } from '../../../scripts/verify-autonomous-completion-delegation-v2.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MANIFEST = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v2.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

test('V2 preparation inherits the approved R2 contract and is non-activatable before merge', () => {
  const result = verifyAutonomousCompletionDelegationV2(ROOT);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.manifest.activationTarget.authorizedMainCommit, null);
  assert.equal(result.manifest.activationTarget.dispatchAuthorityActive, false);
  assert.equal(result.manifest.diagnosticRepairCandidate.mergeStatus, 'NOT_AUTHORIZED');
});

test('V2 accounts conservatively for the failed request and changes only bounded ceilings', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  assert.equal(manifest.immutableFailedRunAccounting.providerRequestAttempt, 'INDETERMINATE');
  assert.equal(manifest.immutableFailedRunAccounting.directProviderRequestsChargedConservatively, 1);
  assert.equal(manifest.providerAndCostRevision.directRequests.g2AdditionalMaximum, 1);
  assert.equal(manifest.providerAndCostRevision.costUsd.absoluteTotalCeiling, 350);
  assert.equal(manifest.providerAndCostRevision.costUsd.g2CanaryOverheadAllocation, 2);
  assert.equal(manifest.providerAndCostRevision.costUsd.unallocatedOverheadContingency, 4);
});

test('V2 candidate hashes resolve to exact PR #95 Git objects without using them as main target', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  const candidate = manifest.diagnosticRepairCandidate;
  const head = execFileSync('git', ['rev-parse', 'origin/repair/g2-non-2xx-diagnostics'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', `${head}^{tree}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  const workflow = execFileSync('git', ['show', `${head}:.github/workflows/external-oss-v8-runtime-identity.yml`], { cwd: ROOT });
  assert.equal(head, candidate.headSha);
  assert.equal(tree, candidate.treeSha);
  assert.equal(sha256(workflow), candidate.workflowSha256);
  assert.notEqual(candidate.headSha, manifest.activationTarget.authorizedMainCommit);
});

test('known evaluator timeout conflict remains an explicit non-dispatchable stop', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  assert.equal(manifest.workflowRevision.pairedEvaluator.id, 322642963);
  assert.equal(manifest.workflowRevision.pairedEvaluator.dispatchAuthorized, false);
  assert.match(manifest.workflowRevision.pairedEvaluator.blockingConflict, /600000 ms/u);
  assert.match(manifest.workflowRevision.pairedEvaluator.blockingConflict, /2700 seconds per arm/u);
});
