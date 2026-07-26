import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  deriveAttemptId,
  sha256Canonical,
} from '../../scripts/lib/governance-impact-core.mjs';
import {
  main,
  parseCommand,
} from '../../scripts/governance-impact-eval.mjs';

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
    },
    read() {
      return { stdout, stderr };
    },
  };
}

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-impact-cli-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runGit(repositoryRoot, args) {
  const result = spawnSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr);
}

function validScenario() {
  return {
    schemaVersion: 1,
    id: 'cli-scenario',
    dataClassification: 'synthetic',
    paths: {
      seedDir: 'seed',
      taskFile: 'task.md',
      governedOverlayDir: 'overlay',
      oracleDir: 'oracle',
    },
    artifactHashes: {
      seed: 'a'.repeat(64),
      task: 'b'.repeat(64),
      governedOverlay: 'c'.repeat(64),
      oracle: 'd'.repeat(64),
    },
    facts: [
      { id: 'FACT-001', kind: 'requirement', statement: 'Do the task.' },
      { id: 'FACT-002', kind: 'prohibition', statement: 'Do not escape.' },
    ],
    factParity: {
      baseline: ['FACT-001', 'FACT-002'],
      governed: ['FACT-001', 'FACT-002'],
    },
    checks: [
      { id: 'CHECK-001', kind: 'acceptance', factIds: ['FACT-001'], critical: true },
      { id: 'CHECK-002', kind: 'prohibition', factIds: ['FACT-002'], critical: true },
      { id: 'CHECK-003', kind: 'privacy', factIds: ['FACT-001'], critical: true },
    ],
    oracle: {
      command: ['node', 'oracle/verify.mjs'],
      checkIds: ['CHECK-001', 'CHECK-002', 'CHECK-003'],
    },
    allowedChangePaths: ['src/'],
    forbiddenChangePaths: ['package.json'],
  };
}

function manifestForScenario(scenario) {
  const scenarioHash = sha256Canonical(scenario);
  const cohort = {
    runtime: 'synthetic',
    model: 'fixture',
    config: 'offline',
    starterCommit: 'a'.repeat(40),
  };
  const attempt = {
    scenarioHash,
    repetitionId: 'rep-1',
    seed: 17,
  };
  attempt.attemptId = deriveAttemptId({ ...attempt, cohort });
  return {
    manifest: { schemaVersion: 1, cohort, attempts: [attempt] },
    attempt,
  };
}

test('CLI grammar accepts only the frozen commands and options', () => {
  assert.deepEqual(parseCommand([]), { command: 'controls', options: {} });
  assert.deepEqual(parseCommand(['validate', '--scenario', 'fixtures/safe']), {
    command: 'validate',
    options: { scenario: 'fixtures/safe' },
  });
  assert.deepEqual(
    parseCommand([
      'aggregate',
      '--manifest', 'manifest.json',
      '--policy', 'policy.json',
      '--run', 'run-a.json',
      '--run', 'run-b.json',
      '--output', 'report.json',
    ]),
    {
      command: 'aggregate',
      options: {
        manifest: 'manifest.json',
        policy: 'policy.json',
        run: ['run-a.json', 'run-b.json'],
        output: 'report.json',
      },
    },
  );
});

for (const argv of [
  ['unknown'],
  ['run', '--scenario', 'scenario'],
  ['validate', '--unknown', 'x', '--scenario', 'scenario'],
  ['validate', '--scenario', 'a', '--scenario', 'b'],
  ['run', '--scenario', '/absolute', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'a'.repeat(64), '--output', 'o'],
  ['run', '--scenario', 's', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'ABC', '--output', 'o'],
  ['run', '--scenario', 's', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'a'.repeat(64), '--output', 'o', '--timeout-ms', '0'],
]) {
  test(`CLI grammar rejects ${JSON.stringify(argv)}`, () => {
    assert.throws(
      () => parseCommand(argv),
      (error) => error.exitCode === 2 && /^[A-Z][A-Z0-9_]*$/.test(error.code),
    );
  });
}

