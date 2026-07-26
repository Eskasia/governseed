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
  verifyTrackedEvidenceFiles,
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

function validBoundaryEvidence(overrides = {}) {
  return {
    observedImageDigest: 'a'.repeat(64),
    codexVersion: 'codex-cli 1.2.3',
    codexBinarySha256: 'c'.repeat(64),
    containmentPolicyHash: 'd'.repeat(64),
    networkPolicyHash: 'e'.repeat(64),
    proxyPolicyHash: 'f'.repeat(64),
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

function validPreflightReceipt({
  executionBoundaryId,
  imageReference,
  model = 'gpt-5.6-codex',
  timeoutMs = 300_000,
  boundaryEvidence = validBoundaryEvidence({
    observedImageDigest: imageReference.slice(imageReference.lastIndexOf(':') + 1),
  }),
} = {}) {
  return {
    schemaVersion: 1,
    kind: 'governance-impact-oci-preflight',
    preflightStatus: 'READY',
    claimDisposition: 'NOT_EVALUATED',
    runtime: 'codex',
    model,
    timeoutMs,
    provenance: {
      imageReference,
      expectedCodexVersion: 'codex-cli 1.2.3',
      expectedCodexBinarySha256: 'c'.repeat(64),
    },
    executionBoundaryId,
    boundaryEvidence,
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

test('CLI grammar accepts the credential-free OCI preflight contract', () => {
  const imageReference =
    `registry.example/governance/codex@sha256:${'a'.repeat(64)}`;
  assert.deepEqual(parseCommand([
    'preflight',
    '--model', 'gpt-5.6-codex',
    '--runtime-image', imageReference,
    '--codex-version', 'codex-cli 1.2.3',
    '--codex-binary-sha256', 'c'.repeat(64),
    '--timeout-ms', '300000',
    '--output', 'artifacts/governance-impact/preflight.json',
  ]), {
    command: 'preflight',
    options: {
      model: 'gpt-5.6-codex',
      'runtime-image': imageReference,
      'codex-version': 'codex-cli 1.2.3',
      'codex-binary-sha256': 'c'.repeat(64),
      'timeout-ms': 300_000,
      output: 'artifacts/governance-impact/preflight.json',
    },
  });
  assert.throws(
    () => parseCommand([
      'preflight',
      '--model', 'gpt-5.6-codex',
      '--runtime-image', imageReference,
      '--codex-version', 'codex-cli 1.2.3',
      '--codex-binary-sha256', 'c'.repeat(64),
      '--output', 'preflight.json',
    ]),
    (error) => error.code === 'MISSING_OPTION',
  );
});

test('CLI grammar accepts the reviewed OCI provenance tuple for real Codex runs', () => {
  const imageDigest = `registry.example/governance/codex@sha256:${'a'.repeat(64)}`;
  assert.deepEqual(
    parseCommand([
      'run',
      '--scenario', 'scenario',
      '--manifest', 'manifest.json',
      '--policy', 'policy.json',
      '--preflight-receipt', 'preflight.json',
      '--attempt-id', 'b'.repeat(64),
      '--output', 'raw-run.json',
      '--runtime-image', imageDigest,
      '--codex-version', 'codex-cli 1.2.3',
      '--codex-binary-sha256', 'c'.repeat(64),
    ]),
    {
      command: 'run',
      options: {
        scenario: 'scenario',
        manifest: 'manifest.json',
        policy: 'policy.json',
        'preflight-receipt': 'preflight.json',
        'attempt-id': 'b'.repeat(64),
        output: 'raw-run.json',
        'runtime-image': imageDigest,
        'codex-version': 'codex-cli 1.2.3',
        'codex-binary-sha256': 'c'.repeat(64),
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
  ['run', '--scenario', 's', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'a'.repeat(64), '--output', 'o', '--timeout-ms', '600001'],
  ['run', '--scenario', 's', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'a'.repeat(64), '--output', 'o', '--runtime-image', 'registry/repo:latest'],
  ['run', '--scenario', 's', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'a'.repeat(64), '--output', 'o', '--runtime-image', `registry/repo@sha256:${'b'.repeat(64)}`, '--codex-version', 'codex\nsecret'],
  ['run', '--scenario', 's', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'a'.repeat(64), '--output', 'o', '--runtime-image', `registry/repo@sha256:${'b'.repeat(64)}`, '--codex-version', 'codex/secret'],
  ['run', '--scenario', 's', '--manifest', 'm', '--policy', 'p', '--attempt-id', 'a'.repeat(64), '--output', 'o', '--codex-binary-sha256', 'ABC'],
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

test('OCI preflight publishes one closed receipt without reading the runtime credential', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const capture = captureIo();
  const imageReference =
    `registry.example/governance/codex@sha256:${'a'.repeat(64)}`;
  const executionBoundaryId = 'b'.repeat(64);
  const evidence = validBoundaryEvidence();
  const proxy = Object.freeze({ kind: 'synthetic-proxy' });
  let persisted = null;
  let preflightCalls = 0;
  const guardedEnvironment = new Proxy({
    GOVERNANCE_IMPACT_REAL: '1',
  }, {
    get(target, key) {
      if (key === 'OPENAI_API_KEY') {
        assert.fail('preflight must not read the runtime credential');
      }
      return Reflect.get(target, key);
    },
  });

  const exitCode = await main([
    'preflight',
    '--model', 'gpt-5.6-codex',
    '--runtime-image', imageReference,
    '--codex-version', 'codex-cli 1.2.3',
    '--codex-binary-sha256', 'c'.repeat(64),
    '--timeout-ms', '300000',
    '--output', 'artifacts/governance-impact/preflight.json',
  ], capture.io, {
    repositoryRoot,
    platform: 'linux',
    env: guardedEnvironment,
    createOciProxyFacade(options) {
      assert.deepEqual(options, {
        model: 'gpt-5.6-codex',
        deadlineMs: 300_000,
      });
      return proxy;
    },
    createOciSupervisor(options) {
      assert.equal(options.platform, 'linux');
      assert.equal(options.proxy, proxy);
      return {
        async preflightAndReconcile(provenance) {
          preflightCalls += 1;
          assert.deepEqual(provenance, {
            imageReference,
            expectedCodexVersion: 'codex-cli 1.2.3',
            expectedCodexBinarySha256: 'c'.repeat(64),
          });
          return {
            executionBoundaryId,
            boundaryEvidence: evidence,
          };
        },
      };
    },
    async persistJsonAtomically(file, value) {
      persisted = { file, value };
      return { sha256: '1'.repeat(64) };
    },
  });

  const streams = capture.read();
  assert.equal(exitCode, 0, streams.stderr);
  assert.equal(preflightCalls, 1);
  assert.equal(streams.stderr, '');
  assert.deepEqual(persisted.value, {
    schemaVersion: 1,
    kind: 'governance-impact-oci-preflight',
    preflightStatus: 'READY',
    claimDisposition: 'NOT_EVALUATED',
    runtime: 'codex',
    model: 'gpt-5.6-codex',
    timeoutMs: 300_000,
    provenance: {
      imageReference,
      expectedCodexVersion: 'codex-cli 1.2.3',
      expectedCodexBinarySha256: 'c'.repeat(64),
    },
    executionBoundaryId,
    boundaryEvidence: evidence,
  });
  assert.equal(
    path.relative(repositoryRoot, persisted.file),
    path.join('artifacts', 'governance-impact', 'preflight.json'),
  );
  const output = JSON.parse(streams.stdout);
  assert.equal(output.command, 'preflight');
  assert.equal(output.artifact.sha256, '1'.repeat(64));
  assert.equal(output.summary.claimDisposition, 'NOT_EVALUATED');
});

test('OCI preflight rejects malformed proof without publishing a receipt', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const capture = captureIo();
  const imageReference =
    `registry.example/governance/codex@sha256:${'a'.repeat(64)}`;
  let persisted = false;

  const exitCode = await main([
    'preflight',
    '--model', 'gpt-5.6-codex',
    '--runtime-image', imageReference,
    '--codex-version', 'codex-cli 1.2.3',
    '--codex-binary-sha256', 'c'.repeat(64),
    '--timeout-ms', '300000',
    '--output', 'artifacts/governance-impact/preflight.json',
  ], capture.io, {
    repositoryRoot,
    platform: 'linux',
    env: { GOVERNANCE_IMPACT_REAL: '1' },
    createOciProxyFacade: () => ({}),
    createOciSupervisor: () => ({
      async preflightAndReconcile() {
        return {
          executionBoundaryId: 'b'.repeat(64),
          boundaryEvidence: validBoundaryEvidence({
            cleanupComplete: false,
          }),
        };
      },
    }),
    async persistJsonAtomically() {
      persisted = true;
      return { sha256: '1'.repeat(64) };
    },
  });

  const streams = capture.read();
  assert.equal(exitCode, 4);
  assert.equal(persisted, false);
  assert.equal(streams.stdout, '');
  assert.equal(
    JSON.parse(streams.stderr).code,
    'OCI_PREFLIGHT_RECEIPT_INVALID',
  );
});

test('v2 Linux Codex routes through OCI provenance without host binary or CODEX_HOME', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const capture = captureIo();
  const scenario = validScenario();
  const executionBoundaryId = 'e'.repeat(64);
  const cohort = {
    runtime: 'codex',
    model: 'gpt-5.6-codex',
    config: 'oci-v2',
    starterCommit: 'a'.repeat(40),
    executionBoundaryId,
  };
  const attempt = {
    scenarioHash: sha256Canonical(scenario),
    repetitionId: 'rep-1',
    seed: 17,
  };
  attempt.attemptId = deriveAttemptId({
    schemaVersion: 2,
    ...attempt,
    cohort,
  });
  const manifest = {
    schemaVersion: 2,
    cohort,
    attempts: [attempt],
  };
  const policy = { expectedManifestHash: sha256Canonical(manifest) };
  const imageReference =
    `registry.example/governance/codex@sha256:${'b'.repeat(64)}`;
  const boundaryEvidence = validBoundaryEvidence({
    observedImageDigest: 'b'.repeat(64),
  });
  const receipt = validPreflightReceipt({
    executionBoundaryId,
    imageReference,
    boundaryEvidence,
  });
  const upstreamKey = 'CANARY_UPSTREAM_KEY_MUST_STAY_ON_HOST';
  const events = [];
  const proxy = Object.freeze({ kind: 'opaque-facade' });
  let getUpstreamKey;
  let credentialReads = 0;
  const supervisor = {
    async preflightAndReconcile(provenance) {
      events.push('preflight');
      assert.deepEqual(provenance, {
        imageReference,
        expectedCodexVersion: 'codex-cli 1.2.3',
        expectedCodexBinarySha256: 'c'.repeat(64),
      });
      return { executionBoundaryId, boundaryEvidence };
    },
    async openArm() {
      throw new Error('runner seam owns arm opening');
    },
  };
  const exitCode = await main([
    'run',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--preflight-receipt', 'preflight.json',
    '--attempt-id', attempt.attemptId,
    '--output', 'raw-run.json',
    '--runtime-image', imageReference,
    '--codex-version', 'codex-cli 1.2.3',
    '--codex-binary-sha256', 'c'.repeat(64),
  ], capture.io, {
    repositoryRoot,
    platform: 'linux',
    env: {
      GOVERNANCE_IMPACT_REAL: '1',
      HOME: '/private/source-home',
      get OPENAI_API_KEY() {
        credentialReads += 1;
        events.push('credential-read');
        return upstreamKey;
      },
    },
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'policy.json') return policy;
      if (path.basename(file) === 'preflight.json') return receipt;
      throw new Error('unexpected input');
    },
    verifyTrackedScenario() {},
    verifyTrackedEvidence(files) {
      assert.deepEqual(
        files.map((file) => path.basename(file)),
        ['manifest.json', 'policy.json', 'preflight.json'],
      );
    },
    hashScenarioArtifacts: async () => scenario.artifactHashes,
    resolveRuntimeExecutable() {
      assert.fail('OCI route must not resolve a host runtime');
    },
    createOciProxyFacade(options) {
      events.push('create-proxy');
      assert.equal(options.attemptId, attempt.attemptId);
      assert.equal(options.model, cohort.model);
      assert.equal(options.deadlineMs, 300_000);
      assert.equal(typeof options.getUpstreamKey, 'function');
      getUpstreamKey = options.getUpstreamKey;
      return proxy;
    },
    createOciSupervisor(options) {
      events.push('create-supervisor');
      assert.deepEqual(options, {
        platform: 'linux',
        proxy,
      });
      return supervisor;
    },
    async runPairedScenario(options) {
      events.push('run-paired');
      assert.equal(getUpstreamKey(), upstreamKey);
      assert.equal(options.executable, undefined);
      assert.equal(options.codexHome, undefined);
      assert.equal(options.timeoutMs, 300_000);
      assert.equal(typeof options.deps.openArmSession, 'function');
      return {
        rawRun: { schemaVersion: 2, marker: 'safe' },
        scored: {
          attemptId: attempt.attemptId,
          scenarioHash: attempt.scenarioHash,
          arms: {
            baseline: { deliveryPass: true },
            governed: { deliveryPass: true },
          },
          comparison: { winner: 'tie' },
        },
        armOrder: ['baseline', 'governed'],
      };
    },
  });
  const streams = capture.read();
  assert.equal(exitCode, 0, streams.stderr);
  assert.deepEqual(events, [
    'create-proxy',
    'create-supervisor',
    'preflight',
    'credential-read',
    'run-paired',
  ]);
  assert.equal(credentialReads, 1);
  assert.equal(streams.stderr, '');
  assert.equal(streams.stdout.includes(upstreamKey), false);
});

test('v2 boundary mismatch stops before credential access or arm execution', async (t) => {
  const repositoryRoot = tempDirectory(t);
  const capture = captureIo();
  const scenario = validScenario();
  const cohort = {
    runtime: 'codex',
    model: 'gpt-5.6-codex',
    config: 'oci-v2',
    starterCommit: 'a'.repeat(40),
    executionBoundaryId: 'e'.repeat(64),
  };
  const attempt = {
    scenarioHash: sha256Canonical(scenario),
    repetitionId: 'rep-1',
    seed: 17,
  };
  attempt.attemptId = deriveAttemptId({
    schemaVersion: 2,
    ...attempt,
    cohort,
  });
  const manifest = {
    schemaVersion: 2,
    cohort,
    attempts: [attempt],
  };
  const policy = { expectedManifestHash: sha256Canonical(manifest) };
  const imageReference =
    `registry.example/governance/codex@sha256:${'b'.repeat(64)}`;
  const receipt = validPreflightReceipt({
    executionBoundaryId: cohort.executionBoundaryId,
    imageReference,
    boundaryEvidence: validBoundaryEvidence({
      observedImageDigest: 'b'.repeat(64),
    }),
  });
  const exitCode = await main([
    'run',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--preflight-receipt', 'preflight.json',
    '--attempt-id', attempt.attemptId,
    '--output', 'raw-run.json',
    '--runtime-image',
    imageReference,
    '--codex-version', 'codex-cli 1.2.3',
    '--codex-binary-sha256', 'c'.repeat(64),
  ], capture.io, {
    repositoryRoot,
    platform: 'linux',
    env: {
      GOVERNANCE_IMPACT_REAL: '1',
      get OPENAI_API_KEY() {
        assert.fail('boundary mismatch must not read the runtime credential');
      },
    },
    readExactJson(file) {
      if (path.basename(file) === 'scenario.json') return scenario;
      if (path.basename(file) === 'manifest.json') return manifest;
      if (path.basename(file) === 'policy.json') return policy;
      if (path.basename(file) === 'preflight.json') return receipt;
      throw new Error('unexpected input');
    },
    verifyTrackedScenario() {},
    verifyTrackedEvidence() {},
    hashScenarioArtifacts: async () => scenario.artifactHashes,
    createOciProxyFacade: () => Object.freeze({ kind: 'opaque-facade' }),
    createOciSupervisor: () => ({
      async preflightAndReconcile() {
        return { executionBoundaryId: 'd'.repeat(64) };
      },
      async openArm() {
        assert.fail('boundary mismatch must not open an arm');
      },
    }),
    async runPairedScenario() {
      assert.fail('boundary mismatch must not start paired execution');
    },
  });

  const streams = capture.read();
  assert.equal(exitCode, 2);
  assert.equal(streams.stdout, '');
  assert.equal(JSON.parse(streams.stderr).code, 'EXECUTION_BOUNDARY_MISMATCH');
});

test('fatal errors use exactly one closed stderr envelope and stable exit', async () => {
  const capture = captureIo();
  const exitCode = await main(['validate'], capture.io);
  const streams = capture.read();
  assert.equal(exitCode, 2);
  assert.equal(streams.stdout, '');
  assert.equal(streams.stderr.endsWith('\n'), true);
  assert.equal(streams.stderr.trim().split('\n').length, 1);
  const error = JSON.parse(streams.stderr);
  assert.deepEqual(Object.keys(error), [
    'schemaVersion',
    'error',
    'executionStatus',
    'claimDisposition',
    'phase',
    'code',
    'exitCode',
    'message',
    'suggestion',
    'retryClass',
    'remediation',
  ]);
  assert.equal(error.schemaVersion, 2);
  assert.equal(error.executionStatus, 'BLOCKED');
  assert.equal(error.claimDisposition, 'NOT_EVALUATED');
  assert.equal(error.phase, 'preflight');
  assert.equal(error.retryClass, 'operator-input');
  assert.equal(error.remediation, error.suggestion);
});

test('post-launch safety errors are explicitly fail-closed and never claim-evaluated', async () => {
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
        const error = new Error('/private/workspace');
        error.code = 'CLEANUP_FAILED';
        error.exitCode = 3;
        throw error;
      },
    },
  });
  const error = JSON.parse(capture.read().stderr);
  assert.equal(exitCode, 3);
  assert.equal(error.executionStatus, 'FAIL-CLOSED');
  assert.equal(error.claimDisposition, 'NOT_EVALUATED');
  assert.equal(error.phase, 'cleanup');
  assert.equal(error.retryClass, 'non-retryable-integrity');
  assert.equal(error.remediation, error.suggestion);
  assert.equal(capture.read().stderr.includes('/private/workspace'), false);
});

