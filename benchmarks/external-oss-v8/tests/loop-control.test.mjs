import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const CONTROL_ROOT = 'benchmarks/external-oss-v8/control/loop';
const taskGraph = JSON.parse(readFileSync(`${CONTROL_ROOT}/task-graph.json`, 'utf8'));
const loopState = JSON.parse(readFileSync(`${CONTROL_ROOT}/loop-state.json`, 'utf8'));
const ledgerText = readFileSync(`${CONTROL_ROOT}/run-ledger.jsonl`, 'utf8');
const ledgerLines = ledgerText.trim().split('\n');
const ledgerEntries = ledgerLines.map((line) => JSON.parse(line));
const decisionLog = readFileSync(`${CONTROL_ROOT}/decision-log.md`, 'utf8');
const humanGates = readFileSync(`${CONTROL_ROOT}/human-gates.md`, 'utf8');
const decisionReconciliation = JSON.parse(
  readFileSync(`${CONTROL_ROOT}/reconciliation/issue-84-comment-5185865928.json`, 'utf8'),
);
const identityResolution = JSON.parse(
  readFileSync(`${CONTROL_ROOT}/reconciliation/issue-84-comment-5186392861.json`, 'utf8'),
);
const contractMerge = JSON.parse(
  readFileSync(`${CONTROL_ROOT}/reconciliation/pr-85-contract-merge.json`, 'utf8'),
);
const taskIdentityReview = JSON.parse(
  readFileSync(`${CONTROL_ROOT}/reconciliation/pr-87-independent-review-rejection.json`, 'utf8'),
);
const taskIdentityMerge = JSON.parse(
  readFileSync(`${CONTROL_ROOT}/reconciliation/pr-87-task-identity-merge.json`, 'utf8'),
);
const requiredNodeFields = [
  'nodeId',
  'phase',
  'objective',
  'dependencies',
  'entryCriteria',
  'acceptanceCriteria',
  'validationCommands',
  'evidencePaths',
  'humanGate',
  'status',
  'blockerCode',
  'attempts',
  'activeIssue',
  'activePR',
  'lastVerifiedMainSha',
  'weightPercent',
];
const allowedStatuses = new Set([
  'PASS',
  'IN_PROGRESS',
  'PENDING',
  'BLOCKED',
  'INDETERMINATE',
  'EVIDENCE_CONFLICT',
  'PARTIAL',
  'FAIL',
  'HUMAN_GATE',
  'EXTERNAL_PENDING',
  'SUPERSEDED',
]);
const requiredCanonicalNodes = {
  P0: ['P0.1', 'P0.2', 'P0.3', 'P0.4'],
  P1: ['P1.1', 'P1.2', 'P1.3', 'P1.4', 'P1.5'],
  P2: ['P2.1', 'P2.2', 'P2.3', 'P2.4', 'P2.5', 'P2.6'],
  P3: ['P3.1', 'P3.2', 'P3.3', 'P3.4', 'P3.5', 'P3.6', 'P3.7', 'P3.8', 'P3.9'],
  P4: ['P4.1', 'P4.2', 'P4.3', 'P4.4', 'P4.5', 'P4.6'],
  P5: ['P5.1', 'P5.2', 'P5.3', 'P5.4', 'P5.5', 'P5.6'],
  P6: ['P6.1', 'P6.2', 'P6.3', 'P6.4'],
  P7: ['P7.1', 'P7.2', 'P7.3', 'P7.4', 'P7.5', 'P7.6'],
  P8: ['P8.1', 'P8.2', 'P8.3', 'P8.4', 'P8.5'],
};
const forbiddenRerunIds = ['30814159615', '30824406710', '30850478318'];