test('default command runs fixed offline controls and never resolves a runtime', async () => {
  const capture = captureIo();
  let resolverCalled = false;
  const exitCode = await main([], capture.io, {
    resolveRuntimeExecutable() {
      resolverCalled = true;
      throw new Error('must not be called');
    },
  });
  const streams = capture.read();
  assert.equal(exitCode, 0);
  assert.equal(resolverCalled, false);
  assert.equal(streams.stderr, '');
  assert.deepEqual(JSON.parse(streams.stdout), {
    schemaVersion: 1,
    ok: true,
    command: 'controls',
    code: 'OK',
    artifact: null,
    summary: {
      controls: [
        'baseline-wins',
        'governed-wins',
        'tie',
        'missing-telemetry',
        'forbidden-change',
      ],
      passed: 5,
    },
  });
});

for (const optIn of [undefined, '0', 'true']) {
  test(`run refuses non-exact real opt-in ${String(optIn)}`, async () => {
    const capture = captureIo();
    let invoked = false;
    const exitCode = await main([
      'run',
      '--scenario', 'scenario',
      '--manifest', 'manifest.json',
      '--policy', 'policy.json',
      '--attempt-id', 'a'.repeat(64),
      '--output', 'raw-run.json',
    ], capture.io, {
      env: optIn === undefined ? {} : { GOVERNANCE_IMPACT_REAL: optIn },
      commandHandlers: {
        run: async () => {
          invoked = true;
        },
      },
    });
    const streams = capture.read();
    assert.equal(exitCode, 2);
    assert.equal(invoked, false);
    assert.equal(streams.stdout, '');
    assert.equal(JSON.parse(streams.stderr).code, 'REAL_MODE_REQUIRED');
  });
}

test('missing executable exits 4 with no mock artifact or reflected path', async () => {
  const capture = captureIo();
  const exitCode = await main([
    'run',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--attempt-id', 'a'.repeat(64),
    '--output', 'raw-run.json',
  ], capture.io, {
    env: { GOVERNANCE_IMPACT_REAL: '1' },
    commandHandlers: {
      run: async () => {
        const error = new Error('/Users/private/bin/not-installed');
        error.code = 'RUNTIME_MISSING';
        error.exitCode = 4;
        throw error;
      },
    },
  });
  const streams = capture.read();
  assert.equal(exitCode, 4);
  assert.equal(streams.stdout, '');
  assert.equal(JSON.parse(streams.stderr).code, 'RUNTIME_MISSING');
  assert.equal(streams.stderr.includes('/Users/private'), false);
});

test('installed unsafe runtime refusal is exit 2 before spawn', async () => {
  for (const runtime of ['claude', 'antigravity']) {
    const capture = captureIo();
    let spawned = false;
    const exitCode = await main([
      'run',
      '--scenario', 'scenario',
      '--manifest', 'manifest.json',
      '--policy', 'policy.json',
      '--attempt-id', 'a'.repeat(64),
      '--output', 'raw-run.json',
    ], capture.io, {
      env: { GOVERNANCE_IMPACT_REAL: '1' },
      commandHandlers: {
        run: async () => {
          spawned = true;
          const error = new Error(runtime);
          error.code = 'SESSION_SAFETY_UNAVAILABLE';
          error.exitCode = 2;
          throw error;
        },
      },
    });
    assert.equal(exitCode, 2);
    assert.equal(spawned, true);
    assert.equal(JSON.parse(capture.read().stderr).code, 'SESSION_SAFETY_UNAVAILABLE');
  }
});