for (const expected of [
  {
    code: 'RUNTIME_CREDENTIAL_UNAVAILABLE',
    exitCode: 4,
    executionStatus: 'BLOCKED',
    phase: 'preflight',
    retryClass: 'environment-remediation',
  },
  {
    code: 'EXECUTION_BOUNDARY_MISMATCH',
    exitCode: 2,
    executionStatus: 'BLOCKED',
    phase: 'preflight',
    retryClass: 'operator-input',
  },
  {
    code: 'OCI_CGROUP_V2_UNAVAILABLE',
    exitCode: 4,
    executionStatus: 'BLOCKED',
    phase: 'preflight',
    retryClass: 'environment-remediation',
  },
  {
    code: 'OCI_RECONCILIATION_UNCERTAIN',
    exitCode: 4,
    executionStatus: 'BLOCKED',
    phase: 'reconcile',
    retryClass: 'environment-remediation',
  },
  {
    code: 'OCI_BOUNDARY_PROOF_UNAVAILABLE',
    exitCode: 3,
    executionStatus: 'FAIL-CLOSED',
    phase: 'boundary-proof',
    retryClass: 'non-retryable-integrity',
  },
  {
    code: 'OCI_PROXY_ATTEMPT_UNSAFE',
    exitCode: 3,
    executionStatus: 'FAIL-CLOSED',
    phase: 'proxy',
    retryClass: 'non-retryable-integrity',
  },
  {
    code: 'OCI_CLEANUP_UNCERTAIN',
    exitCode: 3,
    executionStatus: 'FAIL-CLOSED',
    phase: 'cleanup',
    retryClass: 'non-retryable-integrity',
  },
]) {
  test(`${expected.code} retains its canonical terminal contract`, async () => {
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
          const error = new Error('/private/detail-must-not-escape');
          error.code = expected.code;
          throw error;
        },
      },
    });
    const error = JSON.parse(capture.read().stderr);
    assert.equal(exitCode, expected.exitCode);
    assert.equal(error.code, expected.code);
    assert.equal(error.executionStatus, expected.executionStatus);
    assert.equal(error.claimDisposition, 'NOT_EVALUATED');
    assert.equal(error.phase, expected.phase);
    assert.equal(error.retryClass, expected.retryClass);
    assert.equal(capture.read().stderr.includes('/private/detail'), false);
  });
}

