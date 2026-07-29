import { spawn as nodeSpawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const OCI_RUNTIME_PATH = '/opt/governance/runtime/codex';
export const OCI_PROXY_BASE_URL = 'http://127.0.0.1:43127/v1';

const MANAGED_LABEL = 'org.openai.governance-impact.managed';
const DIGEST_REFERENCE = /^[^\s/@\0]+(?:\/[^\s/@\0]+)+@sha256:([a-f0-9]{64})$/u;
const HEX_64 = /^[a-f0-9]{64}$/u;
const SAFE_CONTAINER_TOKEN = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/u;
const MAX_DOCKER_OUTPUT_BYTES = 16 * 1024 * 1024;
const MAX_STDIN_BYTES = 1024 * 1024;
const VERSION_TIMEOUT_MS = 10_000;
const SHUTDOWN_TIMEOUT_MS = 5_000;
const DOCKER_CHILD_ENV_KEYS = Object.freeze([
  'PATH',
  'HOME',
  'USER',
  'LOGNAME',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'XDG_RUNTIME_DIR',
  'DOCKER_HOST',
  'DOCKER_CONTEXT',
  'DOCKER_CONFIG',
  'DOCKER_TLS_VERIFY',
  'DOCKER_CERT_PATH',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'SSH_AUTH_SOCK',
]);

const LIMITS = Object.freeze({
  cpuPeriod: 100_000,
  cpuQuota: 100_000,
  memoryBytes: 1_073_741_824,
  pidLimit: 64,
});

const IMAGE_CONTAINER_ENVIRONMENT = Object.freeze({
  PATH: '/opt/governance/runtime:/usr/bin:/bin',
  LANG: 'C.UTF-8',
});

const BASE_CONTAINER_ENVIRONMENT = Object.freeze({
  ...IMAGE_CONTAINER_ENVIRONMENT,
  HOME: '/tmp/home',
  CODEX_HOME: '/tmp/home/.codex',
  TMPDIR: '/tmp',
  NO_COLOR: '1',
});

const CONTAINER_TMPFS = Object.freeze({
  '/tmp': 'rw,noexec,nosuid,nodev,size=67108864,mode=1777',
});

const CONTAINMENT_POLICY = Object.freeze({
  schemaVersion: 1,
  runtimePath: OCI_RUNTIME_PATH,
  rootFilesystem: 'read-only',
  user: '65532:65532',
  capabilities: Object.freeze({ add: [], drop: ['ALL'] }),
  securityOptions: Object.freeze(['no-new-privileges']),
  pidNamespace: 'private',
  cgroupNamespace: 'private',
  limits: LIMITS,
  tmpfs: CONTAINER_TMPFS,
  devices: Object.freeze([]),
  mounts: Object.freeze({
    workspace: Object.freeze({ target: '/workspace', readOnly: false }),
    responseSchema: Object.freeze({
      target: '/run/governance/response.schema.json',
      readOnly: true,
    }),
    lifeline: Object.freeze({ target: '/run/governance/lifeline', readOnly: true }),
  }),
});

const NETWORK_POLICY = Object.freeze({
  schemaVersion: 1,
  networkMode: 'none',
  arbitraryEgress: false,
  proxyTransport: 'host-netns-relay-to-unix-domain-socket',
});

const CLOSED_HARDENING = Object.freeze({
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

const PID1_SCRIPT = `#!/bin/sh
set -eu
exec 3</run/governance/lifeline
if ! IFS= read -r ready <&3 || [ "$ready" != "start" ]; then
  exit 125
fi
mkdir -p "$HOME" "$CODEX_HOME"
"${OCI_RUNTIME_PATH}" "$@" </run/governance/stdin >/run/governance/stdout 2>/run/governance/stderr &
child=$!
(
  while IFS= read -r _ <&3; do :; done
  kill -TERM "$child" 2>/dev/null || true
  sleep 1
  kill -KILL "$child" 2>/dev/null || true
) &
watcher=$!
set +e
wait "$child"
status=$?
set -e
kill "$watcher" 2>/dev/null || true
wait "$watcher" 2>/dev/null || true
exit "$status"
`;

export class OciSupervisorError extends Error {
  constructor(code, phase, executionStatus) {
    super(code);
    this.name = 'OciSupervisorError';
    this.code = code;
    this.phase = phase;
    this.executionStatus = executionStatus;
  }
}

function fail(code, phase, executionStatus) {
  throw new OciSupervisorError(code, phase, executionStatus);
}

function closedError(error, code, phase, executionStatus) {
  if (
    error instanceof OciSupervisorError
    && error.phase === phase
    && error.executionStatus === executionStatus
  ) {
    return error;
  }
  return new OciSupervisorError(code, phase, executionStatus);
}

function canonicalize(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return createHash('sha256').update(input).digest('hex');
}

function hashPolicy(value) {
  return sha256(canonicalize(value));
}

function nonEmptySingleLine(value) {
  return typeof value === 'string'
    && value.length > 0
    && value.trim() === value
    && !/[\r\n\0]/u.test(value);
}

function validateProvenance(value) {
  if (!value || typeof value !== 'object') fail('OCI_PROVENANCE_INVALID', 'preflight', 'BLOCKED');
  const digestMatch = DIGEST_REFERENCE.exec(value.imageReference);
  if (
    !digestMatch
    || !nonEmptySingleLine(value.expectedCodexVersion)
    || !HEX_64.test(value.expectedCodexBinarySha256)
  ) {
    fail('OCI_PROVENANCE_INVALID', 'preflight', 'BLOCKED');
  }
  return {
    imageReference: value.imageReference,
    expectedCodexVersion: value.expectedCodexVersion,
    expectedCodexBinarySha256: value.expectedCodexBinarySha256,
    digest: digestMatch[1],
  };
}

function requireAbsolutePath(value, code = 'OCI_ARM_INPUT_INVALID') {
  if (
    typeof value !== 'string'
    || !path.isAbsolute(value)
    || value.includes('\0')
    || value.includes('\n')
    || value.includes('\r')
  ) {
    fail(code, 'arm-open', 'BLOCKED');
  }
  return value;
}

function validateArmInput(input) {
  if (!input || (input.arm !== 'baseline' && input.arm !== 'governed')) {
    fail('OCI_ARM_INPUT_INVALID', 'arm-open', 'BLOCKED');
  }
  if (!HEX_64.test(input.attemptId)) fail('OCI_ARM_INPUT_INVALID', 'arm-open', 'BLOCKED');
  requireAbsolutePath(input.workspace);
  requireAbsolutePath(input.responseSchema);
  if (
    !input.command
    || !Array.isArray(input.command.args)
    || input.command.args.some((entry) => (
      typeof entry !== 'string' || entry.includes('\0')
    ))
    || typeof input.command.stdin !== 'string'
    || Buffer.byteLength(input.command.stdin) > MAX_STDIN_BYTES
    || !Number.isInteger(input.timeoutMs)
    || input.timeoutMs <= 0
  ) {
    fail('OCI_ARM_INPUT_INVALID', 'arm-open', 'BLOCKED');
  }
}

function validateImageIdentity(image, provenance) {
  if (
    !image
    || !Array.isArray(image.RepoDigests)
    || !image.RepoDigests.includes(provenance.imageReference)
    || !environmentMatches(
      image.Config?.Env,
      IMAGE_CONTAINER_ENVIRONMENT,
    )
  ) {
    fail('OCI_IMAGE_IDENTITY_MISMATCH', 'preflight', 'BLOCKED');
  }
}

function environmentMatches(entries, expected) {
  if (!Array.isArray(entries)) return false;
  const actual = new Map();
  for (const entry of entries) {
    const separator = String(entry).indexOf('=');
    if (separator <= 0) return false;
    const key = String(entry).slice(0, separator);
    if (actual.has(key)) return false;
    actual.set(key, String(entry).slice(separator + 1));
  }
  const expectedEntries = Object.entries(expected);
  return actual.size === expectedEntries.length
    && expectedEntries.every(([key, value]) => actual.get(key) === value);
}

function validateImageFile(file, provenance) {
  if (
    !file
    || file.type !== 'file'
    || !Buffer.isBuffer(file.bytes)
    || !Number.isInteger(file.mode)
    || (file.mode & 0o111) === 0
  ) {
    fail('OCI_RUNTIME_BINARY_INVALID', 'preflight', 'BLOCKED');
  }
  if (sha256(file.bytes) !== provenance.expectedCodexBinarySha256) {
    fail('OCI_RUNTIME_BINARY_MISMATCH', 'preflight', 'BLOCKED');
  }
}

function normalizedObservedVersion(output) {
  if (
    !output
    || typeof output.stdout !== 'string'
    || typeof output.stderr !== 'string'
    || output.stderr.length !== 0
  ) {
    fail('OCI_RUNTIME_VERSION_INVALID', 'preflight', 'BLOCKED');
  }
  const trimmed = output.stdout.trim();
  if (!nonEmptySingleLine(trimmed)) {
    fail('OCI_RUNTIME_VERSION_INVALID', 'preflight', 'BLOCKED');
  }
  return trimmed;
}

function inspectMountsAreExact(inspect, spec) {
  if (!Array.isArray(inspect?.Mounts) || inspect.Mounts.length !== spec.mounts.length) {
    return false;
  }
  const actual = new Map(inspect.Mounts.map((mount) => [mount.Destination, mount]));
  for (const expected of spec.mounts) {
    const mount = actual.get(expected.target);
    if (
      !mount
      || mount.Type !== 'bind'
      || mount.Source !== expected.source
      || mount.RW !== (expected.readOnly !== true)
    ) {
      return false;
    }
  }
  return true;
}

function inspectHasForbiddenMount(inspect) {
  return (inspect.Mounts ?? []).some((mount) => {
    const source = String(mount.Source ?? '');
    const destination = String(mount.Destination ?? '');
    return source === '/'
      || source === '/var/run'
      || source === '/etc'
      || source.includes('docker.sock')
      || destination.includes('docker.sock')
      || source === '/sys/fs/cgroup'
      || source.startsWith('/sys/fs/cgroup/')
      || destination === '/sys/fs/cgroup'
      || destination.startsWith('/sys/fs/cgroup/');
  });
}

function assertHardenedInspect(inspect, spec, phase = 'preflight', status = 'BLOCKED') {
  const host = inspect?.HostConfig;
  const user = inspect?.Config?.User;
  const validUser = typeof user === 'string'
    && user.length > 0
    && !/^(?:0|root)(?::|$)/u.test(user);
  const exactEnvironment = environmentMatches(
    inspect?.Config?.Env,
    spec.expectedEnvironment,
  );
  const capDrop = Array.isArray(host?.CapDrop)
    && host.CapDrop.length === 1
    && host.CapDrop[0] === 'ALL';
  const security = Array.isArray(host?.SecurityOpt)
    && host.SecurityOpt.some((entry) => (
      entry === 'no-new-privileges' || entry === 'no-new-privileges:true'
    ));
  const noDevices = Array.isArray(host?.Devices)
    && host.Devices.length === 0
    && Array.isArray(host?.DeviceRequests)
    && host.DeviceRequests.length === 0;
  const noPorts = host?.PublishAllPorts === false
    && host?.PortBindings
    && Object.keys(host.PortBindings).length === 0;
  const privatePid = host?.PidMode === '' || host?.PidMode === 'private';
  const exactTmpfs = host?.Tmpfs
    && Object.keys(host.Tmpfs).length === Object.keys(spec.tmpfs).length
    && Object.entries(spec.tmpfs)
      .every(([target, value]) => host.Tmpfs[target] === value);

  if (
    !validUser
    || !exactEnvironment
    || host?.NetworkMode !== 'none'
    || host?.ReadonlyRootfs !== true
    || host?.Privileged !== false
    || !capDrop
    || !Array.isArray(host?.CapAdd)
    || host.CapAdd.length !== 0
    || !security
    || !privatePid
    || host?.CgroupnsMode !== 'private'
    || host?.PidsLimit !== LIMITS.pidLimit
    || host?.CpuPeriod !== LIMITS.cpuPeriod
    || host?.CpuQuota !== LIMITS.cpuQuota
    || host?.Memory !== LIMITS.memoryBytes
    || !noDevices
    || !noPorts
    || host?.AutoRemove !== false
    || host?.RestartPolicy?.Name !== 'no'
    || host?.OomKillDisable !== false
    || !exactTmpfs
    || inspectHasForbiddenMount(inspect)
    || !inspectMountsAreExact(inspect, spec)
  ) {
    fail('OCI_HARDENING_MISMATCH', phase, status);
  }
}

function buildMounts(surface, additions = []) {
  return [
    {
      source: surface.entrypointPath,
      target: '/run/governance/pid1.sh',
      readOnly: true,
    },
    {
      source: surface.fifoPath,
      target: '/run/governance/lifeline',
      readOnly: true,
    },
    {
      source: surface.stdinPath,
      target: '/run/governance/stdin',
      readOnly: true,
    },
    {
      source: surface.stdoutPath,
      target: '/run/governance/stdout',
      readOnly: false,
    },
    {
      source: surface.stderrPath,
      target: '/run/governance/stderr',
      readOnly: false,
    },
    ...additions,
  ];
}

function buildContainerSpec({
  purpose,
  provenance,
  surface,
  commandArgs,
  expectedEnvironment = BASE_CONTAINER_ENVIRONMENT,
  labels = {},
  mounts = [],
}) {
  return {
    purpose,
    imageReference: provenance.imageReference,
    runtimePath: OCI_RUNTIME_PATH,
    name: `governance-impact-${purpose}-${randomUUID()}`,
    labels: {
      [MANAGED_LABEL]: 'true',
      'org.openai.governance-impact.purpose': purpose,
      ...labels,
    },
    networkMode: 'none',
    user: CONTAINMENT_POLICY.user,
    readOnlyRootFilesystem: true,
    capDrop: ['ALL'],
    securityOptions: ['no-new-privileges'],
    pidNamespace: 'private',
    cgroupNamespace: 'private',
    pidLimit: LIMITS.pidLimit,
    cpuPeriod: LIMITS.cpuPeriod,
    cpuQuota: LIMITS.cpuQuota,
    memoryBytes: LIMITS.memoryBytes,
    devices: [],
    tmpfs: { ...CONTAINER_TMPFS },
    entrypoint: '/bin/sh',
    entrypointTarget: '/run/governance/pid1.sh',
    commandArgs: [...commandArgs],
    expectedEnvironment: { ...expectedEnvironment },
    envFilePath: surface.envFilePath,
    mounts: buildMounts(surface, mounts),
  };
}

function boundaryEvidence(identity, values) {
  return {
    observedImageDigest: identity.observedImageDigest,
    codexVersion: identity.codexVersion,
    codexBinarySha256: identity.codexBinarySha256,
    containmentPolicyHash: identity.containmentPolicyHash,
    networkPolicyHash: identity.networkPolicyHash,
    proxyPolicyHash: identity.proxyPolicyHash,
    hardening: { ...CLOSED_HARDENING },
    pidNamespaceStopped: values.pidNamespaceStopped,
    cgroupEmpty: values.cgroupEmpty,
    cleanupComplete: values.cleanupComplete,
  };
}

function executionBoundaryId(identity) {
  return hashPolicy({
    observedImageDigest: identity.observedImageDigest,
    codexVersion: identity.codexVersion,
    codexBinarySha256: identity.codexBinarySha256,
    containmentPolicyHash: identity.containmentPolicyHash,
    networkPolicyHash: identity.networkPolicyHash,
    proxyPolicyHash: identity.proxyPolicyHash,
  });
}

async function runContainerAndProve({
  docker,
  fs,
  procfs,
  containerId,
  surface,
  timeoutMs,
  state,
  phase,
  status,
  beforeReady,
}) {
  try {
    state.lifeline = await fs.openFifoWriter(surface);
    await docker.startContainer(containerId);
    state.started = true;
    const running = await docker.inspectContainer(containerId);
    const pid = running?.State?.Pid;
    if (running?.State?.Running !== true || !Number.isInteger(pid) || pid <= 0) {
      fail('OCI_INIT_PID_UNAVAILABLE', phase, status);
    }
    state.cgroupPath = await procfs.cgroupPathForPid(pid);
    if (typeof state.cgroupPath !== 'string' || !state.cgroupPath.startsWith('/')) {
      fail('OCI_CGROUP_PATH_UNAVAILABLE', phase, status);
    }
    if (beforeReady) await beforeReady(pid);
    await fs.signalFifoReady(state.lifeline);
    let waited = await docker.waitContainer(containerId, { timeoutMs });
    state.timedOut = waited?.timedOut === true;
    if (state.timedOut) {
      await fs.closeFifoWriter(state.lifeline);
      state.lifeline = null;
      waited = await docker.waitContainer(containerId, {
        timeoutMs: SHUTDOWN_TIMEOUT_MS,
      });
      if (waited?.timedOut === true) {
        await docker.killContainer(containerId);
        waited = await docker.waitContainer(containerId, {
          timeoutMs: SHUTDOWN_TIMEOUT_MS,
        });
      }
    } else {
      await fs.closeFifoWriter(state.lifeline);
      state.lifeline = null;
    }
    if (
      waited?.timedOut === true
      || !Number.isInteger(waited?.exitCode)
      || waited.exitCode < 0
      || waited.exitCode > 255
    ) {
      fail('OCI_EXECUTION_UNCERTAIN', phase, status);
    }
    state.exitCode = waited.exitCode;
    const stopped = await docker.inspectContainer(containerId);
    if (stopped?.State?.Running !== false || stopped?.State?.Pid !== 0) {
      fail('OCI_BOUNDARY_PROOF_UNAVAILABLE', phase, status);
    }
    state.pidNamespaceStopped = true;
    const observation = await procfs.observeCgroup(state.cgroupPath);
    if (observation?.populated !== false && observation?.removed !== true) {
      fail('OCI_BOUNDARY_PROOF_UNAVAILABLE', phase, status);
    }
    state.cgroupEmpty = true;
    return state;
  } catch (error) {
    if (state.lifeline) {
      await fs.closeFifoWriter(state.lifeline).catch(() => {});
      state.lifeline = null;
    }
    throw closedError(error, 'OCI_EXECUTION_UNCERTAIN', phase, status);
  }
}

async function removeOwnedResources({
  docker,
  fs,
  proxy,
  containerId,
  surface,
  proxyHandle,
  requireBoundaryProof,
  state,
}) {
  let certain = state.pidNamespaceStopped === true && state.cgroupEmpty === true;
  let stableProxyErrorCode = null;
  if (!certain) {
    try {
      const inspect = await docker.inspectContainer(containerId);
      if (inspect?.State?.Running === true) {
        if (!state.cgroupPath && Number.isInteger(inspect.State.Pid) && inspect.State.Pid > 0) {
          state.cgroupPath = await state.procfs.cgroupPathForPid(inspect.State.Pid);
        }
        await docker.stopContainer(containerId);
      }
      const stopped = await docker.inspectContainer(containerId);
      if (stopped?.State?.Running === false && stopped?.State?.Pid === 0 && state.cgroupPath) {
        const observed = await state.procfs.observeCgroup(state.cgroupPath);
        certain = observed?.populated === false || observed?.removed === true;
      }
    } catch {
      certain = false;
    }
  }

  let removed = true;
  try {
    if (state.lifeline) await fs.closeFifoWriter(state.lifeline);
  } catch {
    removed = false;
  }
  try {
    await docker.removeContainer(containerId);
  } catch {
    removed = false;
  }
  if (proxyHandle) {
    try {
      await proxy.closeAttempt(proxyHandle);
    } catch (error) {
      if (
        typeof error?.code === 'string'
        && /^PROXY_[A-Z0-9_]+$/u.test(error.code)
      ) {
        stableProxyErrorCode = error.code;
      }
      removed = false;
    }
  }
  try {
    await fs.removeRuntimeSurface(surface);
  } catch {
    removed = false;
  }
  try {
    const remaining = await docker.listManagedContainers({ labelKey: MANAGED_LABEL });
    if (remaining.includes(containerId)) removed = false;
  } catch {
    removed = false;
  }
  if (proxyHandle) {
    try {
      if (await proxy.proveClosed(proxyHandle) !== true) removed = false;
    } catch (error) {
      if (
        typeof error?.code === 'string'
        && /^PROXY_[A-Z0-9_]+$/u.test(error.code)
      ) {
        stableProxyErrorCode ??= error.code;
      }
      removed = false;
    }
  }
  try {
    if (await fs.runtimeSurfaceRemoved(surface) !== true) removed = false;
  } catch {
    removed = false;
  }
  return {
    complete: removed && (!requireBoundaryProof || certain),
    stableProxyErrorCode,
  };
}

function defaultUnavailableProxy() {
  return {
    async describePolicy() {
      fail('OCI_PROXY_UNAVAILABLE', 'preflight', 'BLOCKED');
    },
    async reconcile() {
      return false;
    },
  };
}

export function createLinuxCodexOciSupervisor(options = {}) {
  const platform = options.platform ?? process.platform;
  const docker = options.docker ?? createDockerCliClient();
  const procfs = options.procfs ?? createLinuxProcfsClient();
  const fs = options.fs ?? createSupervisorFs();
  const proxy = options.proxy ?? defaultUnavailableProxy();
  const clock = options.clock ?? { now: () => Date.now() };
  let preflightState = null;

  async function reconcileManagedContainers() {
    let ids;
    try {
      ids = await docker.listManagedContainers({ labelKey: MANAGED_LABEL });
    } catch {
      fail('OCI_RECONCILIATION_UNCERTAIN', 'reconcile', 'BLOCKED');
    }
    for (const id of ids) {
      try {
        const initial = await docker.inspectContainer(id);
        if (
          initial?.State?.Running !== true
          || !Number.isInteger(initial.State.Pid)
          || initial.State.Pid <= 0
        ) {
          fail('OCI_RECONCILIATION_UNCERTAIN', 'reconcile', 'BLOCKED');
        }
        const cgroupPath = await procfs.cgroupPathForPid(initial.State.Pid);
        await docker.stopContainer(id);
        const stopped = await docker.inspectContainer(id);
        if (stopped?.State?.Running !== false || stopped?.State?.Pid !== 0) {
          fail('OCI_RECONCILIATION_UNCERTAIN', 'reconcile', 'BLOCKED');
        }
        const observed = await procfs.observeCgroup(cgroupPath);
        if (observed?.populated !== false && observed?.removed !== true) {
          fail('OCI_RECONCILIATION_UNCERTAIN', 'reconcile', 'BLOCKED');
        }
        await docker.removeContainer(id);
        const remaining = await docker.listManagedContainers({ labelKey: MANAGED_LABEL });
        if (remaining.includes(id)) {
          fail('OCI_RECONCILIATION_UNCERTAIN', 'reconcile', 'BLOCKED');
        }
      } catch (error) {
        throw closedError(
          error,
          'OCI_RECONCILIATION_UNCERTAIN',
          'reconcile',
          'BLOCKED',
        );
      }
    }
    try {
      if (await proxy.reconcile() !== true) {
        fail('OCI_RECONCILIATION_UNCERTAIN', 'reconcile', 'BLOCKED');
      }
    } catch (error) {
      throw closedError(
        error,
        'OCI_RECONCILIATION_UNCERTAIN',
        'reconcile',
        'BLOCKED',
      );
    }
  }

  async function runVersionProbe(provenance) {
    let surface;
    let containerId;
    const state = { procfs };
    try {
      surface = await fs.prepareRuntimeSurface({
        purpose: 'version-probe',
        stdin: '',
        containerEnv: BASE_CONTAINER_ENVIRONMENT,
        pid1Script: PID1_SCRIPT,
      });
      const spec = buildContainerSpec({
        purpose: 'version-probe',
        provenance,
        surface,
        commandArgs: ['--version'],
      });
      containerId = await docker.createContainer(spec);
      await fs.removeSensitiveEnvFile(surface);
      const inspect = await docker.inspectContainer(containerId);
      assertHardenedInspect(inspect, spec);
      await runContainerAndProve({
        docker,
        fs,
        procfs,
        containerId,
        surface,
        timeoutMs: VERSION_TIMEOUT_MS,
        state,
        phase: 'preflight',
        status: 'BLOCKED',
      });
      const output = await fs.readRuntimeOutput(surface);
      const version = normalizedObservedVersion(output);
      if (state.timedOut || state.exitCode !== 0) {
        fail('OCI_RUNTIME_VERSION_INVALID', 'preflight', 'BLOCKED');
      }
      const cleanup = await removeOwnedResources({
        docker,
        fs,
        proxy,
        containerId,
        surface,
        proxyHandle: null,
        requireBoundaryProof: true,
        state,
      });
      containerId = null;
      surface = null;
      if (!cleanup.complete) {
        fail('OCI_PREFLIGHT_CLEANUP_UNCERTAIN', 'preflight', 'BLOCKED');
      }
      return version;
    } catch (error) {
      if (containerId && surface) {
        await removeOwnedResources({
          docker,
          fs,
          proxy,
          containerId,
          surface,
          proxyHandle: null,
          requireBoundaryProof: false,
          state,
        }).catch(() => {});
      }
      throw closedError(error, 'OCI_PREFLIGHT_UNCERTAIN', 'preflight', 'BLOCKED');
    }
  }

  async function preflightAndReconcile(inputProvenance) {
    if (platform !== 'linux') {
      fail('OCI_PLATFORM_UNSUPPORTED', 'preflight', 'BLOCKED');
    }
    const provenance = validateProvenance(inputProvenance);
    let cgroupV2;
    try {
      cgroupV2 = await procfs.isCgroupV2();
    } catch {
      cgroupV2 = false;
    }
    if (cgroupV2 !== true) {
      fail('OCI_CGROUP_V2_UNAVAILABLE', 'preflight', 'BLOCKED');
    }

    await reconcileManagedContainers();
    let image;
    let imageFile;
    try {
      image = await docker.inspectImage(provenance.imageReference);
      validateImageIdentity(image, provenance);
      imageFile = await docker.readImageFile(
        provenance.imageReference,
        OCI_RUNTIME_PATH,
      );
      validateImageFile(imageFile, provenance);
    } catch (error) {
      throw closedError(error, 'OCI_IMAGE_INSPECTION_UNCERTAIN', 'preflight', 'BLOCKED');
    }

    let proxyPolicy;
    try {
      proxyPolicy = await proxy.describePolicy();
    } catch (error) {
      throw closedError(error, 'OCI_PROXY_UNAVAILABLE', 'preflight', 'BLOCKED');
    }
    if (!proxyPolicy || typeof proxyPolicy !== 'object' || Array.isArray(proxyPolicy)) {
      fail('OCI_PROXY_UNAVAILABLE', 'preflight', 'BLOCKED');
    }

    const codexVersion = await runVersionProbe(provenance);
    if (codexVersion !== provenance.expectedCodexVersion) {
      fail('OCI_RUNTIME_VERSION_MISMATCH', 'preflight', 'BLOCKED');
    }
    const identity = {
      observedImageDigest: provenance.digest,
      codexVersion,
      codexBinarySha256: provenance.expectedCodexBinarySha256,
      containmentPolicyHash: hashPolicy(CONTAINMENT_POLICY),
      networkPolicyHash: hashPolicy(NETWORK_POLICY),
      proxyPolicyHash: hashPolicy(proxyPolicy),
    };
    preflightState = {
      provenance,
      identity,
      executionBoundaryId: executionBoundaryId(identity),
      proxyPolicyHash: identity.proxyPolicyHash,
    };
    return {
      executionBoundaryId: preflightState.executionBoundaryId,
      boundaryEvidence: boundaryEvidence(identity, {
        pidNamespaceStopped: true,
        cgroupEmpty: true,
        cleanupComplete: true,
      }),
    };
  }

  async function openArm(input) {
    if (!preflightState) fail('OCI_PREFLIGHT_REQUIRED', 'arm-open', 'BLOCKED');
    validateArmInput(input);
    if (typeof fs.validateReadOnlyFile === 'function') {
      try {
        if (await fs.validateReadOnlyFile(input.responseSchema) !== true) {
          fail('OCI_ARM_INPUT_INVALID', 'arm-open', 'BLOCKED');
        }
      } catch (error) {
        throw closedError(error, 'OCI_ARM_INPUT_INVALID', 'arm-open', 'BLOCKED');
      }
    }

    let proxyHandle;
    let surface;
    let containerId;
    try {
      proxyHandle = await proxy.openAttempt({
        arm: input.arm,
        attemptId: input.attemptId,
        deadlineMs: input.timeoutMs,
      });
      if (
        !proxyHandle
        || hashPolicy(proxyHandle.policy) !== preflightState.proxyPolicyHash
        || typeof proxy.getContainerEnvironment !== 'function'
      ) {
        fail('OCI_PROXY_POLICY_MISMATCH', 'arm-open', 'FAIL-CLOSED');
      }
      const proxyEnvironment = await proxy.getContainerEnvironment(proxyHandle);
      if (
        !proxyEnvironment
        || typeof proxyEnvironment !== 'object'
        || Array.isArray(proxyEnvironment)
        || Object.keys(proxyEnvironment).sort().join(',')
          !== 'OPENAI_API_KEY,OPENAI_BASE_URL'
        || !nonEmptySingleLine(proxyEnvironment.OPENAI_API_KEY)
        || proxyEnvironment.OPENAI_BASE_URL !== OCI_PROXY_BASE_URL
      ) {
        fail('OCI_PROXY_POLICY_MISMATCH', 'arm-open', 'FAIL-CLOSED');
      }
      const containerEnvironment = {
        ...BASE_CONTAINER_ENVIRONMENT,
        ...proxyEnvironment,
      };
      surface = await fs.prepareRuntimeSurface({
        purpose: 'arm',
        stdin: input.command.stdin,
        containerEnv: containerEnvironment,
        pid1Script: PID1_SCRIPT,
      });
      const stagedResponseSchema = await fs.stageResponseSchema(
        input.responseSchema,
        surface,
      );
      const spec = buildContainerSpec({
        purpose: 'arm',
        provenance: preflightState.provenance,
        surface,
        commandArgs: input.command.args,
        expectedEnvironment: containerEnvironment,
        labels: {
          'org.openai.governance-impact.arm': input.arm,
          'org.openai.governance-impact.attempt': input.attemptId,
        },
        mounts: [
          {
            source: input.workspace,
            target: '/workspace',
            readOnly: false,
          },
          {
            source: stagedResponseSchema.path,
            target: '/run/governance/response.schema.json',
            readOnly: true,
          },
        ],
      });
      containerId = await docker.createContainer(spec);
      await fs.removeSensitiveEnvFile(surface);
      const inspect = await docker.inspectContainer(containerId);
      assertHardenedInspect(inspect, spec, 'arm-open', 'FAIL-CLOSED');

      const state = {
        procfs,
        started: false,
        pidNamespaceStopped: false,
        cgroupEmpty: false,
        cleaned: false,
      };
      let cleanupResult;
      const session = {
        executionBoundaryId: preflightState.executionBoundaryId,
        async runAndProveStopped() {
          if (state.started) {
            fail('OCI_SESSION_STATE_INVALID', 'execution', 'FAIL-CLOSED');
          }
          const startedAt = clock.now();
          await runContainerAndProve({
            docker,
            fs,
            procfs,
            containerId,
            surface,
            timeoutMs: input.timeoutMs,
            state,
            phase: 'boundary-proof',
            status: 'FAIL-CLOSED',
            beforeReady: async (initPid) => {
              if (typeof proxy.attachAttempt !== 'function') {
                fail('OCI_PROXY_RELAY_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
              }
              try {
                if (
                  await proxy.attachAttempt(proxyHandle, { initPid }) !== true
                ) {
                  fail('OCI_PROXY_RELAY_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
                }
              } catch (error) {
                if (
                  error instanceof OciSupervisorError
                  && error.code === 'OCI_PROXY_RELAY_UNAVAILABLE'
                ) {
                  throw error;
                }
                fail('OCI_PROXY_RELAY_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
              }
            },
          });
          if (
            await fs.verifyStagedResponseSchema(stagedResponseSchema) !== true
          ) {
            fail(
              'OCI_RESPONSE_SCHEMA_DRIFT',
              'boundary-proof',
              'FAIL-CLOSED',
            );
          }
          const wallTimeMs = Math.max(0, Math.round(clock.now() - startedAt));
          let execution;
          if (state.timedOut) {
            execution = {
              status: 'timeout',
              errorCode: 'CHILD_TIMEOUT',
              exitCode: state.exitCode,
              signal: null,
              wallTimeMs,
            };
          } else if (state.exitCode !== 0) {
            execution = {
              status: 'failed',
              errorCode: 'CHILD_EXIT_NONZERO',
              exitCode: state.exitCode,
              signal: null,
              wallTimeMs,
            };
          } else {
            execution = {
              status: 'completed',
              errorCode: null,
              exitCode: 0,
              signal: null,
              wallTimeMs,
            };
          }
          return {
            execution,
            closedBoundaryEvidence: boundaryEvidence(preflightState.identity, {
              pidNamespaceStopped: true,
              cgroupEmpty: true,
              cleanupComplete: false,
            }),
            executionBoundaryId: preflightState.executionBoundaryId,
          };
        },
        async cleanupAndProve() {
          if (cleanupResult) return cleanupResult;
          const cleanup = await removeOwnedResources({
            docker,
            fs,
            proxy,
            containerId,
            surface,
            proxyHandle,
            requireBoundaryProof: true,
            state,
          });
          state.cleaned = cleanup.complete;
          if (!cleanup.complete) {
            if (cleanup.stableProxyErrorCode) {
              fail(cleanup.stableProxyErrorCode, 'cleanup', 'FAIL-CLOSED');
            }
            fail('OCI_CLEANUP_UNCERTAIN', 'cleanup', 'FAIL-CLOSED');
          }
          cleanupResult = {
            cleanupComplete: true,
            executionBoundaryId: preflightState.executionBoundaryId,
          };
          return cleanupResult;
        },
      };
      return session;
    } catch (error) {
      if (containerId && surface) {
        await removeOwnedResources({
          docker,
          fs,
          proxy,
          containerId,
          surface,
          proxyHandle,
          requireBoundaryProof: false,
          state: { procfs },
        }).catch(() => {});
      } else {
        if (proxyHandle) await proxy.closeAttempt(proxyHandle).catch(() => {});
        if (surface) await fs.removeRuntimeSurface(surface).catch(() => {});
      }
      throw closedError(error, 'OCI_ARM_OPEN_UNCERTAIN', 'arm-open', 'FAIL-CLOSED');
    }
  }

  return {
    openArm,
    preflightAndReconcile,
  };
}

function collectDockerCommand(spawnImpl, executable, args, options) {
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawnImpl(executable, args, {
        env: options.env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      reject(new OciSupervisorError('OCI_DOCKER_COMMAND_FAILED', 'docker', 'FAIL-CLOSED'));
      return;
    }
    const stdout = [];
    const stderr = [];
    let size = 0;
    let timedOut = false;
    let settled = false;
    const timer = options.timeoutMs > 0
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, options.timeoutMs)
      : null;
    const onData = (target) => (chunk) => {
      const value = Buffer.from(chunk);
      size += value.length;
      if (size > options.maxOutputBytes) {
        child.kill('SIGKILL');
        return;
      }
      target.push(value);
    };
    child.stdout.on('data', onData(stdout));
    child.stderr.on('data', onData(stderr));
    child.once('error', () => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      reject(new OciSupervisorError('OCI_DOCKER_COMMAND_FAILED', 'docker', 'FAIL-CLOSED'));
    });
    child.once('close', (exitCode) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (size > options.maxOutputBytes) {
        reject(new OciSupervisorError('OCI_DOCKER_OUTPUT_LIMIT', 'docker', 'FAIL-CLOSED'));
        return;
      }
      resolve({
        exitCode,
        timedOut,
        stdout: Buffer.concat(stdout),
        stderr: Buffer.concat(stderr),
      });
    });
    child.stdin.end(options.input ?? undefined);
  });
}

function requireDockerSuccess(result) {
  if (result.timedOut || result.exitCode !== 0) {
    fail('OCI_DOCKER_COMMAND_FAILED', 'docker', 'FAIL-CLOSED');
  }
  return result;
}

function parseJsonBuffer(buffer) {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    fail('OCI_DOCKER_RESPONSE_INVALID', 'docker', 'FAIL-CLOSED');
  }
}

function parseTarEntry(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 512) {
    fail('OCI_IMAGE_FILE_INVALID', 'preflight', 'BLOCKED');
  }
  const octal = (start, length) => {
    const text = buffer.subarray(start, start + length)
      .toString('ascii')
      .replace(/\0.*$/u, '')
      .trim();
    const value = Number.parseInt(text || '0', 8);
    if (!Number.isSafeInteger(value) || value < 0) {
      fail('OCI_IMAGE_FILE_INVALID', 'preflight', 'BLOCKED');
    }
    return value;
  };
  const mode = octal(100, 8);
  const size = octal(124, 12);
  const typeFlag = buffer[156];
  if (buffer.length < 512 + size) {
    fail('OCI_IMAGE_FILE_INVALID', 'preflight', 'BLOCKED');
  }
  return {
    bytes: buffer.subarray(512, 512 + size),
    mode,
    type: typeFlag === 0 || typeFlag === 48
      ? 'file'
      : typeFlag === 50
        ? 'symlink'
        : 'other',
  };
}

