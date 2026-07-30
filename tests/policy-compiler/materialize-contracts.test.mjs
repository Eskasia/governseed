import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  assertSameSnapshot,
  compileArgs,
  governancePath,
  makeProject,
  makeRuntimeGuard,
  parseSingleJson,
  requestCapability,
  runCli,
  setCeiling,
  snapshotFiles,
} from './helpers.mjs';

const TARGET = '.codex/config.toml';

function materializeArgs(project, ...extra) {
  return ['materialize', project, '--target', 'codex', ...extra, '--json'];
}

function compiled(state) {
  const result = runCli(state, compileArgs(state.project));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return parseSingleJson(result, 0);
}

function targetFile(project) {
  return path.join(project, '.codex', 'config.toml');
}

function receiptFor(project, materializeId) {
  return governancePath(
    project,
    `.agent-governance/receipts/${materializeId}.json`,
  );
}

// Compile writes COMPILE- receipts to the same directory, so only MAT- entries
// answer "did materialize write a receipt".
function listReceipts(project) {
  const directory = governancePath(project, '.agent-governance/receipts');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.startsWith('MAT-'))
    .sort();
}

test('materialize writes one project-local target file and a receipt', (t) => {
  const state = makeProject(t, 'materialize-clean');
  compiled(state);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );

  assert.equal(output.ok, true);
  assert.equal(output.status, 'target-materialized');
  assert.equal(output.result.target, 'codex');
  assert.equal(output.result.dryRun, false);
  assert.equal(output.result.status, 'target-materialized');
  assert.match(output.result.materializeId, /^MAT-[0-9A-F]{12}$/u);
  assert.equal(output.result.trustStateObserved, 'unknown');
  assert.equal(output.artifact, `.agent-governance/receipts/${output.result.materializeId}.json`);

  const bytes = fs.readFileSync(targetFile(state.project), 'utf8');
  assert.match(bytes, /^# GovernSeed target-materialized configuration\./u);
  assert.equal(bytes.endsWith('\n'), true);
  assert.equal(bytes.endsWith('\n\n'), false);
  assert.equal(bytes.includes('\r'), false);
  assert.equal(/[ \t]+\n/u.test(bytes), false);

  assert.deepEqual(output.result.filesCreated.sort(), [
    '.agent-governance/receipts/' + output.result.materializeId + '.json',
    TARGET,
  ].sort());
  assert.ok(fs.existsSync(receiptFor(state.project, output.result.materializeId)));
});

test('the emitted target file is restriction-only for the base policy', (t) => {
  const state = makeProject(t, 'materialize-values');
  compiled(state);
  parseSingleJson(runCli(state, materializeArgs(state.project)), 0);
  const bytes = fs.readFileSync(targetFile(state.project), 'utf8');

  assert.equal(bytes.includes('danger-full-access'), false);
  assert.equal(bytes.includes('approval_policy = "never"'), false);
  assert.equal(bytes.includes('network_access = true'), false);
  assert.match(bytes, /^approval_policy = "untrusted"$/mu);
  assert.match(bytes, /^sandbox_mode = "workspace-write"$/mu);
  assert.match(bytes, /^network_access = false$/mu);
  assert.match(bytes, /^writable_roots = \[\]$/mu);
});

test('a second materialize run writes nothing and reports no change', (t) => {
  const state = makeProject(t, 'materialize-idempotent');
  compiled(state);
  const first = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );
  const snapshot = snapshotFiles(state.project);
  const second = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );

  assert.equal(second.result.materializeId, first.result.materializeId);
  assert.deepEqual(second.result.filesCreated, []);
  assert.deepEqual(second.result.filesUpdated, []);
  assert.equal(second.result.filesUnchanged.includes(TARGET), true);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('materializeId is derived from the compiled policy, never from the emitted bytes', (t) => {
  const state = makeProject(t, 'materialize-identity');
  compiled(state);
  const dry = parseSingleJson(
    runCli(state, materializeArgs(state.project, '--dry-run')),
    0,
  );
  assert.equal(fs.existsSync(targetFile(state.project)), false);

  const wet = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );
  assert.equal(
    wet.result.materializeId,
    dry.result.materializeId,
    'identity must not depend on bytes that do not exist during a dry run',
  );
  const bytes = fs.readFileSync(targetFile(state.project), 'utf8');
  assert.equal(bytes.includes(wet.result.materializeId), true);
});

