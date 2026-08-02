import { createHash, randomBytes as nodeRandomBytes } from 'node:crypto';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CREDENTIAL_PROXY_ENDPOINT,
  CREDENTIAL_PROXY_MODEL,
  CREDENTIAL_PROXY_PROVIDER,
  CREDENTIAL_PROXY_REQUEST_LIMIT,
  CREDENTIAL_PROXY_TIMEOUT_MS,
  CREDENTIAL_PROXY_TOKEN_CEILING,
  createHostCredentialProxy,
  describeCredentialProxyPolicy,
} from './credential-proxy.mjs';

const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const UPSTREAM = CREDENTIAL_PROXY_ENDPOINT;
const MAX_REQUEST_BYTES = 1_048_576;
const MAX_RESPONSE_BYTES = 4_194_304;
const REQUEST_LIMIT = CREDENTIAL_PROXY_REQUEST_LIMIT;
const TIMEOUT_MS = CREDENTIAL_PROXY_TIMEOUT_MS;
const TOKEN_CEILING = CREDENTIAL_PROXY_TOKEN_CEILING;
const CONTAINER_SOCKET_PATH = '/run/governance/proxy.sock';
const MANAGED_ROOT_PREFIX = 'gs8-';
const LOCK_NAME = '.gs8-proxy.lock';
const STALE_LOCK_PREFIX = `${LOCK_NAME}.stale-`;
const LOCK_METADATA_NAME = 'owner.json';
const LOCK_METADATA_MAX_BYTES = 1_024;
const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
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
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;
  const benchmarkId = options.benchmarkId ?? BENCHMARK_ID;
  const runId = options.runId;
  const taskId = options.taskId;
  const attemptPin = options.attemptId;
  const tempRoot = options.tempRoot ?? os.tmpdir();
  const ownerPid = options.ownerPid ?? process.pid;
  const ownerUid = options.ownerUid
    ?? (typeof process.getuid === 'function' ? process.getuid() : 0);
  const ownerGid = options.ownerGid
    ?? (typeof process.getgid === 'function' ? process.getgid() : 0);
  const upstreamKeyOption = options.upstreamKey;
  const getUpstreamKey = options.getUpstreamKey;
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const dependencies = normalizeDependencies(options);

  if (
    model !== CREDENTIAL_PROXY_MODEL
    || timeoutMs !== TIMEOUT_MS
    || benchmarkId !== BENCHMARK_ID
    || !closedToken(runId)
    || !closedToken(taskId)
    || (
      attemptPin !== undefined
      && !HEX_64.test(attemptPin)
    )
    || !path.isAbsolute(tempRoot)
    || !positiveInteger(ownerPid)
    || !nonNegativeInteger(ownerUid)
    || !nonNegativeInteger(ownerGid)
    || !path.isAbsolute(repositoryRoot)
    || (
      getUpstreamKey !== undefined
      && typeof getUpstreamKey !== 'function'
    )
  ) {
    fail('PROXY_POLICY_INVALID');
  }

  const descriptorInput = Object.freeze({
    attemptId: 'durable-policy-descriptor',
    benchmarkId,
    runId: 'durable-policy-run',
    taskId: 'durable-policy-task',
    provider: CREDENTIAL_PROXY_PROVIDER,
    model,
    upstream: UPSTREAM,
    maxRequestBytes: MAX_REQUEST_BYTES,
    maxResponseBytes: MAX_RESPONSE_BYTES,
    requestLimit: REQUEST_LIMIT,
    timeoutMs: TIMEOUT_MS,
    tokenCeiling: TOKEN_CEILING,
  });
  let durablePolicy;
  try {
    durablePolicy = describeCredentialProxyPolicy(descriptorInput);
  } catch {
    fail('PROXY_POLICY_INVALID');
  }

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
      || input.benchmarkId !== benchmarkId
      || input.runId !== runId
      || input.taskId !== taskId
      || input.timeoutMs !== timeoutMs
    ) {
      fail('PROXY_POLICY_INVALID');
    }
    if (knownStates.size > 0) fail('PROXY_LIFECYCLE_INVALID');
    if (!reconciled && await reconcile() !== true) {
      fail('PROXY_RECONCILIATION_UNCERTAIN');
    }

    const upstreamKey = await resolveUpstreamKey();

    let root;
    let core;
    try {
      root = await dependencies.fs.mkdtemp(
        path.join(tempRoot, MANAGED_ROOT_PREFIX),
      );
      await dependencies.fs.chmod(root, 0o700);
      const socketPath = path.join(root, 'p.sock');
      core = dependencies.createCredentialProxy({
        policy: {
          attemptId: input.attemptId,
          benchmarkId,
          runId,
          taskId,
          provider: CREDENTIAL_PROXY_PROVIDER,
          model,
          upstream: UPSTREAM,
          maxRequestBytes: MAX_REQUEST_BYTES,
          maxResponseBytes: MAX_RESPONSE_BYTES,
          requestLimit: REQUEST_LIMIT,
          timeoutMs: TIMEOUT_MS,
          tokenCeiling: TOKEN_CEILING,
        },
        socketPath,
        socketOwnerUid: ownerUid,
        socketOwnerGid: ownerGid,
        socketMode: 0o600,
        upstreamKey,
        receiptSink: options.receiptSink,
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
          GOVERNSEED_PROXY_SOCKET: CONTAINER_SOCKET_PATH,
          GOVERNSEED_BENCHMARK_ID: benchmarkId,
          GOVERNSEED_RUN_ID: runId,
          GOVERNSEED_TASK_ID: taskId,
        }),
        phase: 'open',
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
      GOVERNSEED_PROXY_SOCKET: state.containerEnvironment.GOVERNSEED_PROXY_SOCKET,
      GOVERNSEED_BENCHMARK_ID: state.containerEnvironment.GOVERNSEED_BENCHMARK_ID,
      GOVERNSEED_RUN_ID: state.containerEnvironment.GOVERNSEED_RUN_ID,
      GOVERNSEED_TASK_ID: state.containerEnvironment.GOVERNSEED_TASK_ID,
    });
  }

  async function getSocketPath(handle) {
    const state = requireHandle(handle);
    if (state.phase !== 'open' && state.phase !== 'attached') {
      fail('PROXY_LIFECYCLE_INVALID');
    }
    return state.socketPath;
  }

  async function attachAttempt(handle, input) {
    const state = requireHandle(handle);
    if (state.phase !== 'open') {
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
    state.phase = 'attached';
    return true;
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
    getSocketPath,
    attachAttempt,
    closeAttempt,
    proveClosed,
  });
}
