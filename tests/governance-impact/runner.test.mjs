import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildCodexRuntimeCommand,
  buildMinimalEnv,
  buildRuntimeCommand,
  resolveRuntimeExecutable,
  runChildSafely,
  runtimeCapabilities,
} from '../../scripts/lib/governance-impact-adapters.mjs';
import {
  deriveAttemptId,
  scoreRun,
  sha256Canonical,
} from '../../scripts/lib/governance-impact-core.mjs';
import {
  deterministicArmOrder,
  hashScenarioArtifacts,
  MAX_JSON_INPUT_BYTES,
  normalizeAndVerifyManifest,
  parseExactJson,
  persistJsonAtomically,
  prepareArmWorkspace,
  readExactJson,
  runOracle,
  runPairedScenario,
  scanPrivacyBuffer,
  snapshotWorkspace,
} from '../../scripts/governance-impact-eval.mjs';

const fakeRuntime = new URL('./fixtures/fake-runtime.mjs', import.meta.url);

function tempDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-impact-task5-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function safeChild(mode, args = [], options = {}) {
  return runChildSafely(
    process.execPath,
    [fakeRuntime.pathname, mode, ...args.map(String)],
    {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? buildMinimalEnv('synthetic', {
        home: os.tmpdir(),
        tmp: os.tmpdir(),
      }, { sourceEnv: process.env }),
      timeoutMs: options.timeoutMs ?? 2_000,
      ...options,
    },
  );
}

test('runtime support matrix refuses every unsafe real launch', () => {
  assert.deepEqual(runtimeCapabilities('codex', 'linux'), {
    available: true,
    noSessionPersistence: true,
    workspaceOnly: true,
    processTree: false,
  });
  assert.equal(runtimeCapabilities('codex', 'win32').processTree, false);
  assert.equal(runtimeCapabilities('claude', 'linux').workspaceOnly, false);
  assert.equal(runtimeCapabilities('antigravity', 'darwin').noSessionPersistence, false);
});

for (const platform of ['linux', 'darwin', 'win32']) {
  test(`${platform} Codex real command is refused before launch construction`, () => {
    assert.throws(
      () => buildRuntimeCommand('codex', '/arm', 'task.md', {
        platform,
        executable: '/opt/bin/codex',
        model: 'm',
        responseSchema: '/trusted/schema.json',
      }),
      (error) => error.code === 'SESSION_SAFETY_UNAVAILABLE' && error.exitCode === 2,
    );
  });
}

