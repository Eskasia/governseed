import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v3.json';
const SCHEMA_PATH = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v3.schema.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function requireValue(condition, message, errors) {
  if (!condition) errors.push(message);
}

export function verifyAutonomousCompletionDelegationV3(root) {
  const manifest = readJson(root, MANIFEST_PATH);
  const schema = readJson(root, SCHEMA_PATH);
  const previousBytes = readFileSync(path.join(root, manifest.previousManifest.path));
  const previous = JSON.parse(previousBytes.toString('utf8'));
  const contractBytes = readFileSync(path.join(root, manifest.canonicalContract.path));
  const errors = [];

  requireValue(
    JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(Object.keys(schema.properties).sort()),
    'V3 top-level fields do not match the closed schema',
    errors,
  );
  requireValue(manifest.schemaVersion === 3, 'schemaVersion must equal 3', errors);
  requireValue(
    manifest.status === 'PENDING_EXACT_OWNER_APPROVAL_BINDING',
    'V3 activation preparation status is not fail-closed',
    errors,
  );
  requireValue(sha256(previousBytes) === manifest.previousManifest.sha256, 'V2 manifest hash mismatch', errors);
  requireValue(sha256(contractBytes) === manifest.canonicalContract.sha256, 'canonical contract hash mismatch', errors);
  requireValue(previous.experimentId === manifest.experimentId, 'experiment ID drift', errors);
  requireValue(previous.experimentRevision === manifest.experimentRevision, 'experiment revision drift', errors);
  for (const section of manifest.unchangedContractSections) {
    const v1 = readJson(root, previous.baseManifest.path);
    requireValue(Object.hasOwn(v1, section), `unknown inherited section: ${section}`, errors);
  }
  requireValue(
    Object.entries(manifest.canonicalContract)
      .filter(([key]) => key.endsWith('Changed'))
      .every(([, value]) => value === false),
    'an experiment-contract field is marked changed',
    errors,
  );
  requireValue(manifest.receiptPersistenceRepairCandidate.state === 'MERGED', 'repair candidate is not merged', errors);
  requireValue(manifest.receiptPersistenceRepairCandidate.mergeStatus === 'MERGED', 'repair merge is not recorded', errors);
  requireValue(manifest.receiptPersistenceRepairCandidate.ci.conclusion === 'success', 'candidate CI is not successful', errors);
  requireValue(
    manifest.activationProposal.authorizedMainCommit === manifest.receiptPersistenceRepairCandidate.mergeCommit,
    'activation commit does not match the repair merge commit',
    errors,
  );
  requireValue(
    manifest.activationProposal.authorizedMainTree === manifest.receiptPersistenceRepairCandidate.mergedMainTree,
    'activation tree does not match the merged repair tree',
    errors,
  );
  requireValue(
    manifest.receiptPersistenceRepairCandidate.postMergeCi.runId === 31249042879
      && manifest.receiptPersistenceRepairCandidate.postMergeCi.conclusion === 'success',
    'post-merge CI evidence mismatch',
    errors,
  );
  requireValue(manifest.activationProposal.dispatchAuthorityActive === false, 'dispatch authority activated early', errors);
  requireValue(manifest.activationProposal.additionalDispatchMaximum === 1, 'additional G2 dispatch ceiling is not one', errors);
  requireValue(
    manifest.activationProposal.additionalDirectProviderRequestMaximum === 1,
    'additional direct G2 request ceiling is not one',
    errors,
  );
  requireValue(manifest.activationProposal.automaticRetryAllowed === false, 'automatic retry enabled', errors);
  requireValue(manifest.activationProposal.fallbackAllowed === false, 'fallback enabled', errors);

  const runs = manifest.immutableFailedRunAccounting.runs;
  requireValue(runs.length === 2, 'both immutable failed runs are not retained', errors);
  requireValue(runs.every((run) => run.rerunPermitted === false), 'a failed run became rerunnable', errors);
  requireValue(
    runs.reduce((total, run) => total + run.directProviderRequestsChargedConservatively, 0)
      === manifest.immutableFailedRunAccounting.conservativeTotals.directProviderRequests,
    'failed-run direct request accounting mismatch',
    errors,
  );

  const conflict = manifest.checkerAndMergeConflict;
  requireValue(conflict.requiredCheckerAlreadyConsumed === true, 'consumed G2 checker was not recorded', errors);
  requireValue(conflict.approvedCheckerTaskMaximum === 8, 'approved eighth checker ceiling is missing', errors);
  requireValue(conflict.eligibleUnusedInheritedChecker === null, 'an ineligible inherited checker was substituted', errors);
  requireValue(conflict.checkerReuseAllowed === false, 'checker reuse was enabled', errors);
  requireValue(conflict.checkerReplacementAllowed === false, 'checker replacement was enabled', errors);
  requireValue(conflict.selectedDecision === 'ADDITIONAL_UNIQUE_NO_RETRY_CHECKER', 'approved checker option was not selected', errors);
  requireValue(conflict.additionalChecker.verdict === 'ACCEPT', 'additional checker ACCEPT is missing', errors);
  requireValue(conflict.additionalChecker.retryOrReplacementAllowed === false, 'additional checker became retryable', errors);
  requireValue(conflict.mergePreconditionsSatisfied === true, 'merge preconditions are not recorded complete', errors);
  requireValue(conflict.decisionRequired.length === 0, 'resolved checker decision remains open', errors);
  requireValue(conflict.preparationSelectsNeitherDecision === false, 'approved checker decision was discarded', errors);

  const proposal = manifest.ceilingProposal.approvedRevision;
  requireValue(
    proposal.absoluteCostUsd === 350
      && proposal.providerAuthorizationUnitsMaximum === 2123
      && proposal.directProviderRequestsMaximum === 2115
      && proposal.workflowDispatchesMaximumIncludingConsumed === 37
      && proposal.checkerTasksMaximum === 8
      && proposal.mergeCommitsMaximum === 8,
    'V3 approved ceiling revision mismatch',
    errors,
  );
  const consumed = manifest.ceilingProposal.consumedOrReservedAtPreparation;
  requireValue(
    consumed.directProviderRequests === 2
      && consumed.checkerTasks === 3
      && consumed.providerAuthorizationUnits === 5
      && consumed.workflowDispatches === 2
      && consumed.mergeCommits === 3
      && consumed.costUsd === 8,
    'V3 consumed or reserved accounting mismatch',
    errors,
  );
  const direct = manifest.providerAndCostRevision.directRequests;
  requireValue(direct.total === direct.g2Canary + direct.pilot + direct.confirmatory, 'direct request arithmetic mismatch', errors);
  requireValue(
    manifest.providerAndCostRevision.maximumProviderAuthorizationUnits
      === direct.total + manifest.providerAndCostRevision.checkerTasks.approvedMaximum,
    'provider authorization unit arithmetic mismatch',
    errors,
  );
  requireValue(
    manifest.providerAndCostRevision.checkerTasks.remainingEligibleForReceiptPersistenceRepair === 0,
    'an eligible inherited receipt-persistence checker was fabricated',
    errors,
  );
  requireValue(
    manifest.workflowRevision.g2RuntimeIdentity.dispatchesConsumed === 2
      && manifest.workflowRevision.g2RuntimeIdentity.remainingDispatchesProposed === 1
      && manifest.workflowRevision.g2RuntimeIdentity.manualDispatchCeilingProposed === 3
      && manifest.workflowRevision.g2RuntimeIdentity.dispatchAuthorized === false,
    'G2 dispatch accounting mismatch',
    errors,
  );
  requireValue(
    manifest.workflowRevision.pairedEvaluator.compatibilityStatus === 'BLOCKED_PROTOCOL_CHANGE_REQUIRED'
      && manifest.workflowRevision.pairedEvaluator.dispatchAuthorized === false,
    'known evaluator timeout conflict was not preserved',
    errors,
  );
  requireValue(
    manifest.authorityBoundary.preparationDoesNotAuthorize.includes('provider request')
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('workflow dispatch or rerun')
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('checker or checker replacement')
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('merge'),
    'preparation authority boundary widened',
    errors,
  );
  return Object.freeze({ ok: errors.length === 0, errors, manifest });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? '.');
  const result = verifyAutonomousCompletionDelegationV3(root);
  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('AUTONOMOUS_COMPLETION_DELEGATION_V3_PREPARATION_VALID\n');
  }
}
