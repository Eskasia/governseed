import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  createDockerCliClient,
  createLinuxCodexOciSupervisor,
  createSupervisorFs,
  OCI_RUNTIME_PATH,
  OciSupervisorError,
} from '../../scripts/lib/governance-impact-oci-supervisor.mjs';

const IMAGE_DIGEST = 'a'.repeat(64);
const IMAGE_REFERENCE = `registry.example/governance/codex@sha256:${IMAGE_DIGEST}`;
const CODEX_BYTES = Buffer.from('reviewed-codex-binary');
const CODEX_HASH = createHash('sha256').update(CODEX_BYTES).digest('hex');
const VERSION = 'codex-cli 1.2.3';
const PROVENANCE = Object.freeze({
  imageReference: IMAGE_REFERENCE,
  expectedCodexVersion: VERSION,
  expectedCodexBinarySha256: CODEX_HASH,
});
const PROXY_POLICY = Object.freeze({
  version: 1,
  transport: 'unix-domain-socket',
  requestLimit: 1,
  concurrency: 1,
  requestBytes: 65_536,
  responseBytes: 262_144,
});

function hardenedInspect(spec, state = {}) {
  return {
    Id: state.id ?? 'container-id',
    Config: {
      User: spec.user,
      Env: Object.entries(spec.expectedEnvironment)
        .map(([key, value]) => `${key}=${value}`),
      Labels: { ...spec.labels },
      Entrypoint: [spec.entrypoint],
    },
    HostConfig: {
      AutoRemove: false,
      CapAdd: [],
      CapDrop: ['ALL'],
      CgroupnsMode: 'private',
      CpuPeriod: 100_000,
      CpuQuota: spec.cpuQuota,
      Devices: [],
      DeviceRequests: [],
      Memory: spec.memoryBytes,
      NetworkMode: 'none',
      OomKillDisable: false,
      PidMode: '',
      PidsLimit: spec.pidLimit,
      PortBindings: {},
      Privileged: false,
      PublishAllPorts: false,
      ReadonlyRootfs: true,
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      SecurityOpt: ['no-new-privileges'],
      Tmpfs: { ...spec.tmpfs },
    },
    Mounts: spec.mounts.map((mount) => ({
      Type: 'bind',
      Source: mount.source,
      Destination: mount.target,
      RW: mount.readOnly !== true,
    })),
    State: {
      Dead: false,
      ExitCode: state.exitCode ?? 0,
      Pid: state.pid ?? 0,
      Running: state.running ?? false,
      Status: state.running ? 'running' : 'exited',
    },
  };
}