test('Codex pure command builder keeps the frozen safe argv contract unit-testable', () => {
  const command = buildCodexRuntimeCommand('/tmp/arm', 'task.md', {
    executable: '/opt/bin/codex',
    model: 'gpt-safe',
    responseSchema: '/tmp/trusted/response.schema.json',
  });
  assert.equal(command.executable, '/opt/bin/codex');
  assert.deepEqual(command.args, [
    'exec',
    '--ephemeral',
    '--ignore-user-config',
    '--strict-config',
    '--sandbox',
    'workspace-write',
    '--cd',
    '/tmp/arm',
    '--model',
    'gpt-safe',
    '--output-schema',
    '/tmp/trusted/response.schema.json',
    '--color',
    'never',
    '--config',
    'shell_environment_policy.inherit=none',
    '-',
  ]);
  assert.match(command.stdin, /task\.md/);
  assert.equal(command.args.includes('--json'), false);
  assert.equal(command.args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(command.args.includes(command.stdin), false);
});

test('Windows Codex real command remains refused with Windows-shaped paths', () => {
  assert.throws(
    () => buildRuntimeCommand('codex', 'C:\\arm', 'task.md', {
      platform: 'win32',
      executable: 'C:\\codex.exe',
      model: 'm',
      responseSchema: 'C:\\trusted\\schema.json',
    }),
    (error) => error.code === 'SESSION_SAFETY_UNAVAILABLE' && error.exitCode === 2,
  );
});

test('minimal POSIX environment is an exact allowlist with no inherited secret', () => {
  const environment = buildMinimalEnv(
    'codex',
    { home: '/tmp/home', tmp: '/tmp/tmp', codexHome: '/tmp/codex-home' },
    {
      platform: 'linux',
      sourceEnv: {
        PATH: '/bin',
        OPENAI_API_KEY: 'blocked',
        HOME: '/private/home',
        CUSTOM_SECRET: 'blocked',
      },
    },
  );
  assert.deepEqual(environment, {
    PATH: '/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    HOME: '/tmp/home',
    TMPDIR: '/tmp/tmp',
    NO_COLOR: '1',
    CODEX_HOME: '/tmp/codex-home',
  });
});

test('minimal Windows fake-runtime environment is closed and omits ComSpec', () => {
  const environment = buildMinimalEnv(
    'synthetic',
    { home: 'C:\\isolated-home', tmp: 'C:\\isolated-tmp' },
    {
      platform: 'win32',
      sourceEnv: {
        PATH: 'C:\\Windows',
        PATHEXT: '.EXE;.CMD',
        SystemRoot: 'C:\\Windows',
        WINDIR: 'C:\\Windows',
        ComSpec: 'C:\\Windows\\cmd.exe',
        CLOUD_TOKEN: 'blocked',
      },
    },
  );
  assert.deepEqual(environment, {
    PATH: 'C:\\Windows',
    PATHEXT: '.EXE;.CMD',
    SystemRoot: 'C:\\Windows',
    WINDIR: 'C:\\Windows',
    USERPROFILE: 'C:\\isolated-home',
    TEMP: 'C:\\isolated-tmp',
    TMP: 'C:\\isolated-tmp',
    NO_COLOR: '1',
  });
});

test('executable resolution treats BIN as one token and never invokes a shell', () => {
  const calls = [];
  const fakeFs = {
    accessSync(value) {
      calls.push(value);
      if (value !== '/tmp/runtime; touch sentinel') throw Object.assign(new Error(), { code: 'ENOENT' });
    },
  };
  const resolved = resolveRuntimeExecutable(
    'codex',
    { CODEX_BIN: '/tmp/runtime; touch sentinel', PATH: '/bin' },
    'linux',
    fakeFs,
  );
  assert.equal(resolved, '/tmp/runtime; touch sentinel');
  assert.deepEqual(calls, ['/tmp/runtime; touch sentinel']);
});

test('missing direct executable resolves to null without a mock fallback', () => {
  const fakeFs = {
    accessSync() {
      throw Object.assign(new Error(), { code: 'ENOENT' });
    },
  };
  assert.equal(
    resolveRuntimeExecutable('antigravity', {
      ANTIGRAVITY_BIN: '/missing/antigravity',
      PATH: '/bin',
    }, 'linux', fakeFs),
    null,
  );
});

test('Windows executable resolution accepts only native files compatible with shell false', () => {
  const calls = [];
  const fakeFs = {
    constants: { X_OK: 1 },
    accessSync(candidate) {
      calls.push(candidate);
    },
  };

  assert.equal(
    resolveRuntimeExecutable(
      'codex',
      {
        CODEX_BIN: 'C:\\tools\\codex.cmd',
        PATH: 'C:\\tools',
        PATHEXT: '.CMD;.BAT;.EXE;.COM',
      },
      'win32',
      fakeFs,
    ),
    null,
  );
  assert.deepEqual(calls, []);

  const resolved = resolveRuntimeExecutable(
    'codex',
    {
      PATH: 'C:\\tools',
      PATHEXT: '.CMD;.BAT;.EXE;.COM',
    },
    'win32',
    fakeFs,
  );
  assert.match(resolved, /codex\.EXE$/u);
  assert.equal(calls.some((candidate) => /\.(?:CMD|BAT)$/u.test(candidate)), false);
});

test('deterministic arm order is domain-separated from input enumeration', () => {
  assert.deepEqual(deterministicArmOrder(42), deterministicArmOrder(42));
  assert.deepEqual([...deterministicArmOrder(42)].sort(), ['baseline', 'governed']);
  assert.deepEqual(deterministicArmOrder(43), deterministicArmOrder(43));
});

test('artifact hash purpose domain uses only the frozen canonical entry payload', async (t) => {
  const root = tempDirectory(t);
  for (const directory of ['seed', 'overlay', 'oracle']) {
    fs.mkdirSync(path.join(root, directory));
    fs.writeFileSync(path.join(root, directory, 'value.txt'), 'same bytes\n');
  }
  fs.writeFileSync(path.join(root, 'task.md'), 'same bytes\n');
  const hashes = await hashScenarioArtifacts(root, {
    dataClassification: 'synthetic',
    paths: {
      seedDir: 'seed',
      taskFile: 'task.md',
      governedOverlayDir: 'overlay',
      oracleDir: 'oracle',
    },
  });
  assert.equal(hashes.seed, hashes.governedOverlay);
  assert.equal(hashes.seed, hashes.oracle);
  assert.notEqual(hashes.seed, hashes.task);
});

test('runChildSafely always launches executable plus argv with shell false', async () => {
  const stdout = new EventEmitter();
  const stderr = new EventEmitter();
  const stdin = { end() {} };
  let observed;
  const spawnImpl = (executable, args, options) => {
    observed = { executable, args, options };
    const child = new EventEmitter();
    Object.assign(child, { stdout, stderr, stdin, pid: 12345, kill() {} });
    queueMicrotask(() => {
      stdout.emit('data', Buffer.from('{}'));
      child.emit('close', 0, null);
    });
    return child;
  };
  await runChildSafely('/tmp/fake executable', ['--literal', ';touch nope'], {
    cwd: '/tmp',
    env: { PATH: '/bin' },
    spawnImpl,
    platform: 'win32',
  });
  assert.equal(observed.executable, '/tmp/fake executable');
  assert.deepEqual(observed.args, ['--literal', ';touch nope']);
  assert.equal(observed.options.shell, false);
  assert.deepEqual(observed.options.stdio, ['pipe', 'pipe', 'pipe']);
});

for (const total of [65_535, 65_536]) {
  test(`combined child output accepts ${total} bytes`, async () => {
    const result = await safeChild('combined', [Math.floor(total / 2), Math.ceil(total / 2)]);
    assert.equal(result.status, 'completed');
    assert.equal(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr), total);
  });
}