for (const [
  code,
  exitCode,
  executionStatus,
  phase,
  retryClass,
] of [
  ['OCI_PLATFORM_UNSUPPORTED', 2, 'BLOCKED', 'preflight', 'environment-remediation'],
  ['OCI_PROVENANCE_INVALID', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_IMAGE_IDENTITY_MISMATCH', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_RUNTIME_BINARY_INVALID', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_RUNTIME_BINARY_MISMATCH', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_RUNTIME_VERSION_INVALID', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_RUNTIME_VERSION_MISMATCH', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_HARDENING_MISMATCH', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_IMAGE_FILE_INVALID', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_IMAGE_INSPECTION_UNCERTAIN', 4, 'BLOCKED', 'preflight', 'environment-remediation'],
  ['OCI_PROXY_UNAVAILABLE', 4, 'BLOCKED', 'preflight', 'environment-remediation'],
  ['OCI_PREFLIGHT_CLEANUP_UNCERTAIN', 4, 'BLOCKED', 'preflight', 'environment-remediation'],
  ['OCI_PREFLIGHT_UNCERTAIN', 4, 'BLOCKED', 'preflight', 'environment-remediation'],
  ['OCI_PREFLIGHT_RECEIPT_INVALID', 4, 'BLOCKED', 'preflight', 'environment-remediation'],
  ['OCI_PREFLIGHT_RECEIPT_MISMATCH', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['EVIDENCE_NOT_COMMITTED', 2, 'BLOCKED', 'preflight', 'operator-input'],
  ['OCI_PREFLIGHT_REQUIRED', 2, 'BLOCKED', 'arm-open', 'operator-input'],
  ['OCI_ARM_INPUT_INVALID', 2, 'BLOCKED', 'arm-open', 'operator-input'],
  ['OCI_RESPONSE_SCHEMA_UNSTABLE', 2, 'BLOCKED', 'arm-open', 'operator-input'],
  ['OCI_ARM_OPEN_UNCERTAIN', 3, 'FAIL-CLOSED', 'arm-open', 'non-retryable-integrity'],
  ['OCI_PROXY_POLICY_MISMATCH', 3, 'FAIL-CLOSED', 'proxy', 'non-retryable-integrity'],
  ['OCI_PROXY_RELAY_UNAVAILABLE', 3, 'FAIL-CLOSED', 'proxy', 'transient-infrastructure'],
  ['OCI_INIT_PID_UNAVAILABLE', 3, 'FAIL-CLOSED', 'boundary-proof', 'non-retryable-integrity'],
  ['OCI_CGROUP_PATH_UNAVAILABLE', 3, 'FAIL-CLOSED', 'boundary-proof', 'non-retryable-integrity'],
  ['OCI_EXECUTION_UNCERTAIN', 3, 'FAIL-CLOSED', 'boundary-proof', 'non-retryable-integrity'],
  ['OCI_RESPONSE_SCHEMA_DRIFT', 3, 'FAIL-CLOSED', 'boundary-proof', 'non-retryable-integrity'],
  ['OCI_SESSION_STATE_INVALID', 3, 'FAIL-CLOSED', 'execution', 'non-retryable-integrity'],
  ['OCI_CONTAINER_ENV_INVALID', 3, 'FAIL-CLOSED', 'arm-open', 'non-retryable-integrity'],
  ['OCI_FIFO_CREATE_FAILED', 3, 'FAIL-CLOSED', 'arm-open', 'transient-infrastructure'],
  ['OCI_RUNTIME_SURFACE_FAILED', 3, 'FAIL-CLOSED', 'arm-open', 'transient-infrastructure'],
  ['PROXY_ATTEMPT_UNSAFE', 3, 'FAIL-CLOSED', 'proxy', 'non-retryable-integrity'],
  ['PROXY_CLEANUP_UNPROVEN', 3, 'FAIL-CLOSED', 'cleanup', 'non-retryable-integrity'],
]) {
  test(`${code} is not collapsed into a generic terminal error`, async () => {
    const capture = captureIo();
    const result = await main([
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
          throw Object.assign(new Error('private'), { code });
        },
      },
    });
    const terminal = JSON.parse(capture.read().stderr);
    assert.equal(result, exitCode);
    assert.equal(terminal.code, code);
    assert.equal(terminal.executionStatus, executionStatus);
    assert.equal(terminal.phase, phase);
    assert.equal(terminal.retryClass, retryClass);
  });
}

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

