import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MANIFEST_PATH = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v2.json';
const SCHEMA_PATH = 'benchmarks/external-oss-v8/control/delegation/autonomous-completion-delegation-manifest-v2.schema.json';

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(root, relativePath) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function requireValue(condition, message, errors) {
  if (!condition) errors.push(message);
}

export function verifyAutonomousCompletionDelegationV2(root) {
  const manifest = readJson(root, MANIFEST_PATH);
  const schema = readJson(root, SCHEMA_PATH);
  const baseBytes = readFileSync(path.join(root, manifest.baseManifest.path));
  const base = JSON.parse(baseBytes.toString('utf8'));
  const contractBytes = readFileSync(path.join(root, manifest.canonicalContract.path));
  const errors = [];

  requireValue(
    JSON.stringify(Object.keys(manifest).sort()) === JSON.stringify(Object.keys(schema.properties).sort()),
    'V2 top-level fields do not match the closed schema',
    errors,
  );
  requireValue(manifest.schemaVersion === 2, 'schemaVersion must equal 2', errors);
  requireValue(manifest.status === 'PENDING_EXACT_REPAIR_MERGE_TARGET', 'preparation status is not fail-closed', errors);
  requireValue(sha256(baseBytes) === manifest.baseManifest.sha256, 'base manifest hash mismatch', errors);
  requireValue(sha256(contractBytes) === manifest.canonicalContract.sha256, 'canonical contract hash mismatch', errors);
  requireValue(base.experimentId === manifest.experimentId, 'experiment ID drift', errors);
  requireValue(base.experimentRevision === manifest.experimentRevision, 'experiment revision drift', errors);
  for (const section of manifest.unchangedContractSections) {
    requireValue(Object.hasOwn(base, section), `unknown inherited section: ${section}`, errors);
  }
  requireValue(
    Object.entries(manifest.canonicalContract)
      .filter(([key]) => key.endsWith('Changed'))
      .every(([, value]) => value === false),
    'an experiment-contract field is marked changed',
    errors,
  );
  requireValue(manifest.activationTarget.authorizedMainCommit === null, 'pre-merge main commit must be null', errors);
  requireValue(manifest.activationTarget.authorizedMainTree === null, 'pre-merge main tree must be null', errors);
  requireValue(manifest.activationTarget.dispatchAuthorityActive === false, 'dispatch authority activated early', errors);
  requireValue(manifest.activationTarget.providerRequestMaximum === 1, 'additional G2 request ceiling is not one', errors);
  requireValue(manifest.activationTarget.automaticRetryAllowed === false, 'automatic retry enabled', errors);
  requireValue(manifest.activationTarget.fallbackAllowed === false, 'fallback enabled', errors);
  requireValue(manifest.immutableFailedRunAccounting.rerunPermitted === false, 'failed run became rerunnable', errors);
  requireValue(
    manifest.providerAndCostRevision.directRequests.total
      === manifest.providerAndCostRevision.directRequests.g2Canary
        + manifest.providerAndCostRevision.directRequests.pilot
        + manifest.providerAndCostRevision.directRequests.confirmatory,
    'direct provider request arithmetic mismatch',
    errors,
  );
  requireValue(
    manifest.providerAndCostRevision.maximumProviderAuthorizationUnits
      === manifest.providerAndCostRevision.directRequests.total
        + manifest.providerAndCostRevision.checkerTasks.maximum,
    'provider authorization unit arithmetic mismatch',
    errors,
  );
  requireValue(
    manifest.ceilingRevision.providerAuthorizationUnitsMaximum === 2121
      && manifest.ceilingRevision.directProviderRequestsMaximum === 2114
      && manifest.ceilingRevision.workflowDispatchesMaximumIncludingConsumed === 36
      && manifest.ceilingRevision.checkerTasksMaximum === 7
      && manifest.ceilingRevision.mergeCommitsMaximum === 8
      && manifest.ceilingRevision.absoluteCostUsd === 350,
    'V2 ceiling mismatch',
    errors,
  );
  requireValue(
    manifest.workflowRevision.g2RuntimeIdentity.dispatchesConsumed === 1
      && manifest.workflowRevision.g2RuntimeIdentity.remainingDispatches === 1
      && manifest.workflowRevision.g2RuntimeIdentity.manualDispatchCeiling === 2,
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
      && manifest.authorityBoundary.preparationDoesNotAuthorize.includes('merge'),
    'preparation authority boundary widened',
    errors,
  );
  return Object.freeze({ ok: errors.length === 0, errors, manifest });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] ?? '.');
  const result = verifyAutonomousCompletionDelegationV2(root);
  if (!result.ok) {
    for (const error of result.errors) process.stderr.write(`${error}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('AUTONOMOUS_COMPLETION_DELEGATION_V2_PREPARATION_VALID\n');
  }
}