test('combined child output rejects the 65,537th byte before decode', async () => {
  await assert.rejects(
    safeChild('combined', [32_768, 32_769]),
    (error) => error.code === 'OUTPUT_LIMIT_EXCEEDED' && error.exitCode === 3,
  );
});

test('thousands of small chunks cannot evade the aggregate output cap', async () => {
  await assert.rejects(
    safeChild('combined', [65_000, 1_000]),
    (error) => error.code === 'OUTPUT_LIMIT_EXCEEDED',
  );
});

test('malformed UTF-8 is fatal and raw bytes are not reflected', async () => {
  await assert.rejects(
    safeChild('malformed-utf8'),
    (error) =>
      error.code === 'OUTPUT_SCHEMA_INVALID' &&
      !JSON.stringify(error).includes('\ufffd'),
  );
});

test('non-zero child status remains safe evidence', async () => {
  const result = await safeChild('nonzero', [9]);
  assert.equal(result.status, 'failed');
  assert.equal(result.errorCode, 'CHILD_EXIT_NONZERO');
  assert.equal(result.exitCode, 9);
});

test('timeout terminates and reaps the child as evidence', async () => {
  const result = await safeChild('sleep', [2_000], { timeoutMs: 30 });
  assert.equal(result.status, 'timeout');
  assert.equal(result.errorCode, 'CHILD_TIMEOUT');
});

test('privacy canary blocks output without reflecting the canary', async () => {
  const canary = `task5-secret-${Date.now()}`;
  await assert.rejects(
    safeChild('canary', [canary, canary], {
      privacyScanner(buffer) {
        if (buffer.includes(Buffer.from(canary))) {
          const error = new Error('blocked');
          error.code = 'PRIVACY_OUTPUT_BLOCKED';
          error.exitCode = 3;
          throw error;
        }
      },
    }),
    (error) =>
      error.code === 'PRIVACY_OUTPUT_BLOCKED' &&
      !error.message.includes(canary) &&
      !JSON.stringify(error).includes(canary),
  );
});

test('production privacy scanner maps child canaries to post-launch exit 3', async () => {
  await assert.rejects(
    safeChild('canary', ['safe@example.com'], { privacyScanner: scanPrivacyBuffer }),
    (error) => error.code === 'PRIVACY_OUTPUT_BLOCKED' && error.exitCode === 3,
  );
});

test('POSIX timeout reaps descendants before returning', {
  skip: process.platform === 'win32',
}, async (t) => {
  const root = tempDirectory(t);
  const sentinel = path.join(root, 'late-sentinel');
  const result = await safeChild('descendant', [sentinel, 250], {
    timeoutMs: 30,
    killGraceMs: 20,
  });
  assert.equal(result.errorCode, 'CHILD_TIMEOUT');
  await new Promise((resolve) => setTimeout(resolve, 400));
  assert.equal(fs.existsSync(sentinel), false);
});

for (const [label, exitCode, status] of [
  ['completed', 0, 'completed'],
  ['failed', 7, 'failed'],
]) {
  test(`POSIX ${label} leader exit reaps its surviving process group before return`, {
    skip: process.platform === 'win32',
  }, async (t) => {
    const root = tempDirectory(t);
    const sentinel = path.join(root, `${label}-late-sentinel`);
    const result = await safeChild(
      'leader-exit-descendant',
      [sentinel, 250, exitCode],
      { killGraceMs: 20 },
    );
    assert.equal(result.status, status);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.equal(fs.existsSync(sentinel), false);
  });
}

test('Codex capability stays closed because a POSIX setsid descendant escapes process-group proof', {
  skip: process.platform === 'win32',
}, async (t) => {
  assert.equal(runtimeCapabilities('codex', process.platform).processTree, false);
  const root = tempDirectory(t);
  const sentinel = path.join(root, 'detached-late-sentinel');
  const pidFile = path.join(root, 'detached.pid');
  let detachedPid;
  t.after(() => {
    if (Number.isInteger(detachedPid)) {
      try {
        process.kill(-detachedPid, 'SIGKILL');
      } catch (error) {
        if (error?.code !== 'ESRCH') throw error;
      }
    }
  });
  const result = await safeChild(
    'leader-exit-detached-descendant',
    [sentinel, pidFile, 200],
    { killGraceMs: 20 },
  );
  detachedPid = Number(fs.readFileSync(pidFile, 'utf8'));
  assert.equal(result.status, 'completed');
  await new Promise((resolve) => setTimeout(resolve, 350));
  // Retained threat-model reproducer: this is not live-readiness evidence.
  assert.equal(fs.existsSync(sentinel), true);
});

test('exact JSON parser rejects duplicate keys and trailing content', () => {
  assert.deepEqual(parseExactJson(Buffer.from('{"a":1,"b":[true,null]}')), {
    a: 1,
    b: [true, null],
  });
  assert.throws(() => parseExactJson(Buffer.from('{"a":1,"a":2}')), /INPUT_SCHEMA_INVALID/);
  assert.throws(() => parseExactJson(Buffer.from('{"a":1} trailing')), /INPUT_SCHEMA_INVALID/);
});

