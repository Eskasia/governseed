import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { verifyAutonomousCompletionDelegationV4 } from '../../../scripts/verify-autonomous-completion-delegation-v4.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const MANIFEST = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v4.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readManifest() {
  return JSON.parse(readFileSync(path.join(ROOT, MANIFEST), 'utf8'));
}

test('V4 is closed, valid, and inactive before exact OWNER approval', () => {
  const result = verifyAutonomousCompletionDelegationV4(ROOT);
  assert.equal(result.ok, true, result.errors.join('\n'));
  assert.equal(result.manifest.status, 'PENDING_EXACT_OWNER_APPROVAL_BINDING');
  assert.equal(result.manifest.activationProposal.dispatchAuthorityActive, false);
  assert.equal(result.manifest.activationProposal.environmentApprovalAuthorityActive, false);
  assert.equal(result.manifest.activationProposal.providerRequestAuthorityActive, false);
});

test('V4 preserves exact V3 bytes, activation evidence, and canonical R2 contract', () => {
  const manifest = readManifest();
  const previous = readFileSync(path.join(ROOT, manifest.previousManifest.path));
  const contract = readFileSync(path.join(ROOT, manifest.canonicalContract.path));
  assert.equal(sha256(previous), manifest.previousManifest.sha256);
  assert.equal(manifest.previousManifest.commit, 'bb5052dad4bfe6236e371bdecdcf8779c59c0ad1');
  assert.equal(manifest.previousManifest.tree, 'd9840e5c13466a7256da5b1e13b2a6e00a2dbd1f');
  assert.equal(manifest.previousManifest.ownerActivationBinding.id, 5226165467);
  assert.equal(sha256(contract), manifest.canonicalContract.sha256);
  assert.equal(Object.entries(manifest.canonicalContract).filter(([key]) => key.endsWith('Changed')).every(([, value]) => value === false), true);
});

test('V4 binds the OWNER preparation authorization and states quota readiness without fabricating verification', () => {
  const manifest = readManifest();
  assert.equal(manifest.preparationAuthorization.id, 5226523520);
  assert.equal(manifest.preparationAuthorization.bodySha256, '8204f127744e6e1853d7a7732f64f2da44f99ee549390e30a84b79354cba05bc');
  assert.equal(manifest.quotaReadinessAttestation.ownerAttested, true);
  assert.equal(manifest.quotaReadinessAttestation.independentMachineVerificationClaimed, false);
  assert.equal(manifest.quotaReadinessAttestation.providerAccountDataRead, false);
  assert.equal(manifest.quotaReadinessAttestation.credentialRead, false);
});

test('V4 preserves all three failures and the privacy-safe 429 artifact identity', () => {
  const manifest = readManifest();
  const accounting = manifest.immutableG2FailureAccounting;
  assert.deepEqual(accounting.runs.map((run) => run.runId), [31014045209, 31032816504, 31258029890]);
  assert.equal(accounting.runs.every((run) => run.rerunPermitted === false), true);
  assert.equal(accounting.conservativeTotals.directProviderRequests, 3);
  assert.equal(accounting.conservativeTotals.workflowDispatches, 3);
  assert.equal(accounting.successfulRuntimeIdentityArtifacts, 0);
  const latest = accounting.runs.at(-1);
  assert.equal(latest.providerHttpStatus, 429);
  assert.equal(latest.failureClassification, 'RATE_LIMIT_OR_QUOTA');
  assert.equal(latest.artifactId, 9021973989);
  assert.equal(latest.artifactDigest, 'sha256:ca2a85c1c21d54a28247d52856aa130c8e880a0710bc290b3cc32442bb8a42bd');
  assert.equal(latest.failureArtifactSha256, '3e439de0effefb0fa4632fc8b2ac1cc1a3e828de6ef7d2a4a0d6c65b6e42fb38');
  assert.equal(latest.rawProviderDataPersisted, false);
});

test('V4 proposes exactly one fresh G2 attempt without enabling execution or further retry', () => {
  const activation = readManifest().activationProposal;
  assert.equal(activation.additionalDispatchMaximum, 1);
  assert.equal(activation.environmentApprovalMaximum, 1);
  assert.equal(activation.additionalDirectProviderRequestMaximum, 1);
  assert.equal(activation.runAttemptMustEqual, 1);
  assert.equal(activation.freshRunRequired, true);
  assert.equal(activation.historicalRunRerunForbidden, true);
  assert.equal(activation.automaticRetryAllowed, false);
  assert.equal(activation.manualRetryBeyondProposedRunAllowed, false);
  assert.equal(activation.fallbackAllowed, false);
});

test('V4 revised ceilings account for the consumed attempt and preserve the USD 350 absolute cap', () => {
  const manifest = readManifest();
  const ceiling = manifest.ceilingRevision;
  assert.equal(ceiling.absoluteCostUsd, 350);
  assert.equal(ceiling.providerAuthorizationUnitsMaximum, 2124);
  assert.equal(ceiling.directProviderRequestsMaximum, 2116);
  assert.equal(ceiling.workflowDispatchesMaximumIncludingConsumed, 38);
  assert.equal(ceiling.checkerTasksMaximum, 8);
  assert.equal(ceiling.mergeCommitsMaximum, 8);
  assert.deepEqual(ceiling.consumedOrReservedAtPreparation, {
    directProviderRequests: 3,
    checkerTasks: 3,
    providerAuthorizationUnits: 6,
    workflowDispatches: 3,
    mergeCommits: 3,
    costUsd: 9,
  });
  assert.equal(manifest.providerAndCostRevision.costUsd.unallocatedOverheadContingency, 0);
});

test('V4 target resolves to current main and exact workflow bytes', () => {
  const activation = readManifest().activationProposal;
  const main = execFileSync('git', ['rev-parse', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const tree = execFileSync('git', ['rev-parse', 'origin/main^{tree}'], { cwd: ROOT, encoding: 'utf8' }).trim();
  const workflow = execFileSync('git', ['show', `${main}:${activation.workflowPath}`], { cwd: ROOT });
  assert.equal(main, activation.authorizedMainCommit);
  assert.equal(tree, activation.authorizedMainTree);
  assert.equal(sha256(workflow), activation.workflowSha256);
});

test('V4 keeps the paired evaluator non-dispatchable under the inherited timeout conflict', () => {
  const paired = readManifest().workflowRevision.pairedEvaluator;
  assert.equal(paired.id, 322642963);
  assert.equal(paired.compatibilityStatus, 'BLOCKED_PROTOCOL_CHANGE_REQUIRED');
  assert.equal(paired.dispatchAuthorized, false);
  assert.match(paired.blockingConflict, /600000 ms/u);
  assert.match(paired.blockingConflict, /2700 seconds per arm/u);
});
