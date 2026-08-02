import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  deriveAttemptId,
  sha256Canonical,
} from '../../../scripts/lib/governance-impact-core.mjs';
import {
  main,
} from '../eval.mjs';

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
        timeoutMs: 30_000,
        benchmarkId: 'GS-OSS-2026-08-02-V8',
        runId: 'preflight',
        taskId: 'preflight',
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
  fs.writeFileSync(path.join(repositoryRoot, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(repositoryRoot, 'policy.json'), JSON.stringify(policy));
  fs.writeFileSync(path.join(repositoryRoot, 'preflight.json'), JSON.stringify(receipt));
  runGit(repositoryRoot, ['init', '--quiet']);
  runGit(repositoryRoot, ['config', 'user.email', 'synthetic@example.invalid']);
  runGit(repositoryRoot, ['config', 'user.name', 'Synthetic Test']);
  runGit(repositoryRoot, ['add', 'manifest.json', 'policy.json', 'preflight.json']);
  runGit(repositoryRoot, ['commit', '--quiet', '-m', 'reviewed evidence']);
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
    hashScenarioArtifacts: async () => scenario.artifactHashes,
    resolveRuntimeExecutable() {
      assert.fail('OCI route must not resolve a host runtime');
    },
    createOciProxyFacade(options) {
      events.push('create-proxy');
      assert.equal(options.attemptId, attempt.attemptId);
      assert.equal(options.model, cohort.model);
      assert.equal(options.timeoutMs, 30_000);
      assert.equal(options.benchmarkId, 'GS-OSS-2026-08-02-V8');
      assert.equal(options.runId, attempt.attemptId);
      assert.equal(options.taskId, scenario.id);
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
  fs.writeFileSync(path.join(repositoryRoot, 'manifest.json'), JSON.stringify(manifest));
  fs.writeFileSync(path.join(repositoryRoot, 'policy.json'), JSON.stringify(policy));
  fs.writeFileSync(path.join(repositoryRoot, 'preflight.json'), JSON.stringify(receipt));
  runGit(repositoryRoot, ['init', '--quiet']);
  runGit(repositoryRoot, ['config', 'user.email', 'synthetic@example.invalid']);
  runGit(repositoryRoot, ['config', 'user.name', 'Synthetic Test']);
  runGit(repositoryRoot, ['add', 'manifest.json', 'policy.json', 'preflight.json']);
  runGit(repositoryRoot, ['commit', '--quiet', '-m', 'reviewed evidence']);
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
