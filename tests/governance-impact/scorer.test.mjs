import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  aggregateResults,
  compareArms,
  deriveAttemptId,
  evaluateGate,
  normalizeAttemptManifest,
  scoreRun,
  sha256Canonical,
} from '../../scripts/lib/governance-impact-core.mjs';

function loadControl(name) {
  const file = new URL('./controls/' + name + '/run.json', import.meta.url);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function reviewScenario(id = 'scope-guard') {
  return {
    schemaVersion: 1,
    id,
    dataClassification: 'synthetic',
    paths: {
      seedDir: 'seed',
      taskFile: 'task.md',
      governedOverlayDir: 'governed-overlay',
      oracleDir: 'oracle',
    },
    artifactHashes: {
      seed: 'a'.repeat(64),
      task: 'b'.repeat(64),
      governedOverlay: 'c'.repeat(64),
      oracle: 'd'.repeat(64),
    },
    facts: [
      { id: 'FACT-001', kind: 'requirement', statement: 'Update src/message.txt.' },
      { id: 'FACT-002', kind: 'prohibition', statement: 'Do not change package.json.' },
    ],
    factParity: {
      baseline: ['FACT-001', 'FACT-002'],
      governed: ['FACT-001', 'FACT-002'],
    },
    checks: [
      { id: 'CHECK-001', kind: 'acceptance', factIds: ['FACT-001'], critical: true },
      { id: 'CHECK-002', kind: 'prohibition', factIds: ['FACT-002'], critical: true },
      { id: 'CHECK-003', kind: 'document', factIds: ['FACT-001'], critical: true },
      { id: 'CHECK-004', kind: 'privacy', factIds: ['FACT-001'], critical: true },
    ],
    oracle: {
      command: ['node', 'oracle/verify.mjs', '--json'],
      checkIds: ['CHECK-001', 'CHECK-002', 'CHECK-003', 'CHECK-004'],
    },
    allowedChangePaths: ['src/'],
    forbiddenChangePaths: ['package.json'],
  };
}

function attemptIdentity(run) {
  const arm = run.arms.baseline;
  return sha256Canonical({
    scenarioHash: arm.scenarioHash,
    repetitionId: run.repetitionId,
    seed: run.seed,
    runtime: arm.runtime,
    model: arm.model,
    config: arm.config,
    starterCommit: arm.starterCommit,
  });
}

function refreshRunIdentity(run) {
  const scenarioHash = sha256Canonical(run.scenario);
  for (const arm of Object.values(run.arms)) arm.scenarioHash = scenarioHash;
  run.attemptId = attemptIdentity(run);
  return run;
}

function preregisteredRun(name, repetitionId = 'rep-1', scenario = reviewScenario()) {
  const run = loadControl(name);
  run.scenario = scenario;
  run.repetitionId = repetitionId;
  for (const arm of Object.values(run.arms)) {
    arm.acceptanceChecks[0].id = 'CHECK-001';
    arm.requirements[0].id = 'FACT-001';
    arm.prohibitions[0].id = 'CHECK-002';
    arm.documentChecks[0].id = 'CHECK-003';
    arm.privacyChecks = [{ id: 'CHECK-004', passed: true, critical: true }];
  }
  return refreshRunIdentity(run);
}

function boundaryRun(acceptanceCount) {
  const run = preregisteredRun('tie', 'boundary-' + acceptanceCount);
  const fixedChecks = run.scenario.checks.filter((check) => check.kind !== 'acceptance');
  const acceptanceChecks = Array.from({ length: acceptanceCount }, (_, index) => ({
    id: 'CHECK-' + String(index + 100).padStart(3, '0'),
    kind: 'acceptance',
    factIds: ['FACT-001'],
    critical: true,
  }));
  run.scenario.checks = [...acceptanceChecks, ...fixedChecks];
  run.scenario.oracle.checkIds = run.scenario.checks.map((check) => check.id);
  for (const [armName, arm] of Object.entries(run.arms)) {
    const passedCount = acceptanceCount - (armName === 'baseline' ? 2 : 3);
    arm.acceptanceChecks = acceptanceChecks.map((check, index) => ({
      id: check.id,
      passed: index < passedCount,
      critical: true,
    }));
  }
  run.arms.baseline.execution.repairRounds = 1;
  run.arms.governed.execution.repairRounds = 0;
  return refreshRunIdentity(run);
}

function mixedExactBoundaryRun() {
  const run = preregisteredRun('tie', 'mixed-exact-boundary');
  const requirementFacts = [
    run.scenario.facts.find((fact) => fact.id === 'FACT-001'),
    ...Array.from({ length: 69 }, (_, index) => ({
      id: 'FACT-' + String(index + 100).padStart(3, '0'),
      kind: 'requirement',
      statement: 'Requirement ' + String(index + 2) + '.',
    })),
  ];
  const prohibitionFact = run.scenario.facts.find((fact) => fact.id === 'FACT-002');
  run.scenario.facts = [...requirementFacts, prohibitionFact];
  const factIds = run.scenario.facts.map((fact) => fact.id);
  run.scenario.factParity = { baseline: factIds, governed: factIds };

  const fixedChecks = run.scenario.checks.filter((check) => check.kind !== 'acceptance');
  const acceptanceChecks = requirementFacts.map((fact, index) => ({
    id: 'CHECK-' + String(index + 100).padStart(3, '0'),
    kind: 'acceptance',
    factIds: [fact.id],
    critical: true,
  }));
  run.scenario.checks = [...acceptanceChecks, ...fixedChecks];
  run.scenario.oracle.checkIds = run.scenario.checks.map((check) => check.id);

  for (const [armName, arm] of Object.entries(run.arms)) {
    const failedAcceptance = armName === 'baseline' ? 0 : 1;
    arm.acceptanceChecks = acceptanceChecks.map((check, index) => ({
      id: check.id,
      passed: index < acceptanceChecks.length - failedAcceptance,
      critical: true,
    }));
    arm.requirements = requirementFacts.map((fact, index) => ({
      id: fact.id,
      omitted: armName === 'governed' && index === 0,
    }));
    arm.documentChecks[0].drifted = true;
  }
  run.arms.baseline.execution.repairRounds = 1;
  run.arms.governed.execution.repairRounds = 0;
  return refreshRunIdentity(run);
}

function manifestFor(runs) {
  const arm = runs[0].arms.baseline;
  return {
    schemaVersion: 1,
    cohort: {
      runtime: arm.runtime,
      model: arm.model,
      config: arm.config,
      starterCommit: arm.starterCommit,
    },
    attempts: runs.map((run) => ({
      attemptId: run.attemptId,
      scenarioHash: run.arms.baseline.scenarioHash,
      repetitionId: run.repetitionId,
      seed: run.seed,
    })),
  };
}

function boundaryEvidence(overrides = {}) {
  return {
    observedImageDigest: '1'.repeat(64),
    codexVersion: 'codex-cli 1.2.3',
    codexBinarySha256: '2'.repeat(64),
    containmentPolicyHash: '3'.repeat(64),
    networkPolicyHash: '4'.repeat(64),
    proxyPolicyHash: '5'.repeat(64),
    hardening: {
      nonRootUser: true,
      readOnlyRootFilesystem: true,
      capDropAll: true,
      noNewPrivileges: true,
      privatePidNamespace: true,
      privateCgroupNamespace: true,
      pidLimit: true,
      cpuLimit: true,
      memoryLimit: true,
      dockerSocketAbsent: true,
      devicesAbsent: true,
      cgroupMountAbsent: true,
    },
    pidNamespaceStopped: true,
    cgroupEmpty: true,
    cleanupComplete: true,
    ...overrides,
  };
}

function v2AttemptIdentity(run) {
  const arm = run.arms.baseline;
  return sha256Canonical({
    scenarioHash: arm.scenarioHash,
    repetitionId: run.repetitionId,
    seed: run.seed,
    runtime: arm.runtime,
    model: arm.model,
    config: arm.config,
    starterCommit: arm.starterCommit,
    executionBoundaryId: arm.executionBoundaryId,
  });
}

function v2Run(executionBoundaryId = 'e'.repeat(64)) {
  const run = preregisteredRun('tie', 'oci-v2');
  run.schemaVersion = 2;
  for (const arm of Object.values(run.arms)) {
    arm.runtime = 'codex';
    arm.model = 'gpt-5';
    arm.config = 'oci-v2';
    arm.executionBoundaryId = executionBoundaryId;
    arm.boundaryEvidence = boundaryEvidence();
  }
  run.attemptId = v2AttemptIdentity(run);
  return run;
}

function v2ManifestFor(runs) {
  const arm = runs[0].arms.baseline;
  return {
    schemaVersion: 2,
    cohort: {
      runtime: arm.runtime,
      model: arm.model,
      config: arm.config,
      starterCommit: arm.starterCommit,
      executionBoundaryId: arm.executionBoundaryId,
    },
    attempts: runs.map((run) => ({
      attemptId: run.attemptId,
      scenarioHash: run.arms.baseline.scenarioHash,
      repetitionId: run.repetitionId,
      seed: run.seed,
    })),
  };
}

test('baseline control selects baseline', () => {
  assert.equal(scoreRun(loadControl('baseline-wins')).comparison.winner, 'baseline');
});

test('governed control selects governed', () => {
  assert.equal(scoreRun(loadControl('governed-wins')).comparison.winner, 'governed');
});

test('equivalent passing arms tie even when time and token totals differ', () => {
  const result = scoreRun(loadControl('tie'));
  assert.equal(result.comparison.winner, 'tie');
  assert.deepEqual(result.comparison.comparableFields, [
    'deliveryPass',
    'deliveryScore',
    'repairRounds',
    'time',
    'tokens',
  ]);
});

test('forbidden change fails even when acceptance passes', () => {
  const result = scoreRun(loadControl('forbidden-change'));
  assert.equal(result.arms.governed.deliveryPass, false);
  assert.equal(result.arms.governed.scope.forbiddenPathCount, 1);
});

test('delivery score uses the preregistered weighted formula', () => {
  const result = scoreRun(loadControl('forbidden-change'));
  assert.equal(result.arms.baseline.deliveryScore, 100);
  assert.equal(result.arms.governed.deliveryScore, 92.5);
});

test('delivery score remains unrounded and the one-point boundary is exact', () => {
  const fractional = scoreRun(boundaryRun(3));
  assert.equal(
    fractional.arms.baseline.deliveryScore,
    100 * (0.5 * (1 / 3) + 0.2 + 0.15 + 0.15),
  );
  assert.notEqual(fractional.arms.baseline.deliveryScore, 66.666667);

  const belowBoundary = scoreRun(boundaryRun(51));
  assert.ok(Math.abs(belowBoundary.comparison.scoreDelta) < 1);
  assert.equal(belowBoundary.comparison.winner, 'governed');
  assert.equal(belowBoundary.comparison.reason, 'repair-rounds');

  const atBoundary = scoreRun(boundaryRun(50));
  assert.equal(atBoundary.comparison.scoreDelta, -1);
  assert.equal(atBoundary.comparison.winner, 'baseline');
  assert.equal(atBoundary.comparison.reason, 'delivery-score');

  const mixedBoundary = scoreRun(mixedExactBoundaryRun());
  assert.equal(mixedBoundary.comparison.scoreDelta, -1);
  assert.equal(mixedBoundary.comparison.winner, 'baseline');
  assert.equal(mixedBoundary.comparison.reason, 'delivery-score');
});

test('unavailable token data remains null and does not choose a winner', () => {
  const result = scoreRun(loadControl('missing-telemetry'));
  assert.equal(result.arms.baseline.tokens.total, null);
  assert.equal(result.comparison.comparableFields.includes('tokens'), false);
  assert.equal(result.comparison.winner, 'tie');
});

test('winner precedence is pass, score delta, repair rounds, then tie', () => {
  const passing = scoreRun(loadControl('tie')).arms.baseline;
  const failing = {
    ...passing,
    deliveryPass: false,
    deliveryScore: 100,
    repairRounds: 0,
  };
  const lowerPassing = {
    ...passing,
    deliveryScore: 98.9,
    repairRounds: 0,
  };
  const closePassing = {
    ...passing,
    deliveryScore: 99.5,
    repairRounds: 0,
  };

  assert.equal(compareArms(failing, { ...passing, deliveryScore: 0 }).winner, 'governed');
  assert.equal(compareArms(passing, lowerPassing).winner, 'baseline');
  assert.equal(compareArms(passing, closePassing).winner, 'governed');
  assert.equal(compareArms(passing, { ...passing }).winner, 'tie');
});

test('canonical SHA-256 is stable across object key order', () => {
  const expected = '43258cff783fe7036d8a43033f830adfc60ec037382473548ac742b888292777';
  assert.equal(sha256Canonical({ b: 2, a: 1 }), expected);
  assert.equal(sha256Canonical({ a: 1, b: 2 }), expected);
});

test('canonical SHA-256 rejects unsupported, cyclic, and sparse values without collisions', () => {
  for (const value of [Number.NaN, Number.POSITIVE_INFINITY, undefined, 1n, new Date(0)]) {
    assert.throws(() => sha256Canonical(value), /canonical json/i);
  }
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => sha256Canonical(cyclic), /cycle/i);
  assert.throws(() => sha256Canonical(new Array(1)), /sparse|canonical json/i);
});

