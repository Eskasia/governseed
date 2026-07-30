import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  assertSameSnapshot,
  makeProject,
  makeRuntimeGuard,
  parseSingleJson,
  readJson,
  runCli,
  setCeiling,
  snapshotFiles,
  writeJson,
} from './helpers.mjs';

const TARGET = '.claude/settings.json';

function compileArgs(project, ...extra) {
  return ['compile', project, '--target', 'claude', ...extra, '--json'];
}

function materializeArgs(project, ...extra) {
  return ['materialize', project, '--target', 'claude', ...extra, '--json'];
}

function targetFile(project) {
  return path.join(project, '.claude', 'settings.json');
}

function localFile(project) {
  return path.join(project, '.claude', 'settings.local.json');
}

function compiled(state) {
  const result = runCli(state, compileArgs(state.project));
  assert.equal(result.status, 0, result.stdout + result.stderr);
  return parseSingleJson(result, 0);
}

function listReceipts(project) {
  const directory = path.join(project, '.agent-governance', 'receipts');
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => name.startsWith('MAT-'))
    .sort();
}

function writeExistingSettings(project, value) {
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  fs.writeFileSync(
    targetFile(project),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

test('materialize writes .claude/settings.json and a receipt for the claude target', (t) => {
  const state = makeProject(t, 'claude-materialize-clean');
  compiled(state);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );

  assert.equal(output.ok, true);
  assert.equal(output.status, 'target-materialized');
  assert.equal(output.result.target, 'claude');
  assert.equal(output.result.dryRun, false);
  assert.match(output.result.materializeId, /^MAT-[0-9A-F]{12}$/u);
  assert.equal(output.result.trustStateObserved, 'unknown');
  assert.equal(output.result.ownership.artifactType, 'claude-project-settings');
  assert.equal(
    output.artifact,
    `.agent-governance/receipts/${output.result.materializeId}.json`,
  );
  assert.deepEqual(output.result.filesCreated.sort(), [
    `.agent-governance/receipts/${output.result.materializeId}.json`,
    TARGET,
  ].sort());

  const bytes = fs.readFileSync(targetFile(state.project), 'utf8');
  assert.equal(bytes.endsWith('\n'), true);
  assert.equal(bytes.includes('\r'), false);
  assert.deepEqual(JSON.parse(bytes), {
    permissions: {
      ask: ['Bash', 'PowerShell'],
      disableAutoMode: 'disable',
      disableBypassPermissionsMode: 'disable',
    },
  });
});

test('the emitted settings file is restriction-only and grants nothing', (t) => {
  const state = makeProject(t, 'claude-materialize-restriction-only');
  setCeiling(state.project, 'filesystem.project-write', 'deny');
  compiled(state);
  parseSingleJson(runCli(state, materializeArgs(state.project)), 0);
  const settings = readJson(targetFile(state.project));

  assert.equal('allow' in settings.permissions, false);
  assert.equal('additionalDirectories' in settings.permissions, false);
  assert.equal('defaultMode' in settings.permissions, false);
  assert.deepEqual(settings.permissions.deny, ['Edit', 'NotebookEdit', 'Write']);
  assert.equal(settings.permissions.disableAutoMode, 'disable');
  assert.equal(settings.permissions.disableBypassPermissionsMode, 'disable');
});

test('ownership is recorded in the receipt and never as a marker key in the file', (t) => {
  const state = makeProject(t, 'claude-materialize-ownership');
  compiled(state);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );

  assert.deepEqual(output.result.ownedEntries, [
    { key: 'permissions.ask', entries: ['Bash', 'PowerShell'] },
  ]);
  assert.deepEqual(output.result.ownedScalars, [
    { key: 'permissions.disableAutoMode', value: 'disable' },
    { key: 'permissions.disableBypassPermissionsMode', value: 'disable' },
  ]);

  const bytes = fs.readFileSync(targetFile(state.project), 'utf8');
  for (const marker of ['GovernSeed', 'governSeed', 'materializeId', 'policyId']) {
    assert.equal(
      bytes.includes(marker),
      false,
      `${marker} must not appear in a file Claude Code validates against its own schema`,
    );
  }
});