test('dry-run performs every check and writes nothing at all', (t) => {
  const state = makeProject(t, 'materialize-dry-run');
  compiled(state);
  const snapshot = snapshotFiles(state.project);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project, '--dry-run')),
    0,
  );

  assert.equal(output.status, 'dry-run');
  assert.equal(output.result.dryRun, true);
  assert.equal(output.result.status, 'dry-run');
  assert.equal(fs.existsSync(path.join(state.project, '.codex')), false);
  assert.deepEqual(listReceipts(state.project), []);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('a foreign target file is an owner conflict and is left byte-identical', (t) => {
  const state = makeProject(t, 'materialize-owner-conflict');
  compiled(state);
  const original = '# hand written\nsandbox_mode = "read-only"\n';
  fs.mkdirSync(path.join(state.project, '.codex'), { recursive: true });
  fs.writeFileSync(targetFile(state.project), original, 'utf8');

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.equal(output.ok, false);
  assert.equal(output.code, 'TARGET_SETTINGS_OWNER_CONFLICT');
  assert.equal(fs.readFileSync(targetFile(state.project), 'utf8'), original);
  assert.deepEqual(listReceipts(state.project), []);
});

test('re-materializing over GovernSeed-owned bytes from an earlier policy updates them', (t) => {
  const state = makeProject(t, 'materialize-reown');
  compiled(state);
  parseSingleJson(runCli(state, materializeArgs(state.project)), 0);

  setCeiling(state.project, 'filesystem.project-write', 'deny');
  compiled(state);

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );
  assert.deepEqual(output.result.filesUpdated, [TARGET]);
  assert.match(
    fs.readFileSync(targetFile(state.project), 'utf8'),
    /^sandbox_mode = "read-only"$/mu,
  );
});

test('unsupported and deferred controls are reported, never silently dropped', (t) => {
  const state = makeProject(t, 'materialize-partial-support');
  compiled(state);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );

  const unmaterialized = new Map(
    output.result.unmaterializedControls.map((entry) => [entry.controlId, entry]),
  );
  for (const controlId of [
    'POL-CREDENTIALS',
    'POL-RETENTION',
    'POL-SHELL-EXECUTION',
    'POL-EXTERNAL-CONTENT',
    'POL-FILESYSTEM-PROJECT-READ',
    'POL-GENERATED-ARTIFACTS',
    'POL-VERIFICATION',
  ]) {
    assert.ok(unmaterialized.has(controlId), `${controlId} must be reported`);
    assert.match(unmaterialized.get(controlId).reasonCode, /^[A-Z][A-Z0-9_]*$/u);
    assert.ok(
      ['not-applicable', 'deferred'].includes(
        unmaterialized.get(controlId).materializationStatus,
      ),
    );
  }

  const declared = output.result.materializedControls.length
    + output.result.unmaterializedControls.length;
  assert.equal(declared, 12);
});

test('a deny control target-materialized as an approval gate says so in machine-readable output', (t) => {
  const state = makeProject(t, 'materialize-deny-gate');
  compiled(state);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );

  const byId = new Map(
    output.result.materializedControls.map((entry) => [entry.controlId, entry]),
  );
  for (const controlId of ['POL-DESTRUCTIVE-ACTIONS', 'POL-PUBLISH-ACTIONS']) {
    const entry = byId.get(controlId);
    assert.ok(entry, `${controlId} must be target-materialized`);
    assert.equal(entry.mode, 'deny');
    assert.deepEqual(entry.nativeKeys, ['approval_policy']);
    assert.equal(
      entry.modeCoverage,
      'approval-gate-only',
      'a deny written as an approval prompt must not read as full coverage',
    );
  }
  for (const controlId of ['POL-NETWORK', 'POL-FILESYSTEM-ROOT-WRITE']) {
    assert.equal(byId.get(controlId).modeCoverage, 'full');
  }
});