function dockerChildEnvironment(source) {
  const result = {};
  for (const key of DOCKER_CHILD_ENV_KEYS) {
    const value = source?.[key];
    if (
      typeof value === 'string'
      && value.length > 0
      && !/[\0\r\n]/u.test(value)
    ) {
      result[key] = value;
    }
  }
  return result;
}

function safeMountArgument(mount) {
  if (
    !mount
    || typeof mount.source !== 'string'
    || typeof mount.target !== 'string'
    || !path.isAbsolute(mount.source)
    || !path.posix.isAbsolute(mount.target)
    || /[,\0\r\n]/u.test(mount.source)
    || /[,\0\r\n]/u.test(mount.target)
  ) {
    fail('OCI_DOCKER_SPEC_INVALID', 'arm-open', 'BLOCKED');
  }
  return [
    'type=bind',
    `source=${mount.source}`,
    `target=${mount.target}`,
    ...(mount.readOnly === true ? ['readonly'] : []),
  ].join(',');
}

export function createDockerCliClient(options = {}) {
  const executable = options.executable ?? 'docker';
  const spawnImpl = options.spawnImpl ?? nodeSpawn;
  const env = dockerChildEnvironment(options.env ?? process.env);
  const maxOutputBytes = options.maxOutputBytes ?? MAX_DOCKER_OUTPUT_BYTES;

  const run = (args, runOptions = {}) => collectDockerCommand(
    spawnImpl,
    executable,
    args,
    {
      env,
      input: runOptions.input,
      timeoutMs: runOptions.timeoutMs ?? 30_000,
      maxOutputBytes,
    },
  );

  return {
    async listManagedContainers({ labelKey = MANAGED_LABEL } = {}) {
      if (!SAFE_CONTAINER_TOKEN.test(labelKey)) {
        fail('OCI_DOCKER_SPEC_INVALID', 'reconcile', 'BLOCKED');
      }
      const result = requireDockerSuccess(await run([
        'ps',
        '--all',
        '--quiet',
        '--filter',
        `label=${labelKey}`,
      ]));
      return result.stdout
        .toString('utf8')
        .split(/\r?\n/u)
        .map((value) => value.trim())
        .filter(Boolean);
    },
    async inspectImage(reference) {
      const result = requireDockerSuccess(await run(['image', 'inspect', reference]));
      const values = parseJsonBuffer(result.stdout);
      if (!Array.isArray(values) || values.length !== 1) {
        fail('OCI_DOCKER_RESPONSE_INVALID', 'preflight', 'BLOCKED');
      }
      return values[0];
    },
    async readImageFile(reference, file) {
      const created = requireDockerSuccess(await run([
        'create',
        '--network',
        'none',
        '--read-only',
        '--user',
        '65532:65532',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        String(LIMITS.pidLimit),
        '--memory',
        String(LIMITS.memoryBytes),
        '--label',
        `${MANAGED_LABEL}=true`,
        '--entrypoint',
        '/bin/false',
        reference,
      ]));
      const id = created.stdout.toString('utf8').trim();
      if (!SAFE_CONTAINER_TOKEN.test(id)) {
        fail('OCI_DOCKER_RESPONSE_INVALID', 'preflight', 'BLOCKED');
      }
      let archive;
      let removeSucceeded = false;
      try {
        archive = requireDockerSuccess(await run(['cp', `${id}:${file}`, '-']));
        requireDockerSuccess(await run(['rm', '--force', id]));
        removeSucceeded = true;
      } finally {
        if (!removeSucceeded) {
          await run(['rm', '--force', id]).catch(() => {});
        }
      }
      if (!removeSucceeded) {
        fail('OCI_CLEANUP_UNCERTAIN', 'preflight', 'BLOCKED');
      }
      return parseTarEntry(archive.stdout);
    },
    async createContainer(spec) {
      if (!spec || !SAFE_CONTAINER_TOKEN.test(spec.name)) {
        fail('OCI_DOCKER_SPEC_INVALID', 'arm-open', 'BLOCKED');
      }
      const args = [
        'create',
        '--name',
        spec.name,
        '--network',
        'none',
        '--user',
        spec.user,
        '--read-only',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--pids-limit',
        String(spec.pidLimit),
        '--cpu-period',
        String(spec.cpuPeriod),
        '--cpu-quota',
        String(spec.cpuQuota),
        '--memory',
        String(spec.memoryBytes),
        '--cgroupns',
        'private',
        '--restart',
        'no',
        '--tmpfs',
        `/tmp:${spec.tmpfs['/tmp']}`,
        '--env-file',
        spec.envFilePath,
      ];
      for (const [key, value] of Object.entries(spec.labels).sort(([a], [b]) => a.localeCompare(b))) {
        args.push('--label', `${key}=${value}`);
      }
      for (const mount of spec.mounts) {
        args.push('--mount', safeMountArgument(mount));
      }
      args.push(
        '--entrypoint',
        spec.entrypoint,
        spec.imageReference,
        spec.entrypointTarget,
        ...spec.commandArgs,
      );
      const created = requireDockerSuccess(await run(args));
      const id = created.stdout.toString('utf8').trim();
      if (!SAFE_CONTAINER_TOKEN.test(id)) {
        fail('OCI_DOCKER_RESPONSE_INVALID', 'arm-open', 'FAIL-CLOSED');
      }
      return id;
    },
    async inspectContainer(id) {
      const inspected = requireDockerSuccess(await run(['inspect', id]));
      const values = parseJsonBuffer(inspected.stdout);
      if (!Array.isArray(values) || values.length !== 1) {
        fail('OCI_DOCKER_RESPONSE_INVALID', 'docker', 'FAIL-CLOSED');
      }
      return values[0];
    },
    async startContainer(id) {
      requireDockerSuccess(await run(['start', id]));
    },
    async waitContainer(id, waitOptions = {}) {
      const waited = await run(['wait', id], {
        timeoutMs: waitOptions.timeoutMs ?? 0,
      });
      if (waited.timedOut) return { timedOut: true, exitCode: null };
      requireDockerSuccess(waited);
      const exitCode = Number.parseInt(waited.stdout.toString('utf8').trim(), 10);
      if (!Number.isInteger(exitCode) || exitCode < 0 || exitCode > 255) {
        fail('OCI_DOCKER_RESPONSE_INVALID', 'docker', 'FAIL-CLOSED');
      }
      return { timedOut: false, exitCode };
    },
    async stopContainer(id) {
      requireDockerSuccess(await run(['stop', '--time', '0', id]));
    },
    async killContainer(id) {
      requireDockerSuccess(await run(['kill', '--signal', 'KILL', id]));
    },
    async removeContainer(id) {
      requireDockerSuccess(await run(['rm', '--force', id]));
    },
  };
}

