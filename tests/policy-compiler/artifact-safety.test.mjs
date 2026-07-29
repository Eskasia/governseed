import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  commitPolicyCompile,
  preparePolicyCompile,
} from '../../scripts/lib/policy-compiler-project.mjs';
import {
  canonicalJsonBytes,
  readJsonArtifact,
  writeJsonArtifact,
} from '../../scripts/lib/governance-artifacts.mjs';
import {
  compileArgs,
  governancePath,
  makeProject,
  parseSingleJson,
  runCli,
  snapshotFiles,
  assertSameSnapshot,
  installPack,
  readJson,
  writeJson,
} from './helpers.mjs';

test('compiler rejects symlink and hardlink inputs', async (t) => {
  await t.test('symlink', () => {
    const state = makeProject(t, 'safety-symlink');
    const risk = governancePath(
      state.project,
      '.agent-governance/risk-profile.json',
    );
    const outside = path.join(state.sandbox, 'outside-risk.json');
    fs.renameSync(risk, outside);
    fs.symlinkSync(outside, risk);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      4,
    );
    assert.equal(output.code, 'SYMLINK_BLOCKED');
  });

  await t.test('hardlink', () => {
    const state = makeProject(t, 'safety-hardlink');
    const risk = governancePath(
      state.project,
      '.agent-governance/risk-profile.json',
    );
    fs.linkSync(risk, path.join(state.sandbox, 'risk-hardlink.json'));
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      4,
    );
    assert.equal(output.code, 'SYMLINK_BLOCKED');
  });

  await t.test('AGENTS hardlink', () => {
    const state = makeProject(t, 'safety-agents-hardlink');
    const rules = path.join(state.project, 'AGENTS.md');
    fs.linkSync(rules, path.join(state.sandbox, 'AGENTS-hardlink.md'));
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      4,
    );
    assert.equal(output.code, 'SYMLINK_BLOCKED');
  });

  await t.test('dry-run output parent symlink', () => {
    const state = makeProject(t, 'safety-output-parent-symlink');
    const outside = path.join(state.sandbox, 'outside-policies');
    fs.mkdirSync(outside);
    fs.symlinkSync(
      outside,
      governancePath(state.project, '.agent-governance/policies'),
    );
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      4,
    );
    assert.equal(output.code, 'SYMLINK_BLOCKED');
    assert.deepEqual(fs.readdirSync(outside), []);
  });
});

