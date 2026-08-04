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
  assert.equal(Number(calculated.toFixed(10)), 21.5);
  assert.equal(loopState.completionPercentage, 21.5);
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.4').status, 'IN_PROGRESS');
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

test('recorded GitHub and human-gate state matches the current control PR', () => {
  assert.equal(loopState.activePR, 83);
  assert.deepEqual(loopState.openPullRequests.active, [81, 83]);
  assert.equal(loopState.latestRunIds.latestValidation, '30911942323');
  assert.equal(taskGraph.nodes.find((node) => node.nodeId === 'P0.4').activePR, 83);
  assert.match(humanGates, /pull\/83/);
  assert.match(humanGates, /c8cdfc3a608b3ff9b886ab516c3a29a67854b362/);
  assert.match(humanGates, /f639e1a3673007146c1417897ab8abe09fd963bc/);
  assert.doesNotMatch(humanGates, /PENDING_PR_CREATION/);
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
  ]) assert.match(decisionLog, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(humanGates, /Explicitly unauthorized/);
  assert.match(humanGates, /orchestration metadata only/);
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

test('ledger accepts appended immutable records and binds the prior technical result', () => {
  assert.equal(ledgerEntries.length >= 2, true);
  assert.equal(new Set(ledgerEntries.map((entry) => entry.cycleId)).size, ledgerEntries.length);
  assert.deepEqual([...ledgerEntries].map((entry) => entry.timestamp).sort(), ledgerEntries.map((entry) => entry.timestamp));
  assert.equal(ledgerEntries.at(-1).cycleId, loopState.lastCycleId);
  assert.equal(ledgerEntries[0].startingSha, loopState.currentMainSha);
  assert.equal(ledgerEntries.at(-1).reconcilesCycleId, ledgerEntries[0].cycleId);
  assert.equal(ledgerEntries.at(-1).resultingSha, 'c8cdfc3a608b3ff9b886ab516c3a29a67854b362');
  assert.equal(ledgerEntries.at(-1).resultingTreeSha, 'f639e1a3673007146c1417897ab8abe09fd963bc');
  for (const entry of ledgerEntries) {
    assert.equal(entry.selectedNode, loopState.activeNode);
    assert.equal(entry.providerRequests, 'NOT_RUN');
    assert.equal(entry.workflowDispatch, 'NOT_RUN');
    assert.match(entry.claimBoundary, /No provider|no provider/i);
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