export function createLinuxProcfsClient(options = {}) {
  const fs = options.fs ?? nodeFs.promises;
  const procRoot = options.procRoot ?? '/proc';
  const cgroupRoot = options.cgroupRoot ?? '/sys/fs/cgroup';

  return {
    async isCgroupV2() {
      try {
        await fs.access(path.join(cgroupRoot, 'cgroup.controllers'));
        const own = await fs.readFile(path.join(procRoot, 'self', 'cgroup'), 'utf8');
        return own.split(/\r?\n/u).some((line) => line.startsWith('0::/'));
      } catch {
        return false;
      }
    },
    async cgroupPathForPid(pid) {
      if (!Number.isInteger(pid) || pid <= 0) {
        fail('OCI_CGROUP_PATH_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
      }
      let content;
      try {
        content = await fs.readFile(path.join(procRoot, String(pid), 'cgroup'), 'utf8');
      } catch {
        fail('OCI_CGROUP_PATH_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
      }
      const matches = content
        .split(/\r?\n/u)
        .filter((line) => line.startsWith('0::'))
        .map((line) => line.slice(3));
      if (
        matches.length !== 1
        || !matches[0].startsWith('/')
        || matches[0].includes('\0')
        || matches[0].split('/').includes('..')
      ) {
        fail('OCI_CGROUP_PATH_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
      }
      return matches[0];
    },
    async observeCgroup(cgroupPath) {
      if (
        typeof cgroupPath !== 'string'
        || !cgroupPath.startsWith('/')
        || cgroupPath.split('/').includes('..')
      ) {
        fail('OCI_CGROUP_PATH_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
      }
      const relative = cgroupPath.slice(1);
      const eventsPath = path.resolve(cgroupRoot, relative, 'cgroup.events');
      const root = `${path.resolve(cgroupRoot)}${path.sep}`;
      if (!eventsPath.startsWith(root)) {
        fail('OCI_CGROUP_PATH_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
      }
      try {
        const content = await fs.readFile(eventsPath, 'utf8');
        const values = new Map(content
          .trim()
          .split(/\r?\n/u)
          .map((line) => line.trim().split(/\s+/u)));
        if (values.get('populated') === '0') return { populated: false, removed: false };
        if (values.get('populated') === '1') return { populated: true, removed: false };
        fail('OCI_BOUNDARY_PROOF_UNAVAILABLE', 'boundary-proof', 'FAIL-CLOSED');
      } catch (error) {
        if (error?.code === 'ENOENT') return { populated: null, removed: true };
        throw error;
      }
    },
  };
}

function validateContainerEnvironment(environment) {
  const entries = [];
  for (const [key, value] of Object.entries(environment ?? {})) {
    if (
      !/^[A-Z][A-Z0-9_]*$/u.test(key)
      || typeof value !== 'string'
      || /[\0\r\n]/u.test(value)
    ) {
      fail('OCI_CONTAINER_ENV_INVALID', 'arm-open', 'FAIL-CLOSED');
    }
    entries.push(`${key}=${value}`);
  }
  return entries.sort().join('\n') + (entries.length > 0 ? '\n' : '');
}

export function createSupervisorFs(options = {}) {
  const fs = options.fs ?? nodeFs.promises;
  const tempRoot = options.tempRoot ?? os.tmpdir();
  const mkfifo = options.mkfifo ?? ((fifoPath) => {
    const result = spawnSync('mkfifo', ['--', fifoPath], {
      shell: false,
      stdio: 'ignore',
    });
    if (result.status !== 0) {
      fail('OCI_FIFO_CREATE_FAILED', 'arm-open', 'FAIL-CLOSED');
    }
  });

  return {
    async prepareRuntimeSurface(input) {
      const root = await fs.mkdtemp(path.join(tempRoot, 'governance-impact-oci-'));
      const surface = {
        root,
        entrypointPath: path.join(root, 'pid1.sh'),
        envFilePath: path.join(root, 'container.env'),
        fifoPath: path.join(root, 'lifeline.fifo'),
        stderrPath: path.join(root, 'stderr'),
        stdinPath: path.join(root, 'stdin'),
        stdoutPath: path.join(root, 'stdout'),
        responseSchemaPath: path.join(root, 'response.schema.json'),
      };
      try {
        await fs.chmod(root, 0o711);
        await fs.writeFile(surface.entrypointPath, input.pid1Script, { mode: 0o555 });
        await fs.writeFile(surface.envFilePath, validateContainerEnvironment(input.containerEnv), {
          mode: 0o600,
        });
        await fs.writeFile(surface.stdinPath, input.stdin, { mode: 0o444 });
        await fs.writeFile(surface.stdoutPath, '', { mode: 0o622 });
        await fs.writeFile(surface.stderrPath, '', { mode: 0o622 });
        await Promise.all([
          fs.chmod(surface.entrypointPath, 0o555),
          fs.chmod(surface.envFilePath, 0o600),
          fs.chmod(surface.stdinPath, 0o444),
          fs.chmod(surface.stdoutPath, 0o622),
          fs.chmod(surface.stderrPath, 0o622),
        ]);
        mkfifo(surface.fifoPath);
        await fs.chmod(surface.fifoPath, 0o666);
        return surface;
      } catch (error) {
        await fs.rm(root, { recursive: true, force: true }).catch(() => {});
        throw closedError(error, 'OCI_RUNTIME_SURFACE_FAILED', 'arm-open', 'FAIL-CLOSED');
      }
    },
    async removeSensitiveEnvFile(surface) {
      await fs.rm(surface.envFilePath, { force: true });
    },
    async openFifoWriter(surface) {
      return fs.open(
        surface.fifoPath,
        nodeFs.constants.O_RDWR | nodeFs.constants.O_NONBLOCK,
      );
    },
    async signalFifoReady(handle) {
      await handle.write('start\n');
    },
    async stageResponseSchema(source, surface) {
      let sourceHandle;
      try {
        const noFollow = nodeFs.constants.O_NOFOLLOW ?? 0;
        sourceHandle = await fs.open(
          source,
          nodeFs.constants.O_RDONLY | noFollow,
        );
        const before = await sourceHandle.stat();
        if (!before.isFile() || before.isSymbolicLink?.()) {
          fail('OCI_RESPONSE_SCHEMA_UNSTABLE', 'arm-open', 'BLOCKED');
        }
        const bytes = await sourceHandle.readFile();
        const after = await sourceHandle.stat();
        if (
          bytes.length > MAX_STDIN_BYTES
          || before.dev !== after.dev
          || before.ino !== after.ino
          || before.size !== after.size
          || before.mtimeMs !== after.mtimeMs
        ) {
          fail('OCI_RESPONSE_SCHEMA_UNSTABLE', 'arm-open', 'BLOCKED');
        }
        await fs.writeFile(surface.responseSchemaPath, bytes, {
          flag: 'wx',
          mode: 0o444,
        });
        await fs.chmod(surface.responseSchemaPath, 0o444);
        const copied = await fs.lstat(surface.responseSchemaPath);
        if (!copied.isFile() || copied.isSymbolicLink()) {
          fail('OCI_RESPONSE_SCHEMA_UNSTABLE', 'arm-open', 'BLOCKED');
        }
        return {
          path: surface.responseSchemaPath,
          sha256: sha256(bytes),
          identity: {
            dev: copied.dev,
            ino: copied.ino,
            size: copied.size,
            mtimeMs: copied.mtimeMs,
          },
        };
      } catch (error) {
        throw closedError(
          error,
          'OCI_RESPONSE_SCHEMA_UNSTABLE',
          'arm-open',
          'BLOCKED',
        );
      } finally {
        await sourceHandle?.close().catch(() => {});
      }
    },
    async verifyStagedResponseSchema(staged) {
      let handle;
      try {
        const noFollow = nodeFs.constants.O_NOFOLLOW ?? 0;
        handle = await fs.open(
          staged.path,
          nodeFs.constants.O_RDONLY | noFollow,
        );
        const before = await handle.stat();
        if (
          !before.isFile()
          || before.dev !== staged.identity.dev
          || before.ino !== staged.identity.ino
          || before.size !== staged.identity.size
          || before.mtimeMs !== staged.identity.mtimeMs
        ) {
          return false;
        }
        const bytes = await handle.readFile();
        const after = await handle.stat();
        return bytes.length <= MAX_STDIN_BYTES
          && before.dev === after.dev
          && before.ino === after.ino
          && before.size === after.size
          && before.mtimeMs === after.mtimeMs
          && sha256(bytes) === staged.sha256;
      } catch {
        return false;
      } finally {
        await handle?.close().catch(() => {});
      }
    },
    async closeFifoWriter(handle) {
      await handle?.close();
    },
    async readRuntimeOutput(surface) {
      const [stdout, stderr] = await Promise.all([
        fs.readFile(surface.stdoutPath),
        fs.readFile(surface.stderrPath),
      ]);
      if (stdout.length + stderr.length > MAX_STDIN_BYTES) {
        fail('OCI_RUNTIME_OUTPUT_LIMIT', 'preflight', 'BLOCKED');
      }
      return {
        stdout: stdout.toString('utf8'),
        stderr: stderr.toString('utf8'),
      };
    },
    async removeRuntimeSurface(surface) {
      await fs.rm(surface.root, { recursive: true, force: true });
    },
    async runtimeSurfaceRemoved(surface) {
      try {
        await fs.lstat(surface.root);
        return false;
      } catch (error) {
        if (error?.code === 'ENOENT') return true;
        throw error;
      }
    },
    async validateReadOnlyFile(file) {
      try {
        const stat = await fs.lstat(file);
        return stat.isFile() && !stat.isSymbolicLink();
      } catch {
        return false;
      }
    },
  };
}