function makeHarness(overrides = {}) {
  const events = [];
  const specs = new Map();
  const states = new Map();
  const surfaces = new Map();
  const proxyHandles = new Set();
  const proxyHandleIds = new WeakMap();
  const managedSequences = [...(overrides.managedSequences ?? [[]])];
  const waitSequences = [...(overrides.waitSequences ?? [])];
  const cgroupObservations = [...(overrides.cgroupObservations ?? [
    overrides.cgroupObservation ?? { populated: false, removed: false },
  ])];
  const removeContainerErrors = [...(overrides.removeContainerErrors ?? [])];
  let surfaceNumber = 0;
  let containerNumber = 0;

  const docker = {
    async listManagedContainers() {
      events.push('docker.list');
      const value = managedSequences.length > 1
        ? managedSequences.shift()
        : managedSequences[0];
      return [...(value ?? [])];
    },
    async inspectImage(reference) {
      events.push('docker.inspect-image');
      if (overrides.inspectImageError) {
        throw new OciSupervisorError(
          'OCI_DOCKER_COMMAND_FAILED',
          'docker',
          'FAIL-CLOSED',
        );
      }
      return overrides.imageInspect ?? {
        Id: `sha256:${IMAGE_DIGEST}`,
        RepoDigests: [reference],
        Config: {
          User: '65532:65532',
          Env: ['PATH=/opt/governance/runtime:/usr/bin:/bin', 'LANG=C.UTF-8'],
        },
      };
    },
    async readImageFile(reference, file) {
      events.push('docker.read-image-file');
      assert.equal(reference, IMAGE_REFERENCE);
      assert.equal(file, OCI_RUNTIME_PATH);
      return overrides.imageFile ?? {
        bytes: CODEX_BYTES,
        mode: 0o755,
        type: 'file',
      };
    },
    async createContainer(spec) {
      containerNumber += 1;
      const id = `container-${containerNumber}`;
      events.push(`docker.create:${spec.purpose}`);
      specs.set(id, structuredClone(spec));
      states.set(id, { id, running: false, pid: 0, exitCode: 0 });
      return id;
    },
    async inspectContainer(id) {
      events.push(`docker.inspect:${id}`);
      if (overrides.inspectContainer) {
        const result = await overrides.inspectContainer(id, specs.get(id), states.get(id), events);
        if (result !== undefined) return result;
      }
      const spec = specs.get(id);
      if (!spec) {
        if (id === 'leftover-running') {
          const state = states.get(id) ?? {
            id,
            running: true,
            pid: 777,
            exitCode: 0,
          };
          const leftoverSpec = makeContainerSpecForInspect();
          return hardenedInspect(leftoverSpec, state);
        }
        if (id === 'leftover-stopped') {
          return hardenedInspect(makeContainerSpecForInspect(), {
            id,
            running: false,
            pid: 0,
          });
        }
        throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      }
      const inspect = hardenedInspect(spec, states.get(id));
      return overrides.mutateInspect ? overrides.mutateInspect(inspect, spec) : inspect;
    },
    async startContainer(id) {
      events.push(`docker.start:${id}`);
      const state = states.get(id);
      state.running = true;
      state.pid = 5000 + Number(id.split('-').at(-1));
    },
    async waitContainer(id, options) {
      events.push(`docker.wait:${id}:${options.timeoutMs}`);
      const next = waitSequences.length > 0
        ? waitSequences.shift()
        : { timedOut: false, exitCode: 0 };
      if (!next.timedOut) {
        const state = states.get(id);
        if (state) {
          state.running = false;
          state.pid = 0;
          state.exitCode = next.exitCode;
        }
      }
      return next;
    },
    async stopContainer(id) {
      events.push(`docker.stop:${id}`);
      const state = states.get(id) ?? {
        id,
        running: true,
        pid: 777,
        exitCode: 137,
      };
      state.running = false;
      state.pid = 0;
      states.set(id, state);
    },
    async killContainer(id) {
      events.push(`docker.kill:${id}`);
      const state = states.get(id);
      if (state) {
        state.running = false;
        state.pid = 0;
        state.exitCode = 137;
      }
    },
    async removeContainer(id) {
      events.push(`docker.remove:${id}`);
      const shouldFail = removeContainerErrors.length > 0
        ? removeContainerErrors.shift()
        : overrides.removeContainerError;
      if (shouldFail) throw new Error('private cleanup detail');
      specs.delete(id);
      states.delete(id);
      for (const sequence of managedSequences) {
        const index = sequence.indexOf(id);
        if (index >= 0) sequence.splice(index, 1);
      }
    },
  };

  const procfs = {
    async isCgroupV2() {
      events.push('procfs.cgroup-v2');
      return overrides.cgroupV2 ?? true;
    },
    async cgroupPathForPid(pid) {
      events.push(`procfs.path:${pid}`);
      return `/docker/${pid}`;
    },
    async observeCgroup(cgroupPath) {
      events.push(`procfs.events:${cgroupPath}`);
      return cgroupObservations.length > 1
        ? cgroupObservations.shift()
        : cgroupObservations[0];
    },
  };

  const fs = {
    async prepareRuntimeSurface(input) {
      surfaceNumber += 1;
      const root = `/tmp/oci-surface-${surfaceNumber}`;
      const surface = {
        root,
        entrypointPath: `${root}/pid1.sh`,
        envFilePath: `${root}/container.env`,
        fifoPath: `${root}/lifeline.fifo`,
        stderrPath: `${root}/stderr`,
        stdinPath: `${root}/stdin`,
        stdoutPath: `${root}/stdout`,
      };
      events.push(`fs.prepare:${input.purpose}`);
      surfaces.set(root, { input: structuredClone(input), removed: false });
      return surface;
    },
    async stageResponseSchema(source, surface) {
      events.push(`fs.stage-schema:${surface.root}`);
      assert.equal(source, '/tmp/runner-owned-response.schema.json');
      return {
        path: `${surface.root}/response.schema.json`,
        sha256: 'd'.repeat(64),
        identity: { dev: 1, ino: 2, size: 17 },
      };
    },
    async verifyStagedResponseSchema(staged) {
      events.push(`fs.verify-schema:${staged.path}`);
      return overrides.responseSchemaStable ?? true;
    },
    async removeSensitiveEnvFile(surface) {
      events.push(`fs.remove-env:${surface.root}`);
    },
    async openFifoWriter(surface) {
      events.push(`fs.arm-fifo:${surface.root}`);
      return { surface: surface.root, closed: false };
    },
    async signalFifoReady(handle) {
      events.push(`fs.signal-fifo-ready:${handle.surface}`);
    },
    async closeFifoWriter(handle) {
      if (!handle || handle.closed) return;
      events.push(`fs.close-fifo:${handle.surface}`);
      handle.closed = true;
    },
    async readRuntimeOutput(surface) {
      events.push(`fs.read-output:${surface.root}`);
      return overrides.versionOutput ?? {
        stdout: `${VERSION}\n`,
        stderr: '',
      };
    },
    async removeRuntimeSurface(surface) {
      events.push(`fs.remove-surface:${surface.root}`);
      if (overrides.removeSurfaceError) throw new Error('private surface path');
      const stored = surfaces.get(surface.root);
      if (stored) stored.removed = true;
    },
    async runtimeSurfaceRemoved(surface) {
      events.push(`fs.prove-removed:${surface.root}`);
      return overrides.surfaceRemoved ?? surfaces.get(surface.root)?.removed === true;
    },
  };

  const proxy = {
    async describePolicy() {
      events.push('proxy.describe');
      return overrides.proxyPolicy ?? PROXY_POLICY;
    },
    async reconcile() {
      events.push('proxy.reconcile');
      return overrides.proxyReconciled ?? true;
    },
    async openAttempt(input) {
      events.push(`proxy.open:${input.arm}`);
      const handle = Object.freeze({
        policy: overrides.proxyPolicy ?? PROXY_POLICY,
      });
      proxyHandleIds.set(handle, `proxy-${input.arm}`);
      proxyHandles.add(handle);
      return handle;
    },
    async getContainerEnvironment(handle) {
      events.push(`proxy.env:${proxyHandleIds.get(handle)}`);
      if (overrides.proxyEnvironmentError) {
        throw new Error('private proxy environment detail');
      }
      return overrides.proxyEnvironment ?? Object.freeze({
        OPENAI_API_KEY: `attempt-token-${proxyHandleIds.get(handle).replace('proxy-', '')}`,
        OPENAI_BASE_URL: 'http://127.0.0.1:43127/v1',
      });
    },
    async attachAttempt(handle, input) {
      events.push(`proxy.attach:${proxyHandleIds.get(handle)}:${input.initPid}`);
      if (overrides.proxyAttachError) throw new Error('private relay detail');
      return true;
    },
    async closeAttempt(handle) {
      events.push(`proxy.close:${proxyHandleIds.get(handle)}`);
      if (overrides.proxyCloseStableCode) {
        throw Object.assign(new Error('private proxy path'), {
          code: overrides.proxyCloseStableCode,
        });
      }
      if (overrides.proxyCloseError) throw new Error('private proxy path');
      proxyHandles.delete(handle);
    },
    async proveClosed(handle) {
      events.push(`proxy.prove-closed:${proxyHandleIds.get(handle)}`);
      return overrides.proxyClosed ?? !proxyHandles.has(handle);
    },
  };

  let now = 1_000;
  const clock = {
    now() {
      now += 5;
      return now;
    },
  };

  return {
    clock,
    docker,
    events,
    fs,
    procfs,
    proxy,
    specs,
    surfaces,
    supervisor: createLinuxCodexOciSupervisor({
      clock,
      docker,
      fs,
      platform: overrides.platform ?? 'linux',
      procfs,
      proxy,
    }),
  };
}