test('installed Codex on POSIX is refused by the default capability gate before arm preparation', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const codexHome = path.join(repositoryRoot, 'codex-home');
  fs.mkdirSync(codexHome);
  const capture = captureIo();
  const scenario = validScenario();
  const cohort = {
    runtime: 'codex',
    model: 'fixture',
    config: 'offline',
    starterCommit: 'a'.repeat(40),
  };
  const attempt = {
    scenarioHash: sha256Canonical(scenario),
    repetitionId: 'rep-1',
    seed: 17,
  };
  attempt.attemptId = deriveAttemptId({ ...attempt, cohort });
  const manifest = {
    schemaVersion: 1,
    cohort,
    attempts: [attempt],
  };
  const policy = { expectedManifestHash: sha256Canonical(manifest) };
  let executableResolved = false;
  let armPrepared = false;
  let childSpawned = false;
  const exitCode = await main([
    'run',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--attempt-id', attempt.attemptId,
    '--output', 'raw-run.json',
  ], capture.io, {
    repositoryRoot,
    platform: 'linux',
    env: {
      GOVERNANCE_IMPACT_REAL: '1',
      CODEX_HOME: codexHome,
      HOME: path.join(repositoryRoot, 'source-home'),
    },
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'policy.json') return policy;
      throw new Error('unexpected input');
    },
    verifyTrackedScenario() {},
    hashScenarioArtifacts: async () => scenario.artifactHashes,
    resolveRuntimeExecutable() {
      executableResolved = true;
      return '/opt/bin/codex';
    },
    runnerDeps: {
      runOracle: async () => {
        throw new Error('must not reach oracle');
      },
      prepareArmWorkspace: async () => {
        armPrepared = true;
        throw new Error('must not prepare an arm');
      },
      runChildSafely: async () => {
        childSpawned = true;
        throw new Error('must not spawn');
      },
    },
  });
  const streams = capture.read();
  assert.equal(exitCode, 2);
  assert.equal(executableResolved, true);
  assert.equal(armPrepared, false);
  assert.equal(childSpawned, false);
  assert.equal(streams.stdout, '');
  assert.equal(JSON.parse(streams.stderr).code, 'SESSION_SAFETY_UNAVAILABLE');
});

test('fatal errors use exactly one closed stderr envelope and stable exit', async () => {
  const capture = captureIo();
  const exitCode = await main(['validate'], capture.io);
  const streams = capture.read();
  assert.equal(exitCode, 2);
  assert.equal(streams.stdout, '');
  assert.equal(streams.stderr.endsWith('\n'), true);
  assert.equal(streams.stderr.trim().split('\n').length, 1);
  assert.deepEqual(Object.keys(JSON.parse(streams.stderr)), [
    'schemaVersion',
    'error',
    'code',
    'exitCode',
    'message',
    'suggestion',
  ]);
});