function validateControl(graph, state) {
  const errors = [];
  const nodes = new Map(graph.nodes.map((node) => [node.nodeId, node]));
  for (const node of graph.nodes) {
    for (const field of requiredNodeFields) {
      if (!Object.hasOwn(node, field)) errors.push(`${node.nodeId} missing ${field}`);
    }
    if (!allowedStatuses.has(node.status)) errors.push(`${node.nodeId} invalid status ${node.status}`);
    if (!Array.isArray(node.dependencies)) errors.push(`${node.nodeId} dependencies must be an array`);
  }
  for (const node of graph.nodes.filter((candidate) => candidate.status === 'PASS')) {
    for (const dependencyId of node.dependencies) {
      const dependency = nodes.get(dependencyId);
      if (!dependency) errors.push(`${node.nodeId} has unknown dependency ${dependencyId}`);
      else if (dependency.status !== 'PASS') errors.push(`${node.nodeId} falsely passes with ${dependencyId}=${dependency.status}`);
    }
  }
  const canonicalIds = new Set(Object.values(requiredCanonicalNodes).flat());
  const calculated = graph.nodes
    .filter((node) => canonicalIds.has(node.nodeId) && node.status === 'PASS')
    .reduce((sum, node) => sum + node.weightPercent, 0);
  if (Number(calculated.toFixed(10)) !== state.completionPercentage) {
    errors.push(`completion mismatch: calculated=${calculated} recorded=${state.completionPercentage}`);
  }
  for (const runId of state.activeRunIds ?? []) {
    if (forbiddenRerunIds.includes(String(runId))) errors.push(`forbidden rerun is active: ${runId}`);
  }
  return errors;
}

test('task graph contains every canonical node and required control field', () => {
  assert.equal(taskGraph.schemaVersion, 1);
  assert.equal(taskGraph.benchmarkId, 'GS-OSS-2026-08-02-V8');
  assert.match(taskGraph.authoritativeMainSha, /^[0-9a-f]{40}$/);
  assert.match(taskGraph.authoritativeMainTreeSha, /^[0-9a-f]{40}$/);

  const nodeIds = new Set(taskGraph.nodes.map((node) => node.nodeId));
  for (const [phase, ids] of Object.entries(requiredCanonicalNodes)) {
    assert.equal(taskGraph.phaseWeightsPercent[phase] > 0, true, `missing weight for ${phase}`);
    for (const id of ids) assert.equal(nodeIds.has(id), true, `missing canonical node ${id}`);
  }

  for (const node of taskGraph.nodes) {
    for (const field of requiredNodeFields) {
      assert.equal(Object.hasOwn(node, field), true, `${node.nodeId} missing ${field}`);
    }
    assert.equal(allowedStatuses.has(node.status), true, `${node.nodeId} invalid status ${node.status}`);
    assert.equal(Array.isArray(node.dependencies), true, `${node.nodeId} dependencies must be an array`);
    assert.equal(Array.isArray(node.entryCriteria), true, `${node.nodeId} entryCriteria must be an array`);
    assert.equal(Array.isArray(node.acceptanceCriteria), true, `${node.nodeId} acceptanceCriteria must be an array`);
    assert.equal(Array.isArray(node.validationCommands), true, `${node.nodeId} validationCommands must be an array`);
    assert.equal(Array.isArray(node.evidencePaths), true, `${node.nodeId} evidencePaths must be an array`);
  }
  assert.deepEqual(validateControl(taskGraph, loopState), []);
});

test('PASS nodes do not depend on non-PASS nodes', () => {
  const nodes = new Map(taskGraph.nodes.map((node) => [node.nodeId, node]));
  for (const node of taskGraph.nodes.filter((candidate) => candidate.status === 'PASS')) {
    for (const dependencyId of node.dependencies) {
      const dependency = nodes.get(dependencyId);
      assert.ok(dependency, `${node.nodeId} has unknown dependency ${dependencyId}`);
      assert.equal(dependency.status, 'PASS', `${node.nodeId} falsely passes with ${dependencyId}=${dependency.status}`);
    }
  }
});