test('exact JSON stable-open rejects swap after lstat before descriptor read', (t) => {
  const root = tempDirectory(t);
  const input = path.join(root, 'input.json');
  const replacement = path.join(root, 'replacement.json');
  fs.writeFileSync(input, '{"safe":true}');
  fs.writeFileSync(replacement, '{"evil":true}');
  let swapped = false;
  const fsApi = new Proxy(fs, {
    get(target, property) {
      if (property === 'openSync') {
        return (file, ...args) => {
          if (!swapped && file === input) {
            swapped = true;
            fs.renameSync(input, `${input}.original`);
            fs.symlinkSync(replacement, input);
          }
          return fs.openSync(file, ...args);
        };
      }
      return Reflect.get(target, property);
    },
  });
  assert.throws(
    () => readExactJson(input, { fs: fsApi, root }),
    (error) => ['SYMLINK_INPUT_BLOCKED', 'PATH_POLICY_BLOCKED'].includes(error.code),
  );
});

test('exact JSON input cap accepts the boundary and rejects cap plus one', (t) => {
  const root = tempDirectory(t);
  const atCap = path.join(root, 'at-cap.json');
  const overCap = path.join(root, 'over-cap.json');
  const prefix = '{"ok":true}';
  fs.writeFileSync(atCap, prefix + ' '.repeat(MAX_JSON_INPUT_BYTES - prefix.length));
  fs.writeFileSync(overCap, prefix + ' '.repeat(MAX_JSON_INPUT_BYTES + 1 - prefix.length));
  assert.deepEqual(readExactJson(atCap, { root }), { ok: true });
  assert.throws(
    () => readExactJson(overCap, { root }),
    (error) => error.code === 'INPUT_SCHEMA_INVALID',
  );
});

test('exact JSON rejects initial symlinks and parent-containment escapes', (t) => {
  const root = tempDirectory(t);
  const inside = path.join(root, 'inside');
  fs.mkdirSync(inside);
  const outside = path.join(root, 'outside.json');
  const linked = path.join(inside, 'linked.json');
  fs.writeFileSync(outside, '{"outside":true}');
  fs.symlinkSync(outside, linked);
  assert.throws(
    () => readExactJson(linked, { root: inside }),
    (error) => error.code === 'SYMLINK_INPUT_BLOCKED',
  );
  assert.throws(
    () => readExactJson(outside, { root: inside }),
    (error) => error.code === 'PATH_POLICY_BLOCKED',
  );
});

test('privacy scanner rejects private markers before artifact hashing', async (t) => {
  const root = tempDirectory(t);
  fs.mkdirSync(path.join(root, 'seed'));
  fs.mkdirSync(path.join(root, 'overlay'));
  fs.mkdirSync(path.join(root, 'oracle'));
  fs.writeFileSync(path.join(root, 'seed', 'value.txt'), 'safe@example.com');
  fs.writeFileSync(path.join(root, 'task.md'), 'task');
  fs.writeFileSync(path.join(root, 'oracle', 'verify.mjs'), 'safe');
  let hashCalls = 0;
  await assert.rejects(
    hashScenarioArtifacts(root, {
      dataClassification: 'synthetic',
      paths: {
        seedDir: 'seed',
        taskFile: 'task.md',
        governedOverlayDir: 'overlay',
        oracleDir: 'oracle',
      },
    }, {
      privacyScanner: scanPrivacyBuffer,
      artifactHasher() {
        hashCalls += 1;
        return 'a'.repeat(64);
      },
    }),
    (error) => error.code === 'PRIVACY_SOURCE_BLOCKED',
  );
  assert.equal(hashCalls, 0);
});

test('lstat/open identity swap is blocked before target bytes or hashing', async (t) => {
  const root = tempDirectory(t);
  for (const directory of ['seed', 'overlay', 'oracle']) {
    fs.mkdirSync(path.join(root, directory));
  }
  const victim = path.join(root, 'seed', 'value.txt');
  const replacement = path.join(root, 'replacement.txt');
  fs.writeFileSync(victim, 'safe fixture');
  fs.writeFileSync(replacement, 'safe@example.com');
  fs.writeFileSync(path.join(root, 'task.md'), 'task');
  fs.writeFileSync(path.join(root, 'oracle', 'verify.mjs'), 'oracle');
  let descriptorReads = 0;
  let swapped = false;
  const fsApi = new Proxy(fs, {
    get(target, property) {
      if (property === 'openSync') {
        return (file, flags) => {
          if (!swapped && file === victim) {
            swapped = true;
            fs.renameSync(victim, `${victim}.original`);
            fs.symlinkSync(replacement, victim);
          }
          return fs.openSync(file, flags);
        };
      }
      if (property === 'readFileSync') {
        return (file, ...args) => {
          if (typeof file === 'number') descriptorReads += 1;
          return fs.readFileSync(file, ...args);
        };
      }
      return Reflect.get(target, property);
    },
  });
  let hashCalls = 0;
  await assert.rejects(
    hashScenarioArtifacts(root, {
      dataClassification: 'synthetic',
      paths: {
        seedDir: 'seed',
        taskFile: 'task.md',
        governedOverlayDir: 'overlay',
        oracleDir: 'oracle',
      },
    }, {
      fs: fsApi,
      artifactHasher() {
        hashCalls += 1;
        return 'a'.repeat(64);
      },
    }),
    (error) => error.code === 'SYMLINK_INPUT_BLOCKED',
  );
  assert.equal(descriptorReads, 0);
  assert.equal(hashCalls, 0);
});