test('compiler rejects traversal, secret-like content, invalid UTF-8, and 1 MiB input', async (t) => {
  await t.test('traversal', () => {
    const state = makeProject(t, 'safety-traversal');
    installPack(state.project, {
      effect: 'deny',
      capability: 'network',
    });
    const lockPath = governancePath(
      state.project,
      '.agent-governance/packs.lock.json',
    );
    const lock = readJson(lockPath);
    lock.packs[0].artifact = '../outside.json';
    writeJson(lockPath, lock);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      4,
    );
    assert.equal(output.code, 'COMPILE_PATH_BLOCKED');
  });

  await t.test('ignored local Pack input', () => {
    const state = makeProject(t, 'safety-local-pack');
    const installed = installPack(state.project, {
      effect: 'deny',
      capability: 'network',
    });
    const privatePath =
      '.agent-governance/local/private-pack.json';
    fs.renameSync(
      governancePath(state.project, installed.relative),
      governancePath(state.project, privatePath),
    );
    const packLockPath = governancePath(
      state.project,
      '.agent-governance/packs.lock.json',
    );
    const packLock = readJson(packLockPath);
    packLock.packs[0].artifact = privatePath;
    writeJson(packLockPath, packLock);
    const sourceLockPath = governancePath(
      state.project,
      '.agent-governance/source-lock.json',
    );
    const sourceLock = readJson(sourceLockPath);
    sourceLock.sources.find(
      (source) => source.sourceId === 'SRC-PACK',
    ).importedFiles = [privatePath];
    writeJson(sourceLockPath, sourceLock);
    const before = snapshotFiles(state.project);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      4,
    );
    assert.equal(output.code, 'PRIVATE_CONTENT_BLOCKED');
    assertSameSnapshot(before, snapshotFiles(state.project));
  });

  const cases = [
    {
      label: 'secret',
      mutate(file) {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.openQuestions = ['sk-proj-' + 'x'.repeat(40)];
        fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      },
      code: 'SECRET_VALUE_BLOCKED',
    },
    {
      label: 'url-userinfo',
      relativePath: '.agent-governance/source-lock.json',
      mutate(file) {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.sources[0].repository =
          'https://user:password@example.com/governance.git';
        fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      },
      code: 'SECRET_VALUE_BLOCKED',
    },
    {
      label: 'github-fine-grained-token',
      relativePath: '.agent-governance/source-lock.json',
      mutate(file) {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.sources[0].license =
          `github_pat_${'x'.repeat(32)}`;
        fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      },
      code: 'SECRET_VALUE_BLOCKED',
    },
    {
      label: 'url-secret-fragment',
      relativePath: '.agent-governance/source-lock.json',
      mutate(file) {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.sources[0].repository =
          'https://example.com/governance.git#token=supersecretpassword';
        fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      },
      code: 'SECRET_VALUE_BLOCKED',
    },
    {
      label: 'oauth-client-secret-query',
      relativePath: '.agent-governance/source-lock.json',
      mutate(file) {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.sources[0].repository =
          `https://example.com/governance.git?client_secret=${'x'.repeat(32)}`;
        fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      },
      code: 'SECRET_VALUE_BLOCKED',
    },
    {
      label: 'oauth-refresh-token-fragment',
      relativePath: '.agent-governance/source-lock.json',
      mutate(file) {
        const value = JSON.parse(fs.readFileSync(file, 'utf8'));
        value.sources[0].repository =
          `https://example.com/governance.git#refresh-token=${'x'.repeat(32)}`;
        fs.writeFileSync(file, JSON.stringify(value), 'utf8');
      },
      code: 'SECRET_VALUE_BLOCKED',
    },
    {
      label: 'invalid-utf8',
      mutate(file) {
        fs.writeFileSync(file, Buffer.from([0xc3, 0x28]));
      },
      code: 'INVALID_UTF8',
    },
    {
      label: 'oversized',
      mutate(file) {
        fs.writeFileSync(file, Buffer.alloc(1024 * 1024 + 1, 0x20));
      },
      code: 'FILE_TOO_LARGE',
    },
  ];
  for (const scenario of cases) {
    await t.test(scenario.label, () => {
      const state = makeProject(t, `safety-${scenario.label}`);
      const input = governancePath(
        state.project,
        scenario.relativePath
          ?? '.agent-governance/risk-profile.json',
      );
      scenario.mutate(input);
      const output = parseSingleJson(
        runCli(state, compileArgs(state.project)),
        ['INVALID_UTF8', 'FILE_TOO_LARGE'].includes(scenario.code) ? 3 : 4,
      );
      assert.equal(output.code, scenario.code);
    });
  }
});

test('transaction rolls back created artifacts when receipt commit fails', (t) => {
  const state = makeProject(t, 'safety-rollback');
  const prepared = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T12:00:00.000Z',
  });
  const before = snapshotFiles(state.project);
  assert.throws(
    () => commitPolicyCompile(state.project, prepared, {
      hooks: {
        beforeReceipt() {
          const error = new Error('synthetic receipt failure');
          error.code = 'COMPILE_TEST_CRASH';
          throw error;
        },
      },
    }),
    (error) => error?.code === 'COMPILE_TEST_CRASH',
  );
  assertSameSnapshot(before, snapshotFiles(state.project));
  for (const relative of [
    '.agent-governance/adapters',
    '.agent-governance/policies',
    '.agent-governance/receipts',
  ]) {
    assert.equal(
      fs.existsSync(governancePath(state.project, relative)),
      false,
    );
  }
});

test('rollback never deletes output replaced with unknown content', (t) => {
  const state = makeProject(t, 'safety-rollback-owner-change');
  const prepared = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T12:00:00.000Z',
  });
  const policyPath = governancePath(
    state.project,
    prepared.paths.policy,
  );
  const replacement = Buffer.from(
    '{"schemaVersion":1,"owner":"user"}\n',
    'utf8',
  );
  assert.throws(
    () => commitPolicyCompile(state.project, prepared, {
      hooks: {
        beforeReceipt() {
          fs.writeFileSync(policyPath, replacement);
          const error = new Error('synthetic owner replacement');
          error.code = 'COMPILE_TEST_CRASH';
          throw error;
        },
      },
    }),
    (error) => error?.code === 'COMPILE_TEST_CRASH',
  );
  assert.deepEqual(fs.readFileSync(policyPath), replacement);
  assert.equal(
    fs.existsSync(governancePath(state.project, prepared.paths.receipt)),
    false,
  );
});