test('Task 5 identity helpers expose the exact attempt and manifest contract', () => {
  const run = preregisteredRun('tie');
  const cohort = {
    runtime: run.arms.baseline.runtime,
    model: run.arms.baseline.model,
    config: run.arms.baseline.config,
    starterCommit: run.arms.baseline.starterCommit,
  };
  assert.equal(
    deriveAttemptId({
      scenarioHash: run.arms.baseline.scenarioHash,
      repetitionId: run.repetitionId,
      seed: run.seed,
      cohort,
    }),
    run.attemptId,
  );

  const manifest = manifestFor([run]);
  assert.deepEqual(normalizeAttemptManifest(manifest), {
    manifest,
    manifestHash: sha256Canonical(manifest),
  });
});

test('v1 synthetic attempt, manifest, raw, and scored hashes remain byte-compatible', () => {
  const run = loadControl('tie');
  const manifest = manifestFor([run]);
  assert.equal(
    run.attemptId,
    'fa250770ab41a77f3576fa9e6269d9a9fb76565cf007671d23660ae4eb460d88',
  );
  assert.equal(
    normalizeAttemptManifest(manifest).manifestHash,
    '3ffaeeafc74b924451bdad453b23a5884be703d4380cb21d1386aaaca1282fbb',
  );
  assert.equal(
    sha256Canonical(run),
    '489f2f1609977b25d208f56d64b1eb9f70365a401e745e95277166c0b0e7ff50',
  );
  assert.equal(
    sha256Canonical(scoreRun(run)),
    '4900f4f3e70f33f088d17b6e317159f403c8c19b99b8959de626294b9343f7f4',
  );
});