function makeContainerSpecForInspect() {
  return {
    cpuQuota: 100_000,
    entrypoint: '/bin/sh',
    labels: {},
    memoryBytes: 1_073_741_824,
    mounts: [],
    pidLimit: 64,
    user: '65532:65532',
    expectedEnvironment: {
      PATH: '/opt/governance/runtime:/usr/bin:/bin',
      LANG: 'C.UTF-8',
      HOME: '/tmp/home',
      CODEX_HOME: '/tmp/home/.codex',
      TMPDIR: '/tmp',
      NO_COLOR: '1',
    },
    tmpfs: {
      '/tmp': 'rw,noexec,nosuid,nodev,size=67108864,mode=1777',
    },
  };
}

async function preflight(harness) {
  return harness.supervisor.preflightAndReconcile(PROVENANCE);
}

async function openArm(harness, arm = 'baseline') {
  await preflight(harness);
  return harness.supervisor.openArm({
    arm,
    attemptId: 'b'.repeat(64),
    command: {
      args: ['exec', '--ephemeral', '--cd', '/workspace', '-'],
      stdin: 'Complete the synthetic task.',
    },
    responseSchema: '/tmp/runner-owned-response.schema.json',
    timeoutMs: 2_000,
    workspace: `/tmp/${arm}-workspace`,
  });
}

test('exports the Linux supervisor, Docker CLI client, fixed runtime path, and stable error type', () => {
  assert.equal(typeof createLinuxCodexOciSupervisor, 'function');
  assert.equal(typeof createDockerCliClient, 'function');
  assert.equal(OCI_RUNTIME_PATH, '/opt/governance/runtime/codex');
  const error = new OciSupervisorError('OCI_TEST', 'preflight', 'BLOCKED');
  assert.equal(error.message, 'OCI_TEST');
  assert.equal(error.code, 'OCI_TEST');
  assert.equal(error.phase, 'preflight');
  assert.equal(error.executionStatus, 'BLOCKED');
});

test('preflight refuses non-Linux and missing cgroup v2 before Docker mutation', async () => {
  const nonLinux = makeHarness({ platform: 'darwin' });
  await assert.rejects(
    () => preflight(nonLinux),
    (error) => error.code === 'OCI_PLATFORM_UNSUPPORTED'
      && error.phase === 'preflight'
      && error.executionStatus === 'BLOCKED'
      && !('artifactSafe' in error),
  );
  assert.deepEqual(nonLinux.events, []);

  const noCgroup = makeHarness({ cgroupV2: false });
  await assert.rejects(
    () => preflight(noCgroup),
    (error) => error.code === 'OCI_CGROUP_V2_UNAVAILABLE'
      && error.phase === 'preflight'
      && error.executionStatus === 'BLOCKED',
  );
  assert.deepEqual(noCgroup.events, ['procfs.cgroup-v2']);
});

for (const [name, provenance] of [
  ['tag instead of digest', { ...PROVENANCE, imageReference: 'registry/repo:latest' }],
  ['uppercase digest', {
    ...PROVENANCE,
    imageReference: `registry/repo@sha256:${'A'.repeat(64)}`,
  }],
  ['multiline version', { ...PROVENANCE, expectedCodexVersion: 'codex\nsecret' }],
  ['empty version', { ...PROVENANCE, expectedCodexVersion: '' }],
  ['uppercase binary hash', {
    ...PROVENANCE,
    expectedCodexBinarySha256: CODEX_HASH.toUpperCase(),
  }],
]) {
  test(`reviewed provenance rejects ${name}`, async () => {
    const harness = makeHarness();
    await assert.rejects(
      () => harness.supervisor.preflightAndReconcile(provenance),
      (error) => error.code === 'OCI_PROVENANCE_INVALID'
        && error.phase === 'preflight'
        && error.executionStatus === 'BLOCKED',
    );
    assert.equal(harness.events.includes('docker.inspect-image'), false);
  });
}