test('rollback preserves identical output created by another compiler', (t) => {
  const state = makeProject(t, 'safety-concurrent-identical');
  const prepared = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T12:00:00.000Z',
  });
  const policyPath = governancePath(state.project, prepared.paths.policy);
  const concurrentBytes = canonicalJsonBytes(prepared.manifest);
  fs.mkdirSync(path.dirname(policyPath), { recursive: true });
  fs.writeFileSync(policyPath, concurrentBytes);
  assert.throws(
    () => commitPolicyCompile(state.project, prepared, {
      hooks: {
        beforeReceipt() {
          const error = new Error('synthetic receipt failure');
          error.code = 'COMPILE_TEST_CRASH';
          throw error;
        },
      },
    }),
    (error) => error?.code === 'COMPILE_TEST_CRASH',
  );
  assert.deepEqual(fs.readFileSync(policyPath), concurrentBytes);
  assert.equal(
    fs.existsSync(governancePath(state.project, prepared.paths.adapter)),
    false,
  );
  assert.equal(
    fs.existsSync(governancePath(state.project, prepared.paths.receipt)),
    false,
  );
});

test('receipt publication rechecks newly written policy bytes', (t) => {
  const state = makeProject(t, 'safety-before-receipt-drift');
  const prepared = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T12:00:00.000Z',
  });
  const policyPath = governancePath(
    state.project,
    prepared.paths.policy,
  );
  const replacement = Buffer.from('{}\n', 'utf8');
  assert.throws(
    () => commitPolicyCompile(state.project, prepared, {
      hooks: {
        beforeReceipt() {
          fs.writeFileSync(policyPath, replacement);
        },
      },
    }),
    (error) => error?.code === 'POLICY_OUTPUT_DRIFT',
  );
  assert.deepEqual(fs.readFileSync(policyPath), replacement);
  assert.equal(
    fs.existsSync(governancePath(state.project, prepared.paths.adapter)),
    false,
  );
  assert.equal(
    fs.existsSync(governancePath(state.project, prepared.paths.receipt)),
    false,
  );
});

test('unchanged outputs are rechecked during commit', (t) => {
  const state = makeProject(t, 'safety-unchanged-drift');
  const first = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T12:00:00.000Z',
  });
  commitPolicyCompile(state.project, first);
  const second = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T13:00:00.000Z',
  });
  const policyPath = governancePath(state.project, second.paths.policy);
  const replacement = Buffer.from('{}\n', 'utf8');
  assert.throws(
    () => commitPolicyCompile(state.project, second, {
      hooks: {
        beforeCommit({ kind }) {
          if (kind === 'policy') {
            fs.writeFileSync(policyPath, replacement);
          }
        },
      },
    }),
    (error) => error?.code === 'POLICY_OUTPUT_DRIFT',
  );
  assert.deepEqual(fs.readFileSync(policyPath), replacement);
});

test('commit rejects an output parent symlink inserted after prepare', (t) => {
  const state = makeProject(t, 'safety-mkdir-symlink-race');
  const prepared = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T12:00:00.000Z',
  });
  const outside = path.join(state.sandbox, 'outside-adapters');
  fs.mkdirSync(outside);
  fs.symlinkSync(
    outside,
    governancePath(state.project, '.agent-governance/adapters'),
  );
  assert.throws(
    () => commitPolicyCompile(state.project, prepared),
    (error) => [
      'SYMLINK_BLOCKED',
      'COMPILE_PATH_BLOCKED',
    ].includes(error?.code),
  );
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.equal(
    fs.existsSync(governancePath(state.project, prepared.paths.policy)),
    false,
  );
});

test('transaction detects a parent directory identity swap before commit', (t) => {
  const state = makeProject(t, 'safety-parent-swap');
  const prepared = preparePolicyCompile(state.project, {
    target: 'codex',
    compiledAt: '2026-07-29T12:00:00.000Z',
  });
  assert.throws(
    () => commitPolicyCompile(state.project, prepared, {
      hooks: {
        beforeCommit({ parent }) {
          const moved = `${parent}-moved`;
          fs.renameSync(parent, moved);
          fs.mkdirSync(parent);
        },
      },
    }),
    (error) => [
      'SYMLINK_BLOCKED',
      'COMPILE_PATH_BLOCKED',
    ].includes(error?.code),
  );
});