test('aggregate handler receives policy bootstrap seed and normalized manifest inputs', async () => {
  const capture = captureIo();
  let observed;
  const exitCode = await main([
    'aggregate',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--run', 'run.json',
    '--output', 'report.json',
  ], capture.io, {
    commandHandlers: {
      aggregate: async (options) => {
        observed = options;
        return {
          artifact: { path: 'report.json', sha256: 'b'.repeat(64) },
          summary: {
            manifestHash: 'a'.repeat(64),
            commitment: 'b'.repeat(64),
            expectedPairs: 1,
            comparablePairs: 1,
            rejectedPairs: 0,
          },
        };
      },
    },
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(observed.run, ['run.json']);
  assert.equal(JSON.parse(capture.read().stdout).command, 'aggregate');
});

test('replay recomputes all hashes before scoring and persists only scored evidence', async () => {
  const capture = captureIo();
  const scenario = validScenario();
  const { manifest, attempt } = manifestForScenario(scenario);
  const rawRun = { attemptId: attempt.attemptId, scenario };
  const events = [];
  const scored = {
    attemptId: attempt.attemptId,
    scenarioHash: attempt.scenarioHash,
    arms: {
      baseline: { deliveryPass: true },
      governed: { deliveryPass: false },
    },
    comparison: { winner: 'baseline' },
  };
  const exitCode = await main([
    'replay',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--run', 'run.json',
    '--output', 'result.json',
  ], capture.io, {
    repositoryRoot: '/tmp/task5-replay-root',
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'run.json') return rawRun;
      throw new Error('unexpected input');
    },
    hashScenarioArtifacts: async () => {
      events.push('hash');
      return scenario.artifactHashes;
    },
    scoreRun(value) {
      events.push('score');
      assert.equal(value, rawRun);
      return scored;
    },
    persistJsonAtomically: async (_file, value) => {
      events.push('persist');
      assert.equal(value, scored);
      return { sha256: 'f'.repeat(64) };
    },
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(events, ['hash', 'score', 'persist']);
});

test('replay refuses an output parent symlink that escapes the repository', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const outside = tempDirectory(t);
  fs.symlinkSync(
    outside,
    path.join(repositoryRoot, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const capture = captureIo();
  const scenario = validScenario();
  const { manifest, attempt } = manifestForScenario(scenario);
  const rawRun = { attemptId: attempt.attemptId, scenario };
  const scored = {
    attemptId: attempt.attemptId,
    scenarioHash: attempt.scenarioHash,
    arms: {
      baseline: { deliveryPass: true },
      governed: { deliveryPass: false },
    },
    comparison: { winner: 'baseline' },
  };
  const exitCode = await main([
    'replay',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--run', 'run.json',
    '--output', 'escape/result.json',
  ], capture.io, {
    repositoryRoot,
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'run.json') return rawRun;
      throw new Error('unexpected input');
    },
    hashScenarioArtifacts: async () => scenario.artifactHashes,
    scoreRun: () => scored,
  });
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(capture.read().stderr).code, 'PATH_POLICY_BLOCKED');
  assert.equal(fs.existsSync(path.join(outside, 'result.json')), false);
});

test('run refuses an output parent escape before preparing an arm', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const outside = tempDirectory(t);
  fs.symlinkSync(
    outside,
    path.join(repositoryRoot, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const capture = captureIo();
  const scenario = validScenario();
  const { manifest, attempt } = manifestForScenario(scenario);
  const manifestHash = sha256Canonical(manifest);
  const policy = { expectedManifestHash: manifestHash };
  let armPrepared = false;
  const exitCode = await main([
    'run',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--attempt-id', attempt.attemptId,
    '--output', 'escape/result.json',
  ], capture.io, {
    repositoryRoot,
    env: { GOVERNANCE_IMPACT_REAL: '1' },
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'policy.json') return policy;
      throw new Error('unexpected input');
    },
    verifyTrackedScenario() {},
    hashScenarioArtifacts: async () => scenario.artifactHashes,
    resolveRuntimeExecutable: () => process.execPath,
    runnerDeps: {
      runOracle: async () => {
        throw new Error('must not reach oracle');
      },
      prepareArmWorkspace: async () => {
        armPrepared = true;
        throw new Error('must not prepare an arm');
      },
    },
  });
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(capture.read().stderr).code, 'PATH_POLICY_BLOCKED');
  assert.equal(armPrepared, false);
  assert.equal(fs.existsSync(path.join(outside, 'result.json')), false);
});

test('aggregate refuses an output parent escape without publishing a report', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const outside = tempDirectory(t);
  fs.symlinkSync(
    outside,
    path.join(repositoryRoot, 'escape'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );
  const capture = captureIo();
  const scenario = validScenario();
  const { manifest } = manifestForScenario(scenario);
  const manifestHash = sha256Canonical(manifest);
  const policy = { expectedManifestHash: manifestHash, expectedBootstrapSeed: 77 };
  const acceptedRuns = [];
  const report = {
    manifestHash,
    evidence: {
      acceptedRuns,
      commitment: sha256Canonical({ manifestHash, acceptedRuns }),
    },
    pairing: { expectedPairs: 1, comparablePairs: 0, rejectedPairs: 1 },
  };
  const exitCode = await main([
    'aggregate',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--run', 'run.json',
    '--output', 'escape/report.json',
  ], capture.io, {
    repositoryRoot,
    readExactJson(file) {
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'policy.json') return policy;
      if (path.basename(file) === 'run.json') return { run: true };
      throw new Error('unexpected input');
    },
    aggregateResults: () => report,
  });
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(capture.read().stderr).code, 'PATH_POLICY_BLOCKED');
  assert.equal(fs.existsSync(path.join(outside, 'report.json')), false);
});