test('v2 evidence verifier requires manifest, policy, and receipt to match HEAD', (t) => {
  const repositoryRoot = tempDirectory(t);
  const evidenceRoot = path.join(repositoryRoot, 'artifacts');
  fs.mkdirSync(evidenceRoot);
  const files = ['manifest.json', 'policy.json', 'preflight.json']
    .map((name) => path.join(evidenceRoot, name));
  for (const file of files) fs.writeFileSync(file, '{}\n');
  runGit(repositoryRoot, ['init', '--quiet']);
  runGit(repositoryRoot, ['config', 'user.email', 'synthetic@example.invalid']);
  runGit(repositoryRoot, ['config', 'user.name', 'Synthetic Test']);
  runGit(repositoryRoot, ['add', 'artifacts']);
  runGit(repositoryRoot, ['commit', '--quiet', '-m', 'reviewed evidence']);

  assert.doesNotThrow(() => verifyTrackedEvidenceFiles(files, {
    repositoryRoot,
  }));

  fs.writeFileSync(files[2], '{"dirty":true}\n');
  assert.throws(
    () => verifyTrackedEvidenceFiles(files, { repositoryRoot }),
    (error) => error.code === 'EVIDENCE_NOT_COMMITTED',
  );

  runGit(repositoryRoot, ['add', 'artifacts/preflight.json']);
  assert.throws(
    () => verifyTrackedEvidenceFiles(files, { repositoryRoot }),
    (error) => error.code === 'EVIDENCE_NOT_COMMITTED',
  );
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
