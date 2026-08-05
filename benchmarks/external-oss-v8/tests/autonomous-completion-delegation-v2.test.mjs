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

test('V2 preparation binds the merged repair target but remains non-activatable before OWNER binding', () => {
  const result = verifyAutonomousCompletionDelegationV2(ROOT);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.manifest.activationTarget.authorizedMainCommit, '9c83280cec2d9f8fedd15455cfa261680452969f');
  assert.equal(result.manifest.activationTarget.authorizedMainTree, 'f1f89f4dcb1d06cfd4e9af76df8fbaf7722cd64b');
  assert.equal(result.manifest.activationTarget.dispatchAuthorityActive, false);
  assert.equal(result.manifest.diagnosticRepairCandidate.mergeStatus, 'MERGED');
  assert.equal(result.manifest.diagnosticRepairCandidate.mergeReceipt.id, 5194456585);
  assert.equal(result.manifest.diagnosticRepairCandidate.postMergeCi.runId, 31025047970);
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

test('V2 candidate hashes resolve to PR #95 and its exact merge target on main', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  const candidate = manifest.diagnosticRepairCandidate;
  const head = execFileSync('git', ['rev-parse', 'origin/repair/g2-non-2xx-diagnostics'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', `${head}^{tree}`], { cwd: ROOT, encoding: 'utf8' }).trim();
  const workflow = execFileSync('git', ['show', `${head}:.github/workflows/external-oss-v8-runtime-identity.yml`], { cwd: ROOT });
  assert.equal(head, candidate.headSha);
  assert.equal(tree, candidate.treeSha);
  assert.equal(sha256(workflow), candidate.workflowSha256);
  assert.notEqual(candidate.headSha, manifest.activationTarget.authorizedMainCommit);
  assert.equal(execFileSync('git', ['rev-parse', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim(), manifest.activationTarget.authorizedMainCommit);
  assert.equal(execFileSync('git', ['rev-parse', 'origin/main^{tree}'], { cwd: ROOT, encoding: 'utf8' }).trim(), manifest.activationTarget.authorizedMainTree);
});

test('known evaluator timeout conflict remains an explicit non-dispatchable stop', () => {
  const manifest = JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
  assert.equal(manifest.workflowRevision.pairedEvaluator.id, 322642963);
  assert.equal(manifest.workflowRevision.pairedEvaluator.dispatchAuthorized, false);
  assert.match(manifest.workflowRevision.pairedEvaluator.blockingConflict, /600000 ms/u);
  assert.match(manifest.workflowRevision.pairedEvaluator.blockingConflict, /2700 seconds per arm/u);
});