test('validate rejects policy without a manifest', async () => {
  const capture = captureIo();
  const scenario = validScenario();
  const exitCode = await main([
    'validate',
    '--scenario', 'scenario',
    '--policy', 'policy.json',
  ], capture.io, {
    repositoryRoot: '/tmp/task5-validate-root',
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      if (path.basename(file) === 'policy.json') return { expectedManifestHash: null };
      throw new Error('unexpected input');
    },
    hashScenarioArtifacts: async () => scenario.artifactHashes,
  });
  assert.equal(exitCode, 2);
  assert.equal(JSON.parse(capture.read().stderr).code, 'MISSING_OPTION');
});

test('validate proves the scenario is tracked and clean before reporting success', async () => {
  const capture = captureIo();
  const scenario = validScenario();
  const events = [];
  const exitCode = await main([
    'validate',
    '--scenario', 'scenario',
  ], capture.io, {
    repositoryRoot: '/tmp/task5-validate-root',
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      throw new Error('unexpected input');
    },
    verifyTrackedScenario(scenarioRoot, value) {
      events.push(['tracked', scenarioRoot, value]);
    },
    hashScenarioArtifacts: async () => {
      events.push(['hash']);
      return scenario.artifactHashes;
    },
  });
  assert.equal(exitCode, 0);
  assert.equal(events[0][0], 'tracked');
  assert.equal(events[0][1], '/tmp/task5-validate-root/scenario');
  assert.equal(events[0][2], scenario);
  assert.deepEqual(events[1], ['hash']);
  assert.equal(events[2][0], 'tracked');
});

test('validate requires every scenario descendant to be tracked and clean', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const scenarioRoot = path.join(repositoryRoot, 'scenario');
  for (const directory of ['seed', 'overlay', 'oracle']) {
    fs.mkdirSync(path.join(scenarioRoot, directory), { recursive: true });
    fs.writeFileSync(path.join(scenarioRoot, directory, 'tracked.txt'), 'tracked\n');
  }
  fs.writeFileSync(path.join(scenarioRoot, 'task.md'), 'task\n');
  const scenario = validScenario();
  fs.writeFileSync(path.join(scenarioRoot, 'scenario.json'), JSON.stringify(scenario));
  runGit(repositoryRoot, ['init', '--quiet']);
  runGit(repositoryRoot, ['config', 'user.email', 'synthetic@example.invalid']);
  runGit(repositoryRoot, ['config', 'user.name', 'Synthetic Test']);
  runGit(repositoryRoot, ['add', 'scenario']);
  runGit(repositoryRoot, ['commit', '--quiet', '-m', 'fixture']);
  const untracked = path.join(scenarioRoot, 'seed', 'untracked.txt');
  fs.writeFileSync(untracked, 'must be rejected\n');

  const invoke = async () => {
    const capture = captureIo();
    const exitCode = await main([
      'validate',
      '--scenario', 'scenario',
    ], capture.io, {
      repositoryRoot,
      readExactJson: () => scenario,
      hashScenarioArtifacts: async () => scenario.artifactHashes,
    });
    return { exitCode, streams: capture.read() };
  };
  const rejected = await invoke();
  assert.equal(rejected.exitCode, 2);
  assert.equal(JSON.parse(rejected.streams.stderr).code, 'SCENARIO_NOT_COMMITTED');

  fs.rmSync(untracked);
  const clean = await invoke();
  assert.equal(clean.exitCode, 0);
  assert.equal(clean.streams.stderr, '');

  const trackedSeed = path.join(scenarioRoot, 'seed', 'tracked.txt');
  fs.writeFileSync(trackedSeed, 'unstaged change\n');
  const unstaged = await invoke();
  assert.equal(unstaged.exitCode, 2);
  assert.equal(JSON.parse(unstaged.streams.stderr).code, 'SCENARIO_NOT_COMMITTED');

  runGit(repositoryRoot, ['add', 'scenario/seed/tracked.txt']);
  const staged = await invoke();
  assert.equal(staged.exitCode, 2);
  assert.equal(JSON.parse(staged.streams.stderr).code, 'SCENARIO_NOT_COMMITTED');
});