test('weighted completion equals only canonical PASS node weights', () => {
  const canonicalIds = new Set(Object.values(requiredCanonicalNodes).flat());
  const calculated = taskGraph.nodes
    .filter((node) => canonicalIds.has(node.nodeId) && node.status === 'PASS')
    .reduce((sum, node) => sum + node.weightPercent, 0);
  assert.equal(Number(calculated.toFixed(10)), 31);
  assert.equal(loopState.completionPercentage, 31);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.1').status, 'PASS');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.2').status, 'PASS');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.4').status, 'PASS');
});

test('G2 conflict remains fail-closed and forbidden runs cannot become active', () => {
  const conflict = loopState.evidenceConflicts.find((item) => item.conflictId === 'G2-TOP-LEVEL-GATE-STALE-001');
  assert.equal(conflict?.status, 'EVIDENCE_CONFLICT');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P3.7').status, 'BLOCKED');
  assert.equal(loopState.providerRequests, 'INDETERMINATE_FOR_RUN_30850478318');
  assert.deepEqual(loopState.latestRunIds.forbiddenG2Reruns, forbiddenRerunIds);
  assert.equal(loopState.workflowDispatch, 'NOT_RUN_IN_THIS_CYCLE');
  assert.deepEqual(loopState.activeRunIds, []);
  assert.equal(loopState.evidenceConflicts.some((item) => item.conflictId === 'G2-REPAIR6-APPROVAL-LOCATION-001'), true);
});

test('recorded GitHub state closes P1.2 and gates P1.4 on fresh independent review', () => {
  assert.equal(loopState.activeNode, 'P1.4');
  assert.equal(loopState.activeIssue, 88);
  assert.equal(loopState.activePR, null);
  assert.equal(loopState.currentHumanGate, 'PUBLIC_HIDDEN_SEPARATION_INDEPENDENT_REVIEW_AUTHORIZATION');
  assert.deepEqual(loopState.openPullRequests.active, [81]);
  assert.equal(loopState.latestRunIds.priorLoopControlTechnicalValidation, '30913519842');
  assert.equal(loopState.latestRunIds.loopControlMergeValidation, '30916308174');
  assert.equal(loopState.latestRunIds.priorExperimentContractEvidenceValidation, '30961663119');
  assert.equal(loopState.latestRunIds.experimentContractPullRequestValidation, '30966317154');
  assert.equal(loopState.latestRunIds.experimentContractMergeValidation, '30971703749');
  assert.equal(loopState.latestRunIds.taskIdentityPullRequestValidation, '30976115630');
  assert.equal(loopState.latestRunIds.taskIdentityMergeValidation, '30988393468');
  assert.equal('experimentContractEvidenceValidation' in loopState.latestRunIds, false);
  assert.equal('latestValidation' in loopState.latestRunIds, false);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.4').activePR, 83);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.4').status, 'PASS');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.D1').status, 'PASS');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.D1').blockerCode, null);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.D1').activePR, 85);
  assert.match(humanGates, /issues\/84/);
  assert.match(humanGates, /pull\/85/);
  assert.match(humanGates, /EXPERIMENT_CONTRACT_TASK_IDENTITY_RESOLUTION/);
  assert.equal(loopState.finalHeadBinding.status, 'VERIFIED_MERGED');
  assert.equal(loopState.finalHeadBinding.pullRequest, 87);
  assert.equal(loopState.finalHeadBinding.reviewedHeadSha, 'd5b1c32138496a91931b20f065c39f4404505d01');
  assert.equal(loopState.finalHeadBinding.reviewedTreeSha, '31dc203b0bb1af2d1546a9f9df676fa945dde792');
  assert.equal(loopState.finalHeadBinding.approvalCommentBodySha256, '2f08758e31ebb706375cd046097270ce86c9cc4203e3ba0c684467e1b71f6a93');
  assert.equal(loopState.finalHeadBinding.mergeCommitSha, loopState.currentMainSha);
  assert.equal(loopState.finalHeadBinding.mergeValidationRun, loopState.latestRunIds.taskIdentityMergeValidation);
  assert.equal(Date.parse(loopState.finalHeadBinding.approvalCreatedAt) < Date.parse(loopState.finalHeadBinding.mergedAt), true);
  assert.deepEqual(loopState.readySetAtSelection, ['P1.4', 'P3.R6']);
  assert.equal(loopState.selectedGatePreparationNode, 'P1.4');
  assert.deepEqual(loopState.nextReadyNodes, ['P3.R6']);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.2').status, 'PASS');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.2').activeIssue, 86);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.2').activePR, 87);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.2').attempts, 6);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.2').blockerCode, null);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.4').status, 'HUMAN_GATE');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.4').attempts, 2);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.4').activeIssue, 88);
  assert.equal(loopState.pendingReviewBinding.status, 'EXTERNAL_GITHUB_HEAD_BINDING_REQUIRED');
  assert.equal(loopState.pendingReviewBinding.pullRequest, null);
  assert.equal(loopState.pendingReviewBinding.priorIndependentReview.status, 'ACCEPT');
  assert.equal(loopState.pendingReviewBinding.currentIndependentReview, 'NOT_RUN_ON_P1_4_CANDIDATE_REQUIRES_NEW_AUTHORIZATION');
  assert.equal(loopState.thisCycleProviderRequests, 0);
  assert.ok(loopState.pendingReviewBinding.unauthorizedActions.includes('merge'));
});