test('a policy that would widen a key fails closed and writes nothing', (t) => {
  const state = makeProject(t, 'materialize-would-widen');
  compiled(state);
  setCeiling(state.project, 'filesystem.root-write', 'allow');
  requestCapability(state.project, 'filesystem.root-write');
  compiled(state);
  const snapshot = snapshotFiles(state.project);

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'MATERIALIZE_WOULD_WIDEN');
  assert.equal(fs.existsSync(targetFile(state.project)), false);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('a project-tree permission profile blocks materialize before any write', (t) => {
  const state = makeProject(t, 'materialize-profile-conflict');
  compiled(state);
  fs.mkdirSync(path.join(state.project, '.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(state.project, '.codex/other.toml'),
    'unused\n',
    'utf8',
  );
  fs.mkdirSync(path.join(state.project, 'nested/.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(state.project, 'nested/.codex/config.toml'),
    'default_permissions = ":read-only"\n',
    'utf8',
  );

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'TARGET_SETTINGS_PROFILE_MODEL_CONFLICT');
  assert.equal(fs.existsSync(targetFile(state.project)), false);
  assert.deepEqual(listReceipts(state.project), []);
});

test('a [permissions table anywhere in the project tree also blocks materialize', (t) => {
  const state = makeProject(t, 'materialize-permissions-table');
  compiled(state);
  fs.mkdirSync(path.join(state.project, 'sub/.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(state.project, 'sub/.codex/config.toml'),
    '[permissions.strict.filesystem]\n":minimal" = "read"\n',
    'utf8',
  );

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'TARGET_SETTINGS_PROFILE_MODEL_CONFLICT');
  assert.equal(fs.existsSync(targetFile(state.project)), false);
});

test('a nearer config file blocks materialize instead of producing an inert file', (t) => {
  const state = makeProject(t, 'materialize-shadowed');
  compiled(state);
  fs.mkdirSync(path.join(state.project, 'service/.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(state.project, 'service/.codex/config.toml'),
    'sandbox_mode = "workspace-write"\n',
    'utf8',
  );

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'TARGET_SETTINGS_SHADOWED');
  assert.equal(fs.existsSync(targetFile(state.project)), false);
  assert.deepEqual(listReceipts(state.project), []);
});

test('a sandbox-protected target path is a named refusal, not a generic I/O error', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('POSIX permission semantics required; reported rather than silent');
    return;
  }
  const state = makeProject(t, 'materialize-protected-path');
  compiled(state);
  const directory = path.join(state.project, '.codex');
  fs.mkdirSync(directory, { recursive: true });
  fs.chmodSync(directory, 0o500);
  try {
    const output = parseSingleJson(
      runCli(state, materializeArgs(state.project)),
      4,
    );
    assert.equal(output.code, 'MATERIALIZE_TARGET_PATH_PROTECTED');
    assert.equal(fs.existsSync(targetFile(state.project)), false);
    assert.deepEqual(listReceipts(state.project), []);
  } finally {
    // Restored inline: the sandbox cleanup hook registered by makeProject runs
    // before any hook registered here.
    fs.chmodSync(directory, 0o700);
  }
});

test('materialize refuses a target path that is a symlink', (t) => {
  const state = makeProject(t, 'materialize-symlink');
  compiled(state);
  const outside = path.join(state.sandbox, 'outside.toml');
  fs.writeFileSync(outside, 'sandbox_mode = "read-only"\n', 'utf8');
  fs.mkdirSync(path.join(state.project, '.codex'), { recursive: true });
  try {
    fs.symlinkSync(outside, targetFile(state.project));
  } catch {
    t.skip('symlink creation is unavailable in this environment');
    return;
  }

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.ok(
    ['MATERIALIZE_PATH_BLOCKED', 'SYMLINK_BLOCKED'].includes(output.code),
    `unexpected code ${output.code}`,
  );
  assert.equal(fs.readFileSync(outside, 'utf8'), 'sandbox_mode = "read-only"\n');
});

test('materialize without a compiled policy needs input rather than guessing', (t) => {
  const state = makeProject(t, 'materialize-uncompiled');
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    1,
  );
  assert.equal(output.code, 'POLICY_NOT_COMPILED');
  assert.equal(fs.existsSync(targetFile(state.project)), false);
});