test('workspace copy consumes stable-open bytes and never path-raced copyFileSync bytes', async (t) => {
  const root = tempDirectory(t);
  const scenarioRoot = path.join(root, 'scenario');
  fs.mkdirSync(path.join(scenarioRoot, 'seed'), { recursive: true });
  fs.mkdirSync(path.join(scenarioRoot, 'overlay'));
  fs.mkdirSync(path.join(scenarioRoot, 'oracle'));
  const source = path.join(scenarioRoot, 'seed', 'value.txt');
  const replacement = path.join(root, 'replacement.txt');
  fs.writeFileSync(source, 'verified bytes');
  fs.writeFileSync(replacement, 'unsafe replacement');
  fs.writeFileSync(path.join(scenarioRoot, 'task.md'), 'task');
  let swapped = false;
  const originalCopy = fs.copyFileSync;
  fs.copyFileSync = (from, to, flags) => {
    if (!swapped && from === source) {
      swapped = true;
      fs.renameSync(source, `${source}.original`);
      fs.symlinkSync(replacement, source);
    }
    return originalCopy(from, to, flags);
  };
  try {
    const prepared = await prepareArmWorkspace({
      repositoryRoot: root,
      tempRoot: path.join(root, 'tmp'),
      scenarioRoot,
      scenario: {
        paths: {
          seedDir: 'seed',
          taskFile: 'task.md',
          governedOverlayDir: 'overlay',
          oracleDir: 'oracle',
        },
      },
      arm: 'baseline',
    });
    t.after(() => fs.rmSync(prepared.root, { recursive: true, force: true }));
    assert.equal(
      fs.readFileSync(path.join(prepared.workspace, 'value.txt'), 'utf8'),
      'verified bytes',
    );
    assert.equal(swapped, false);
  } finally {
    fs.copyFileSync = originalCopy;
  }
});

test('workspace preparation removes its unique root when materialization fails', async (t) => {
  const root = tempDirectory(t);
  const scenarioRoot = path.join(root, 'scenario');
  const tempRoot = path.join(root, 'tmp');
  fs.mkdirSync(path.join(scenarioRoot, 'seed'), { recursive: true });
  fs.mkdirSync(path.join(scenarioRoot, 'overlay'));
  fs.mkdirSync(tempRoot);
  fs.writeFileSync(path.join(scenarioRoot, 'seed', 'value.txt'), 'safe\n');
  fs.writeFileSync(path.join(scenarioRoot, 'task.md'), 'task\n');
  const fakeFs = Object.create(fs);
  fakeFs.writeFileSync = (target, ...args) => {
    if (typeof target === 'number') throw Object.assign(new Error('injected'), { code: 'EIO' });
    return fs.writeFileSync(target, ...args);
  };

  await assert.rejects(
    prepareArmWorkspace({
      fs: fakeFs,
      repositoryRoot: root,
      tempRoot,
      scenarioRoot,
      scenario: {
        paths: {
          seedDir: 'seed',
          taskFile: 'task.md',
          governedOverlayDir: 'overlay',
        },
        artifactHashes: {},
      },
      arm: 'baseline',
    }),
    (error) => error.code === 'PATH_POLICY_BLOCKED',
  );
  assert.deepEqual(fs.readdirSync(tempRoot), []);
});

test('workspace preparation refuses a symlinked base that escapes the repository', async (t) => {
  const root = tempDirectory(t);
  const outside = tempDirectory(t);
  const scenarioRoot = path.join(root, 'scenario');
  fs.mkdirSync(path.join(scenarioRoot, 'seed'), { recursive: true });
  fs.mkdirSync(path.join(scenarioRoot, 'overlay'));
  fs.writeFileSync(path.join(scenarioRoot, 'seed', 'value.txt'), 'safe\n');
  fs.writeFileSync(path.join(scenarioRoot, 'task.md'), 'task\n');
  fs.symlinkSync(
    outside,
    path.join(root, '.tmp'),
    process.platform === 'win32' ? 'junction' : 'dir',
  );

  await assert.rejects(
    prepareArmWorkspace({
      repositoryRoot: root,
      scenarioRoot,
      scenario: {
        paths: {
          seedDir: 'seed',
          taskFile: 'task.md',
          governedOverlayDir: 'overlay',
        },
        artifactHashes: {},
      },
      arm: 'baseline',
    }),
    (error) => error.code === 'PATH_POLICY_BLOCKED',
  );
  assert.deepEqual(fs.readdirSync(outside), []);
});

