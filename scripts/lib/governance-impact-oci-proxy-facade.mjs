import { spawn as nodeSpawn } from 'node:child_process';
import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREDENTIAL_PROXY_PATH,
  createHostCredentialProxy,
  describeCredentialProxyPolicy,
} from './governance-impact-credential-proxy.mjs';
import {
  OCI_PROXY_BASE_URL,
} from './governance-impact-oci-supervisor.mjs';

const UPSTREAM = 'https://api.openai.com/v1/responses';
const MAX_REQUEST_BYTES = 1_048_576;
const MAX_RESPONSE_BYTES = 4_194_304;
const MAX_REQUESTS = 32;
const DEFAULT_DEADLINE_MS = 300_000;
const MANAGED_ROOT_PREFIX = 'governance-impact-oci-proxy-';
const LOCK_NAME = '.governance-impact-oci-proxy.lock';
const STALE_LOCK_PREFIX = `${LOCK_NAME}.stale-`;
const LOCK_METADATA_NAME = 'owner.json';
const LOCK_METADATA_MAX_BYTES = 1_024;
const READY_TEXT = 'READY\n';
const RELAY_OUTPUT_MAX_BYTES = 4_096;
const RELAY_READY_TIMEOUT_MS = 5_000;
const RELAY_SHUTDOWN_TIMEOUT_MS = 1_000;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);
const HEX_64 = /^[a-f0-9]{64}$/u;

export class OciCredentialProxyFacadeError extends Error {
  constructor(code) {
    super(code);
    this.name = 'OciCredentialProxyFacadeError';
    this.code = code;
  }

  toJSON() {
    return { code: this.code };
  }
}

function fail(code) {
  throw new OciCredentialProxyFacadeError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function closedToken(value, maximum = 8_192) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && value.trim() === value
    && !/[\0\r\n]/u.test(value);
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function requireFunction(value) {
  if (typeof value !== 'function') fail('PROXY_DEPENDENCY_INVALID');
  return value;
}

function defaultIsProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (error?.code === 'ESRCH') return false;
    return null;
  }
}