test('preflight independently verifies resolved digest, raw binary shape/hash, exact version, and inspect hardening', async () => {
  const harness = makeHarness();
  const result = await preflight(harness);

  assert.match(result.executionBoundaryId, /^[a-f0-9]{64}$/);
  assert.deepEqual(Object.keys(result.boundaryEvidence), [
    'observedImageDigest',
    'codexVersion',
    'codexBinarySha256',
    'containmentPolicyHash',
    'networkPolicyHash',
    'proxyPolicyHash',
    'hardening',
    'pidNamespaceStopped',
    'cgroupEmpty',
    'cleanupComplete',
  ]);
  assert.equal(result.boundaryEvidence.observedImageDigest, IMAGE_DIGEST);
  assert.equal(result.boundaryEvidence.codexVersion, VERSION);
  assert.equal(result.boundaryEvidence.codexBinarySha256, CODEX_HASH);
  assert.deepEqual(result.boundaryEvidence.hardening, {
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
  });
  assert.equal(result.boundaryEvidence.pidNamespaceStopped, true);
  assert.equal(result.boundaryEvidence.cgroupEmpty, true);
  assert.equal(result.boundaryEvidence.cleanupComplete, true);
  assert.equal(JSON.stringify(result).includes('/tmp/'), false);
  assert.equal(JSON.stringify(result).includes('attempt-token'), false);
  assert.deepEqual(harness.events.slice(0, 6), [
    'procfs.cgroup-v2',
    'docker.list',
    'proxy.reconcile',
    'docker.inspect-image',
    'docker.read-image-file',
    'proxy.describe',
  ]);
});

test('preflight maps lower-level Docker failures to one canonical preflight code', async () => {
  const harness = makeHarness({ inspectImageError: true });
  await assert.rejects(
    () => preflight(harness),
    (error) => error.code === 'OCI_IMAGE_INSPECTION_UNCERTAIN'
      && error.phase === 'preflight'
      && error.executionStatus === 'BLOCKED',
  );
});

test('version-probe cleanup uncertainty has a distinct blocked preflight code', async () => {
  const harness = makeHarness({ removeContainerError: true });
  await assert.rejects(
    () => preflight(harness),
    (error) => error.code === 'OCI_PREFLIGHT_CLEANUP_UNCERTAIN'
      && error.phase === 'preflight'
      && error.executionStatus === 'BLOCKED',
  );
});

for (const [name, overrides, expectedCode] of [
  ['resolved image mismatch', {
    imageInspect: {
      Id: `sha256:${'f'.repeat(64)}`,
      RepoDigests: [`registry.example/governance/codex@sha256:${'f'.repeat(64)}`],
      Config: { User: '65532:65532', Env: [] },
    },
  }, 'OCI_IMAGE_IDENTITY_MISMATCH'],
  ['symlink runtime', {
    imageFile: { bytes: CODEX_BYTES, mode: 0o755, type: 'symlink' },
  }, 'OCI_RUNTIME_BINARY_INVALID'],
  ['non-executable runtime', {
    imageFile: { bytes: CODEX_BYTES, mode: 0o644, type: 'file' },
  }, 'OCI_RUNTIME_BINARY_INVALID'],
  ['binary hash mismatch', {
    imageFile: { bytes: Buffer.from('different'), mode: 0o755, type: 'file' },
  }, 'OCI_RUNTIME_BINARY_MISMATCH'],
  ['version stderr', {
    versionOutput: { stdout: `${VERSION}\n`, stderr: 'warning' },
  }, 'OCI_RUNTIME_VERSION_INVALID'],
  ['multiline observed version', {
    versionOutput: { stdout: `${VERSION}\nsecond line\n`, stderr: '' },
  }, 'OCI_RUNTIME_VERSION_INVALID'],
  ['version mismatch', {
    versionOutput: { stdout: 'codex-cli 9.9.9\n', stderr: '' },
  }, 'OCI_RUNTIME_VERSION_MISMATCH'],
]) {
  test(`preflight fails closed on ${name}`, async () => {
    const harness = makeHarness(overrides);
    await assert.rejects(
      () => preflight(harness),
      (error) => error.code === expectedCode
        && error.phase === 'preflight'
        && error.executionStatus === 'BLOCKED'
        && error.message === expectedCode,
    );
  });
}

test('actual Docker inspect hardening rejects privileged, host-networked, root, writable, or broad-mounted containers', async () => {
  const mutations = [
    (inspect) => { inspect.HostConfig.Privileged = true; },
    (inspect) => { inspect.HostConfig.NetworkMode = 'host'; },
    (inspect) => { inspect.Config.User = '0:0'; },
    (inspect) => { inspect.HostConfig.ReadonlyRootfs = false; },
    (inspect) => {
      inspect.Mounts.push({
        Type: 'bind',
        Source: '/var/run/docker.sock',
        Destination: '/var/run/docker.sock',
        RW: true,
      });
    },
    (inspect) => {
      inspect.Mounts.push({
        Type: 'bind',
        Source: '/',
        Destination: '/host',
        RW: false,
      });
    },
    (inspect) => { inspect.HostConfig.Devices = [{ PathOnHost: '/dev/kvm' }]; },
    (inspect) => { inspect.HostConfig.CgroupnsMode = 'host'; },
    (inspect) => { inspect.Config.Env.push('UNREVIEWED_SECRET=blocked'); },
    (inspect) => { inspect.HostConfig.Tmpfs = {}; },
    (inspect) => {
      inspect.HostConfig.Tmpfs['/run'] = 'rw,size=1048576';
    },
  ];

  for (const mutate of mutations) {
    const harness = makeHarness({
      mutateInspect(inspect) {
        mutate(inspect);
        return inspect;
      },
    });
    await assert.rejects(
      () => preflight(harness),
      (error) => error.code === 'OCI_HARDENING_MISMATCH'
        && error.phase === 'preflight'
        && error.executionStatus === 'BLOCKED',
    );
  }
});

