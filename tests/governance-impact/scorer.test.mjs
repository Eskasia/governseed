import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

import {
  aggregateResults,
  compareArms,
  evaluateGate,
  scoreRun,
  sha256Canonical,
} from '../../scripts/lib/governance-impact-core.mjs';

function loadControl(name) {
  const file = new URL('./controls/' + name + '/run.json', import.meta.url);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
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

test('scoring rejects runtime labels outside the preregistered adapter set', () => {
  const run = loadControl('tie');
  run.arms.baseline.runtime = 'unknown-runtime';
  assert.throws(() => scoreRun(run), /arm\.runtime/);
});

test('scoring rejects ambiguous starter commit lengths', () => {
  const run = loadControl('tie');
  run.arms.baseline.starterCommit = 'a'.repeat(41);
  assert.throws(() => scoreRun(run), /arm\.starterCommit/);
});

test('aggregate does not count duplicate run IDs as independent repetitions', () => {
  const result = scoreRun(loadControl('governed-wins'));
  const report = aggregateResults([result, structuredClone(result)], 91);

  assert.equal(report.pairing.totalPairs, 2);
  assert.equal(report.pairing.comparablePairs, 1);
  assert.equal(report.pairing.rejectedPairs, 1);
  assert.equal(report.scenarios.minimumCompleteRepetitions, 1);
});

test('aggregate excludes mismatched pairs and keeps unavailable metrics null', () => {
  const governed = scoreRun(loadControl('governed-wins'));
  const tie = scoreRun(loadControl('missing-telemetry'));
  const results = [];

  for (let scenario = 0; scenario < 5; scenario += 1) {
    for (let repetition = 0; repetition < 3; repetition += 1) {
      const source = repetition === 0 ? tie : governed;
      const result = structuredClone(source);
      const scenarioHash = String(scenario + 1).repeat(64);
      result.runId = `scenario-${scenario + 1}-run-${repetition + 1}`;
      result.arms.baseline.scenarioHash = scenarioHash;
      result.arms.governed.scenarioHash = scenarioHash;
      results.push(result);
    }
  }

  const mismatch = structuredClone(governed);
  mismatch.runId = 'mismatched-model';
  mismatch.arms.governed.model = 'different-model';
  results.push(mismatch);

  const first = aggregateResults(results, 42017);
  const second = aggregateResults(results, 42017);

  assert.deepEqual(first, second);
  assert.equal(first.pairing.totalPairs, 16);
  assert.equal(first.pairing.comparablePairs, 15);
  assert.equal(first.pairing.rejectedPairs, 1);
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
  confidenceMetric: 'deliveryPassDelta',
  minConfidenceLowerBound: 0,
  minTelemetryCoverage: 0.8,
  telemetryClaims: [],
};

function passingGateReport() {
  return {
    pairing: {
      totalPairs: 15,
      comparablePairs: 15,
      rejectedPairs: 0,
      completeness: 1,
    },
    scenarios: {
      count: 5,
      minimumCompleteRepetitions: 3,
    },
    metrics: {
      deliveryPassDelta: {
        mean: 0.2,
        confidence95: { lower: 0.01, upper: 0.4 },
      },
      tokens: null,
      time: null,
    },
    coverage: { tokens: 0, time: 0 },
    regressions: {
      criticalScope: 0,
      criticalProhibition: 0,
      privacy: 0,
      criticalDocument: 0,
    },
  };
}

test('release gate requires samples, completeness, confidence, and no regressions', () => {
  const report = passingGateReport();
  assert.equal(evaluateGate(report, improvesPolicy).pass, true);

  report.scenarios.count = 4;
  report.metrics.deliveryPassDelta.confidence95.lower = 0;
  report.regressions.criticalScope = 1;
  const failed = evaluateGate(report, improvesPolicy);

  assert.equal(failed.pass, false);
  assert.deepEqual(failed.failures, [
    'MIN_SCENARIOS',
    'CONFIDENCE_LOWER_BOUND',
    'CRITICAL_REGRESSION',
  ]);
});

test('release gate cannot make telemetry claims below coverage threshold', () => {
  const report = passingGateReport();
  report.coverage.tokens = 0.79;
  const result = evaluateGate(report, { ...improvesPolicy, telemetryClaims: ['tokens'] });
  assert.equal(result.pass, false);
  assert.deepEqual(result.failures, ['TELEMETRY_COVERAGE_TOKENS']);
});

test('an improves policy cannot weaken the public evidence thresholds', () => {
  const report = passingGateReport();
  report.scenarios.count = 1;
  report.scenarios.minimumCompleteRepetitions = 1;
  report.pairing.completeness = 0.5;
  report.coverage.tokens = 0.1;

  const result = evaluateGate(report, {
    ...improvesPolicy,
    minScenarios: 0,
    minCompleteRepetitions: 0,
    minPairCompleteness: 0,
    confidenceLevel: 0.5,
    minConfidenceLowerBound: -1,
    minTelemetryCoverage: 0,
    telemetryClaims: ['tokens'],
  });

  assert.equal(result.pass, false);
  assert.deepEqual(result.failures, [
    'MIN_SCENARIOS',
    'MIN_COMPLETE_REPETITIONS',
    'PAIR_COMPLETENESS',
    'TELEMETRY_COVERAGE_TOKENS',
  ]);
});