function absentError(error) {
  return error?.code === 'ENOENT';
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

function policyScopeHash(policy) {
  return createHash('sha256')
    .update('governance-impact-oci-proxy-lock-v1\0')
    .update(canonicalJson(policy))
    .digest('hex');
}

function ownerOnly(stat, ownerUid) {
  return stat?.isDirectory?.() === true
    && stat?.isSymbolicLink?.() !== true
    && (stat.mode & 0o077) === 0
    && (
      ownerUid === null
      || ownerUid === undefined
      || stat.uid === ownerUid
    );
}

function normalizeDependencies(options) {
  const fsApi = options.fs ?? nodeFs.promises;
  const timers = options.timers ?? {
    setTimeout: (callback, delay) => setTimeout(callback, delay),
    clearTimeout: (timer) => clearTimeout(timer),
  };
  return Object.freeze({
    fs: Object.freeze({
      chmod: requireFunction(fsApi?.chmod),
      lstat: requireFunction(fsApi?.lstat),
      mkdir: requireFunction(fsApi?.mkdir),
      mkdtemp: requireFunction(fsApi?.mkdtemp),
      readFile: requireFunction(fsApi?.readFile),
      readdir: requireFunction(fsApi?.readdir),
      rename: requireFunction(fsApi?.rename),
      rm: requireFunction(fsApi?.rm),
      writeFile: requireFunction(fsApi?.writeFile),
    }),
    createCredentialProxy: requireFunction(
      options.createCredentialProxy ?? createHostCredentialProxy,
    ),
    spawn: requireFunction(options.spawn ?? nodeSpawn),
    randomBytes: requireFunction(options.randomBytes ?? nodeRandomBytes),
    isProcessAlive: requireFunction(
      options.isProcessAlive ?? defaultIsProcessAlive,
    ),
    timers: Object.freeze({
      setTimeout: requireFunction(timers?.setTimeout),
      clearTimeout: requireFunction(timers?.clearTimeout),
    }),
  });
}

async function pathAbsent(fsApi, target) {
  try {
    await fsApi.lstat(target);
    return false;
  } catch (error) {
    return absentError(error);
  }
}

function stableFailure(error, fallback) {
  if (
    error instanceof OciCredentialProxyFacadeError
    && /^PROXY_[A-Z0-9_]+$/u.test(error.code)
  ) {
    return error;
  }
  return new OciCredentialProxyFacadeError(fallback);
}

export function createOciCredentialProxyFacade(options = {}) {
  if (!isPlainObject(options)) fail('PROXY_POLICY_INVALID');
  const model = options.model;
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
  const attemptPin = options.attemptId;
  const tempRoot = options.tempRoot ?? os.tmpdir();
  const ownerPid = options.ownerPid ?? process.pid;
  const ownerUid = options.ownerUid
    ?? (typeof process.getuid === 'function' ? process.getuid() : 0);
  const ownerGid = options.ownerGid
    ?? (typeof process.getgid === 'function' ? process.getgid() : 0);
  const platform = options.platform ?? process.platform;
  const upstreamKeyOption = options.upstreamKey;
  const getUpstreamKey = options.getUpstreamKey;
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const relayScriptPath = options.relayScriptPath
    ?? 'scripts/governance-impact-uds-relay.mjs';
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const readyTimeoutMs = options.readyTimeoutMs ?? RELAY_READY_TIMEOUT_MS;
  const shutdownTimeoutMs = options.shutdownTimeoutMs ?? RELAY_SHUTDOWN_TIMEOUT_MS;
  const outputLimit = options.relayOutputMaxBytes ?? RELAY_OUTPUT_MAX_BYTES;
  const dependencies = normalizeDependencies(options);

  if (
    !closedToken(model)
    || !positiveInteger(deadlineMs)
    || (
      attemptPin !== undefined
      && !HEX_64.test(attemptPin)
    )
    || !path.isAbsolute(tempRoot)
    || !positiveInteger(ownerPid)
    || !nonNegativeInteger(ownerUid)
    || !nonNegativeInteger(ownerGid)
    || !closedToken(nodeExecutable)
    || !path.isAbsolute(nodeExecutable)
    || relayScriptPath !== 'scripts/governance-impact-uds-relay.mjs'
    || !path.isAbsolute(repositoryRoot)
    || !positiveInteger(readyTimeoutMs)
    || !positiveInteger(shutdownTimeoutMs)
    || !positiveInteger(outputLimit)
    || (
      getUpstreamKey !== undefined
      && typeof getUpstreamKey !== 'function'
    )
  ) {
    fail('PROXY_POLICY_INVALID');
  }

  const descriptorInput = Object.freeze({
    attemptId: 'durable-policy-descriptor',
    model,
    upstream: UPSTREAM,
    maxRequestBytes: MAX_REQUEST_BYTES,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    maxRequests: MAX_REQUESTS,
    deadlineMs,
  });
  let durablePolicy;
  try {
    durablePolicy = describeCredentialProxyPolicy(descriptorInput);
  } catch {
    fail('PROXY_POLICY_INVALID');
  }

  let proxyUrl;
  try {
    proxyUrl = new URL(OCI_PROXY_BASE_URL);
  } catch {
    fail('PROXY_POLICY_INVALID');
  }
  if (
    proxyUrl.protocol !== 'http:'
    || proxyUrl.hostname !== '127.0.0.1'
    || !positiveInteger(Number(proxyUrl.port))
    || proxyUrl.pathname !== '/v1'
  ) {
    fail('PROXY_POLICY_INVALID');
  }
  const relayPort = Number(proxyUrl.port);
  const handles = new WeakMap();
  const knownStates = new Set();
  const lockPath = path.join(tempRoot, LOCK_NAME);
  const scopeHash = policyScopeHash(durablePolicy);
  let lockOwned = false;
  let reconciled = false;
  let boundAttemptId = attemptPin ?? null;
  let retainedUpstreamKey;

  const metadata = Object.freeze({
    schemaVersion: 1,
    pid: ownerPid,
    scopeHash,
  });

  async function readLock() {
    let stat;
    let bytes;
    try {
      stat = await dependencies.fs.lstat(lockPath);
      if (!ownerOnly(stat, ownerUid)) fail('PROXY_RECONCILIATION_UNCERTAIN');
      bytes = await dependencies.fs.readFile(path.join(lockPath, LOCK_METADATA_NAME));
    } catch (error) {
      throw stableFailure(error, 'PROXY_RECONCILIATION_UNCERTAIN');
    }
    if (!Buffer.isBuffer(bytes)) bytes = Buffer.from(bytes);
    if (bytes.length === 0 || bytes.length > LOCK_METADATA_MAX_BYTES) {
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }
    let value;
    try {
      value = JSON.parse(bytes.toString('utf8'));
    } catch {
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }
    if (
      !isPlainObject(value)
      || Object.keys(value).sort().join(',') !== 'pid,schemaVersion,scopeHash'
      || value.schemaVersion !== 1
      || !positiveInteger(value.pid)
      || !HEX_64.test(value.scopeHash)
    ) {
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }
    return { stat, value };
  }

  async function writeOwnedLock() {
    try {
      await dependencies.fs.writeFile(
        path.join(lockPath, LOCK_METADATA_NAME),
        `${JSON.stringify(metadata)}\n`,
        { flag: 'wx', mode: 0o600 },
      );
      await dependencies.fs.chmod(lockPath, 0o700);
      await dependencies.fs.chmod(
        path.join(lockPath, LOCK_METADATA_NAME),
        0o600,
      );
      lockOwned = true;
      return true;
    } catch {
      await dependencies.fs.rm(lockPath, {
        recursive: true,
        force: true,
      }).catch(() => {});
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }
  }

  async function acquireLock() {
    if (lockOwned) return true;
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await dependencies.fs.mkdir(lockPath, { mode: 0o700 });
        return await writeOwnedLock();
      } catch (error) {
        if (error instanceof OciCredentialProxyFacadeError) throw error;
        if (error?.code !== 'EEXIST') {
          fail('PROXY_RECONCILIATION_UNCERTAIN');
        }
      }

      const observed = await readLock();
      let alive;
      try {
        alive = await dependencies.isProcessAlive(observed.value.pid);
      } catch {
        alive = null;
      }
      if (alive === true) return false;
      if (alive !== false) fail('PROXY_RECONCILIATION_UNCERTAIN');

      let nonce;
      try {
        const bytes = dependencies.randomBytes(8);
        if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
          fail('PROXY_DEPENDENCY_INVALID');
        }
        nonce = Buffer.from(bytes).toString('hex');
      } catch (error) {
        throw stableFailure(error, 'PROXY_RECONCILIATION_UNCERTAIN');
      }
      const quarantine = `${lockPath}.stale-${ownerPid}-${nonce}`;
      try {
        await dependencies.fs.rename(lockPath, quarantine);
      } catch (error) {
        if (error?.code === 'ENOENT') continue;
        fail('PROXY_RECONCILIATION_UNCERTAIN');
      }
      try {
        const moved = await dependencies.fs.lstat(quarantine);
        if (
          moved.dev !== observed.stat.dev
          || moved.ino !== observed.stat.ino
          || !ownerOnly(moved, ownerUid)
        ) {
          fail('PROXY_RECONCILIATION_UNCERTAIN');
        }
        await dependencies.fs.rm(quarantine, {
          recursive: true,
          force: true,
        });
        if (!await pathAbsent(dependencies.fs, quarantine)) {
          fail('PROXY_RECONCILIATION_UNCERTAIN');
        }
      } catch (error) {
        throw stableFailure(error, 'PROXY_RECONCILIATION_UNCERTAIN');
      }
    }
    fail('PROXY_RECONCILIATION_UNCERTAIN');
  }

  async function reconcile() {
    if (knownStates.size > 0) return false;
    const acquired = await acquireLock();
    if (!acquired) return false;
    let entries;
    try {
      entries = await dependencies.fs.readdir(tempRoot, {
        withFileTypes: true,
      });
    } catch {
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }
    for (const entry of entries) {
      if (entry.name.startsWith(STALE_LOCK_PREFIX)) {
        fail('PROXY_RECONCILIATION_UNCERTAIN');
      }
      if (!entry.name.startsWith(MANAGED_ROOT_PREFIX)) continue;
      const target = path.join(tempRoot, entry.name);
      let stat;
      try {
        stat = await dependencies.fs.lstat(target);
      } catch {
        fail('PROXY_RECONCILIATION_UNCERTAIN');
      }
      if (!ownerOnly(stat, ownerUid)) {
        fail('PROXY_RECONCILIATION_UNCERTAIN');
      }
      try {
        await dependencies.fs.rm(target, {
          recursive: true,
          force: true,
        });
        if (!await pathAbsent(dependencies.fs, target)) {
          fail('PROXY_RECONCILIATION_UNCERTAIN');
        }
      } catch (error) {
        throw stableFailure(error, 'PROXY_RECONCILIATION_UNCERTAIN');
      }
    }
    reconciled = true;
    return true;
  }

  async function describePolicy() {
    if (!reconciled && await reconcile() !== true) {
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }
    return durablePolicy;
  }

  async function resolveUpstreamKey() {
    if (retainedUpstreamKey !== undefined) return retainedUpstreamKey;
    let value;
    try {
      value = getUpstreamKey === undefined
        ? upstreamKeyOption
        : await getUpstreamKey();
    } catch {
      fail('PROXY_CREDENTIAL_UNAVAILABLE');
    }
    if (!closedToken(value)) fail('PROXY_CREDENTIAL_UNAVAILABLE');
    retainedUpstreamKey = value;
    return retainedUpstreamKey;
  }

  function requireHandle(handle) {
    const state = handles.get(handle);
    if (!state) fail('PROXY_HANDLE_INVALID');
    return state;
  }

  async function cleanupOpenFailure(core, root) {
    let complete = true;
    if (core) {
      try {
        await core.close();
      } catch {
        complete = false;
      }
    }
    if (root) {
      try {
        await dependencies.fs.rm(root, { recursive: true, force: true });
      } catch {
        complete = false;
      }
      if (!await pathAbsent(dependencies.fs, root)) complete = false;
    }
    return complete;
  }

  async function openAttempt(input) {
    if (
      !isPlainObject(input)
      || (input.arm !== 'baseline' && input.arm !== 'governed')
      || !HEX_64.test(input.attemptId ?? '')
      || (boundAttemptId !== null && input.attemptId !== boundAttemptId)
      || input.deadlineMs !== deadlineMs
    ) {
      fail('PROXY_POLICY_INVALID');
    }
    if (knownStates.size > 0) fail('PROXY_LIFECYCLE_INVALID');
    if (!reconciled && await reconcile() !== true) {
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }

    const upstreamKey = await resolveUpstreamKey();
    let bearer;
    try {
      const bytes = dependencies.randomBytes(32);
      if (
        (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array))
        || bytes.length !== 32
      ) {
        fail('PROXY_DEPENDENCY_INVALID');
      }
      bearer = Buffer.from(bytes).toString('base64url');
    } catch (error) {
      throw stableFailure(error, 'PROXY_DEPENDENCY_INVALID');
    }

    let root;
    let core;
    try {
      root = await dependencies.fs.mkdtemp(
        path.join(tempRoot, MANAGED_ROOT_PREFIX),
      );
      await dependencies.fs.chmod(root, 0o700);
      const socketPath = path.join(root, 'core.sock');
      core = dependencies.createCredentialProxy({
        policy: {
          attemptId: input.attemptId,
          model,
          upstream: UPSTREAM,
          maxRequestBytes: MAX_REQUEST_BYTES,
          maxResponseBytes: MAX_RESPONSE_BYTES,
          maxRequests: MAX_REQUESTS,
          deadlineMs,
        },
        socketPath,
        attemptBearer: bearer,
        upstreamKey,
        dependencies: options.coreDependencies,
      });
      if (
        !core
        || typeof core.start !== 'function'
        || typeof core.close !== 'function'
        || typeof core.proveSafe !== 'function'
      ) {
        fail('PROXY_DEPENDENCY_INVALID');
      }
      await core.start();
      await dependencies.fs.chmod(root, 0o700);
      await dependencies.fs.chmod(socketPath, 0o600);

      const handle = Object.freeze({ policy: durablePolicy });
      const state = {
        handle,
        arm: input.arm,
        attemptId: input.attemptId,
        root,
        socketPath,
        core,
        containerEnvironment: Object.freeze({
          OPENAI_API_KEY: bearer,
          OPENAI_BASE_URL: OCI_PROXY_BASE_URL,
        }),
        phase: 'open',
        relay: null,
        relayExited: false,
        relayExitPromise: null,
        relayExitResolve: null,
        relayExpectedClose: false,
        unsafe: false,
        coreClosed: false,
        rootRemoved: false,
        closePromise: null,
        closeCode: null,
      };
      handles.set(handle, state);
      knownStates.add(state);
      boundAttemptId ??= input.attemptId;
      return handle;
    } catch (error) {
      const cleaned = await cleanupOpenFailure(core, root);
      if (!cleaned) fail('PROXY_CLEANUP_UNPROVEN');
      throw stableFailure(error, 'PROXY_ATTEMPT_UNSAFE');
    }
  }

  async function getContainerEnvironment(handle) {
    const state = requireHandle(handle);
    if (state.phase !== 'open' && state.phase !== 'attached') {
      fail('PROXY_LIFECYCLE_INVALID');
    }
    return Object.freeze({
      OPENAI_API_KEY: state.containerEnvironment.OPENAI_API_KEY,
      OPENAI_BASE_URL: state.containerEnvironment.OPENAI_BASE_URL,
    });
  }

  function settleRelayExit(state, exitCode, signalCode) {
    if (state.relayExited) return;
    state.relayExited = true;
    state.relayExitCode = exitCode;
    state.relaySignalCode = signalCode;
    if (!state.relayExpectedClose) state.unsafe = true;
    state.relayExitResolve?.(true);
  }

  function killRelay(state, signal) {
    try {
      return state.relay?.kill(signal) === true;
    } catch {
      return false;
    }
  }

  function waitBounded(promise, timeoutMs) {
    return new Promise((resolve) => {
      let settled = false;
      const timer = dependencies.timers.setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(false);
      }, timeoutMs);
      Promise.resolve(promise).then(() => {
        if (settled) return;
        settled = true;
        dependencies.timers.clearTimeout(timer);
        resolve(true);
      }, () => {
        if (settled) return;
        settled = true;
        dependencies.timers.clearTimeout(timer);
        resolve(false);
      });
    });
  }

  async function stopRelay(state) {
    if (!state.relay) return true;
    if (state.relayExited) return true;
    state.relayExpectedClose = true;
    try {
      state.relay.stdin.end();
    } catch {
      state.unsafe = true;
    }
    if (await waitBounded(state.relayExitPromise, shutdownTimeoutMs)) return true;
    state.unsafe = true;
    killRelay(state, 'SIGTERM');
    if (await waitBounded(state.relayExitPromise, shutdownTimeoutMs)) return true;
    killRelay(state, 'SIGKILL');
    return waitBounded(state.relayExitPromise, shutdownTimeoutMs);
  }

  async function waitForRelayReady(state) {
    const child = state.relay;
    let stdout = Buffer.alloc(0);
    let total = 0;
    let ready = false;
    let settled = false;
    let timer;

    return new Promise((resolve, reject) => {
      const rejectStable = () => {
        if (settled) return;
        settled = true;
        if (timer) dependencies.timers.clearTimeout(timer);
        reject(new OciCredentialProxyFacadeError('PROXY_RELAY_UNAVAILABLE'));
      };
      const markControlFailure = () => {
        state.unsafe = true;
        killRelay(state, 'SIGKILL');
        rejectStable();
      };
      const onStdout = (chunk) => {
        const bytes = Buffer.from(chunk);
        total += bytes.length;
        if (total > outputLimit) {
          markControlFailure();
          return;
        }
        if (ready) {
          markControlFailure();
          return;
        }
        stdout = Buffer.concat([stdout, bytes], stdout.length + bytes.length);
        const text = stdout.toString('utf8');
        if (!READY_TEXT.startsWith(text)) {
          markControlFailure();
          return;
        }
        if (text === READY_TEXT) {
          ready = true;
          settled = true;
          dependencies.timers.clearTimeout(timer);
          resolve(true);
        }
      };
      const onStderr = (chunk) => {
        total += Buffer.byteLength(chunk);
        markControlFailure();
      };
      const onError = () => {
        state.unsafe = true;
        rejectStable();
      };
      const onClose = () => rejectStable();

      child.stdout.on('data', onStdout);
      child.stderr.on('data', onStderr);
      child.once('error', onError);
      child.once('close', onClose);
      timer = dependencies.timers.setTimeout(() => {
        markControlFailure();
      }, readyTimeoutMs);
    });
  }

  async function attachAttempt(handle, input) {
    const state = requireHandle(handle);
    if (state.phase !== 'open' || state.relay) {
      fail('PROXY_RELAY_UNAVAILABLE');
    }
    if (platform !== 'linux' || ownerUid === 0 || ownerGid === 0) {
      state.unsafe = true;
      fail('PROXY_RELAY_UNAVAILABLE');
    }
    if (
      !isPlainObject(input)
      || !Number.isSafeInteger(input.initPid)
      || input.initPid <= 0
      || input.initPid > 2_147_483_647
    ) {
      state.unsafe = true;
      fail('PROXY_RELAY_UNAVAILABLE');
    }

    const args = [
      '-n',
      'nsenter',
      `--net=/proc/${input.initPid}/ns/net`,
      `--setgid=${ownerGid}`,
      `--setuid=${ownerUid}`,
      '--',
      nodeExecutable,
      relayScriptPath,
    ];
    const childEnvironment = {
      PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
      LANG: 'C.UTF-8',
    };
    let child;
    try {
      child = dependencies.spawn('sudo', args, {
        cwd: repositoryRoot,
        env: childEnvironment,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      state.unsafe = true;
      fail('PROXY_RELAY_UNAVAILABLE');
    }
    if (
      !child
      || typeof child.once !== 'function'
      || typeof child.kill !== 'function'
      || typeof child.stdin?.write !== 'function'
      || typeof child.stdin?.end !== 'function'
      || typeof child.stdout?.on !== 'function'
      || typeof child.stderr?.on !== 'function'
    ) {
      state.unsafe = true;
      try {
        child?.kill?.('SIGKILL');
      } catch {
        // The stable relay error below is the only exposed detail.
      }
      fail('PROXY_RELAY_UNAVAILABLE');
    }

    state.relay = child;
    state.relayExitPromise = new Promise((resolve) => {
      state.relayExitResolve = resolve;
    });
    child.once('close', (exitCode, signalCode) => {
      settleRelayExit(state, exitCode, signalCode);
    });
    child.once('error', () => {
      state.unsafe = true;
      if (!positiveInteger(child.pid)) settleRelayExit(state, null, null);
    });

    try {
      child.stdin.write(`${JSON.stringify({
        socketPath: state.socketPath,
        bearer: state.containerEnvironment.OPENAI_API_KEY,
        attemptId: state.attemptId,
        port: relayPort,
      })}\n`);
      await waitForRelayReady(state);
      if (state.relayExited) fail('PROXY_RELAY_UNAVAILABLE');
      state.phase = 'attached';
      return true;
    } catch {
      state.unsafe = true;
      const stopped = await stopRelay(state);
      if (!stopped) fail('PROXY_CLEANUP_UNPROVEN');
      fail('PROXY_RELAY_UNAVAILABLE');
    }
  }

  async function closeAttempt(handle) {
    const state = requireHandle(handle);
    if (state.closePromise) return state.closePromise;
    if (state.closeCode === 'closed-safe') return true;
    if (state.closeCode) fail(state.closeCode);
    state.closePromise = (async () => {
      let cleanupComplete = true;
      let unsafe = state.unsafe;
      state.phase = 'closing';

      if (!await stopRelay(state)) cleanupComplete = false;
      try {
        await state.core.close();
        state.coreClosed = true;
      } catch {
        cleanupComplete = false;
      }
      try {
        await state.core.proveSafe();
      } catch {
        unsafe = true;
      }
      try {
        await dependencies.fs.rm(state.root, {
          recursive: true,
          force: true,
        });
      } catch {
        cleanupComplete = false;
      }
      try {
        state.rootRemoved = await pathAbsent(dependencies.fs, state.root);
      } catch {
        state.rootRemoved = false;
      }
      if (!state.rootRemoved) cleanupComplete = false;
      if (state.relay && !state.relayExited) cleanupComplete = false;

      state.containerEnvironment = null;
      if (!cleanupComplete) {
        state.phase = 'failed';
        state.closeCode = 'PROXY_CLEANUP_UNPROVEN';
        fail(state.closeCode);
      }
      knownStates.delete(state);
      state.phase = 'closed';
      if (unsafe || state.unsafe) {
        state.closeCode = 'PROXY_ATTEMPT_UNSAFE';
        fail(state.closeCode);
      }
      state.closeCode = 'closed-safe';
      return true;
    })();
    try {
      return await state.closePromise;
    } finally {
      state.closePromise = null;
    }
  }

  async function proveClosed(handle) {
    const state = requireHandle(handle);
    let absent = false;
    try {
      absent = await pathAbsent(dependencies.fs, state.root);
    } catch {
      absent = false;
    }
    if (
      state.phase !== 'closed'
      || state.coreClosed !== true
      || state.rootRemoved !== true
      || absent !== true
      || (state.relay && state.relayExited !== true)
    ) {
      fail('PROXY_CLEANUP_UNPROVEN');
    }
    return true;
  }

  return Object.freeze({
    describePolicy,
    reconcile,
    openAttempt,
    getContainerEnvironment,
    attachAttempt,
    closeAttempt,
    proveClosed,
  });
}