test('managed labels are inventory only: a running leftover is stopped, cgroup-proven, removed, and re-listed', async () => {
  const harness = makeHarness({
    managedSequences: [['leftover-running'], []],
  });
  await preflight(harness);

  assert.equal(harness.events.includes('docker.inspect:leftover-running'), true);
  assert.equal(harness.events.includes('procfs.path:777'), true);
  assert.equal(harness.events.includes('docker.stop:leftover-running'), true);
  assert.equal(harness.events.includes('procfs.events:/docker/777'), true);
  assert.equal(harness.events.includes('docker.remove:leftover-running'), true);
});

test('an unprovable stopped leftover blocks reconciliation instead of trusting its label', async () => {
  const harness = makeHarness({
    managedSequences: [['leftover-stopped']],
  });
  await assert.rejects(
    () => preflight(harness),
    (error) => error.code === 'OCI_RECONCILIATION_UNCERTAIN'
      && error.phase === 'reconcile'
      && error.executionStatus === 'BLOCKED'
      && !('artifactSafe' in error),
  );
  assert.equal(harness.events.includes('docker.remove:leftover-stopped'), false);
});

test('openArm creates the exact hardened private container and does not start it', async () => {
  const harness = makeHarness();
  const session = await openArm(harness);
  const armSpec = [...harness.specs.values()].find((spec) => spec.purpose === 'arm');

  assert.equal(typeof session.runAndProveStopped, 'function');
  assert.equal(typeof session.cleanupAndProve, 'function');
  assert.equal(harness.events.includes('proxy.env:proxy-baseline'), true);
  assert.equal(armSpec.imageReference, IMAGE_REFERENCE);
  assert.equal(armSpec.runtimePath, OCI_RUNTIME_PATH);
  assert.equal(armSpec.networkMode, 'none');
  assert.equal(armSpec.user, '65532:65532');
  assert.equal(armSpec.readOnlyRootFilesystem, true);
  assert.deepEqual(armSpec.capDrop, ['ALL']);
  assert.deepEqual(armSpec.securityOptions, ['no-new-privileges']);
  assert.equal(armSpec.pidNamespace, 'private');
  assert.equal(armSpec.cgroupNamespace, 'private');
  assert.equal(armSpec.pidLimit, 64);
  assert.equal(armSpec.cpuQuota, 100_000);
  assert.equal(armSpec.memoryBytes, 1_073_741_824);
  assert.deepEqual(armSpec.expectedEnvironment, {
    PATH: '/opt/governance/runtime:/usr/bin:/bin',
    LANG: 'C.UTF-8',
    HOME: '/tmp/home',
    CODEX_HOME: '/tmp/home/.codex',
    TMPDIR: '/tmp',
    NO_COLOR: '1',
    OPENAI_API_KEY: 'attempt-token-baseline',
    OPENAI_BASE_URL: 'http://127.0.0.1:43127/v1',
  });
  assert.deepEqual(armSpec.tmpfs, {
    '/tmp': 'rw,noexec,nosuid,nodev,size=67108864,mode=1777',
  });
  assert.deepEqual(armSpec.devices, []);
  assert.equal(armSpec.mounts.some((mount) => mount.target === '/var/run/docker.sock'), false);
  assert.equal(armSpec.mounts.some((mount) => mount.target === '/sys/fs/cgroup'), false);
  assert.equal(armSpec.mounts.some((mount) => mount.source === '/'), false);
  assert.equal(armSpec.mounts.some((mount) => (
    mount.target === '/workspace'
    && mount.source === '/tmp/baseline-workspace'
    && mount.readOnly === false
  )), true);
  assert.equal(armSpec.mounts.some((mount) => (
    mount.target === '/run/governance/lifeline'
    && mount.readOnly === true
  )), true);
  assert.equal(
    armSpec.mounts.some((mount) => mount.target === '/run/governance/proxy.sock'),
    false,
  );
  assert.equal(armSpec.mounts.some((mount) => (
    mount.target === '/run/governance/response.schema.json'
    && mount.source === '/tmp/oci-surface-2/response.schema.json'
    && mount.readOnly === true
  )), true);
  assert.equal(harness.events.some((event) => event.startsWith('docker.start:container-2')), false);
  const pid1 = harness.surfaces.get('/tmp/oci-surface-2').input.pid1Script;
  assert.match(pid1, /read -r ready/u);
  assert.equal(pid1.indexOf('read -r ready') < pid1.indexOf(`"${OCI_RUNTIME_PATH}"`), true);
});

