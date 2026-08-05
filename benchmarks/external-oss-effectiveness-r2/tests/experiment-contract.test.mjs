import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = 'benchmarks/external-oss-effectiveness-r2';
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const contract = readJson(`${ROOT}/experiment-contract.json`);
const schema = readJson(`${ROOT}/experiment-contract.schema.json`);
const manifest = readJson(`${ROOT}/attempt-manifest.json`);
const gates = readJson(`${ROOT}/gate-policy.json`);
const evidence = readJson(`${ROOT}/evidence-index.json`);
const resolution = readJson('benchmarks/external-oss-v8/control/loop/reconciliation/issue-84-comment-5186392861.json');

test('R2 is owner-authorized, supersedes unexecuted R1, and cannot pool evidence', () => {
  assert.equal(contract.experimentId, 'GS-OSS-2026-08-05-EFFECT-R2');
  assert.equal(contract.revision, 2);
  assert.equal(contract.supersession.supersedesBeforeExecution, 'GS-OSS-2026-08-05-EFFECT-R1');
  assert.equal(contract.supersession.r1Executed, false);
  assert.equal(contract.supersession.poolEvidenceAcrossRevisions, false);
  assert.equal(resolution.resolution.authorAssociation, 'OWNER');
  assert.equal(resolution.resolution.commentId, 5186392861);
  assert.equal(resolution.resolution.bodySha256, 'e8ceeb21c85538a8f279db2626f66bed541cfe8476afbcf4604507f4ebff4191');
});

test('contract has exactly the closed top-level schema surface', () => {
  const expected = new Set(schema.required);
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(new Set(Object.keys(contract)), expected);
  for (const key of expected) assert.ok(schema.properties[key], `schema missing ${key}`);
  assert.equal(contract.schemaVersion, schema.properties.schemaVersion.const);
  assert.equal(contract.experimentId, schema.properties.experimentId.const);
  assert.equal(contract.revision, schema.properties.revision.const);
  assert.equal(contract.status, schema.properties.status.const);
});

test('R2 changes TASK-OSS-01 to the V5 reconstruction and preserves the other Pilot identities', () => {
  const tasks = new Map(contract.taskSets.pilot.tasks.map((item) => [item.taskId, item]));
  assert.equal(tasks.size, 3);
  assert.equal(tasks.get('TASK-OSS-01').identitySource, 'V5_RECONSTRUCTED');
  assert.equal(tasks.get('TASK-OSS-01').sealedSeedCommit, '15ba6bed78feebe392dfbe13cf0be4065b260af7');
  assert.equal(tasks.get('TASK-OSS-01').sealedSeedTreeSha256, '3ebafacc713e37ea6939f08b1205198b415c5ae62dcbddb9f11ce4ab732ee70e');
  assert.equal(tasks.get('TASK-OSS-03').sealedSeedCommit, '2ccc49b77ba0c0e9dc159fcce5516efa7c0e7a18');
  assert.equal(tasks.get('TASK-OSS-09').sealedSeedCommit, '5f5ab1beea4feaaecee7131b4b36185f09e2f53c');
  assert.equal(resolution.taskIdentityResolution.status, 'RESOLVED_BY_OWNER_NEW_REVISION');
});

test('task counts and deterministic R2 randomization manifest are exact', () => {
  assert.equal(contract.taskSets.pilot.pairedAttempts, 9);
  assert.equal(contract.taskSets.pilot.armExecutions, 18);
  assert.equal(contract.taskSets.confirmatory.tasks.length, 8);
  assert.equal(contract.taskSets.confirmatory.pairedAttempts, 24);
  assert.equal(contract.taskSets.confirmatory.armExecutions, 48);
  assert.equal(manifest.pairCount, 33);
  assert.equal(manifest.armExecutionCount, 66);
  assert.equal(manifest.pairs.length, 33);
  const identities = new Set();
  for (const pair of manifest.pairs) {
    const input = `${contract.experimentId}|${pair.taskId}|rep-${pair.repetition}|${contract.randomization.masterSeed}`;
    const expectedSeed = Number.parseInt(createHash('sha256').update(input).digest('hex').slice(0, 8), 16);
    assert.equal(pair.attemptSeed, expectedSeed, input);
    assert.deepEqual(pair.armOrder, expectedSeed % 2 === 0 ? ['baseline', 'governed'] : ['governed', 'baseline']);
    assert.equal(identities.has(input), false, `duplicate pair ${input}`);
    identities.add(input);
  }
});

test('confirmatory identities and execution gates fail closed', () => {
  assert.equal(contract.taskSets.confirmatory.identityStatus, 'BLOCKED_PENDING_FORMAL_LOCK_INPUTS');
  for (const task of contract.taskSets.confirmatory.tasks) {
    assert.equal('sealedSeedCommit' in task, false);
    assert.equal('hiddenOracleSha256' in task, false);
  }
  for (const [name, gate] of Object.entries(gates.gates)) assert.equal(gate.status, 'BLOCKED', name);
  assert.equal(gates.providerRequests, 'NOT_RUN');
  assert.equal(gates.workflowDispatch, 'NOT_RUN');
  assert.ok(contract.gates.currentlyUnauthorized.includes('provider request'));
  assert.ok(contract.gates.currentlyUnauthorized.includes('workflow dispatch'));
  assert.ok(contract.gates.currentlyUnauthorized.includes('formal lock'));
  assert.ok(contract.gates.currentlyUnauthorized.includes('Pilot'));
});

test('scorer and every evidence-index hash binding match current bytes', () => {
  assert.equal(sha256(contract.scoring.schema.path), contract.scoring.schema.sha256);
  assert.equal(sha256(contract.scoring.implementation.path), contract.scoring.implementation.sha256);
  for (const item of [...evidence.artifacts, ...evidence.sourceBindings]) {
    assert.equal(sha256(item.path), item.sha256, item.path);
  }
});

test('contract includes the frozen analysis, acceptance, budgets, retention, and claim limits', () => {
  assert.equal(contract.analysis.method.iterations, 2000);
  assert.equal(contract.analysis.method.confidence, 0.95);
  assert.equal(contract.analysis.method.seed, 2026080501);
  assert.equal(contract.budgets.timeoutSecondsPerArm, 2700);
  assert.equal(contract.budgets.providerTokenCeilingPerArm, 150000);
  assert.equal(contract.budgets.costUsd.total, 330);
  assert.equal(contract.budgets.retryOrReplacementAllowed, false);
  assert.ok(contract.scoring.confirmatoryAcceptance.includes('lower 95 percent confidence bound is strictly greater than zero'));
  assert.equal(contract.evidence.artifactRetentionDays, 90);
  assert.match(contract.claimBoundary, /no universal/i);
  assert.match(contract.claimBoundary, /Pilot supports operational feasibility only/);
});

test('committed R2 artifacts contain no local user paths or credential material', () => {
  const combined = [
    'experiment-contract.schema.json', 'experiment-contract.json', 'attempt-manifest.json',
    'gate-policy.json', 'evidence-index.json', 'report.md',
  ].map((name) => readFileSync(`${ROOT}/${name}`, 'utf8')).join('\n');
  assert.doesNotMatch(combined, /\/Users\//);
  assert.doesNotMatch(combined, /\bsk-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(combined, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/);
});
