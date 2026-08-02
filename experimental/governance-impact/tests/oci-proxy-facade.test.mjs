import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  CREDENTIAL_PROXY_ENDPOINT,
  CREDENTIAL_PROXY_MODEL,
  CREDENTIAL_PROXY_REQUEST_LIMIT,
  CREDENTIAL_PROXY_TIMEOUT_MS,
  CREDENTIAL_PROXY_TOKEN_CEILING,
} from '../lib/credential-proxy.mjs';
import {
  createOciCredentialProxyFacade,
} from '../lib/oci-proxy-facade.mjs';

const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const RUN_ID = 'facade-run';
const TASK_ID = 'facade-task';
const MODEL = CREDENTIAL_PROXY_MODEL;
const ATTEMPT_ID = 'a'.repeat(64);
const UPSTREAM_KEY = 'synthetic-host-only-key';

function temporaryRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oci-proxy-facade-v8-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

function fakeCoreFactory(events) {
  return (input) => {
    events.push({ event: 'create', input });
    return {
      async start() {
        events.push('start');
        await fs.promises.writeFile(input.socketPath, '', { mode: 0o600 });
        return { policyHash: 'synthetic-core-policy' };
      },
      async close() {
        events.push('close');
        await fs.promises.rm(input.socketPath, { force: true });
        return { socketRemoved: true, requestCount: 0 };
      },
      async proveSafe() {
        events.push('proveSafe');
        return { attemptSafe: true };
      },
    };
  };
}

function facadeOptions(t, overrides = {}) {
  return {
    model: MODEL,
    benchmarkId: BENCHMARK_ID,
    runId: RUN_ID,
    taskId: TASK_ID,
    timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
    tempRoot: temporaryRoot(t),
    ownerPid: process.pid,
    ownerUid: process.getuid?.() ?? 0,
    ownerGid: process.getgid?.() ?? 0,
    upstreamKey: UPSTREAM_KEY,
    isProcessAlive: () => false,
    ...overrides,
  };
}

function attempt(arm = 'baseline', overrides = {}) {
  return {
    arm,
    attemptId: ATTEMPT_ID,
    benchmarkId: BENCHMARK_ID,
    runId: RUN_ID,
    taskId: TASK_ID,
    timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
    ...overrides,
  };
}

test('facade policy is fixed and never exposes credential-shaped container env', async (t) => {
  const facade = createOciCredentialProxyFacade(facadeOptions(t));
  await facade.reconcile();
  const policy = await facade.describePolicy();
  assert.equal(policy.upstream, CREDENTIAL_PROXY_ENDPOINT);
  assert.equal(policy.requestLimit, CREDENTIAL_PROXY_REQUEST_LIMIT);
  assert.equal(policy.timeoutMs, CREDENTIAL_PROXY_TIMEOUT_MS);
  assert.equal(policy.tokenCeiling, CREDENTIAL_PROXY_TOKEN_CEILING);

  const handle = await facade.openAttempt(attempt());
  const environment = await facade.getContainerEnvironment(handle);
  assert.deepEqual(environment, {
    GOVERNSEED_PROXY_SOCKET: '/run/governance/proxy.sock',
    GOVERNSEED_BENCHMARK_ID: BENCHMARK_ID,
    GOVERNSEED_RUN_ID: RUN_ID,
    GOVERNSEED_TASK_ID: TASK_ID,
  });
  assert.equal(Object.keys(environment).some((key) => /KEY|TOKEN|URL/u.test(key)), false);
  assert.equal(JSON.stringify(environment).includes(UPSTREAM_KEY), false);
  await facade.closeAttempt(handle);
  await facade.proveClosed(handle);
});

test('facade rejects every non-exact model binding before proxy startup', (t) => {
  for (const model of ['gpt-5.6', 'latest', 'gpt-5.6-luna-alias']) {
    assert.throws(
      () => createOciCredentialProxyFacade(facadeOptions(t, { model })),
      (error) => error.code === 'PROXY_POLICY_INVALID',
    );
  }
});

test('attempt binds benchmark, run, task, model, and timeout before core start', async (t) => {
  const events = [];
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    createCredentialProxy: fakeCoreFactory(events),
  }));
  await assert.rejects(
    facade.openAttempt(attempt('baseline', { taskId: 'other-task' })),
    (error) => error.code === 'PROXY_POLICY_INVALID',
  );
  const handle = await facade.openAttempt(attempt('governed'));
  const socketPath = await facade.getSocketPath(handle);
  assert.match(socketPath, /gs8-/u);
  assert.equal(events[0].input.policy.benchmarkId, BENCHMARK_ID);
  assert.equal(events[0].input.policy.runId, RUN_ID);
  assert.equal(events[0].input.policy.taskId, TASK_ID);
  assert.equal(events[0].input.policy.requestLimit, 1);
  assert.equal(events[0].input.policy.timeoutMs, 30_000);
  assert.equal(Object.hasOwn(events[0].input, 'attemptBearer'), false);
  await facade.closeAttempt(handle);
  assert.deepEqual(events.map((entry) => typeof entry === 'string' ? entry : entry.event), [
    'create',
    'start',
    'close',
    'proveSafe',
  ]);
});

test('attach validates a real init pid but does not create a credential relay process', async (t) => {
  const events = [];
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    createCredentialProxy: fakeCoreFactory(events),
    spawn() {
      throw new Error('relay must not be spawned');
    },
  }));
  const handle = await facade.openAttempt(attempt());
  assert.equal(await facade.attachAttempt(handle, { initPid: 1234 }), true);
  await assert.rejects(
    facade.attachAttempt(handle, { initPid: '1234' }),
    (error) => error.code === 'PROXY_RELAY_UNAVAILABLE',
  );
  await assert.rejects(
    facade.closeAttempt(handle),
    (error) => error.code === 'PROXY_ATTEMPT_UNSAFE',
  );
  await facade.proveClosed(handle);
});

test('reconciliation refuses an owned stale lock with uncertain ownership', async (t) => {
  const root = temporaryRoot(t);
  const facade = createOciCredentialProxyFacade(facadeOptions(t, {
    tempRoot: root,
    ownerPid: process.pid + 1,
    isProcessAlive: () => null,
  }));
  await fs.promises.mkdir(path.join(root, '.gs8-proxy.lock'));
  await assert.rejects(
    facade.reconcile(),
    (error) => error.code === 'PROXY_RECONCILIATION_UNCERTAIN',
  );
});