test('workspace snapshot rejects a file swapped after lstat and before open', (t) => {
  if (process.platform === 'win32') return t.skip('POSIX symlink race regression');
  const root = tempDirectory(t);
  const workspace = path.join(root, 'workspace');
  const target = path.join(workspace, 'value.txt');
  const backup = path.join(root, 'value.original');
  const outside = path.join(root, 'outside.txt');
  fs.mkdirSync(workspace);
  fs.writeFileSync(target, 'safe\n');
  fs.writeFileSync(outside, 'replacement\n');
  const fakeFs = Object.create(fs);
  const originalOpen = fs.openSync.bind(fs);
  let swapped = false;
  fakeFs.openSync = (value, flags, ...args) => {
    if (!swapped && value === target) {
      fs.renameSync(target, backup);
      fs.symlinkSync(outside, target);
      swapped = true;
    }
    return originalOpen(value, flags, ...args);
  };

  assert.throws(
    () => snapshotWorkspace(workspace, { fs: fakeFs }),
    (error) => error.code === 'WORKSPACE_CONTAINMENT_FAILED',
  );
  assert.equal(swapped, true);
});

function oracleFixture(t) {
  const root = tempDirectory(t);
  const oracleDir = path.join(root, 'oracle');
  const seedDir = path.join(root, 'seed');
  const workspace = path.join(root, 'workspace');
  fs.mkdirSync(oracleDir);
  fs.mkdirSync(seedDir);
  fs.mkdirSync(workspace);
  fs.writeFileSync(path.join(seedDir, 'value.txt'), 'trusted seed\n');
  const result = {
    acceptanceChecks: [{ id: 'CHECK-001', passed: true, critical: true }],
    requirements: [{ id: 'FACT-001', omitted: false }],
    scope: { changedPaths: [], allowedPaths: ['src/'], forbiddenPaths: ['package.json'] },
    prohibitions: [{ id: 'CHECK-002', violated: false, critical: true }],
    documentChecks: [],
    privacyChecks: [{ id: 'CHECK-003', passed: true, critical: true }],
    repairRounds: 0,
    time: { availability: 'unavailable', wallTimeMs: null },
    tokens: { availability: 'unavailable', total: null },
  };
  const entrypoint = path.join(oracleDir, 'verify.mjs');
  fs.writeFileSync(
    entrypoint,
    `process.stdout.write(${JSON.stringify(JSON.stringify(result) + '\n')});\n`,
  );
  fs.writeFileSync(
    path.join(oracleDir, 'response.schema.json'),
    '{"type":"object"}\n',
  );
  const scenario = {
    paths: { seedDir: 'seed', oracleDir: 'oracle' },
    oracle: {
      command: ['node', 'oracle/verify.mjs'],
      checkIds: ['CHECK-001', 'CHECK-002', 'CHECK-003'],
    },
    checks: [
      { id: 'CHECK-001', kind: 'acceptance', critical: true },
      { id: 'CHECK-002', kind: 'prohibition', critical: true },
      { id: 'CHECK-003', kind: 'privacy', critical: true },
    ],
    facts: [{ id: 'FACT-001', kind: 'requirement' }],
    allowedChangePaths: ['src/'],
    forbiddenChangePaths: ['package.json'],
  };
  return { root, workspace, entrypoint, result, scenario };
}

test('oracle executes a pinned entrypoint despite a transient source swap', async (t) => {
  const fixture = oracleFixture(t);
  const marker = path.join(fixture.root, 'attacker-marker');
  const backup = `${fixture.entrypoint}.original`;
  let swapped = false;
  const result = await runOracle({
    scenario: fixture.scenario,
    scenarioRoot: fixture.root,
    workspace: fixture.workspace,
    env: buildMinimalEnv('synthetic', { home: fixture.root, tmp: fixture.root }, { sourceEnv: process.env }),
    runChildSafely: async (executable, args, options) => {
      fs.renameSync(fixture.entrypoint, backup);
      fs.writeFileSync(
        fixture.entrypoint,
        `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'owned');\n`,
      );
      swapped = true;
      try {
        return await runChildSafely(executable, args, options);
      } finally {
        fs.rmSync(fixture.entrypoint, { force: true });
        fs.renameSync(backup, fixture.entrypoint);
      }
    },
  });
  assert.equal(swapped, true);
  assert.deepEqual(result, fixture.result);
  assert.equal(fs.existsSync(marker), false);
});

test('pinned oracle preserves scenario-relative access to the verified seed', async (t) => {
  const fixture = oracleFixture(t);
  const seedPath = path.join(fixture.root, 'seed', 'value.txt');
  const seedBackup = path.join(fixture.root, 'seed.original');
  fs.writeFileSync(
    fixture.entrypoint,
    `import { readFileSync } from 'node:fs';
const seed = readFileSync(new URL('../seed/value.txt', import.meta.url), 'utf8');
if (seed !== 'trusted seed\\n') process.exit(2);
process.stdout.write(${JSON.stringify(JSON.stringify(fixture.result) + '\n')});
`,
  );
  const result = await runOracle({
    scenario: fixture.scenario,
    scenarioRoot: fixture.root,
    workspace: fixture.workspace,
    env: buildMinimalEnv(
      'synthetic',
      { home: fixture.root, tmp: fixture.root },
      { sourceEnv: process.env },
    ),
    runChildSafely: async (executable, args, options) => {
      fs.renameSync(seedPath, seedBackup);
      fs.writeFileSync(seedPath, 'swapped seed\n');
      try {
        return await runChildSafely(executable, args, options);
      } finally {
        fs.rmSync(seedPath, { force: true });
        fs.renameSync(seedBackup, seedPath);
      }
    },
  });
  assert.deepEqual(result, fixture.result);
});