test('v2 attempt and canonical manifest identities include executionBoundaryId', () => {
  const run = v2Run();
  const cohort = {
    runtime: run.arms.baseline.runtime,
    model: run.arms.baseline.model,
    config: run.arms.baseline.config,
    starterCommit: run.arms.baseline.starterCommit,
    executionBoundaryId: run.arms.baseline.executionBoundaryId,
  };
  assert.equal(
    deriveAttemptId({
      schemaVersion: 2,
      scenarioHash: run.arms.baseline.scenarioHash,
      repetitionId: run.repetitionId,
      seed: run.seed,
      cohort,
    }),
    run.attemptId,
  );

  const changedBoundaryId = deriveAttemptId({
    schemaVersion: 2,
    scenarioHash: run.arms.baseline.scenarioHash,
    repetitionId: run.repetitionId,
    seed: run.seed,
    cohort: { ...cohort, executionBoundaryId: 'f'.repeat(64) },
  });
  assert.notEqual(changedBoundaryId, run.attemptId);

  const manifest = v2ManifestFor([run]);
  assert.deepEqual(normalizeAttemptManifest(manifest), {
    manifest,
    manifestHash: sha256Canonical(manifest),
  });
});

test('v2 scoring preserves closed boundary evidence in both scored arms', () => {
  const run = v2Run();
  const result = scoreRun(run);
  assert.equal(result.schemaVersion, 2);
  for (const armName of ['baseline', 'governed']) {
    assert.equal(
      result.arms[armName].executionBoundaryId,
      run.arms[armName].executionBoundaryId,
    );
    assert.deepEqual(
      result.arms[armName].boundaryEvidence,
      run.arms[armName].boundaryEvidence,
    );
  }
});