test('materialize rejects a non-codex target and any level argument', (t) => {
  const state = makeProject(t, 'materialize-usage');
  compiled(state);

  const target = parseSingleJson(
    runCli(state, ['materialize', state.project, '--target', 'claude', '--json']),
    2,
  );
  assert.equal(target.code, 'CLI_TARGET_UNSUPPORTED');

  const level = parseSingleJson(
    runCli(state, [
      'materialize',
      state.project,
      '--target',
      'codex',
      '--level',
      'project-layer-observed',
      '--json',
    ]),
    2,
  );
  assert.equal(level.code, 'CLI_USAGE_ERROR');
  assert.equal(fs.existsSync(targetFile(state.project)), false);
});

test('materialize writes nothing outside the project root, including user-global config', (t) => {
  const state = makeProject(t, 'materialize-local-only');
  compiled(state);
  const { guard, marker } = makeRuntimeGuard(state);
  fs.writeFileSync(marker, '', 'utf8');
  const outsideBefore = snapshotFiles(state.isolatedHome);

  const result = runCli(state, materializeArgs(state.project), {
    env: {
      NODE_OPTIONS: `--require ${guard}`,
      GOVERNSEED_TEST_GUARD_MARKER: marker,
    },
  });

  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.equal(fs.readFileSync(marker, 'utf8'), '');
  assertSameSnapshot(outsideBefore, snapshotFiles(state.isolatedHome));
});

test('materialize never writes the paths ADR-004 keeps closed', (t) => {
  const state = makeProject(t, 'materialize-closed-paths');
  compiled(state);
  parseSingleJson(runCli(state, materializeArgs(state.project)), 0);

  for (const relative of [
    '.codex/rules',
    'AGENTS.md.bak',
    'requirements.toml',
    '.codex/requirements.toml',
  ]) {
    assert.equal(
      fs.existsSync(path.join(state.project, relative)),
      false,
      `${relative} must not be created`,
    );
  }
  const agents = path.join(state.project, 'AGENTS.md');
  if (fs.existsSync(agents)) {
    assert.equal(
      fs.readFileSync(agents, 'utf8').includes('GovernSeed target-materialized'),
      false,
    );
  }
  assert.deepEqual(
    fs.readdirSync(path.join(state.project, '.codex')).sort(),
    ['config.toml'],
  );
});

test('CRLF governed input produces byte-identical target output', (t) => {
  const lf = makeProject(t, 'materialize-lf');
  const crlf = makeProject(t, 'materialize-crlf');
  for (const relative of [
    '.agent-governance/risk-profile.json',
    '.agent-governance/role-assignments/TASK-001.json',
  ]) {
    const file = governancePath(crlf.project, relative);
    fs.writeFileSync(
      file,
      fs.readFileSync(file, 'utf8').replaceAll('\n', '\r\n'),
      'utf8',
    );
  }
  compiled(lf);
  compiled(crlf);
  parseSingleJson(runCli(lf, materializeArgs(lf.project)), 0);
  parseSingleJson(runCli(crlf, materializeArgs(crlf.project)), 0);

  assert.deepEqual(
    fs.readFileSync(targetFile(crlf.project)),
    fs.readFileSync(targetFile(lf.project)),
  );
});

test('the emitted table is present only when the sandbox mode uses it', (t) => {
  const state = makeProject(t, 'materialize-table-scope');
  setCeiling(state.project, 'filesystem.project-write', 'deny');
  compiled(state);
  parseSingleJson(runCli(state, materializeArgs(state.project)), 0);

  const bytes = fs.readFileSync(targetFile(state.project), 'utf8');
  assert.match(bytes, /^sandbox_mode = "read-only"$/mu);
  assert.equal(
    bytes.includes('[sandbox_workspace_write]'),
    false,
    'a table with no documented effect under read-only must not be emitted',
  );
});

test('an absolute or traversing project argument cannot escape into the filesystem', (t) => {
  const state = makeProject(t, 'materialize-traversal');
  compiled(state);
  const outside = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'governseed-outside-'),
  );
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));

  const output = parseSingleJson(
    runCli(state, materializeArgs(path.join(state.project, '..', 'project', '..'))),
    1,
  );
  assert.equal(output.ok, false);
  assert.equal(fs.existsSync(path.join(outside, '.codex')), false);
});

test('compile still leaves the target file absent', (t) => {
  const state = makeProject(t, 'materialize-compile-boundary');
  compiled(state);
  assert.equal(fs.existsSync(targetFile(state.project)), false);
  assert.equal(fs.existsSync(path.join(state.project, '.codex')), false);
});