test('oracle result rejects malformed arrays, missing IDs, and critical drift with oracle code', async (t) => {
  const fixture = oracleFixture(t);
  for (const mutate of [
    (value) => { value.acceptanceChecks = {}; },
    (value) => { value.privacyChecks = []; },
    (value) => { value.prohibitions[0].critical = false; },
  ]) {
    const value = structuredClone(fixture.result);
    mutate(value);
    await assert.rejects(
      runOracle({
        scenario: fixture.scenario,
        scenarioRoot: fixture.root,
        workspace: fixture.workspace,
        env: {},
        runChildSafely: async () => ({
          status: 'completed',
          stdout: JSON.stringify(value),
          stderr: '',
        }),
      }),
      (error) => error.code === 'ORACLE_INTEGRITY_FAILED',
    );
  }
});

test('runner-owned trusted response schema does not depend on a scenario schema file', async (t) => {
  const fixture = oracleFixture(t);
  fs.rmSync(path.join(fixture.root, 'oracle', 'response.schema.json'));
  let childCalled = false;
  const result = await runOracle({
    scenario: fixture.scenario,
    scenarioRoot: fixture.root,
    workspace: fixture.workspace,
    env: {},
    runChildSafely: async () => {
      childCalled = true;
      return { status: 'completed', stdout: JSON.stringify(fixture.result), stderr: '' };
    },
  });
  assert.equal(childCalled, true);
  assert.deepEqual(result, fixture.result);
});

test('runner-owned response schema identity and digest are verified after execution', async (t) => {
  const fixture = oracleFixture(t);
  await assert.rejects(
    runOracle({
      scenario: fixture.scenario,
      scenarioRoot: fixture.root,
      workspace: fixture.workspace,
      env: {},
      runChildSafely: async (_executable, _args, options) => {
        const schema = fs.readdirSync(options.cwd)
          .map((name) => path.join(options.cwd, name))
          .find((entry) => path.basename(entry) === '.runtime-response.schema.json');
        fs.chmodSync(schema, 0o600);
        fs.writeFileSync(schema, '{"type":"string"}\n');
        return { status: 'completed', stdout: JSON.stringify(fixture.result), stderr: '' };
      },
    }),
    (error) => error.code === 'ORACLE_INTEGRITY_FAILED',
  );
});

test('oracle entrypoint outside oracleDir is refused before child launch', async (t) => {
  const fixture = oracleFixture(t);
  const outside = path.join(fixture.root, 'outside.mjs');
  fs.writeFileSync(outside, 'process.stdout.write("{}");\n');
  fixture.scenario.oracle.command = ['node', 'outside.mjs'];
  let childCalled = false;
  await assert.rejects(
    runOracle({
      scenario: fixture.scenario,
      scenarioRoot: fixture.root,
      workspace: fixture.workspace,
      env: {},
      runChildSafely: async () => {
        childCalled = true;
      },
    }),
    (error) => error.code === 'ORACLE_INTEGRITY_FAILED',
  );
  assert.equal(childCalled, false);
});

test('required manifest pin rejects null or absent policy hash', () => {
  const cohort = {
    runtime: 'synthetic',
    model: 'fixture',
    config: 'offline',
    starterCommit: 'a'.repeat(40),
  };
  const attempt = {
    scenarioHash: 'b'.repeat(64),
    repetitionId: 'rep-1',
    seed: 1,
  };
  attempt.attemptId = deriveAttemptId({ ...attempt, cohort });
  const manifest = { schemaVersion: 1, cohort, attempts: [attempt] };
  for (const expectedManifestHash of [null, undefined]) {
    assert.throws(
      () => normalizeAndVerifyManifest(
        manifest,
        { expectedManifestHash },
        { requirePolicyPin: true },
      ),
      (error) => error.code === 'MANIFEST_HASH_MISMATCH',
    );
  }
});

test('atomic persistence refuses output collisions without overwrite', async (t) => {
  const root = tempDirectory(t);
  const target = path.join(root, 'result.json');
  fs.writeFileSync(target, '{"original":true}\n');
  await assert.rejects(
    persistJsonAtomically(target, { changed: true }),
    (error) => error.code === 'PERSIST_FAILED',
  );
  assert.equal(fs.readFileSync(target, 'utf8'), '{"original":true}\n');
});

test('atomic persistence publishes one synced closed JSON artifact', async (t) => {
  const root = tempDirectory(t);
  const target = path.join(root, 'result.json');
  const receipt = await persistJsonAtomically(target, { schemaVersion: 1, ok: true });
  assert.equal(fs.readFileSync(target, 'utf8'), '{"schemaVersion":1,"ok":true}\n');
  assert.match(receipt.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    fs.readdirSync(root).sort(),
    ['result.json'],
  );
});