test('a second materialize run writes nothing and produces no second receipt', (t) => {
  const state = makeProject(t, 'claude-materialize-idempotent');
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
  assert.deepEqual(listReceipts(state.project), [
    `${first.result.materializeId}.json`,
  ]);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('dry-run performs every check and writes nothing at all', (t) => {
  const state = makeProject(t, 'claude-materialize-dry-run');
  compiled(state);
  const snapshot = snapshotFiles(state.project);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project, '--dry-run')),
    0,
  );

  assert.equal(output.status, 'dry-run');
  assert.equal(output.result.dryRun, true);
  assert.equal(fs.existsSync(path.join(state.project, '.claude')), false);
  assert.deepEqual(listReceipts(state.project), []);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));

  const wet = parseSingleJson(runCli(state, materializeArgs(state.project)), 0);
  assert.equal(
    wet.result.materializeId,
    output.result.materializeId,
    'identity must not depend on bytes that do not exist during a dry run',
  );
});

test('hand-written deny entries in an existing settings file are all preserved', (t) => {
  const state = makeProject(t, 'claude-materialize-merge');
  setCeiling(state.project, 'filesystem.project-write', 'deny');
  compiled(state);
  writeExistingSettings(state.project, {
    $schema: 'https://json.schemastore.org/claude-code-settings.json',
    permissions: {
      deny: ['Bash(rm -rf *)', 'Write'],
      allow: ['Read'],
    },
    model: 'opus',
  });

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );
  const settings = readJson(targetFile(state.project));

  assert.deepEqual(output.result.filesUpdated, [TARGET]);
  assert.equal(settings.model, 'opus');
  assert.equal(
    settings.$schema,
    'https://json.schemastore.org/claude-code-settings.json',
  );
  assert.deepEqual(
    settings.permissions.allow,
    ['Read'],
    'an entry GovernSeed does not own is never removed, even one that grants',
  );
  for (const entry of ['Bash(rm -rf *)', 'Write']) {
    assert.ok(
      settings.permissions.deny.includes(entry),
      `${entry} was written by a human and must survive`,
    );
  }
  for (const entry of ['Edit', 'NotebookEdit', 'Write']) {
    assert.ok(settings.permissions.deny.includes(entry));
  }
  assert.deepEqual(
    output.result.ownedEntries.find(
      (entry) => entry.key === 'permissions.deny',
    ),
    { key: 'permissions.deny', entries: ['Edit', 'NotebookEdit', 'Write'] },
    'the receipt records only what GovernSeed requires, not what it found',
  );
});

test('a conflicting scalar fails closed and names both values', (t) => {
  const state = makeProject(t, 'claude-materialize-scalar-conflict');
  compiled(state);
  writeExistingSettings(state.project, {
    permissions: { disableAutoMode: 'enable' },
  });
  const snapshot = snapshotFiles(state.project);

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.equal(output.ok, false);
  assert.equal(output.code, 'TARGET_SETTINGS_SCALAR_CONFLICT');
  const reported = output.findings.find(
    (entry) => entry.code === 'TARGET_SETTINGS_SCALAR_CONFLICT',
  );
  assert.ok(reported, 'the conflict must be reported as a finding');
  assert.match(reported.subject, /permissions\.disableAutoMode/u);
  assert.match(
    reported.subject,
    /"enable".*"disable"|"disable".*"enable"/u,
    'a human resolving this needs both the found value and the required one',
  );
  assert.deepEqual(listReceipts(state.project), []);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('an unparseable existing settings file is refused, never replaced', (t) => {
  const state = makeProject(t, 'claude-materialize-unparseable');
  compiled(state);
  const broken = '{ "permissions": { "deny": ["Write",] }\n';
  fs.mkdirSync(path.join(state.project, '.claude'), { recursive: true });
  fs.writeFileSync(targetFile(state.project), broken, 'utf8');

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'TARGET_SETTINGS_UNPARSEABLE');
  assert.equal(
    fs.readFileSync(targetFile(state.project), 'utf8'),
    broken,
    'Claude Code rejects an invalid project settings file as a whole, so overwriting one is fail-open',
  );
  assert.deepEqual(listReceipts(state.project), []);
});

test('materialize writes only the project settings file, never the local or user-global scope', (t) => {
  const state = makeProject(t, 'claude-materialize-local-only');
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
  assert.deepEqual(
    fs.readdirSync(path.join(state.project, '.claude')).sort(),
    ['settings.json'],
  );
  assert.equal(fs.existsSync(localFile(state.project)), false);
});

test('an existing settings.local.json is never read as ownership and never written', (t) => {
  const state = makeProject(t, 'claude-materialize-local-untouched');
  compiled(state);
  const local = { permissions: { deny: ['Bash'] } };
  fs.mkdirSync(path.join(state.project, '.claude'), { recursive: true });
  fs.writeFileSync(
    localFile(state.project),
    `${JSON.stringify(local, null, 2)}\n`,
    'utf8',
  );
  const before = fs.readFileSync(localFile(state.project));

  parseSingleJson(runCli(state, materializeArgs(state.project)), 0);
  assert.deepEqual(fs.readFileSync(localFile(state.project)), before);
});

test('materialize refuses a settings path that is a symlink', (t) => {
  const state = makeProject(t, 'claude-materialize-symlink');
  compiled(state);
  const outside = path.join(state.sandbox, 'outside.json');
  fs.writeFileSync(outside, '{}\n', 'utf8');
  fs.mkdirSync(path.join(state.project, '.claude'), { recursive: true });
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
  assert.equal(fs.readFileSync(outside, 'utf8'), '{}\n');
});

test('a sandbox-protected .claude directory is a named refusal', (t) => {
  if (process.platform === 'win32' || process.getuid?.() === 0) {
    t.skip('POSIX permission semantics required; reported rather than silent');
    return;
  }
  const state = makeProject(t, 'claude-materialize-protected');
  compiled(state);
  const directory = path.join(state.project, '.claude');
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
    fs.chmodSync(directory, 0o700);
  }
});