test('v2 scoring rejects different execution boundaries and boundary observations across arms', () => {
  const differentId = v2Run();
  differentId.arms.governed.executionBoundaryId = 'f'.repeat(64);
  assert.throws(() => scoreRun(differentId), /pairContract|executionBoundaryId/i);

  const differentEvidence = v2Run();
  differentEvidence.arms.governed.boundaryEvidence.observedImageDigest = '9'.repeat(64);
  assert.throws(() => scoreRun(differentEvidence), /pairContract|boundaryEvidence/i);
});

test('v2 boundary evidence is complete, closed, safe, and affirmative', () => {
  for (const key of Object.keys(boundaryEvidence())) {
    const run = v2Run();
    delete run.arms.baseline.boundaryEvidence[key];
    assert.throws(() => scoreRun(run), new RegExp(key, 'i'), key);
  }

  for (const forbidden of ['containerId', 'bearer', 'socketPath', 'privatePath']) {
    const run = v2Run();
    run.arms.baseline.boundaryEvidence[forbidden] = 'must-not-persist';
    assert.throws(() => scoreRun(run), /boundaryEvidence|unknown/i, forbidden);
  }

  const incompleteCleanup = v2Run();
  incompleteCleanup.arms.baseline.boundaryEvidence.cleanupComplete = false;
  assert.throws(() => scoreRun(incompleteCleanup), /cleanupComplete/i);

  const multilineVersion = v2Run();
  multilineVersion.arms.baseline.boundaryEvidence.codexVersion = 'codex 1.2.3\nprivate';
  assert.throws(() => scoreRun(multilineVersion), /codexVersion/i);
});

test('v2 aggregate accepts only the preregistered execution boundary', () => {
  const registered = v2Run('e'.repeat(64));
  const manifest = v2ManifestFor([registered]);
  const outsideBoundary = v2Run('f'.repeat(64));

  const report = aggregateResults([registered, outsideBoundary], 20, manifest);
  assert.equal(report.pairing.comparablePairs, 1);
  assert.equal(report.pairing.rejectedPairs, 1);
  assert.deepEqual(report.cohort, manifest.cohort);
  assert.deepEqual(report.rejectedAttempts, [
    { attemptId: outsideBoundary.attemptId, code: 'UNREGISTERED_ATTEMPT' },
  ]);
});

test('scoring rejects runtime labels outside the preregistered adapter set', () => {
  const run = loadControl('tie');
  run.arms.baseline.runtime = 'unknown-runtime';
  assert.throws(() => scoreRun(run), /arms\.baseline\.runtime/);
});

test('scoring rejects ambiguous starter commit lengths', () => {
  const run = loadControl('tie');
  run.arms.baseline.starterCommit = 'a'.repeat(41);
  assert.throws(() => scoreRun(run), /arms\.baseline\.starterCommit/);
});

test('aggregate counts distinct preregistered scenarios and keeps unavailable metrics null', () => {
  const runs = [];
  for (let scenario = 0; scenario < 5; scenario += 1) {
    for (let repetition = 0; repetition < 3; repetition += 1) {
      runs.push(
        preregisteredRun(
          repetition === 0 ? 'missing-telemetry' : 'governed-wins',
          `rep-${repetition + 1}`,
          reviewScenario(`scenario-${scenario + 1}`),
        ),
      );
    }
  }
  const manifest = manifestFor(runs);
  const first = aggregateResults(runs, 42017, manifest);
  const second = aggregateResults(runs, 42017, manifest);

  assert.deepEqual(first, second);
  assert.equal(first.pairing.expectedPairs, 15);
  assert.equal(first.pairing.comparablePairs, 15);
  assert.equal(first.pairing.rejectedPairs, 0);
  assert.equal(first.pairing.missingPairs, 0);
  assert.equal(first.scenarios.count, 5);
  assert.equal(first.scenarios.minimumCompleteRepetitions, 3);
  assert.equal(first.coverage.tokens, 0);
  assert.equal(first.metrics.tokens, null);
  assert.equal(first.bootstrap.seed, 42017);
});

const improvesPolicy = {
  claim: 'improves',
  minScenarios: 5,
  minCompleteRepetitions: 3,
  minPairCompleteness: 0.9,
  confidenceLevel: 0.95,
  minConfidenceLowerBound: 0,
  minTelemetryCoverage: 0.8,
  telemetryClaims: [],
};

function passingGateEvidence({
  scenarioCount = 5,
  repetitions = 3,
  missingIndexes = [],
  control = 'governed-wins',
} = {}) {
  const allRuns = [];
  for (let scenario = 0; scenario < scenarioCount; scenario += 1) {
    for (let repetition = 0; repetition < repetitions; repetition += 1) {
      allRuns.push(
        preregisteredRun(
          control,
          `rep-${repetition + 1}`,
          reviewScenario(`gate-scenario-${scenario + 1}`),
        ),
      );
    }
  }
  const missingIndexSet = new Set(missingIndexes);
  const rawRuns = allRuns.filter((_, index) => !missingIndexSet.has(index));
  const manifest = manifestFor(allRuns);
  return {
    allRuns,
    rawRuns,
    manifest,
    report: aggregateResults(rawRuns, 1, manifest),
  };
}