test('paired runner executes oracle after nonzero and timeout before cleanup/score/persist', async () => {
  const events = [];
  const scenario = {
    schemaVersion: 1,
    id: 'runner-test',
    dataClassification: 'synthetic',
    paths: { seedDir: 'seed', taskFile: 'task.md', governedOverlayDir: 'overlay', oracleDir: 'oracle' },
    artifactHashes: { seed: 'a'.repeat(64), task: 'b'.repeat(64), governedOverlay: 'c'.repeat(64), oracle: 'd'.repeat(64) },
    facts: [
      { id: 'FACT-001', kind: 'requirement', statement: 'Do the task.' },
      { id: 'FACT-002', kind: 'prohibition', statement: 'Do not escape.' },
    ],
    factParity: { baseline: ['FACT-001', 'FACT-002'], governed: ['FACT-001', 'FACT-002'] },
    checks: [
      { id: 'CHECK-001', kind: 'acceptance', factIds: ['FACT-001'], critical: true },
      { id: 'CHECK-002', kind: 'prohibition', factIds: ['FACT-002'], critical: true },
      { id: 'CHECK-003', kind: 'privacy', factIds: ['FACT-001'], critical: true },
    ],
    oracle: { command: ['node', 'oracle/verify.mjs'], checkIds: ['CHECK-001', 'CHECK-002', 'CHECK-003'] },
    allowedChangePaths: ['src/'],
    forbiddenChangePaths: ['package.json'],
  };
  const scenarioHash = sha256Canonical(scenario);
  const cohort = { runtime: 'codex', model: 'm', config: 'c', starterCommit: 'a'.repeat(40) };
  const attempt = {
    scenarioHash,
    repetitionId: 'rep-1',
    seed: 7,
  };
  attempt.attemptId = deriveAttemptId({ ...attempt, cohort });
  const oracleArm = {
    acceptanceChecks: [{ id: 'CHECK-001', passed: true, critical: true }],
    requirements: [{ id: 'FACT-001', omitted: false }],
    scope: { changedPaths: [], allowedPaths: ['src/'], forbiddenPaths: ['package.json'] },
    prohibitions: [{ id: 'CHECK-002', violated: false, critical: true }],
    documentChecks: [],
    privacyChecks: [{ id: 'CHECK-003', passed: true, critical: true }],
    time: { availability: 'unavailable', wallTimeMs: null },
    tokens: { availability: 'unavailable', total: null },
    repairRounds: 0,
  };
  let invocation = 0;
  const result = await runPairedScenario({
    scenario,
    manifest: { schemaVersion: 1, cohort, attempts: [attempt] },
    attemptId: attempt.attemptId,
    deps: {
      prepareArmWorkspace: async ({ arm }) => ({ workspace: `/tmp/${arm}`, home: `/tmp/${arm}-home`, tmp: `/tmp/${arm}-tmp` }),
      buildRuntimeCommand: () => ({ executable: '/fake', args: [], stdin: 'prompt' }),
      buildMinimalEnv: () => ({ PATH: '/bin' }),
      runChildSafely: async () => {
        invocation += 1;
        return invocation === 1
          ? { status: 'failed', errorCode: 'CHILD_EXIT_NONZERO', wallTimeMs: 1 }
          : { status: 'timeout', errorCode: 'CHILD_TIMEOUT', wallTimeMs: 1 };
      },
      runOracle: async ({ arm }) => {
        events.push(`oracle:${arm}`);
        return structuredClone(oracleArm);
      },
      cleanup: async () => events.push('cleanup'),
      scoreRun: (candidate) => {
        events.push('score');
        return scoreRun(candidate);
      },
      persist: async () => events.push('persist'),
      runIdFactory: () => 'run-1',
    },
  });
  assert.equal(events.filter((entry) => entry.startsWith('oracle:')).length, 2);
  assert.ok(events.lastIndexOf('cleanup') < events.indexOf('score'));
  assert.ok(events.indexOf('score') < events.indexOf('persist'));
  assert.equal(
    result.rawRun.arms[result.armOrder[0]].execution.errorCode,
    'CHILD_EXIT_NONZERO',
  );
  assert.equal(result.scored.arms[result.armOrder[0]].deliveryPass, false);
  assert.equal(result.scored.arms[result.armOrder[1]].deliveryPass, false);
});

test('cleanup failure discards candidate before score and persistence', async () => {
  let scored = false;
  let persisted = false;
  await assert.rejects(
    runPairedScenario({
      scenario: { dataClassification: 'synthetic' },
      manifest: { cohort: {}, attempts: [{ attemptId: 'a'.repeat(64), seed: 1 }] },
      attemptId: 'a'.repeat(64),
      deps: {
        prepareArmWorkspace: async ({ arm }) => ({ workspace: `/tmp/${arm}` }),
        buildRuntimeCommand: () => ({ executable: '/fake', args: [] }),
        runChildSafely: async () => ({ status: 'completed', errorCode: null }),
        runOracle: async () => ({}),
        cleanup: async () => { throw new Error('private cleanup path'); },
        scoreRun: () => { scored = true; },
        persist: async () => { persisted = true; },
      },
    }),
    (error) => error.code === 'CLEANUP_FAILED' && !error.message.includes('/tmp/'),
  );
  assert.equal(scored, false);
  assert.equal(persisted, false);
});
