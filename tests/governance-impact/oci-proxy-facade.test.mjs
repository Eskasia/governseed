import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import test from 'node:test';

import {
  createOciCredentialProxyFacade,
} from '../../scripts/lib/governance-impact-oci-proxy-facade.mjs';
import {
  OCI_PROXY_BASE_URL,
} from '../../scripts/lib/governance-impact-oci-supervisor.mjs';

const ATTEMPT_ID = 'a'.repeat(64);
const MODEL = 'gpt-synthetic-fixed';
const UPSTREAM_KEY = 'upstream-secret-must-stay-host-only';
const DEADLINE_MS = 300_000;
const EXPECTED_BEARER = Buffer.alloc(32, 7).toString('base64url');

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-proxy-facade-test-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function errorCode(code) {
  return (error) => error?.code === code && error?.message === code;
}

function createFakeCoreFactory(events, options = {}) {
  return (input) => {
    events.push({ event: 'core.create', input });
    return Object.freeze({
      async start() {
        events.push({ event: 'core.start' });
        await fs.promises.writeFile(input.socketPath, '', { mode: 0o600 });
        if (options.startError) throw options.startError;
        return Object.freeze({ policyHash: 'core-policy-hash' });
      },
      async close() {
        events.push({ event: 'core.close' });
        await fs.promises.rm(input.socketPath, { force: true });
        if (options.closeError) throw options.closeError;
        return Object.freeze({ socketRemoved: true, requestCount: 0 });
      },
      async proveSafe() {
        events.push({ event: 'core.proveSafe' });
        if (options.proveSafeError) throw options.proveSafeError;
        return Object.freeze({ attemptSafe: true });
      },
    });
  };
}

function createFakeRelayChild(options = {}) {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = new PassThrough();
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  let closed = false;

  child.emitClose = (exitCode = 0, signalCode = null) => {
    if (closed) return;
    closed = true;
    child.exitCode = exitCode;
    child.signalCode = signalCode;
    child.emit('exit', exitCode, signalCode);
    child.emit('close', exitCode, signalCode);
  };
  child.kill = (signal = 'SIGTERM') => {
    child.killed = true;
    queueMicrotask(() => child.emitClose(null, signal));
    return true;
  };
  child.stdin.once('finish', () => {
    if (options.closeOnEnd !== false) {
      queueMicrotask(() => child.emitClose(0, null));
    }
  });
  if (options.ready !== false) {
    queueMicrotask(() => child.stdout.write('READY\n'));
  }
  return child;
}

function facadeOptions(t, overrides = {}) {
  return {
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    tempRoot: temporaryRoot(t),
    ownerPid: 41001,
    ownerGid: typeof process.getgid === 'function' ? process.getgid() : 0,
    isProcessAlive: () => false,
    randomBytes: () => Buffer.alloc(32, 7),
    ...overrides,
  };
}

test('credential-free reconcile and describePolicy pin the exact core v2 policy', async (t) => {
  let credentialReads = 0;
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    getUpstreamKey() {
      credentialReads += 1;
      return undefined;
    },
  }));

  assert.equal(await facade.reconcile(), true);
  const policy = await facade.describePolicy();

  assert.equal(credentialReads, 0);
  assert.deepEqual(policy, {
    schemaVersion: 2,
    method: 'POST',
    path: '/v1/responses',
    model: MODEL,
    upstream: 'https://api.openai.com/v1/responses',
    maxRequestBytes: 1_048_576,
    maxResponseBytes: 4_194_304,
    maxRequests: 32,
    deadlineMs: DEADLINE_MS,
    maxConcurrency: 1,
    request: {
      store: false,
      stream: true,
      background: false,
      continuationMode: 'client-replay',
      serverStateFields: [],
      serverStateReferenceFields: [],
      remoteInputUrls: false,
      toolSearchExecution: 'client',
      allowedToolTypes: [
        'apply_patch',
        'custom',
        'function',
        'local_shell',
        'tool_search',
      ],
      strippedIdentifierFields: [
        'client_metadata',
        'metadata',
        'prompt_cache_key',
        'prompt_cache_retention',
        'safety_identifier',
        'user',
      ],
    },
  });
  await assert.rejects(
    facade.openAttempt({
      arm: 'baseline',
      attemptId: ATTEMPT_ID,
      deadlineMs: DEADLINE_MS,
    }),
    errorCode('PROXY_CREDENTIAL_UNAVAILABLE'),
  );
  assert.equal(credentialReads, 1);
});