test('sanitized independent-review receipt binds the rejected exact target and one authorized request', () => {
  assert.equal(taskIdentityReview.reviewTask.name, 'GS-EFFECT-R2-INDEPENDENT-CHECKER');
  assert.equal(taskIdentityReview.reviewTask.providerRequestCount, 1);
  assert.equal(taskIdentityReview.target.pullRequest, 87);
  assert.equal(taskIdentityReview.target.baseSha, taskIdentityMerge.pullRequest.baseShaBeforeMerge);
  assert.equal(taskIdentityReview.target.headSha, '86cdae157e8eec3656569790aca62c5cc61aa81a');
  assert.equal(taskIdentityReview.target.treeSha, '2f80b3d0f1106341e0002b33c19147518d206943');
  assert.equal(taskIdentityReview.verdict, 'REJECT');
  assert.deepEqual(taskIdentityReview.blockingFindings.map((finding) => finding.findingId), [
    'P1-CROSS-TASK-ARTIFACT-REBINDING',
    'P1-DIFF-CHECK-FALSE-CLAIM',
  ]);
  assert.equal(taskIdentityReview.retention.rawPromptCommitted, false);
  assert.equal(taskIdentityReview.retention.rawProviderBodyCommitted, false);
  assert.equal(taskIdentityReview.retention.rawHiddenOracleCommitted, false);
  assert.equal(taskIdentityReview.workflowDispatch, 'NOT_RUN');
});

test('PR 87 merge reconciliation binds accepted review, owner approval, exact tree, and main validation', () => {
  assert.equal(taskIdentityMerge.pullRequest.number, 87);
  assert.equal(taskIdentityMerge.pullRequest.reviewedHeadSha, 'd5b1c32138496a91931b20f065c39f4404505d01');
  assert.equal(taskIdentityMerge.pullRequest.reviewedTreeSha, taskIdentityMerge.pullRequest.mergeCommitTreeSha);
  assert.equal(taskIdentityMerge.pullRequest.mergeCommitSha, loopState.currentMainSha);
  assert.equal(taskIdentityMerge.independentReview.verdict, 'ACCEPT');
  assert.equal(taskIdentityMerge.independentReview.providerRequestCount, 1);
  assert.deepEqual(taskIdentityMerge.independentReview.blockingFindings, []);
  assert.equal(taskIdentityMerge.approval.commentId, 5189326581);
  assert.equal(taskIdentityMerge.approval.authorAssociation, 'OWNER');
  assert.equal(taskIdentityMerge.approval.approvalPredatesMerge, true);
  assert.equal(taskIdentityMerge.approval.secondsBeforeMerge, 32);
  assert.deepEqual(taskIdentityMerge.validation.mainPlatforms, {ubuntu: 'SUCCESS', macos: 'SUCCESS', windows: 'SUCCESS'});
  assert.equal(taskIdentityMerge.validation.mainRunId, Number(loopState.latestRunIds.taskIdentityMergeValidation));
  assert.equal(taskIdentityMerge.gateDecision.P1_2, 'PASS');
  assert.equal(taskIdentityMerge.gateDecision.weightedCompletionPercent, 31);
  assert.equal(taskIdentityMerge.gateDecision.nextReadyNode, 'P1.4');
});

