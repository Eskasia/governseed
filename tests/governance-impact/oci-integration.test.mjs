import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  BLOCKED_EXIT_CODE,
  FIXTURE_CODEX_VERSION,
  runOciIntegration,
} from '../../scripts/governance-impact-oci-integration.mjs';
import {
  createDockerCliClient,
  createLinuxCodexOciSupervisor,
  createLinuxProcfsClient,
  createSupervisorFs,
} from '../../scripts/lib/governance-impact-oci-supervisor.mjs';

const BASE_DIGEST = 'a'.repeat(64);
const IMAGE_DIGEST = 'b'.repeat(64);
const CONFIG_DIGEST = 'c'.repeat(64);
const BASE_IMAGE = `registry.example/base/alpine@sha256:${BASE_DIGEST}`;
const TEST_FILE = fileURLToPath(import.meta.url);
const FIXTURE_ROOT = path.join(path.dirname(TEST_FILE), 'fixtures', 'oci');
const SYNTHETIC_REPO_ROOT = path.resolve('/repo');
const SYNTHETIC_TEMP_ROOT = path.resolve('/tmp');
const SYNTHETIC_NODE_EXECUTABLE = path.resolve('/usr/bin/node');
const SYNTHETIC_FIXTURE_ROOT = path.join(
  SYNTHETIC_REPO_ROOT,
  'tests',
  'governance-impact',
  'fixtures',
  'oci',
);
const SYNTHETIC_TEST_FILE = path.join(
  SYNTHETIC_REPO_ROOT,
  'tests',
  'governance-impact',
  'oci-integration.test.mjs',
);

function blockedHarness(overrides = {}) {
  const calls = [];
  const writes = [];
  const fs = {
    existsSync(file) {
      return file === '/sys/fs/cgroup/cgroup.controllers';
    },
    mkdirSync() {},
    mkdtempSync() {
      return path.join(SYNTHETIC_TEMP_ROOT, 'oci-integration-blocked');
    },
    readFileSync(file) {
      if (file === '/proc/self/cgroup') return '0::/user.slice/test\n';
      throw new Error('unexpected file read');
    },
    rmSync() {},
    writeFileSync() {},
    ...overrides.fs,
  };
  const spawnSync = (...args) => {
    calls.push(args);
    return { status: 0, stdout: '', stderr: '' };
  };
  const exitCode = runOciIntegration({
    env: {
      GOVERNANCE_IMPACT_OCI_INTEGRATION: '1',
      ...overrides.env,
    },
    fs,
    nodeExecutable: SYNTHETIC_NODE_EXECUTABLE,
    platform: overrides.platform ?? 'linux',
    repoRoot: SYNTHETIC_REPO_ROOT,
    spawnSync: overrides.spawnSync ?? spawnSync,
    stderr: {
      write(value) {
        writes.push(value);
      },
    },
  });
  return { calls, exitCode, writes };
}

function assertBlocked(result, code) {
  assert.equal(result.exitCode, BLOCKED_EXIT_CODE);
  assert.equal(result.writes.length, 1);
  assert.equal(result.writes[0].endsWith('\n'), true);
  assert.deepEqual(JSON.parse(result.writes[0]), {
    schemaVersion: 2,
    error: true,
    executionStatus: 'BLOCKED',
    claimDisposition: 'NOT_EVALUATED',
    phase: 'integration-preflight',
    code,
    exitCode: 4,
  });
  assert.equal(
    result.calls.some(([, args]) => (
      Array.isArray(args)
      && args[0] === '--test'
    )),
    false,
  );
}

function assertCleanupFailClosed(result) {
  assert.equal(result.exitCode, 1);
  assert.equal(result.writes.length, 1);
  assert.deepEqual(JSON.parse(result.writes[0]), {
    schemaVersion: 2,
    error: true,
    executionStatus: 'FAIL-CLOSED',
    claimDisposition: 'NOT_EVALUATED',
    phase: 'integration-cleanup',
    code: 'OCI_INTEGRATION_CLEANUP_UNCERTAIN',
    exitCode: 1,
  });
}