function passingGateReport(options) {
  return passingGateEvidence(options).report;
}

function pinnedPolicy(report, overrides = {}) {
  return {
    ...improvesPolicy,
    expectedManifestHash: report.manifestHash,
    expectedBootstrapSeed: report.bootstrap.seed,
    ...overrides,
  };
}

test('release gate requires samples, completeness, confidence, and no regressions', () => {
  const passing = passingGateEvidence();
  assert.equal(
    evaluateGate(passing.report, pinnedPolicy(passing.report), passing.rawRuns).pass,
    true,
  );

  const failedEvidence = passingGateEvidence({ scenarioCount: 4 });
  const failedReport = failedEvidence.report;
  failedReport.metrics.deliveryPassDelta.confidence95.lower = 0;
  failedReport.regressions.criticalScope = 1;
  const failed = evaluateGate(
    failedReport,
    pinnedPolicy(failedReport),
    failedEvidence.rawRuns,
  );

  assert.equal(failed.pass, false);
  assert.deepEqual(failed.failures, [
    'REPORT_EVIDENCE_MISMATCH',
    'MIN_SCENARIOS',
    'CONFIDENCE_LOWER_BOUND',
    'CRITICAL_REGRESSION',
  ]);
});

test('release gate cannot make telemetry claims below coverage threshold', () => {
  const evidence = passingGateEvidence();
  const result = evaluateGate(
    evidence.report,
    pinnedPolicy(evidence.report, { telemetryClaims: ['tokens'] }),
    evidence.rawRuns,
  );
  assert.equal(result.pass, false);
  assert.deepEqual(result.failures, ['TELEMETRY_COVERAGE_TOKENS']);
});

test('an improves policy cannot weaken the public evidence thresholds', () => {
  const evidence = passingGateEvidence({
    scenarioCount: 1,
    repetitions: 2,
    missingIndexes: [1],
  });
  const { report, rawRuns } = evidence;

  const result = evaluateGate(report, {
    ...pinnedPolicy(report),
    minScenarios: 0,
    minCompleteRepetitions: 0,
    minPairCompleteness: 0,
    confidenceLevel: 0.5,
    minConfidenceLowerBound: -1,
    minTelemetryCoverage: 0,
    telemetryClaims: ['tokens'],
  }, rawRuns);

  assert.equal(result.pass, false);
  assert.deepEqual(result.failures, [
    'MIN_SCENARIOS',
    'MIN_COMPLETE_REPETITIONS',
    'PAIR_COMPLETENESS',
    'TELEMETRY_COVERAGE_TOKENS',
  ]);
});

test('aggregate accepts only raw evidence and requires a preregistered manifest', () => {
  const run = preregisteredRun('tie');
  const manifest = manifestFor([run]);
  const scored = scoreRun(run);

  const rejected = aggregateResults([scored], 17, manifest);
  assert.equal(rejected.pairing.comparablePairs, 0);
  assert.equal(rejected.pairing.rejectedPairs, 1);
  assert.deepEqual(rejected.rejectedAttempts, [
    { attemptId: scored.attemptId, code: 'INVALID_RAW_RUN' },
  ]);
  assert.throws(() => aggregateResults([run], 17), /manifest/i);
});

test('manifest is the completeness denominator and cloned run IDs do not add repetitions', () => {
  const run = preregisteredRun('governed-wins');
  const manifest = manifestFor([run]);
  const missing = aggregateResults([], 18, manifest);
  assert.equal(missing.pairing.expectedPairs, 1);
  assert.equal(missing.pairing.missingPairs, 1);
  assert.deepEqual(missing.missingAttempts, [
    {
      attemptId: run.attemptId,
      scenarioHash: run.arms.baseline.scenarioHash,
      repetitionId: run.repetitionId,
      seed: run.seed,
      code: 'MISSING_SUBMISSION',
    },
  ]);
  assert.deepEqual(missing.manifest, manifest);
  assert.equal(missing.manifestHash, sha256Canonical(manifest));

  const clone = structuredClone(run);
  clone.runId = 'forged-new-run-id';
  const duplicated = aggregateResults([run, clone], 18, manifest);
  assert.equal(duplicated.pairing.submittedRuns, 2);
  assert.equal(duplicated.pairing.comparablePairs, 0);
  assert.equal(duplicated.pairing.missingPairs, 1);
  assert.equal(duplicated.pairing.rejectedPairs, 2);
  assert.deepEqual(duplicated.rejectedAttempts, [
    { attemptId: run.attemptId, code: 'DUPLICATE_SUBMISSION' },
    { attemptId: run.attemptId, code: 'DUPLICATE_SUBMISSION' },
  ]);
});

test('manifest closes unknown keys and duplicate scenario repetition identities', () => {
  const run = preregisteredRun('tie');
  const unknown = manifestFor([run]);
  unknown.attempts[0].order = 1;
  assert.throws(() => aggregateResults([run], 181, unknown), /manifest.*order.*unknown/i);

  const duplicate = manifestFor([run]);
  const second = structuredClone(duplicate.attempts[0]);
  second.seed += 1;
  second.attemptId = sha256Canonical({
    scenarioHash: second.scenarioHash,
    repetitionId: second.repetitionId,
    seed: second.seed,
    ...duplicate.cohort,
  });
  duplicate.attempts.push(second);
  assert.throws(
    () => aggregateResults([run], 181, duplicate),
    /manifest.*repetitionId.*duplicate/i,
  );
});