test('decision and human-gate records preserve required fail-closed markers', () => {
  for (const marker of [
    'BLOCKED_EXPERIMENT_CONTRACT_INCOMPLETE',
    'EVIDENCE_CONFLICT',
    'newProviderRequestAuthorized=false',
    '30814159615',
    '30824406710',
    '30850478318',
    'PR `#83`',
    'Issue `#84`',
    'legacyV3SeedTreeHashReproduced=false',
    'TASK-OSS-01',
  ]) assert.match(decisionLog, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(humanGates, /Explicitly unauthorized/);
  assert.match(humanGates, /no R1\/R2 contract, runtime, effectiveness, scoring, or acceptance claim/i);
});

test('owner decision reconciliation binds provenance, scorer hashes, and negative task evidence', () => {
  assert.equal(decisionReconciliation.decision.commentId, 5185865928);
  assert.equal(decisionReconciliation.decision.author, 'Eskasia');
  assert.equal(decisionReconciliation.decision.authorAssociation, 'OWNER');
  assert.equal(
    decisionReconciliation.decision.bodySha256,
    '12263c44592a5e7a038e51ede76beeccc637ea4904681b3a03817a66b386a3f5',
  );
  assert.equal(
    decisionReconciliation.decision.bodyHashCanonicalization,
    'SHA-256 over the exact UTF-8 GitHub API .body string with no added delimiter',
  );
  assert.equal(
    decisionReconciliation.decision.cliBodyWithTrailingLfSha256,
    '0aca84e3a9468235cb1a96ab14e200d8f3dd4cc1540c4f61e9e0c1f151e588c3',
  );
  assert.equal(decisionReconciliation.repository.mainSha, '12f1802173c05e880139a2841900e6953d16d42d');
  assert.equal(decisionReconciliation.repository.pullRequest, 85);
  assert.equal(decisionReconciliation.scorerReconciliation.schema.status, 'PASS');
  assert.equal(decisionReconciliation.scorerReconciliation.implementation.status, 'PASS');
  const task01 = decisionReconciliation.taskIdentityReconciliation.find(
    (item) => item.taskId === 'TASK-OSS-01',
  );
  assert.equal(task01.status, 'EVIDENCE_CONFLICT');
  assert.equal(task01.legacySeedTreeHashReproduced, false);
  assert.notEqual(task01.v4SeedTreeSha256, task01.v5SealedSeedTreeSha256);
  assert.deepEqual(
    decisionReconciliation.taskIdentityReconciliation
      .filter((item) => item.taskId !== 'TASK-OSS-01')
      .map((item) => item.status),
    ['PASS', 'PASS'],
  );
  assert.deepEqual(
    decisionReconciliation.workflowHistory.runsCreatedAtOrAfterDecision.map((run) => run.runId),
    [30961663119],
  );
  assert.equal(decisionReconciliation.workflowHistory.observedThrough, decisionReconciliation.observedAt);
  assert.equal(
    decisionReconciliation.workflowHistory.runsCreatedAtOrAfterDecision.every(
      (run) => run.providerConsuming === false,
    ),
    true,
  );
  assert.deepEqual(decisionReconciliation.workflowHistory.providerConsumingRunsCreatedAtOrAfterDecision, []);
  assert.equal(decisionReconciliation.workflowHistory.providerConsumingWorkflowDispatched, false);
  assert.equal(decisionReconciliation.gateDecision.contractImplementation, 'NOT_RUN');
  assert.equal(decisionReconciliation.gateDecision.providerRequests, 'NOT_RUN');
  assert.equal(decisionReconciliation.gateDecision.workflowDispatch, 'NOT_RUN');
});

test('PR 85 merge reconciliation binds exact owner approval, tree, and main validation', () => {
  assert.equal(contractMerge.pullRequest.number, 85);
  assert.equal(contractMerge.pullRequest.reviewedHeadSha, 'bc0faecf12360b510ca3c4cfb6770f8fcdaffbaa');
  assert.equal(contractMerge.pullRequest.reviewedTreeSha, contractMerge.pullRequest.mergeCommitTreeSha);
  assert.equal(contractMerge.pullRequest.mergeCommitSha, taskIdentityMerge.pullRequest.baseShaBeforeMerge);
  assert.equal(contractMerge.approval.commentId, 5187112324);
  assert.equal(contractMerge.approval.authorAssociation, 'OWNER');
  assert.equal(contractMerge.approval.bodySha256, '7d06ff69617a039ac95a6113a23f440f18de4f3716016eb0eace45e9abe593f5');
  assert.equal(contractMerge.approval.approvalPredatesMerge, true);
  assert.equal(contractMerge.approval.secondsBeforeMerge, 21);
  assert.deepEqual(contractMerge.validation.mainPlatforms, {ubuntu: 'SUCCESS', macos: 'SUCCESS', windows: 'SUCCESS'});
  assert.equal(contractMerge.workflowHistory.providerConsumingWorkflowDispatched, false);
  assert.equal(contractMerge.gateDecision.weightedCompletionPercent, 29);
  assert.equal(contractMerge.gateDecision.nextReadyNode, 'P1.2');
});

test('owner R2 resolution closes the identity conflict without authorizing execution', () => {
  assert.equal(identityResolution.resolution.commentId, 5186392861);
  assert.equal(identityResolution.resolution.author, 'Eskasia');
  assert.equal(identityResolution.resolution.authorAssociation, 'OWNER');
  assert.equal(identityResolution.resolution.bodySha256, 'e8ceeb21c85538a8f279db2626f66bed541cfe8476afbcf4604507f4ebff4191');
  assert.equal(identityResolution.taskIdentityResolution.createdExperimentId, 'GS-OSS-2026-08-05-EFFECT-R2');
  assert.equal(identityResolution.taskIdentityResolution.poolEvidenceAcrossRevisions, false);
  assert.equal(identityResolution.taskIdentityResolution.status, 'RESOLVED_BY_OWNER_NEW_REVISION');
  assert.equal(identityResolution.workflowHistory.providerConsumingWorkflowDispatched, false);
  assert.deepEqual(identityResolution.workflowHistory.providerConsumingRunsCreatedAfterResolution, []);
  assert.equal(identityResolution.gateDecision.providerRequests, 'NOT_RUN');
  assert.equal(identityResolution.gateDecision.workflowDispatch, 'NOT_RUN');
  assert.equal(identityResolution.gateDecision.nextHumanGate, 'CONTRACT_PR_REVIEW_AND_MERGE');
  const conflict = loopState.evidenceConflicts.find((item) => item.conflictId === 'EFFECT-R1-TASK-OSS-01-SEED-IDENTITY-001');
  assert.equal(conflict.status, 'RESOLVED_BY_OWNER_R2');
  assert.match(humanGates, /CONTRACT_PR_REVIEW_AND_MERGE/);
  assert.match(humanGates, /TASK_IDENTITY_PR_REVIEW_AND_MERGE/);
});

test('validator rejects corrupted control records', async (t) => {
  await t.test('missing required field', () => {
    const graph = structuredClone(taskGraph);
    delete graph.nodes[0].objective;
    assert.match(validateControl(graph, loopState).join('\n'), /missing objective/);
  });
  await t.test('invalid status', () => {
    const graph = structuredClone(taskGraph);
    graph.nodes[0].status = 'READYISH';
    assert.match(validateControl(graph, loopState).join('\n'), /invalid status READYISH/);
  });
  await t.test('false PASS dependency', () => {
    const graph = structuredClone(taskGraph);
    graph.nodes.find((node) => node.nodeId === 'P0.4').status = 'PASS';
    graph.nodes.find((node) => node.nodeId === 'P0.3').status = 'BLOCKED';
    assert.match(validateControl(graph, loopState).join('\n'), /falsely passes/);
  });
  await t.test('forbidden rerun as active', () => {
    const state = structuredClone(loopState);
    state.activeRunIds = ['30850478318'];
    assert.match(validateControl(taskGraph, state).join('\n'), /forbidden rerun is active/);
  });
  await t.test('completion inconsistent with statuses', () => {
    const state = structuredClone(loopState);
    state.completionPercentage = 100;
    assert.match(validateControl(taskGraph, state).join('\n'), /completion mismatch/);
  });
});

test('ledger accepts appended immutable records and reconciles attempts per selected node', () => {
  assert.equal(ledgerEntries.length >= 6, true);
  assert.equal(new Set(ledgerEntries.map((entry) => entry.cycleId)).size, ledgerEntries.length);
  assert.deepEqual([...ledgerEntries].map((entry) => entry.timestamp).sort(), ledgerEntries.map((entry) => entry.timestamp));
  assert.equal(ledgerEntries.at(-1).cycleId, loopState.lastCycleId);
  assert.equal(ledgerEntries.at(-1).startingSha, loopState.currentMainSha);
  assert.equal(ledgerEntries[1].reconcilesCycleId, ledgerEntries[0].cycleId);
  assert.equal(ledgerEntries.at(-1).reconcilesCycleId, ledgerEntries.at(-2).cycleId);
  assert.equal(ledgerEntries.at(-1).resultingSha, 'EXTERNAL_GITHUB_PR_HEAD_BINDING_REQUIRED');
  const ledgerByNode = new Map();
  for (const entry of ledgerEntries) {
    const entries = ledgerByNode.get(entry.selectedNode) ?? [];
    entries.push(entry);
    ledgerByNode.set(entry.selectedNode, entries);
  }
  for (const [nodeId, entries] of ledgerByNode) {
    const node = taskGraph.nodes.find((candidate) => candidate.nodeId === nodeId);
    assert.ok(node, `ledger references unknown node ${nodeId}`);
    const attemptsBeforeLedger = {'P0.1': 1, 'P1.2': 1, 'P1.4': 1}[nodeId] ?? 0;
    assert.equal(node.attempts, entries.length + attemptsBeforeLedger, `${nodeId} attempts do not match ledger`);
    assert.equal(node.attempts <= 6, true, `${nodeId} exceeds six-cycle ceiling`);
  }
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.1').attempts, 2);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.2').attempts, 6);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P1.4').attempts, 2);
  const providerEntries = ledgerEntries.filter((entry) => entry.providerRequests !== 'NOT_RUN');
  assert.deepEqual(providerEntries.map((entry) => [entry.cycleId, entry.providerRequests]), [
    ['GS-LOOP-2026-08-05-C013', 'ONE_AUTHORIZED_READ_ONLY_CODEX_CHECKER_TASK'],
    ['GS-LOOP-2026-08-05-C014', 'TWO_SEPARATELY_AUTHORIZED_READ_ONLY_CODEX_CHECKER_TASKS'],
  ]);
  for (const entry of ledgerEntries) {
    assert.equal(entry.workflowDispatch, 'NOT_RUN');
    assert.match(entry.claimBoundary, /No provider|no provider|One authorized read-only checker|Two separately authorized read-only checker/i);
  }
});

test('committed control files contain no local user path', () => {
  const combined = [
    JSON.stringify(taskGraph),
    JSON.stringify(loopState),
    ledgerText,
    decisionLog,
    humanGates,
  ].join('\n');
  assert.doesNotMatch(combined, /\/Users\//);
});