test('openArm rejects a proxy environment outside the exact opaque facade contract', async () => {
  for (const proxyEnvironment of [
    {
      OPENAI_API_KEY: 'attempt-token-baseline',
      OPENAI_BASE_URL: 'http://127.0.0.1:43127/v1',
      UNREVIEWED: 'blocked',
    },
    {
      OPENAI_API_KEY: 'attempt-token-baseline',
      OPENAI_BASE_URL: 'http://127.0.0.1:9999/v1',
    },
    {
      OPENAI_API_KEY: 'line\nbreak',
      OPENAI_BASE_URL: 'http://127.0.0.1:43127/v1',
    },
  ]) {
    const harness = makeHarness({ proxyEnvironment });
    await preflight(harness);
    await assert.rejects(
      () => harness.supervisor.openArm({
        arm: 'baseline',
        attemptId: 'c'.repeat(64),
        command: { args: ['exec', '-'], stdin: 'baseline' },
        responseSchema: '/tmp/runner-owned-response.schema.json',
        timeoutMs: 2_000,
        workspace: '/tmp/baseline-workspace',
      }),
      (error) => error.code === 'OCI_PROXY_POLICY_MISMATCH'
        && error.phase === 'arm-open'
        && error.executionStatus === 'FAIL-CLOSED',
    );
  }
});

test('runAndProveStopped closes the PID1 lifeline and proves stopped plus populated 0 before cleanup', async () => {
  const harness = makeHarness();
  const session = await openArm(harness);
  const result = await session.runAndProveStopped();

  assert.deepEqual(result.execution, {
    status: 'completed',
    errorCode: null,
    exitCode: 0,
    signal: null,
    wallTimeMs: 5,
  });
  assert.match(result.executionBoundaryId, /^[a-f0-9]{64}$/);
  assert.equal(result.closedBoundaryEvidence.pidNamespaceStopped, true);
  assert.equal(result.closedBoundaryEvidence.cgroupEmpty, true);
  assert.equal(result.closedBoundaryEvidence.cleanupComplete, false);
  assert.equal(
    harness.events.includes('fs.verify-schema:/tmp/oci-surface-2/response.schema.json'),
    true,
  );
  assert.equal(JSON.stringify(result).includes('container-2'), false);
  assert.equal(JSON.stringify(result).includes('/docker/'), false);
  assert.equal(JSON.stringify(result).includes('attempt-token'), false);
  assert.equal(harness.events.includes('docker.remove:container-2'), false);
  assert.equal(harness.events.includes('proxy.close:proxy-baseline'), false);

  const started = harness.events.indexOf('docker.start:container-2');
  const fifoArmed = harness.events.indexOf('fs.arm-fifo:/tmp/oci-surface-2');
  const pidCaptured = harness.events.indexOf('procfs.path:5002');
  const relayAttached = harness.events.indexOf('proxy.attach:proxy-baseline:5002');
  const fifoActivated = harness.events.indexOf('fs.signal-fifo-ready:/tmp/oci-surface-2');
  const waited = harness.events.findIndex((event) => event.startsWith('docker.wait:container-2:'));
  const fifoClosed = harness.events.indexOf('fs.close-fifo:/tmp/oci-surface-2');
  const emptyProven = harness.events.indexOf('procfs.events:/docker/5002');
  assert.equal(fifoArmed < started, true);
  assert.equal(started < pidCaptured, true);
  assert.equal(pidCaptured < relayAttached, true);
  assert.equal(relayAttached < fifoActivated, true);
  assert.equal(fifoActivated < waited, true);
  assert.equal(waited < fifoClosed, true);
  assert.equal(fifoClosed < emptyProven, true);
});

test('cleanupAndProve runs only after boundary proof, preserves the workspace, and proves every owned resource absent', async () => {
  const harness = makeHarness({ managedSequences: [[], [], []] });
  const session = await openArm(harness);
  await session.runAndProveStopped();
  const cleanup = await session.cleanupAndProve();

  assert.deepEqual(cleanup, {
    cleanupComplete: true,
    executionBoundaryId: session.executionBoundaryId,
  });
  assert.equal(harness.events.includes('docker.remove:container-2'), true);
  assert.equal(harness.events.includes('proxy.close:proxy-baseline'), true);
  assert.equal(harness.events.includes('proxy.prove-closed:proxy-baseline'), true);
  assert.equal(harness.events.includes('fs.remove-surface:/tmp/oci-surface-2'), true);
  assert.equal(harness.events.includes('fs.prove-removed:/tmp/oci-surface-2'), true);
  assert.equal(harness.events.some((event) => event.includes('baseline-workspace')), false);
});

test('non-zero child exit remains execution evidence when stopped, cgroup, and cleanup proofs succeed', async () => {
  const harness = makeHarness({
    waitSequences: [
      { timedOut: false, exitCode: 0 },
      { timedOut: false, exitCode: 17 },
    ],
  });
  const session = await openArm(harness);
  const result = await session.runAndProveStopped();
  const cleanup = await session.cleanupAndProve();

  assert.equal(result.execution.exitCode, 17);
  assert.equal(result.execution.status, 'failed');
  assert.equal(result.execution.errorCode, 'CHILD_EXIT_NONZERO');
  assert.equal(result.closedBoundaryEvidence.cgroupEmpty, true);
  assert.equal(cleanup.cleanupComplete, true);
});

test('child timeout closes the lifeline and remains execution evidence after eventual boundary proof', async () => {
  const harness = makeHarness({
    waitSequences: [
      { timedOut: false, exitCode: 0 },
      { timedOut: true, exitCode: null },
      { timedOut: false, exitCode: 143 },
    ],
  });
  const session = await openArm(harness);
  const result = await session.runAndProveStopped();
  const cleanup = await session.cleanupAndProve();

  assert.deepEqual(result.execution, {
    status: 'timeout',
    errorCode: 'CHILD_TIMEOUT',
    exitCode: 143,
    signal: null,
    wallTimeMs: 5,
  });
  const firstWait = harness.events.findIndex((event) => event.startsWith('docker.wait:container-2:2000'));
  const closed = harness.events.indexOf('fs.close-fifo:/tmp/oci-surface-2');
  const secondWait = harness.events.findIndex((event) => event.startsWith('docker.wait:container-2:5000'));
  assert.equal(firstWait < closed, true);
  assert.equal(closed < secondWait, true);
  assert.equal(cleanup.cleanupComplete, true);
});