test('global owner lock blocks a live parallel owner without deleting its state', async (t) => {
  const root = temporaryRoot(t);
  const first = createOciCredentialProxyFacade({
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    tempRoot: root,
    ownerPid: 42001,
    isProcessAlive: () => false,
  });
  assert.equal(await first.reconcile(), true);

  const liveState = path.join(root, 'governance-impact-oci-proxy-livefixture');
  await fs.promises.mkdir(liveState, { mode: 0o700 });
  const second = createOciCredentialProxyFacade({
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    tempRoot: root,
    ownerPid: 42002,
    isProcessAlive: (pid) => pid === 42001,
  });

  assert.equal(await second.reconcile(), false);
  assert.equal((await fs.promises.lstat(liveState)).isDirectory(), true);
});

test('stale lock is reclaimed only after proving its owner dead', async (t) => {
  const root = temporaryRoot(t);
  const first = createOciCredentialProxyFacade({
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    tempRoot: root,
    ownerPid: 43001,
    isProcessAlive: () => false,
  });
  assert.equal(await first.reconcile(), true);
  const staleState = path.join(root, 'governance-impact-oci-proxy-stalefixture');
  await fs.promises.mkdir(staleState, { mode: 0o700 });

  const second = createOciCredentialProxyFacade({
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    tempRoot: root,
    ownerPid: 43002,
    isProcessAlive: (pid) => pid === 43002,
  });
  assert.equal(await second.reconcile(), true);
  await assert.rejects(fs.promises.lstat(staleState), { code: 'ENOENT' });
});

test('uncertain managed proxy paths fail reconciliation without deleting them', async (t) => {
  const root = temporaryRoot(t);
  const target = path.join(root, 'unmanaged-target');
  const uncertain = path.join(root, 'governance-impact-oci-proxy-uncertain');
  await fs.promises.mkdir(target);
  await fs.promises.symlink(target, uncertain);
  const facade = createOciCredentialProxyFacade({
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    tempRoot: root,
    ownerPid: 44001,
    isProcessAlive: () => false,
  });

  await assert.rejects(
    facade.reconcile(),
    errorCode('PROXY_RECONCILIATION_UNCERTAIN'),
  );
  assert.equal((await fs.promises.lstat(uncertain)).isSymbolicLink(), true);
});

test('an unresolved stale-lock quarantine cannot be ignored by a later owner', async (t) => {
  const root = temporaryRoot(t);
  const quarantine = path.join(
    root,
    '.governance-impact-oci-proxy.lock.stale-99999-deadbeef',
  );
  await fs.promises.mkdir(quarantine, { mode: 0o700 });
  const facade = createOciCredentialProxyFacade({
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    tempRoot: root,
    ownerPid: 44501,
    isProcessAlive: () => false,
  });

  await assert.rejects(
    facade.reconcile(),
    errorCode('PROXY_RECONCILIATION_UNCERTAIN'),
  );
  assert.equal((await fs.promises.lstat(quarantine)).isDirectory(), true);
});

