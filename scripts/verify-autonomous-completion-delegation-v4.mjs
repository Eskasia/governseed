import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v4.json';
const SCHEMA_PATH = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v4.schema.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function requireValue(condition, message, errors) {
  if (!condition) errors.push(message);
}

export function verifyAutonomousCompletionDelegationV4(root) {
  const manifest = readJson(root, MANIFEST_PATH);
  const schema = readJson(root, SCHEMA_PATH);
  const previousBytes = readFileSync(path.join(root, manifest.previousManifest.path));
  const previous = JSON.parse(previousBytes.toString('utf8'));
  const contractBytes = readFileSync(path.join(root, manifest.canonicalContract.path));
  const errors = [];

  requireValue(
    JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(Object.keys(schema.properties).sort()),
    'V4 top-level fields do not match the closed schema',
    errors,
  );
  requireValue(manifest.schemaVersion === 4, 'schemaVersion must equal 4', errors);
  requireValue(
    manifest.status === 'PENDING_EXACT_OWNER_APPROVAL_BINDING',
    'V4 preparation status is not fail-closed',
    errors,
  );
  requireValue(sha256(previousBytes) === manifest.previousManifest.sha256, 'V3 manifest hash mismatch', errors);
  requireValue(previous.manifestId === 'GS-EFFECT-R2-AUTONOMOUS-COMPLETION-DELEGATION-V3', 'V3 identity mismatch', errors);
  requireValue(previous.experimentId === manifest.experimentId, 'experiment ID drift', errors);
  requireValue(previous.experimentRevision === manifest.experimentRevision, 'experiment revision drift', errors);
  requireValue(sha256(contractBytes) === manifest.canonicalContract.sha256, 'canonical contract hash mismatch', errors);
  requireValue(
    Object.entries(manifest.canonicalContract)
      .filter(([key]) => key.endsWith('Changed'))
      .every(([, value]) => value === false),
    'an experiment-contract field is marked changed',
    errors,
  );

  const authorization = manifest.preparationAuthorization;
  requireValue(authorization.id === 5226523520, 'preparation authorization identity mismatch', errors);
  requireValue(authorization.bodySha256 === '8204f127744e6e1853d7a7732f64f2da44f99ee549390e30a84b79354cba05bc', 'preparation authorization hash mismatch', errors);
  requireValue(
    [
      authorization.providerRequestAuthorized,
      authorization.workflowDispatchAuthorized,
      authorization.environmentApprovalAuthorized,
      authorization.mergeAuthorized,
      authorization.formalLockAuthorized,
      authorization.pilotAuthorized,
      authorization.confirmatoryAuthorized,
      authorization.scoringAuthorized,
      authorization.acceptanceAuthorized,
    ].every((value) => value === false),
    'preparation authorization silently grants execution authority',
    errors,
  );

  const attestation = manifest.quotaReadinessAttestation;
  requireValue(attestation.ownerAttested === true, 'quota-readiness OWNER attestation is missing', errors);
  requireValue(attestation.sourceCommentId === authorization.id, 'quota attestation source mismatch', errors);
  requireValue(attestation.sourceBodySha256 === authorization.bodySha256, 'quota attestation hash mismatch', errors);
  requireValue(attestation.providerAccountDataRead === false, 'provider account data read was fabricated', errors);
  requireValue(attestation.credentialRead === false, 'credential read was fabricated', errors);
  requireValue(attestation.independentMachineVerificationClaimed === false, 'machine verification was fabricated', errors);

  const accounting = manifest.immutableG2FailureAccounting;
  requireValue(
    JSON.stringify(accounting.runs.map((run) => run.runId))
      === JSON.stringify([31014045209, 31032816504, 31258029890]),
    'immutable G2 run identities mismatch',
    errors,
  );
  requireValue(accounting.runs.every((run) => run.rerunPermitted === false), 'an immutable failed run became rerunnable', errors);
  const latest = accounting.runs.at(-1);
  requireValue(latest.providerHttpStatus === 429, 'latest HTTP status mismatch', errors);
  requireValue(latest.failureClassification === 'RATE_LIMIT_OR_QUOTA', 'latest failure classification mismatch', errors);
  requireValue(latest.providerRequestAttempt === 'YES', 'latest provider request was not charged', errors);
  requireValue(latest.artifactId === 9021973989, 'latest artifact ID mismatch', errors);
  requireValue(latest.artifactDigest === 'sha256:ca2a85c1c21d54a28247d52856aa130c8e880a0710bc290b3cc32442bb8a42bd', 'latest artifact digest mismatch', errors);
  requireValue(latest.failureArtifactSha256 === '3e439de0effefb0fa4632fc8b2ac1cc1a3e828de6ef7d2a4a0d6c65b6e42fb38', 'latest failure file hash mismatch', errors);
  requireValue(latest.privacyScanPassed === true && latest.rawProviderDataPersisted === false, 'latest privacy evidence mismatch', errors);
  requireValue(accounting.successfulRuntimeIdentityArtifacts === 0, 'a success artifact was fabricated', errors);
  requireValue(
    accounting.runs.reduce((total, run) => total + run.directProviderRequestsCharged, 0)
      === accounting.conservativeTotals.directProviderRequests,
    'G2 direct-request accounting mismatch',
    errors,
  );
  requireValue(
    accounting.conservativeTotals.failedRuns === 3
      && accounting.conservativeTotals.workflowDispatches === 3
      && accounting.conservativeTotals.directProviderRequests === 3
      && accounting.conservativeTotals.costUsd === 3,
    'G2 conservative totals mismatch',
    errors,
  );

  const activation = manifest.activationProposal;
  requireValue(activation.workflowId === 325585082, 'G2 workflow identity mismatch', errors);
  requireValue(activation.authorizedMainCommit === '4c8442b2b9e9af29fb7755dd6470c92442cbec24', 'authorized main commit mismatch', errors);
  requireValue(activation.authorizedMainTree === 'eaf23456d3d16fc50276844db22dfff3f17d6ebf', 'authorized main tree mismatch', errors);
  requireValue(activation.inputs.runtime_image === activation.runtimeImage, 'runtime image input mismatch', errors);
  requireValue(activation.inputs.authorized_main_commit === activation.authorizedMainCommit, 'authorized-main input mismatch', errors);
  requireValue(activation.runAttemptMustEqual === 1 && activation.freshRunRequired === true, 'fresh run-attempt contract mismatch', errors);
  requireValue(activation.historicalRunRerunForbidden === true, 'historical rerun became permitted', errors);
  requireValue(
    activation.additionalDispatchMaximum === 1
      && activation.additionalDirectProviderRequestMaximum === 1
      && activation.environmentApprovalMaximum === 1,
    'single-attempt proposal widened',
    errors,
  );
  requireValue(
    activation.automaticRetryAllowed === false
      && activation.manualRetryBeyondProposedRunAllowed === false
      && activation.fallbackAllowed === false,
    'retry or fallback was enabled',
    errors,
  );
  requireValue(
    activation.dispatchAuthorityActive === false
      && activation.environmentApprovalAuthorityActive === false
      && activation.providerRequestAuthorityActive === false,
    'V4 execution authority activated early',
    errors,
  );

  const ceiling = manifest.ceilingRevision;
  requireValue(
    ceiling.absoluteCostUsd === 350
      && ceiling.providerAuthorizationUnitsMaximum === 2124
      && ceiling.directProviderRequestsMaximum === 2116
      && ceiling.workflowDispatchesMaximumIncludingConsumed === 38
      && ceiling.checkerTasksMaximum === 8
      && ceiling.mergeCommitsMaximum === 8,
    'V4 ceiling revision mismatch',
    errors,
  );
  const consumed = ceiling.consumedOrReservedAtPreparation;
  requireValue(
    consumed.directProviderRequests === 3
      && consumed.checkerTasks === 3
      && consumed.providerAuthorizationUnits === 6
      && consumed.workflowDispatches === 3
      && consumed.mergeCommits === 3
      && consumed.costUsd === 9,
    'V4 consumed/reserved accounting mismatch',
    errors,
  );
  const remaining = ceiling.remainingBeforeProposedRun;
  requireValue(
    remaining.directProviderRequests === ceiling.directProviderRequestsMaximum - consumed.directProviderRequests
      && remaining.checkerTasks === ceiling.checkerTasksMaximum - consumed.checkerTasks
      && remaining.providerAuthorizationUnits === ceiling.providerAuthorizationUnitsMaximum - consumed.providerAuthorizationUnits
      && remaining.workflowDispatches === ceiling.workflowDispatchesMaximumIncludingConsumed - consumed.workflowDispatches
      && remaining.mergeCommits === ceiling.mergeCommitsMaximum - consumed.mergeCommits
      && remaining.costUsd === ceiling.absoluteCostUsd - consumed.costUsd,
    'V4 remaining-capacity arithmetic mismatch',
    errors,
  );
  const direct = manifest.providerAndCostRevision.directRequests;
  requireValue(direct.total === direct.g2Canary + direct.pilot + direct.confirmatory, 'direct-request arithmetic mismatch', errors);
  requireValue(
    manifest.providerAndCostRevision.maximumProviderAuthorizationUnits
      === direct.total + manifest.providerAndCostRevision.checkerTasks.approvedMaximum,
    'provider-authorization-unit arithmetic mismatch',
    errors,
  );
  requireValue(
    manifest.providerAndCostRevision.costUsd.g2CanaryOverheadAllocation
      + manifest.providerAndCostRevision.checkerTasks.approvedMaximum
        * manifest.providerAndCostRevision.costUsd.checkerTaskOverheadAllocationEach
      + manifest.providerAndCostRevision.costUsd.unallocatedOverheadContingency
      === manifest.providerAndCostRevision.costUsd.governanceOverheadCeiling,
    'governance-overhead allocation mismatch',
    errors,
  );
  requireValue(
    manifest.workflowRevision.g2RuntimeIdentity.manualDispatchCeiling === 4
      && manifest.workflowRevision.g2RuntimeIdentity.dispatchesConsumed === 3
      && manifest.workflowRevision.g2RuntimeIdentity.remainingDispatchesProposed === 1
      && manifest.workflowRevision.g2RuntimeIdentity.dispatchAuthorized === false,
    'G2 dispatch revision mismatch',
    errors,
  );
  requireValue(
    manifest.workflowRevision.pairedEvaluator.compatibilityStatus === 'BLOCKED_PROTOCOL_CHANGE_REQUIRED'
      && manifest.workflowRevision.pairedEvaluator.dispatchAuthorized === false,
    'paired-evaluator timeout conflict was not preserved',
    errors,
  );
  requireValue(
    manifest.authorityBoundary.preparationDoesNotAuthorize.includes('provider request')
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('workflow dispatch or rerun')
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('Environment approval')
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('merge')
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('Pilot'),
    'V4 preparation boundary widened',
    errors,
  );

  return Object.freeze({ ok: errors.length === 0, errors, manifest });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? '.');
  const result = verifyAutonomousCompletionDelegationV4(root);
  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('AUTONOMOUS_COMPLETION_DELEGATION_V4_PREPARATION_VALID\n');
  }
}