test('relay attach failure closes the armed FIFO, fails closed, and still permits proven cleanup', async () => {
  const harness = makeHarness({ proxyAttachError: true });
  const session = await openArm(harness);

  await assert.rejects(
    () => session.runAndProveStopped(),
    (error) => error.code === 'OCI_PROXY_RELAY_UNAVAILABLE'
      && error.phase === 'boundary-proof'
      && error.executionStatus === 'FAIL-CLOSED'
      && error.message === 'OCI_PROXY_RELAY_UNAVAILABLE',
  );
  const armed = harness.events.indexOf('fs.arm-fifo:/tmp/oci-surface-2');
  const started = harness.events.indexOf('docker.start:container-2');
  const attached = harness.events.indexOf('proxy.attach:proxy-baseline:5002');
  const closed = harness.events.indexOf('fs.close-fifo:/tmp/oci-surface-2');
  assert.equal(armed < started, true);
  assert.equal(started < attached, true);
  assert.equal(attached < closed, true);
  assert.equal(
    harness.events.includes('fs.signal-fifo-ready:/tmp/oci-surface-2'),
    false,
  );
  assert.deepEqual(await session.cleanupAndProve(), {
    cleanupComplete: true,
    executionBoundaryId: session.executionBoundaryId,
  });
});

test('response-schema copy drift after execution fails closed before evidence can be returned', async () => {
  const harness = makeHarness({ responseSchemaStable: false });
  const session = await openArm(harness);

  await assert.rejects(
    () => session.runAndProveStopped(),
    (error) => error.code === 'OCI_RESPONSE_SCHEMA_DRIFT'
      && error.phase === 'boundary-proof'
      && error.executionStatus === 'FAIL-CLOSED',
  );
  assert.equal(
    harness.events.includes('fs.verify-schema:/tmp/oci-surface-2/response.schema.json'),
    true,
  );
  assert.deepEqual(await session.cleanupAndProve(), {
    cleanupComplete: true,
    executionBoundaryId: session.executionBoundaryId,
  });
});

test('kernel-confirmed cgroup removal after observed stop is an accepted empty-boundary proof', async () => {
  const harness = makeHarness({
    cgroupObservation: { populated: null, removed: true },
  });
  const session = await openArm(harness);
  const result = await session.runAndProveStopped();
  assert.equal(result.closedBoundaryEvidence.cgroupEmpty, true);
  await session.cleanupAndProve();
});

test('missing empty-boundary proof fails closed with a stable code and no artifact-safety implication', async () => {
  const harness = makeHarness({
    cgroupObservations: [
      { populated: false, removed: false },
      { populated: true, removed: false },
    ],
  });
  const session = await openArm(harness);

  await assert.rejects(
    () => session.runAndProveStopped(),
    (error) => error.code === 'OCI_BOUNDARY_PROOF_UNAVAILABLE'
      && error.phase === 'boundary-proof'
      && error.executionStatus === 'FAIL-CLOSED'
      && error.message === 'OCI_BOUNDARY_PROOF_UNAVAILABLE'
      && !('artifactSafe' in error)
      && !('boundaryEvidence' in error),
  );
  await assert.rejects(
    () => session.cleanupAndProve(),
    (error) => error.code === 'OCI_CLEANUP_UNCERTAIN'
      && error.phase === 'cleanup'
      && error.executionStatus === 'FAIL-CLOSED',
  );
});

test('cleanup uncertainty is a stable fail-closed error and never returns empty proof', async () => {
  const harness = makeHarness({ removeContainerErrors: [false, true] });
  const session = await openArm(harness);
  await session.runAndProveStopped();

  await assert.rejects(
    () => session.cleanupAndProve(),
    (error) => error.code === 'OCI_CLEANUP_UNCERTAIN'
      && error.phase === 'cleanup'
      && error.executionStatus === 'FAIL-CLOSED'
      && error.message === 'OCI_CLEANUP_UNCERTAIN'
      && !('artifactSafe' in error)
      && !('cleanupComplete' in error),
  );
});

test('proxy cleanup retains its stable closed code while all owned cleanup still runs', async () => {
  const harness = makeHarness({
    proxyCloseStableCode: 'PROXY_CLEANUP_UNPROVEN',
  });
  const session = await openArm(harness);
  await session.runAndProveStopped();

  await assert.rejects(
    () => session.cleanupAndProve(),
    (error) => error.code === 'PROXY_CLEANUP_UNPROVEN'
      && error.phase === 'cleanup'
      && error.executionStatus === 'FAIL-CLOSED'
      && error.message === 'PROXY_CLEANUP_UNPROVEN'
      && !('artifactSafe' in error)
      && !('cleanupComplete' in error),
  );
  assert.equal(harness.events.includes('docker.remove:container-2'), true);
  assert.equal(harness.events.includes('fs.remove-surface:/tmp/oci-surface-2'), true);
  assert.equal(harness.events.includes('fs.prove-removed:/tmp/oci-surface-2'), true);
});