test('the network control is deferred with a reason, never approximated as a Bash deny', (t) => {
  const state = makeProject(t, 'claude-materialize-network-blocked');
  compiled(state);
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );

  const unmaterialized = new Map(
    output.result.unmaterializedControls.map((entry) => [entry.controlId, entry]),
  );
  const network = unmaterialized.get('POL-NETWORK');
  assert.ok(network, 'the network control must be reported, not dropped');
  assert.equal(network.materializationStatus, 'deferred');
  assert.equal(network.reasonCode, 'CLAUDE_NO_PROJECT_LAYER_SURFACE');
  assert.match(network.source, /BLOCKED/u);

  const bytes = fs.readFileSync(targetFile(state.project), 'utf8');
  assert.equal(bytes.includes('curl'), false);
  assert.equal(bytes.includes('WebFetch'), false);

  const declared = output.result.materializedControls.length
    + output.result.unmaterializedControls.length;
  assert.equal(declared, 12);
});

test('a codex materialization and a claude materialization coexist untouched', (t) => {
  const state = makeProject(t, 'claude-materialize-coexist');
  assert.equal(
    runCli(state, ['compile', state.project, '--target', 'codex', '--json']).status,
    0,
  );
  parseSingleJson(
    runCli(state, ['materialize', state.project, '--target', 'codex', '--json']),
    0,
  );
  const codexBytes = fs.readFileSync(
    path.join(state.project, '.codex', 'config.toml'),
  );

  compiled(state);
  parseSingleJson(runCli(state, materializeArgs(state.project)), 0);

  assert.deepEqual(
    fs.readFileSync(path.join(state.project, '.codex', 'config.toml')),
    codexBytes,
  );
  assert.equal(listReceipts(state.project).length, 2);
});

test('materialize without a compiled claude policy needs input rather than guessing', (t) => {
  const state = makeProject(t, 'claude-materialize-uncompiled');
  assert.equal(
    runCli(state, ['compile', state.project, '--target', 'codex', '--json']).status,
    0,
  );
  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    1,
  );
  assert.equal(output.code, 'POLICY_NOT_COMPILED');
  assert.equal(fs.existsSync(targetFile(state.project)), false);
});

test('CRLF governed input produces byte-identical claude settings output', (t) => {
  const lf = makeProject(t, 'claude-materialize-lf');
  const crlf = makeProject(t, 'claude-materialize-crlf');
  for (const relative of [
    '.agent-governance/risk-profile.json',
    '.agent-governance/role-assignments/TASK-001.json',
  ]) {
    const file = path.join(crlf.project, ...relative.split('/'));
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

test('a tampered receipt at the same identity is invalid rather than trusted', (t) => {
  const state = makeProject(t, 'claude-materialize-tampered-receipt');
  compiled(state);
  const first = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    0,
  );
  const file = path.join(
    state.project,
    '.agent-governance/receipts',
    `${first.result.materializeId}.json`,
  );
  const receipt = readJson(file);
  receipt.ownedScalars = [];
  writeJson(file, receipt);

  const output = parseSingleJson(
    runCli(state, materializeArgs(state.project)),
    3,
  );
  assert.equal(output.code, 'MATERIALIZE_RECEIPT_INVALID');
});
