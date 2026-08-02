import assert from 'node:assert/strict';
import test from 'node:test';

const FORBIDDEN_ENV_NAMES = new Set([
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GH_TOKEN',
]);
const KEY_SHAPED = /(?:sk-[A-Za-z0-9]{20,}|Bearer\s+[A-Za-z0-9_-]{20,})/u;

function assertCleanBoundarySurface({
  env = {},
  workspace = [],
  mounts = [],
  argv = [],
  artifacts = [],
  logs = [],
}) {
  for (const key of Object.keys(env)) {
    if (FORBIDDEN_ENV_NAMES.has(key)) {
      throw new Error('CREDENTIAL_ENV_FORBIDDEN');
    }
    if (KEY_SHAPED.test(String(env[key]))) throw new Error('CREDENTIAL_ENV_VALUE_FORBIDDEN');
  }
  if ([...workspace, ...artifacts, ...logs].some((value) => KEY_SHAPED.test(String(value)))) {
    throw new Error('CREDENTIAL_VALUE_PERSISTENCE_FORBIDDEN');
  }
  if (mounts.some((mount) => /(?:api[_-]?key|credential|secret|token|password)/iu.test(
    `${mount.source ?? ''} ${mount.target ?? ''}`,
  ))) {
    throw new Error('CREDENTIAL_MOUNT_FORBIDDEN');
  }
  if (argv.some((value) => /(?:authorization|bearer\s|OPENAI_API_KEY|--(?:api-key|credential))/iu.test(String(value)))) {
    throw new Error('CREDENTIAL_ARG_FORBIDDEN');
  }
}

test('credential-shaped container environment is rejected while the repair env is clean', () => {
  assert.throws(
    () => assertCleanBoundarySurface({
      env: { OPENAI_API_KEY: 'synthetic-key-name-only' },
    }),
    /CREDENTIAL_ENV_FORBIDDEN/u,
  );
  assert.doesNotThrow(() => assertCleanBoundarySurface({
    env: {
      GOVERNSEED_PROXY_SOCKET: '/run/governance/proxy.sock',
      GOVERNSEED_BENCHMARK_ID: 'GS-OSS-2026-08-02-V8',
      GOVERNSEED_RUN_ID: 'repair-1-run',
      GOVERNSEED_TASK_ID: 'repair-1-task',
    },
  }));
});

test('workspace and artifact key-shaped values are rejected', () => {
  const syntheticKey = `sk-${'a'.repeat(24)}`;
  assert.throws(
    () => assertCleanBoundarySurface({ workspace: [syntheticKey] }),
    /CREDENTIAL_VALUE_PERSISTENCE_FORBIDDEN/u,
  );
  assert.throws(
    () => assertCleanBoundarySurface({ artifacts: [`raw=${syntheticKey}`] }),
    /CREDENTIAL_VALUE_PERSISTENCE_FORBIDDEN/u,
  );
  assert.doesNotThrow(() => assertCleanBoundarySurface({
    artifacts: [{ requestSha256: 'a'.repeat(64), responseBytes: 12 }],
  }));
});

test('credential file mounts are rejected', () => {
  assert.throws(
    () => assertCleanBoundarySurface({
      mounts: [{ source: '/tmp/provider-api-key.json', target: '/run/key.json' }],
    }),
    /CREDENTIAL_MOUNT_FORBIDDEN/u,
  );
  assert.doesNotThrow(() => assertCleanBoundarySurface({
    mounts: [{ source: '/tmp/proxy.sock', target: '/run/governance/proxy.sock' }],
  }));
});

test('Authorization-bearing command arguments are rejected', () => {
  assert.throws(
    () => assertCleanBoundarySurface({
      argv: ['codex', '--header', 'Authorization: Bearer synthetic-value'],
    }),
    /CREDENTIAL_ARG_FORBIDDEN/u,
  );
  assert.doesNotThrow(() => assertCleanBoundarySurface({
    argv: ['codex', 'exec', '--cd', '/workspace'],
  }));
});

test('raw key-shaped artifact and log values are rejected', () => {
  const syntheticBearer = `Bearer ${'b'.repeat(24)}`;
  assert.throws(
    () => assertCleanBoundarySurface({ logs: [syntheticBearer] }),
    /CREDENTIAL_VALUE_PERSISTENCE_FORBIDDEN/u,
  );
  assert.doesNotThrow(() => assertCleanBoundarySurface({
    logs: [{ event: 'PROXY_REQUEST_COMPLETED', statusCode: 200 }],
  }));
});