test('artifact publication rolls back a parent swapped during the final link', (t) => {
  const state = makeProject(t, 'safety-final-link-parent-swap');
  const parent = governancePath(
    state.project,
    '.agent-governance/generated',
  );
  const outside = path.join(state.sandbox, 'outside-generated');
  const relative = '.agent-governance/generated/result.json';
  const target = governancePath(state.project, relative);
  fs.mkdirSync(parent);
  let swapped = false;
  const fsProxy = new Proxy(fs, {
    get(targetFs, property) {
      if (property === 'linkSync') {
        return (source, destination) => {
          if (!swapped && destination === target) {
            fs.renameSync(parent, outside);
            fs.symlinkSync(outside, parent);
            swapped = true;
          }
          return fs.linkSync(source, destination);
        };
      }
      const value = Reflect.get(targetFs, property);
      return typeof value === 'function'
        ? value.bind(targetFs)
        : value;
    },
  });

  assert.throws(
    () => writeJsonArtifact(
      state.project,
      relative,
      { schemaVersion: 1, status: 'candidate' },
      { fs: fsProxy, subject: 'POL-TEST' },
    ),
    (error) => error?.code === 'SYMLINK_BLOCKED',
  );
  assert.equal(swapped, true);
  assert.equal(fs.existsSync(path.join(outside, 'result.json')), false);
});

test('artifact replacement restores prior bytes when its parent is swapped', (t) => {
  const state = makeProject(t, 'safety-final-rename-parent-swap');
  const parent = governancePath(
    state.project,
    '.agent-governance/generated',
  );
  const outside = path.join(state.sandbox, 'outside-replaced');
  const relative = '.agent-governance/generated/result.json';
  const target = governancePath(state.project, relative);
  const original = { schemaVersion: 1, status: 'planned' };
  writeJsonArtifact(state.project, relative, original, {
    subject: 'POL-TEST',
  });
  const originalBytes = fs.readFileSync(target);
  let swapped = false;
  const fsProxy = new Proxy(fs, {
    get(targetFs, property) {
      if (property === 'renameSync') {
        return (source, destination) => {
          if (
            !swapped
            && destination === target
            && String(source).endsWith('.tmp')
          ) {
            fs.renameSync(parent, outside);
            fs.symlinkSync(outside, parent);
            swapped = true;
          }
          return fs.renameSync(source, destination);
        };
      }
      const value = Reflect.get(targetFs, property);
      return typeof value === 'function'
        ? value.bind(targetFs)
        : value;
    },
  });

  assert.throws(
    () => writeJsonArtifact(
      state.project,
      relative,
      { schemaVersion: 1, status: 'active' },
      {
        allowReplace: true,
        fs: fsProxy,
        subject: 'POL-TEST',
      },
    ),
    (error) => error?.code === 'SYMLINK_BLOCKED',
  );
  assert.equal(swapped, true);
  assert.deepEqual(fs.readFileSync(path.join(outside, 'result.json')), originalBytes);
  assert.deepEqual(fs.readdirSync(outside), ['result.json']);
});

test('input reads reject a parent directory swap before descriptor open', (t) => {
  const state = makeProject(t, 'safety-read-parent-swap');
  const relative = '.agent-governance/input/record.json';
  const absolute = governancePath(state.project, relative);
  const parent = path.dirname(absolute);
  const moved = `${parent}-moved`;
  writeJson(absolute, { schemaVersion: 1, value: 'bounded' });
  let swapped = false;
  const fsProxy = new Proxy(fs, {
    get(target, property) {
      if (property === 'openSync') {
        return (file, ...args) => {
          if (!swapped && file === absolute) {
            swapped = true;
            fs.renameSync(parent, moved);
            fs.symlinkSync(moved, parent);
          }
          return fs.openSync(file, ...args);
        };
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  assert.throws(
    () => readJsonArtifact(state.project, relative, {
      fs: fsProxy,
      subject: 'RISK-001',
    }),
    (error) => error?.code === 'SYMLINK_BLOCKED',
  );
});