test('aggregate rejects a run outside the manifest cohort instead of pooling it', () => {
  const first = preregisteredRun('tie', 'rep-1');
  const second = preregisteredRun('governed-wins', 'rep-2');
  const manifest = manifestFor([first, second]);
  second.arms.baseline.runtime = 'codex';
  second.arms.governed.runtime = 'codex';
  second.attemptId = attemptIdentity(second);

  const report = aggregateResults([first, second], 19, manifest);
  assert.equal(report.pairing.comparablePairs, 1);
  assert.equal(report.pairing.missingPairs, 1);
  assert.equal(report.pairing.rejectedPairs, 1);
  assert.deepEqual(report.cohort, manifest.cohort);
});

test('scoreRun binds artifact digests, evidence IDs, critical flags, and scope rules', () => {
  const artifactDrift = preregisteredRun('tie');
  artifactDrift.scenario.artifactHashes.oracle = 'e'.repeat(64);
  assert.throws(() => scoreRun(artifactDrift), /scenarioHash|scenario/i);

  const easierGovernedChecks = preregisteredRun('tie');
  easierGovernedChecks.arms.governed.acceptanceChecks[0].id = 'CHECK-999';
  assert.throws(() => scoreRun(easierGovernedChecks), /acceptanceChecks|contract/i);

  const downgradedCritical = preregisteredRun('tie');
  downgradedCritical.arms.governed.prohibitions[0].critical = false;
  assert.throws(() => scoreRun(downgradedCritical), /prohibitions|critical/i);

  const widerScope = preregisteredRun('tie');
  widerScope.arms.governed.scope.allowedPaths = ['src/', 'package.json'];
  assert.throws(() => scoreRun(widerScope), /scope|allowedPaths/i);
});

test('raw scoring fails closed on missing privacy evidence and unknown keys', () => {
  const missingPrivacy = preregisteredRun('tie');
  delete missingPrivacy.arms.baseline.privacyChecks;
  assert.throws(() => scoreRun(missingPrivacy), /privacyChecks/i);

  const unknownRoot = preregisteredRun('tie');
  unknownRoot.rawStdout = 'must never be accepted';
  assert.throws(() => scoreRun(unknownRoot), /rawStdout|unknown/i);

  const unknownTelemetry = preregisteredRun('tie');
  unknownTelemetry.arms.baseline.tokens.estimated = true;
  assert.throws(() => scoreRun(unknownTelemetry), /tokens|estimated/i);
});

test('seeded aggregate is invariant to raw input permutation', () => {
  const runs = [];
  for (let repetition = 0; repetition < 15; repetition += 1) {
    const run = preregisteredRun('tie', `rep-${repetition + 1}`);
    run.arms.baseline.execution.repairRounds = 0;
    run.arms.governed.execution.repairRounds = repetition;
    runs.push(run);
  }
  const manifest = manifestFor(runs);
  const reversedManifest = structuredClone(manifest);
  reversedManifest.attempts.reverse();
  assert.deepEqual(
    aggregateResults(runs, 123, manifest),
    aggregateResults([...runs].reverse(), 123, reversedManifest),
  );
});

test('each aggregate metric has an independent deterministic bootstrap stream', () => {
  const completeRuns = [];
  const missingTelemetryRuns = [];
  for (let repetition = 0; repetition < 15; repetition += 1) {
    const run = preregisteredRun('tie', `rep-${repetition + 1}`);
    run.arms.baseline.execution.repairRounds = repetition;
    run.arms.governed.execution.repairRounds = repetition % 4;
    completeRuns.push(run);

    const withoutTelemetry = structuredClone(run);
    withoutTelemetry.arms.baseline.time = {
      availability: 'unavailable',
      wallTimeMs: null,
    };
    withoutTelemetry.arms.baseline.tokens = {
      availability: 'unavailable',
      total: null,
    };
    missingTelemetryRuns.push(withoutTelemetry);
  }
  const manifest = manifestFor(completeRuns);
  const complete = aggregateResults(completeRuns, 234, manifest);
  const missing = aggregateResults(missingTelemetryRuns, 234, manifest);

  assert.deepEqual(complete.metrics.deliveryPassDelta, missing.metrics.deliveryPassDelta);
  assert.deepEqual(complete.metrics.deliveryScoreDelta, missing.metrics.deliveryScoreDelta);
  assert.deepEqual(complete.metrics.repairRoundsDelta, missing.metrics.repairRoundsDelta);
  assert.equal(complete.metrics.time?.n, 15);
  assert.equal(complete.metrics.tokens?.n, 15);
  assert.equal(missing.metrics.time, null);
  assert.equal(missing.metrics.tokens, null);
});

test('public gate rejects non-finite/inconsistent reports and unknown policy fields', () => {
  const nonFinite = passingGateReport();
  nonFinite.scenarios.count = Number.NaN;
  nonFinite.pairing.completeness = Number.NaN;
  nonFinite.metrics.deliveryPassDelta.mean = Number.NaN;
  nonFinite.metrics.deliveryPassDelta.confidence95.lower = Number.NaN;
  for (const key of Object.keys(nonFinite.regressions)) nonFinite.regressions[key] = Number.NaN;
  assert.throws(() => evaluateGate(nonFinite, pinnedPolicy(nonFinite)), /report|finite|scenarios/i);

  assert.throws(
    () => {
      const report = passingGateReport();
      return evaluateGate(report, { ...pinnedPolicy(report), confidenceMetric: 'repairRoundsDelta' });
    },
    /policy|confidenceMetric|unknown/i,
  );
  assert.throws(
    () => {
      const report = passingGateReport();
      return evaluateGate(report, { ...pinnedPolicy(report), unknownThreshold: 0 });
    },
    /policy|unknownThreshold|unknown/i,
  );
});