test('both arms receive one identical executionBoundaryId from actual canonical policies', async () => {
  const harness = makeHarness({
    managedSequences: [[], [], [], [], []],
  });
  const preflightResult = await preflight(harness);
  const baseline = await harness.supervisor.openArm({
    arm: 'baseline',
    attemptId: 'c'.repeat(64),
    command: { args: ['exec', '-'], stdin: 'baseline' },
    responseSchema: '/tmp/runner-owned-response.schema.json',
    timeoutMs: 2_000,
    workspace: '/tmp/baseline-workspace',
  });
  const governed = await harness.supervisor.openArm({
    arm: 'governed',
    attemptId: 'c'.repeat(64),
    command: { args: ['exec', '-'], stdin: 'governed' },
    responseSchema: '/tmp/runner-owned-response.schema.json',
    timeoutMs: 2_000,
    workspace: '/tmp/governed-workspace',
  });

  assert.equal(baseline.executionBoundaryId, preflightResult.executionBoundaryId);
  assert.equal(governed.executionBoundaryId, preflightResult.executionBoundaryId);
  await baseline.cleanupAndProve().catch(() => {});
  await governed.cleanupAndProve().catch(() => {});
});

test('Docker CLI client always uses argv tokens with shell false', async () => {
  const calls = [];
  const spawnImpl = (executable, args, options) => {
    calls.push({ executable, args, options });
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.stdin = new PassThrough();
    child.kill = () => {};
    queueMicrotask(() => {
      child.stdout.end('abc123\ndef456\n');
      child.stderr.end();
      child.emit('close', 0, null);
    });
    return child;
  };
  const client = createDockerCliClient({
    executable: '/usr/bin/docker',
    spawnImpl,
    env: {
      PATH: '/usr/bin:/bin',
      HOME: '/tmp/synthetic-home',
      DOCKER_HOST: 'unix:///var/run/docker.sock',
      OPENAI_API_KEY: 'must-not-reach-docker',
      CODEX_HOME: '/tmp/must-not-reach-docker',
      UNRELATED_SECRET: 'must-not-reach-docker',
    },
  });

  const ids = await client.listManagedContainers({
    labelKey: 'org.openai.governance-impact.managed',
  });
  assert.deepEqual(ids, ['abc123', 'def456']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].executable, '/usr/bin/docker');
  assert.deepEqual(calls[0].args, [
    'ps',
    '--all',
    '--quiet',
    '--filter',
    'label=org.openai.governance-impact.managed',
  ]);
  assert.equal(calls[0].options.shell, false);
  assert.equal(calls[0].options.stdio[0], 'pipe');
  assert.deepEqual(calls[0].options.env, {
    PATH: '/usr/bin:/bin',
    HOME: '/tmp/synthetic-home',
    DOCKER_HOST: 'unix:///var/run/docker.sock',
  });
});

test('production runtime surface grants fixed UID 65532 only the traversal and file access it needs', async (t) => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-supervisor-fs-test-'));
  t.after(() => fs.rmSync(tempRoot, { recursive: true, force: true }));
  const surfaceFs = createSupervisorFs({ tempRoot });
  const surface = await surfaceFs.prepareRuntimeSurface({
    purpose: 'permission-test',
    stdin: 'synthetic input',
    containerEnv: { GOVERNANCE_PROXY_BEARER: 'attempt-only' },
    pid1Script: '#!/bin/sh\nexit 0\n',
  });
  const mode = (file) => fs.lstatSync(file).mode & 0o777;

  assert.equal(mode(surface.root), 0o711);
  assert.equal(mode(surface.entrypointPath), 0o555);
  assert.equal(mode(surface.stdinPath), 0o444);
  assert.equal(mode(surface.fifoPath), 0o666);
  assert.equal(mode(surface.stdoutPath), 0o622);
  assert.equal(mode(surface.stderrPath), 0o622);
  assert.equal(mode(surface.envFilePath), 0o600);

  const sourceSchema = path.join(tempRoot, 'runner-owned.schema.json');
  fs.writeFileSync(sourceSchema, '{"type":"object"}\n', { mode: 0o600 });
  const stagedSchema = await surfaceFs.stageResponseSchema(sourceSchema, surface);
  assert.match(stagedSchema.sha256, /^[a-f0-9]{64}$/);
  assert.equal(mode(stagedSchema.path), 0o444);
  assert.equal(fs.readFileSync(stagedSchema.path, 'utf8'), '{"type":"object"}\n');
  fs.writeFileSync(sourceSchema, '{"type":"array"}\n');
  assert.equal(fs.readFileSync(stagedSchema.path, 'utf8'), '{"type":"object"}\n');
  assert.equal(await surfaceFs.verifyStagedResponseSchema(stagedSchema), true);

  await surfaceFs.removeRuntimeSurface(surface);
  assert.equal(await surfaceFs.runtimeSurfaceRemoved(surface), true);
});

test('production FIFO is held O_RDWR before start and signals readiness with one fixed line', async () => {
  let openFlags;
  let written = '';
  const handle = {
    async write(value) {
      written += value;
    },
  };
  const surfaceFs = createSupervisorFs({
    fs: {
      async open(file, flags) {
        assert.equal(file, '/tmp/lifeline.fifo');
        openFlags = flags;
        return handle;
      },
    },
  });

  const opened = await surfaceFs.openFifoWriter({
    fifoPath: '/tmp/lifeline.fifo',
  });
  await surfaceFs.signalFifoReady(opened);
  assert.equal(
    openFlags,
    fs.constants.O_RDWR | fs.constants.O_NONBLOCK,
  );
  assert.equal(written, 'start\n');
});