test('aggregate calls core seam with policy seed and normalized manifest', async () => {
  const capture = captureIo();
  const scenario = validScenario();
  const { manifest } = manifestForScenario(scenario);
  const manifestHash = sha256Canonical(manifest);
  const policy = { expectedManifestHash: manifestHash, expectedBootstrapSeed: 4815 };
  const rawRun = { id: 'raw-run-reference' };
  let observed;
  const acceptedRuns = [];
  const commitment = sha256Canonical({ manifestHash, acceptedRuns });
  const report = {
    manifestHash,
    evidence: { acceptedRuns, commitment },
    pairing: { expectedPairs: 1, comparablePairs: 0, rejectedPairs: 1 },
  };
  const exitCode = await main([
    'aggregate',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--run', 'run.json',
    '--output', 'report.json',
  ], capture.io, {
    repositoryRoot: '/tmp/task5-aggregate-root',
    readExactJson(file) {
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'policy.json') return policy;
      if (path.basename(file) === 'run.json') return rawRun;
      throw new Error('unexpected input');
    },
    aggregateResults(runs, seed, normalizedManifest) {
      observed = { runs, seed, normalizedManifest };
      return report;
    },
    persistJsonAtomically: async () => ({ sha256: 'e'.repeat(64) }),
  });
  assert.equal(exitCode, 0);
  assert.equal(observed.runs[0], rawRun);
  assert.equal(observed.seed, 4815);
  assert.deepEqual(observed.normalizedManifest, manifest);
});

test('gate calls evaluateGate with report, policy, and raw runs in order', async () => {
  const capture = captureIo();
  const report = { report: true };
  const policy = { claim: 'observed' };
  const rawRun = { run: true };
  let observed;
  const exitCode = await main([
    'gate',
    '--report', 'report.json',
    '--policy', 'policy.json',
    '--run', 'run.json',
  ], capture.io, {
    repositoryRoot: '/tmp/task5-gate-root',
    readExactJson(file) {
      if (path.basename(file) === 'report.json') return report;
      if (path.basename(file) === 'policy.json') return policy;
      if (path.basename(file) === 'run.json') return rawRun;
      throw new Error('unexpected input');
    },
    evaluateGate(...args) {
      observed = args;
      return { pass: true, claim: 'observed', failures: [] };
    },
  });
  assert.equal(exitCode, 0);
  assert.deepEqual(observed, [report, policy, [rawRun]]);
});

test('gate rejection is stdout data with exit 1', async () => {
  const capture = captureIo();
  const exitCode = await main([
    'gate',
    '--report', 'report.json',
    '--policy', 'policy.json',
    '--run', 'run.json',
  ], capture.io, {
    commandHandlers: {
      gate: async () => ({
        gate: { pass: false, claim: 'improves', failures: ['MIN_SCENARIOS'] },
      }),
    },
  });
  const streams = capture.read();
  assert.equal(exitCode, 1);
  assert.equal(streams.stderr, '');
  assert.deepEqual(JSON.parse(streams.stdout), {
    schemaVersion: 1,
    ok: false,
    command: 'gate',
    code: 'GATE_REJECTED',
    claim: 'improves',
    failures: ['MIN_SCENARIOS'],
  });
});