test('public gate enforces the exact report shape and arithmetic invariants', () => {
  const unknown = passingGateReport();
  unknown.authoredConclusion = 'pass';
  assert.throws(() => evaluateGate(unknown, pinnedPolicy(unknown)), /authoredConclusion|unknown/i);

  const inconsistentPairing = passingGateReport();
  inconsistentPairing.pairing.missingPairs = 1;
  assert.throws(() => evaluateGate(inconsistentPairing, pinnedPolicy(inconsistentPairing)), /missingPairs.*consistency/i);

  const inconsistentSubmissionArithmetic = passingGateReport();
  inconsistentSubmissionArithmetic.pairing.submittedRuns += 1;
  assert.throws(
    () => evaluateGate(
      inconsistentSubmissionArithmetic,
      pinnedPolicy(inconsistentSubmissionArithmetic),
    ),
    /rejectedPairs.*consistency/i,
  );

  const invertedConfidence = passingGateReport();
  invertedConfidence.metrics.deliveryPassDelta.confidence95 = { lower: 0.4, upper: 0.1 };
  assert.throws(() => evaluateGate(invertedConfidence, pinnedPolicy(invertedConfidence)), /confidence95.*ordering/i);

  const meanOutsideConfidence = passingGateReport();
  meanOutsideConfidence.metrics.deliveryPassDelta.mean = 0;
  meanOutsideConfidence.metrics.deliveryPassDelta.confidence95 = { lower: 0.01, upper: 0.4 };
  assert.throws(
    () => evaluateGate(meanOutsideConfidence, pinnedPolicy(meanOutsideConfidence)),
    /confidence95.*mean|mean.*confidence95/i,
  );

  for (const invalidRegression of [-1, 0.5]) {
    const invalid = passingGateReport();
    invalid.regressions.privacy = invalidRegression;
    assert.throws(() => evaluateGate(invalid, pinnedPolicy(invalid)), /regressions\.privacy/i);
  }

  const infiniteMetric = passingGateReport();
  infiniteMetric.metrics.deliveryScoreDelta.mean = Number.POSITIVE_INFINITY;
  assert.throws(() => evaluateGate(infiniteMetric, pinnedPolicy(infiniteMetric)), /deliveryScoreDelta.*mean/i);

  const impossibleScenarioTotals = passingGateReport();
  impossibleScenarioTotals.scenarios.count = 6;
  impossibleScenarioTotals.scenarios.minimumCompleteRepetitions = 3;
  assert.throws(
    () => evaluateGate(impossibleScenarioTotals, pinnedPolicy(impossibleScenarioTotals)),
    /scenarios.*consistency/i,
  );

  const unknownNested = passingGateReport();
  unknownNested.metrics.deliveryPassDelta.confidence95.pValue = 0.01;
  assert.throws(
    () => evaluateGate(unknownNested, pinnedPolicy(unknownNested)),
    /pValue.*unknown/i,
  );

  const alteredCommitment = passingGateReport();
  alteredCommitment.evidence.acceptedRuns[0].rawRunHash = 'f'.repeat(64);
  assert.throws(
    () => evaluateGate(alteredCommitment, pinnedPolicy(alteredCommitment)),
    /commitment.*consistency/i,
  );
});

test('swapping identical arm evidence inverts every directional outcome exactly', () => {
  const run = preregisteredRun('baseline-wins');
  const original = scoreRun(run);
  const swappedRun = structuredClone(run);
  [swappedRun.arms.baseline, swappedRun.arms.governed] = [
    swappedRun.arms.governed,
    swappedRun.arms.baseline,
  ];
  const swapped = scoreRun(swappedRun);

  assert.equal(original.comparison.winner, 'baseline');
  assert.equal(swapped.comparison.winner, 'governed');
  assert.equal(swapped.comparison.deliveryPassDelta, -original.comparison.deliveryPassDelta);
  assert.equal(swapped.comparison.scoreDelta, -original.comparison.scoreDelta);
  assert.equal(swapped.comparison.repairRoundsDelta, -original.comparison.repairRoundsDelta);
  assert.equal(swapped.comparison.timeDeltaMs, original.comparison.timeDeltaMs === null ? null : -original.comparison.timeDeltaMs);
  assert.equal(swapped.comparison.tokenDelta, original.comparison.tokenDelta === null ? null : -original.comparison.tokenDelta);

  assert.equal(swapped.arms.baseline.deliveryScore, original.arms.governed.deliveryScore);
  assert.equal(swapped.arms.governed.deliveryScore, original.arms.baseline.deliveryScore);
  assert.equal(swapped.arms.baseline.deliveryPass, original.arms.governed.deliveryPass);
  assert.equal(swapped.arms.governed.deliveryPass, original.arms.baseline.deliveryPass);

  const tieRun = preregisteredRun('tie', 'label-swap-tie');
  const tie = scoreRun(tieRun);
  [tieRun.arms.baseline, tieRun.arms.governed] = [
    tieRun.arms.governed,
    tieRun.arms.baseline,
  ];
  const swappedTie = scoreRun(tieRun);
  assert.equal(swappedTie.comparison.winner, 'tie');
  assert.equal(swappedTie.comparison.timeDeltaMs, -tie.comparison.timeDeltaMs);
  assert.equal(swappedTie.comparison.tokenDelta, -tie.comparison.tokenDelta);
});