test('opaque handle, exact container env, relay argv, and cleanup keep secrets closed', async (t) => {
  const events = [];
  const spawns = [];
  const relayInput = [];
  let credentialReads = 0;
  const child = createFakeRelayChild();
  child.stdin.on('data', (chunk) => relayInput.push(Buffer.from(chunk)));
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    getUpstreamKey() {
      credentialReads += 1;
      return UPSTREAM_KEY;
    },
    createCredentialProxy: createFakeCoreFactory(events),
    nodeExecutable: '/reviewed/node',
    spawn(executable, args, options) {
      spawns.push({ executable, args, options });
      return child;
    },
  }));
  await facade.reconcile();
  const policy = await facade.describePolicy();
  const handle = await facade.openAttempt({
    arm: 'baseline',
    attemptId: ATTEMPT_ID,
    deadlineMs: DEADLINE_MS,
  });

  assert.equal(credentialReads, 1);
  assert.deepEqual(Object.keys(handle), ['policy']);
  assert.equal(Object.isFrozen(handle), true);
  assert.equal(handle.policy, policy);
  assert.equal(JSON.stringify(handle).includes(UPSTREAM_KEY), false);
  assert.equal(JSON.stringify(handle).includes(EXPECTED_BEARER), false);

  const containerEnv = await facade.getContainerEnvironment(handle);
  assert.deepEqual(containerEnv, {
    OPENAI_API_KEY: EXPECTED_BEARER,
    OPENAI_BASE_URL: OCI_PROXY_BASE_URL,
  });
  assert.equal(Object.isFrozen(containerEnv), true);

  assert.equal(await facade.attachAttempt(handle, { initPid: 12345 }), true);
  assert.equal(spawns.length, 1);
  assert.equal(spawns[0].executable, 'sudo');
  assert.deepEqual(spawns[0].args, [
    '-n',
    'nsenter',
    '--net=/proc/12345/ns/net',
    `--setgid=${typeof process.getgid === 'function' ? process.getgid() : 0}`,
    `--setuid=${typeof process.getuid === 'function' ? process.getuid() : 0}`,
    '--',
    '/reviewed/node',
    'scripts/governance-impact-uds-relay.mjs',
  ]);
  assert.equal(spawns[0].options.shell, false);
  assert.deepEqual(Object.keys(spawns[0].options.env).sort(), [
    'LANG',
    'PATH',
  ]);
  const argvText = JSON.stringify([
    spawns[0].executable,
    ...spawns[0].args,
  ]);
  assert.equal(argvText.includes(UPSTREAM_KEY), false);
  assert.equal(argvText.includes(EXPECTED_BEARER), false);
  assert.equal(argvText.includes(ATTEMPT_ID), false);
  assert.equal(argvText.includes('proxy.sock'), false);
  assert.equal(JSON.stringify(spawns[0].options.env).includes(UPSTREAM_KEY), false);
  assert.equal(JSON.stringify(spawns[0].options.env).includes(EXPECTED_BEARER), false);
  const relayConfiguration = JSON.parse(
    Buffer.concat(relayInput).toString('utf8'),
  );
  assert.equal(relayConfiguration.bearer, EXPECTED_BEARER);
  assert.equal(relayConfiguration.attemptId, ATTEMPT_ID);
  assert.equal(relayConfiguration.port, 43127);

  assert.equal(await facade.closeAttempt(handle), true);
  assert.equal(await facade.closeAttempt(handle), true);
  assert.equal(await facade.proveClosed(handle), true);
  assert.deepEqual(
    events.map((entry) => entry.event),
    ['core.create', 'core.start', 'core.close', 'core.proveSafe'],
  );
  const coreInput = events[0].input;
  assert.equal(relayConfiguration.socketPath, coreInput.socketPath);
  assert.equal(coreInput.upstreamKey, UPSTREAM_KEY);
  assert.equal(coreInput.attemptBearer, EXPECTED_BEARER);
  assert.equal(coreInput.policy.attemptId, ATTEMPT_ID);
  assert.equal(coreInput.policy.deadlineMs, DEADLINE_MS);
  await assert.rejects(fs.promises.lstat(path.dirname(coreInput.socketPath)), {
    code: 'ENOENT',
  });
});

test('invalid namespace pid is rejected before spawn', async (t) => {
  let spawnCalls = 0;
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    upstreamKey: UPSTREAM_KEY,
    createCredentialProxy: createFakeCoreFactory([]),
    spawn() {
      spawnCalls += 1;
      return createFakeRelayChild();
    },
  }));
  const handle = await facade.openAttempt({
    arm: 'baseline',
    attemptId: ATTEMPT_ID,
    deadlineMs: DEADLINE_MS,
  });

  await assert.rejects(
    facade.attachAttempt(handle, { initPid: '1;id' }),
    errorCode('PROXY_RELAY_UNAVAILABLE'),
  );
  assert.equal(spawnCalls, 0);
  await assert.rejects(
    facade.closeAttempt(handle),
    errorCode('PROXY_ATTEMPT_UNSAFE'),
  );
  assert.equal(await facade.proveClosed(handle), true);
});