test('Darwin is one sanitized BLOCKED result and never starts node:test', () => {
  const result = blockedHarness({
    env: {
      OPENAI_API_KEY: 'must-not-appear',
      GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE,
    },
    platform: 'darwin',
  });

  assertBlocked(result, 'OCI_INTEGRATION_PLATFORM_UNSUPPORTED');
  assert.doesNotMatch(result.writes[0], /must-not-appear|OPENAI_API_KEY|registry\.example/u);
  assert.equal(result.calls.length, 0);
});

test('the live integration surface is explicit opt-in', () => {
  const writes = [];
  const exitCode = runOciIntegration({
    env: {},
    fs: {
      existsSync() {
        throw new Error('preflight must not start');
      },
    },
    platform: 'linux',
    spawnSync() {
      throw new Error('Docker must not start');
    },
    stderr: {
      write(value) {
        writes.push(value);
      },
    },
  });

  assertBlocked({ calls: [], exitCode, writes }, 'OCI_INTEGRATION_OPT_IN_REQUIRED');
});

test('missing cgroup v2, Docker, or pinned base provenance blocks before node:test', async (t) => {
  await t.test('cgroup v2 unavailable', () => {
    const result = blockedHarness({
      env: { GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE },
      fs: {
        existsSync() {
          return false;
        },
      },
    });
    assertBlocked(result, 'OCI_INTEGRATION_CGROUP_V2_UNAVAILABLE');
    assert.equal(result.calls.length, 0);
  });

  await t.test('preflight workspace unavailable', () => {
    const result = blockedHarness({
      env: { GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE },
      fs: {
        mkdtempSync() {
          throw new Error('/private/preflight/path');
        },
      },
    });
    assertBlocked(result, 'OCI_INTEGRATION_PREFLIGHT_UNCERTAIN');
    assert.doesNotMatch(result.writes[0], /private|preflight\/path/u);
    assert.equal(result.calls.length, 0);
  });

  await t.test('Docker unavailable', () => {
    const calls = [];
    const result = blockedHarness({
      env: { GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE },
      spawnSync(...args) {
        calls.push(args);
        return { status: 127, stdout: '', stderr: 'private daemon detail' };
      },
    });
    result.calls.push(...calls);
    assertBlocked(result, 'OCI_INTEGRATION_DOCKER_UNAVAILABLE');
    assert.equal(calls.length, 1);
  });

  await t.test('base provenance absent', () => {
    const result = blockedHarness();
    assertBlocked(result, 'OCI_INTEGRATION_BASE_PROVENANCE_REQUIRED');
    assert.equal(result.calls.length, 1);
  });

  await t.test('built image provenance absent', () => {
    const calls = [];
    const fixtureDockerfile = path.join(SYNTHETIC_FIXTURE_ROOT, 'Dockerfile');
    const fixtureCodex = path.join(SYNTHETIC_FIXTURE_ROOT, 'codex');
    const result = blockedHarness({
      env: { GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE },
      fs: {
        existsSync(file) {
          return file === '/sys/fs/cgroup/cgroup.controllers'
            || file === fixtureDockerfile
            || file === fixtureCodex;
        },
        readFileSync(file) {
          if (file === '/proc/self/cgroup') return '0::/integration\n';
          if (file === fixtureCodex) return '#!/bin/sh\n';
          if (String(file).endsWith('build-metadata.json')) return '{}';
          throw new Error('unexpected read');
        },
      },
      spawnSync(executable, args, options) {
        calls.push({ executable, args, options });
        if (args.includes('version')) return { status: 0, stdout: '', stderr: '' };
        if (args.includes('inspect') && args.includes(BASE_IMAGE)) {
          return {
            status: 0,
            stdout: JSON.stringify([{
              Id: `sha256:${BASE_DIGEST}`,
              RepoDigests: [BASE_IMAGE],
            }]),
            stderr: '',
          };
        }
        if (args.includes('buildx')) return { status: 0, stdout: '', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
    });
    result.calls.push(...calls.map(({ executable, args, options }) => (
      [executable, args, options]
    )));
    assertBlocked(result, 'OCI_INTEGRATION_FIXTURE_PROVENANCE_UNAVAILABLE');
  });
});

test('eligible Linux builds from the pinned local base and spawns only the live test with shell false', () => {
  const calls = [];
  let cleanupMode = 'ok';
  const files = new Map([
    ['/proc/self/cgroup', '0::/user.slice/test\n'],
    [path.join(SYNTHETIC_FIXTURE_ROOT, 'Dockerfile'), 'ARG BASE_IMAGE\n'],
    [path.join(SYNTHETIC_FIXTURE_ROOT, 'codex'), '#!/bin/sh\n'],
  ]);
  const fs = {
    existsSync(file) {
      return file === '/sys/fs/cgroup/cgroup.controllers' || files.has(file);
    },
    mkdtempSync() {
      return path.join(SYNTHETIC_TEMP_ROOT, 'oci-integration-test');
    },
    readFileSync(file) {
      if (String(file).endsWith('build-metadata.json')) {
        return JSON.stringify({
          'containerimage.config.digest': `sha256:${CONFIG_DIGEST}`,
          'containerimage.digest': `sha256:${IMAGE_DIGEST}`,
        });
      }
      if (files.has(file)) return files.get(file);
      throw new Error(`unexpected read: ${file}`);
    },
    rmSync() {
      if (cleanupMode === 'temp-fail') throw new Error('/private/temp/path');
    },
    writeFileSync(file, value) {
      files.set(file, value);
    },
  };
  const spawnSync = (executable, args, options) => {
    calls.push({ executable, args, options });
    if (executable === 'docker' && args.includes('version')) {
      return { status: 0, stdout: '27.0.0\n', stderr: '' };
    }
    if (
      executable === 'docker'
      && args.includes('image')
      && args.includes('inspect')
      && args.includes(BASE_IMAGE)
    ) {
      return {
        status: 0,
        stdout: JSON.stringify([{
          Id: `sha256:${BASE_DIGEST}`,
          RepoDigests: [BASE_IMAGE],
        }]),
        stderr: '',
      };
    }
    if (executable === 'docker' && args.includes('buildx')) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (executable === 'docker' && args.includes(`sha256:${CONFIG_DIGEST}`)) {
      return {
        status: 0,
        stdout: JSON.stringify([{
          Id: `sha256:${CONFIG_DIGEST}`,
          RepoDigests: [
            `local.invalid/openai/governance-impact-oci-fixture@sha256:${IMAGE_DIGEST}`,
          ],
          Config: {
            Labels: {
              'org.openai.governance-impact.fixture': 'true',
              'org.openai.governance-impact.fixture.base': BASE_IMAGE,
            },
          },
        }]),
        stderr: '',
      };
    }
    if (executable === SYNTHETIC_NODE_EXECUTABLE) {
      return { status: 0, stdout: '', stderr: '' };
    }
    if (executable === 'docker' && args.includes('rm')) {
      return {
        status: cleanupMode === 'image-fail' ? 1 : 0,
        stdout: '',
        stderr: '',
      };
    }
    if (
      executable === 'docker'
      && args.includes('ls')
      && args.some((entry) => String(entry).includes(':integration-'))
    ) {
      return { status: 0, stdout: '', stderr: '' };
    }
    return { status: 127, stdout: '', stderr: '' };
  };
  const result = blockedHarness({
    env: {
      GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE,
      OPENAI_API_KEY: 'must-not-reach-child',
      PATH: '/usr/bin:/bin',
    },
    fs,
    spawnSync,
  });

  assert.equal(result.exitCode, 0);
  assert.deepEqual(result.writes, []);
  const build = calls.find((call) => call.args.includes('buildx'));
  assert.ok(build);
  assert.ok(build.args.includes('--load'));
  assert.ok(build.args.includes('--pull=false'));
  assert.deepEqual(
    build.args.slice(build.args.indexOf('--network'), build.args.indexOf('--network') + 2),
    ['--network', 'none'],
  );
  assert.ok(build.args.includes(`BASE_IMAGE=${BASE_IMAGE}`));
  assert.equal(build.args.includes('--push'), false);
  assert.equal(build.args.includes('pull'), false);
  assert.equal(build.options.shell, false);

  const testCall = calls.find(
    (call) => call.executable === SYNTHETIC_NODE_EXECUTABLE,
  );
  assert.equal(testCall.executable, SYNTHETIC_NODE_EXECUTABLE);
  assert.deepEqual(testCall.args, [
    '--test',
    SYNTHETIC_TEST_FILE,
  ]);
  assert.equal(testCall.options.shell, false);
  assert.equal(testCall.options.stdio, 'inherit');
  assert.equal(testCall.options.env.GOVERNANCE_IMPACT_OCI_INTEGRATION_CHILD, '1');
  assert.equal(
    testCall.options.env.GOVERNANCE_IMPACT_OCI_IMAGE_REFERENCE,
    `local.invalid/openai/governance-impact-oci-fixture@sha256:${IMAGE_DIGEST}`,
  );
  assert.equal('OPENAI_API_KEY' in testCall.options.env, false);

  cleanupMode = 'image-fail';
  assertCleanupFailClosed(blockedHarness({
    env: { GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE },
    fs,
    spawnSync,
  }));

  cleanupMode = 'temp-fail';
  assertCleanupFailClosed(blockedHarness({
    env: { GOVERNANCE_IMPACT_OCI_BASE_IMAGE: BASE_IMAGE },
    fs,
    spawnSync,
  }));
});

test('fixture is offline, digest-base-only, and exposes every required mode without changing image identity', () => {
  const dockerfile = fs.readFileSync(path.join(FIXTURE_ROOT, 'Dockerfile'), 'utf8');
  const codex = fs.readFileSync(path.join(FIXTURE_ROOT, 'codex'), 'utf8');

  assert.match(dockerfile, /^ARG BASE_IMAGE\nFROM \$\{BASE_IMAGE\}/u);
  assert.match(
    dockerfile,
    /COPY [^\n]*--chmod=0555 codex \/opt\/governance\/runtime\/codex/u,
  );
  assert.doesNotMatch(dockerfile, /\b(?:ADD|RUN)\b|\b(?:curl|wget|apk|apt|get)\b/u);
  assert.match(codex, new RegExp(FIXTURE_CODEX_VERSION.replaceAll('.', '\\.'), 'u'));
  assert.match(codex, /\/workspace\/\.governance-impact-mode/u);
  for (const mode of ['normal', 'no-candidate', 'nonzero', 'timeout', 'setsid', 'reparent']) {
    assert.match(codex, new RegExp(`^\\s*${mode}\\)`, 'mu'));
  }
  assert.doesNotMatch(codex, /OPENAI_API_KEY|OPENAI_BASE_URL|https?:\/\//u);
});

const LIVE_CHILD = process.env.GOVERNANCE_IMPACT_OCI_INTEGRATION_CHILD === '1';

function noNetworkProxy(root) {
  const policy = Object.freeze({
    schemaVersion: 1,
    transport: 'integration-no-network',
    arbitraryEgress: false,
    requestLimit: 0,
  });
  const open = new Set();
  const attachedPids = [];
  const arms = new WeakMap();
  return {
    attachedPids,
    async describePolicy() {
      return policy;
    },
    async reconcile() {
      return open.size === 0;
    },
    async openAttempt(input) {
      const handle = Object.freeze({
        policy,
      });
      arms.set(handle, input.arm);
      open.add(handle);
      return handle;
    },
    async getContainerEnvironment(handle) {
      assert.equal(open.has(handle), true);
      return Object.freeze({
        OPENAI_API_KEY: `fixture-${arms.get(handle)}`,
        OPENAI_BASE_URL: 'http://127.0.0.1:43127/v1',
      });
    },
    async attachAttempt(handle, input) {
      assert.equal(open.has(handle), true);
      assert.equal(Number.isInteger(input.initPid) && input.initPid > 0, true);
      attachedPids.push(input.initPid);
      return true;
    },
    async closeAttempt(handle) {
      open.delete(handle);
    },
    async proveClosed(handle) {
      return !open.has(handle);
    },
  };
}

function wrapDocker(rawDocker, hooks = {}) {
  const purposes = new Map();
  const ids = new Set();
  const specs = new Map();
  return {
    ids,
    client: {
      ...rawDocker,
      async createContainer(spec) {
        const id = await rawDocker.createContainer(spec);
        ids.add(id);
        purposes.set(id, spec.purpose);
        specs.set(id, structuredClone(spec));
        hooks.onCreate?.(id, spec);
        return id;
      },
      async removeContainer(id) {
        if (hooks.removeContainer) {
          await hooks.removeContainer(id, purposes.get(id), rawDocker);
        } else {
          await rawDocker.removeContainer(id);
        }
        ids.delete(id);
      },
    },
    purposes,
    specs,
  };
}

async function cleanupCapturedContainers(rawDocker, ids) {
  for (const id of ids) {
    try {
      const inspect = await rawDocker.inspectContainer(id);
      if (inspect?.State?.Running === true) await rawDocker.stopContainer(id);
    } catch {
      // The container may already have been removed by the supervisor.
    }
    await rawDocker.removeContainer(id).catch(() => {});
  }
}

async function makeLiveHarness(options = {}) {
  const imageReference = process.env.GOVERNANCE_IMPACT_OCI_IMAGE_REFERENCE;
  const expectedCodexVersion = process.env.GOVERNANCE_IMPACT_OCI_CODEX_VERSION;
  const expectedCodexBinarySha256 =
    process.env.GOVERNANCE_IMPACT_OCI_CODEX_BINARY_SHA256;
  assert.match(imageReference ?? '', /^[^\s/@]+(?:\/[^\s/@]+)+@sha256:[a-f0-9]{64}$/u);
  assert.equal(expectedCodexVersion, FIXTURE_CODEX_VERSION);
  assert.match(expectedCodexBinarySha256 ?? '', /^[a-f0-9]{64}$/u);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-impact-oci-live-'));
  fs.chmodSync(root, 0o755);
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(workspace, { mode: 0o777 });
  fs.chmodSync(workspace, 0o777);
  const responseSchema = path.join(root, 'response.schema.json');
  fs.writeFileSync(responseSchema, '{"type":"object","additionalProperties":true}\n', {
    mode: 0o444,
  });
  fs.chmodSync(responseSchema, 0o444);

  const rawDocker = createDockerCliClient({ env: process.env });
  const wrapped = wrapDocker(rawDocker, options.dockerHooks);
  const proxy = noNetworkProxy(root);
  const rawProcfs = createLinuxProcfsClient();
  const cgroupObservations = [];
  const procfs = {
    ...rawProcfs,
    async observeCgroup(cgroupPath) {
      const observation = await rawProcfs.observeCgroup(cgroupPath);
      cgroupObservations.push({ cgroupPath, observation });
      return observation;
    },
  };
  const supervisorFs = options.supervisorFs
    ? options.supervisorFs(createSupervisorFs({ tempRoot: root }))
    : createSupervisorFs({ tempRoot: root });
  const supervisor = createLinuxCodexOciSupervisor({
    docker: wrapped.client,
    fs: supervisorFs,
    platform: 'linux',
    procfs,
    proxy,
  });
  const preflight = await supervisor.preflightAndReconcile({
    imageReference,
    expectedCodexVersion,
    expectedCodexBinarySha256,
  });

  return {
    async close() {
      await cleanupCapturedContainers(rawDocker, wrapped.ids);
      fs.rmSync(root, { force: true, recursive: true });
    },
    cgroupObservations,
    open(mode, input = {}) {
      const marker = path.join(workspace, '.governance-impact-mode');
      if (fs.existsSync(marker)) fs.chmodSync(marker, 0o644);
      fs.writeFileSync(marker, `${mode}\n`, { mode: 0o444 });
      fs.chmodSync(marker, 0o444);
      return supervisor.openArm({
        arm: input.arm ?? 'baseline',
        attemptId: input.attemptId ?? 'd'.repeat(64),
        command: {
          args: [],
          stdin: '',
        },
        responseSchema,
        timeoutMs: input.timeoutMs ?? 2_000,
        workspace,
      });
    },
    preflight,
    proxy,
    rawDocker,
    responseSchema,
    root,
    supervisor,
    workspace,
    wrapped,
  };
}

function assertStoppedBoundary(result) {
  assert.equal(result.closedBoundaryEvidence.pidNamespaceStopped, true);
  assert.equal(result.closedBoundaryEvidence.cgroupEmpty, true);
  assert.equal(result.closedBoundaryEvidence.cleanupComplete, false);
  assert.match(result.executionBoundaryId, /^[a-f0-9]{64}$/u);
}

if (LIVE_CHILD) {
  test('live Docker normal completion proves cgroup empty and cleanup complete', async () => {
    const harness = await makeLiveHarness();
    try {
      const session = await harness.open('normal');
      const armSpec = [...harness.wrapped.specs.values()]
        .find((spec) => spec.purpose === 'arm');
      assert.deepEqual(Object.keys(armSpec.labels).sort(), [
        'org.openai.governance-impact.arm',
        'org.openai.governance-impact.attempt',
        'org.openai.governance-impact.managed',
        'org.openai.governance-impact.purpose',
      ]);
      const result = await session.runAndProveStopped();
      assert.deepEqual(result.execution, {
        status: 'completed',
        errorCode: null,
        exitCode: 0,
        signal: null,
        wallTimeMs: result.execution.wallTimeMs,
      });
      assertStoppedBoundary(result);
      assert.equal(
        harness.cgroupObservations.at(-1).observation.populated === false
          || harness.cgroupObservations.at(-1).observation.removed === true,
        true,
      );
      assert.equal(harness.proxy.attachedPids.length, 1);
      assert.deepEqual(await session.cleanupAndProve(), {
        cleanupComplete: true,
        executionBoundaryId: session.executionBoundaryId,
      });
      assert.deepEqual(
        JSON.parse(fs.readFileSync(path.join(harness.workspace, 'candidate.json'), 'utf8')),
        { fixture: true, mode: 'normal' },
      );
    } finally {
      await harness.close();
    }
  });

  test('live Docker preserves nonzero and timeout as execution evidence', async (t) => {
    await t.test('nonzero', async () => {
      const harness = await makeLiveHarness();
      try {
        const session = await harness.open('nonzero');
        const result = await session.runAndProveStopped();
        assert.equal(result.execution.status, 'failed');
        assert.equal(result.execution.errorCode, 'CHILD_EXIT_NONZERO');
        assert.equal(result.execution.exitCode, 17);
        assertStoppedBoundary(result);
        assert.equal((await session.cleanupAndProve()).cleanupComplete, true);
      } finally {
        await harness.close();
      }
    });

    await t.test('timeout', async () => {
      const harness = await makeLiveHarness();
      try {
        const session = await harness.open('timeout', { timeoutMs: 250 });
        const result = await session.runAndProveStopped();
        assert.equal(result.execution.status, 'timeout');
        assert.equal(result.execution.errorCode, 'CHILD_TIMEOUT');
        assertStoppedBoundary(result);
        assert.equal((await session.cleanupAndProve()).cleanupComplete, true);
      } finally {
        await harness.close();
      }
    });
  });

  test('live Docker kills setsid and re-parented descendants before cgroup proof', async (t) => {
    for (const mode of ['setsid', 'reparent']) {
      await t.test(mode, async () => {
        const harness = await makeLiveHarness();
        try {
          const session = await harness.open(mode);
          const result = await session.runAndProveStopped();
          assert.equal(result.execution.status, 'completed');
          assert.equal(result.execution.exitCode, 0);
          assertStoppedBoundary(result);
          assert.equal(
            harness.cgroupObservations.at(-1).observation.populated === false
              || harness.cgroupObservations.at(-1).observation.removed === true,
            true,
          );
          assert.equal(
            fs.readFileSync(path.join(harness.workspace, `${mode}.started`), 'utf8'),
            'started\n',
          );
          assert.equal((await session.cleanupAndProve()).cleanupComplete, true);
        } finally {
          await harness.close();
        }
      });
    }
  });

  test('live response-schema drift fails closed and produces no candidate', async () => {
    const harness = await makeLiveHarness({
      supervisorFs(base) {
        return {
          ...base,
          async verifyStagedResponseSchema(staged) {
            await fs.promises.chmod(staged.path, 0o644);
            await fs.promises.appendFile(staged.path, 'drift\n');
            return base.verifyStagedResponseSchema(staged);
          },
        };
      },
    });
    try {
      const session = await harness.open('no-candidate');
      await assert.rejects(
        () => session.runAndProveStopped(),
        (error) => error.code === 'OCI_RESPONSE_SCHEMA_DRIFT'
          && error.phase === 'boundary-proof'
          && error.executionStatus === 'FAIL-CLOSED',
      );
      assert.equal(fs.existsSync(path.join(harness.workspace, 'candidate.json')), false);
      assert.equal((await session.cleanupAndProve()).cleanupComplete, true);
    } finally {
      await harness.close();
    }
  });

  test('live cleanup failure returns no proof and leaves no candidate output', async () => {
    let failedArmRemoval = false;
    const harness = await makeLiveHarness({
      dockerHooks: {
        async removeContainer(id, purpose, rawDocker) {
          if (purpose === 'arm' && !failedArmRemoval) {
            failedArmRemoval = true;
            throw new Error('integration cleanup fault');
          }
          await rawDocker.removeContainer(id);
        },
      },
    });
    try {
      const session = await harness.open('no-candidate');
      const result = await session.runAndProveStopped();
      assertStoppedBoundary(result);
      await assert.rejects(
        () => session.cleanupAndProve(),
        (error) => error.code === 'OCI_CLEANUP_UNCERTAIN'
          && error.phase === 'cleanup'
          && error.executionStatus === 'FAIL-CLOSED'
          && !('cleanupComplete' in error),
      );
      assert.equal(fs.existsSync(path.join(harness.workspace, 'candidate.json')), false);
    } finally {
      await harness.close();
    }
  });

  test('live baseline and governed arms share one executionBoundaryId', async () => {
    const harness = await makeLiveHarness();
    try {
      const attemptId = 'e'.repeat(64);
      const baseline = await harness.open('no-candidate', {
        arm: 'baseline',
        attemptId,
      });
      const baselineResult = await baseline.runAndProveStopped();
      await baseline.cleanupAndProve();
      const governed = await harness.open('no-candidate', {
        arm: 'governed',
        attemptId,
      });
      const governedResult = await governed.runAndProveStopped();
      await governed.cleanupAndProve();

      assert.equal(
        baseline.executionBoundaryId,
        harness.preflight.executionBoundaryId,
      );
      assert.equal(governed.executionBoundaryId, baseline.executionBoundaryId);
      assert.equal(governedResult.executionBoundaryId, baselineResult.executionBoundaryId);
    } finally {
      await harness.close();
    }
  });
}