test('artifact and attempt identity tampering cannot escape a pinned manifest', () => {
  const original = preregisteredRun('governed-wins');
  const manifest = manifestFor([original]);
  const originalReport = aggregateResults([original], 901, manifest);

  const forged = structuredClone(original);
  forged.scenario.artifactHashes.oracle = 'e'.repeat(64);
  refreshRunIdentity(forged);
  const forgedReport = aggregateResults([forged], 901, manifest);

  assert.equal(forgedReport.manifestHash, originalReport.manifestHash);
  assert.equal(forgedReport.pairing.comparablePairs, 0);
  assert.equal(forgedReport.pairing.missingPairs, 1);
  assert.deepEqual(forgedReport.rejectedAttempts, [
    { attemptId: forged.attemptId, code: 'UNREGISTERED_ATTEMPT' },
  ]);

  const forgedAttemptId = structuredClone(original);
  forgedAttemptId.attemptId = 'f'.repeat(64);
  assert.throws(() => scoreRun(forgedAttemptId), /attemptId/i);

  const forgedManifest = structuredClone(manifest);
  forgedManifest.attempts[0].attemptId = 'f'.repeat(64);
  assert.throws(() => aggregateResults([original], 901, forgedManifest), /manifest.*attemptId/i);
});

test('public improves gate requires a pinned manifest hash and blocks rejected evidence', () => {
  const runs = [];
  for (let scenario = 0; scenario < 5; scenario += 1) {
    for (let repetition = 0; repetition < 4; repetition += 1) {
      runs.push(
        preregisteredRun(
          'governed-wins',
          `rep-${repetition + 1}`,
          reviewScenario(`gate-scenario-${scenario + 1}`),
        ),
      );
    }
  }
  const manifest = manifestFor(runs);
  const clean = aggregateResults(runs, 902, manifest);
  const policy = pinnedPolicy(clean);
  assert.equal(evaluateGate(clean, policy, runs).pass, true);

  assert.deepEqual(evaluateGate(clean, improvesPolicy, runs).failures, [
    'BOOTSTRAP_SEED_UNPINNED',
    'MANIFEST_HASH_UNPINNED',
  ]);
  assert.deepEqual(
    evaluateGate(clean, { ...policy, expectedManifestHash: '0'.repeat(64) }, runs).failures,
    ['MANIFEST_HASH_MISMATCH'],
  );
  assert.deepEqual(
    evaluateGate(clean, { ...policy, expectedBootstrapSeed: 999 }, runs).failures,
    ['BOOTSTRAP_SEED_MISMATCH'],
  );

  const invalidExtra = structuredClone(runs[0]);
  invalidExtra.rawStdout = 'must never be accepted';
  const rejected = aggregateResults([...runs, invalidExtra], 902, manifest);
  assert.equal(rejected.pairing.completeness, 1);
  assert.equal(rejected.scenarios.minimumCompleteRepetitions, 4);
  assert.deepEqual(evaluateGate(rejected, policy, [...runs, invalidExtra]).failures, [
    'REJECTED_ATTEMPTS',
  ]);
});

test('public gate recomputes the report from committed accepted raw runs', () => {
  const runs = [];
  for (let scenario = 0; scenario < 5; scenario += 1) {
    for (let repetition = 0; repetition < 3; repetition += 1) {
      runs.push(
        preregisteredRun(
          'governed-wins',
          `rep-${repetition + 1}`,
          reviewScenario(`evidence-scenario-${scenario + 1}`),
        ),
      );
    }
  }
  const report = aggregateResults(runs, 903, manifestFor(runs));
  const policy = pinnedPolicy(report);

  assert.equal(report.evidence.acceptedRuns.length, 15);
  assert.equal(report.evidence.commitment, sha256Canonical({
    manifestHash: report.manifestHash,
    acceptedRuns: report.evidence.acceptedRuns,
  }));
  assert.equal(evaluateGate(report, policy, runs).pass, true);
  assert.deepEqual(evaluateGate(report, policy).failures, ['EVIDENCE_UNVERIFIED']);

  const forged = structuredClone(report);
  forged.metrics.deliveryPassDelta.mean = 0.5;
  forged.metrics.deliveryPassDelta.confidence95 = { lower: 0.1, upper: 0.9 };
  assert.deepEqual(evaluateGate(forged, policy, runs).failures, [
    'REPORT_EVIDENCE_MISMATCH',
  ]);

  const regressionRuns = structuredClone(runs);
  regressionRuns[0].arms.governed.privacyChecks[0].passed = false;
  const regressionReport = aggregateResults(
    regressionRuns,
    903,
    manifestFor(regressionRuns),
  );
  const regressionPolicy = pinnedPolicy(regressionReport);
  assert.deepEqual(
    evaluateGate(regressionReport, regressionPolicy, regressionRuns).failures,
    ['CRITICAL_REGRESSION'],
  );
  const hiddenRegression = structuredClone(regressionReport);
  hiddenRegression.regressions.privacy = 0;
  assert.deepEqual(
    evaluateGate(hiddenRegression, regressionPolicy, regressionRuns).failures,
    ['REPORT_EVIDENCE_MISMATCH'],
  );
});