test('unexpected relay death is unsafe but still proves complete cleanup', async (t) => {
  const child = createFakeRelayChild();
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    upstreamKey: UPSTREAM_KEY,
    createCredentialProxy: createFakeCoreFactory([]),
    spawn: () => child,
  }));
  const handle = await facade.openAttempt({
    arm: 'governed',
    attemptId: ATTEMPT_ID,
    deadlineMs: DEADLINE_MS,
  });
  await facade.attachAttempt(handle, { initPid: 555 });
  child.emitClose(70, null);

  await assert.rejects(
    facade.closeAttempt(handle),
    errorCode('PROXY_ATTEMPT_UNSAFE'),
  );
  assert.equal(await facade.proveClosed(handle), true);
});

test('core policy failures are sanitized after cleanup', async (t) => {
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    upstreamKey: UPSTREAM_KEY,
    createCredentialProxy: createFakeCoreFactory([], {
      proveSafeError: new Error(`private ${UPSTREAM_KEY}`),
    }),
  }));
  const handle = await facade.openAttempt({
    arm: 'baseline',
    attemptId: ATTEMPT_ID,
    deadlineMs: DEADLINE_MS,
  });

  await assert.rejects(
    facade.closeAttempt(handle),
    (error) => (
      error?.code === 'PROXY_ATTEMPT_UNSAFE'
      && !error.message.includes(UPSTREAM_KEY)
      && JSON.stringify(error).includes(UPSTREAM_KEY) === false
    ),
  );
  assert.equal(await facade.proveClosed(handle), true);
});

test('first successful open binds one attempt and reads the credential once across arms', async (t) => {
  let credentialReads = 0;
  const events = [];
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    getUpstreamKey() {
      credentialReads += 1;
      return UPSTREAM_KEY;
    },
    createCredentialProxy: createFakeCoreFactory(events),
  }));
  const baseline = await facade.openAttempt({
    arm: 'baseline',
    attemptId: ATTEMPT_ID,
    deadlineMs: DEADLINE_MS,
  });
  await facade.closeAttempt(baseline);
  const governed = await facade.openAttempt({
    arm: 'governed',
    attemptId: ATTEMPT_ID,
    deadlineMs: DEADLINE_MS,
  });
  await facade.closeAttempt(governed);

  assert.equal(credentialReads, 1);
  await assert.rejects(
    facade.openAttempt({
      arm: 'baseline',
      attemptId: 'c'.repeat(64),
      deadlineMs: DEADLINE_MS,
    }),
    errorCode('PROXY_POLICY_INVALID'),
  );
  assert.equal(
    events.filter((entry) => entry.event === 'core.create').length,
    2,
  );
});

test('cleanup uncertainty outranks attempt safety and exposes no private path', async (t) => {
  const root = temporaryRoot(t);
  const events = [];
  const fsApi = {
    ...fs.promises,
    async rm(target, options) {
      if (
        options?.recursive === true
        && path.basename(target).startsWith('governance-impact-oci-proxy-')
      ) {
        throw new Error(`private path ${target}`);
      }
      return fs.promises.rm(target, options);
    },
  };
  const facade = createOciCredentialProxyFacade({
    model: MODEL,
    deadlineMs: DEADLINE_MS,
    upstreamKey: UPSTREAM_KEY,
    tempRoot: root,
    ownerPid: 45001,
    isProcessAlive: () => false,
    randomBytes: () => Buffer.alloc(32, 7),
    fs: fsApi,
    createCredentialProxy: createFakeCoreFactory(events),
  });
  const handle = await facade.openAttempt({
    arm: 'baseline',
    attemptId: ATTEMPT_ID,
    deadlineMs: DEADLINE_MS,
  });

  await assert.rejects(
    facade.closeAttempt(handle),
    (error) => (
      error?.code === 'PROXY_CLEANUP_UNPROVEN'
      && !error.message.includes(root)
      && JSON.stringify(error).includes(root) === false
    ),
  );
  await assert.rejects(
    facade.openAttempt({
      arm: 'governed',
      attemptId: ATTEMPT_ID,
      deadlineMs: DEADLINE_MS,
    }),
    errorCode('PROXY_LIFECYCLE_INVALID'),
  );
  assert.equal(
    events.filter((entry) => entry.event === 'core.create').length,
    1,
  );
});
