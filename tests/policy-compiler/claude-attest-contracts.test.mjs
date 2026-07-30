import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  assertSameSnapshot,
  makeProject,
  parseSingleJson,
  readJson,
  runCli,
  setCeiling,
  snapshotFiles,
  writeJson,
} from './helpers.mjs';

const CLAIM = 'PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED';

function compileArgs(project) {
  return ['compile', project, '--target', 'claude', '--json'];
}

function materializeArgs(project) {
  return ['materialize', project, '--target', 'claude', '--json'];
}

function attestArgs(project, ...extra) {
  return ['attest', project, '--target', 'claude', ...extra, '--json'];
}

function targetFile(project) {
  return path.join(project, '.claude', 'settings.json');
}

function localFile(project) {
  return path.join(project, '.claude', 'settings.local.json');
}

function prepared(state) {
  assert.equal(runCli(state, compileArgs(state.project)).status, 0);
  return parseSingleJson(runCli(state, materializeArgs(state.project)), 0);
}

function writeSettings(project, value) {
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  fs.writeFileSync(
    targetFile(project),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
}

test('attest reports the claude project layer and never claims runtime enforcement', (t) => {
  const state = makeProject(t, 'claude-attest-clean');
  const materialized = prepared(state);
  const snapshot = snapshotFiles(state.project);
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);

  assert.equal(output.ok, true);
  assert.equal(output.result.claim, CLAIM);
  assert.equal(output.result.level, 'materialized-unverified');
  assert.equal(output.result.trustStateObserved, 'unknown');
  assert.equal(output.result.target, 'claude');
  assert.equal(output.result.materializeId, materialized.result.materializeId);
  assert.deepEqual(output.result.drift, []);
  assert.deepEqual(output.result.observations, []);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('no argument or environment variable can raise the claude level', (t) => {
  const state = makeProject(t, 'claude-attest-downgrade');
  prepared(state);

  for (const extra of [['--level', 'project-layer-observed'], ['--force']]) {
    const output = parseSingleJson(
      runCli(state, ['attest', state.project, '--target', 'claude', ...extra, '--json']),
      2,
    );
    assert.equal(output.code, 'CLI_USAGE_ERROR');
  }
  const output = parseSingleJson(
    runCli(state, attestArgs(state.project), {
      env: { GOVERNSEED_ATTEST_LEVEL: 'project-layer-observed' },
    }),
    0,
  );
  assert.equal(output.result.level, 'materialized-unverified');
});

test('the claude precedence caveat states the documented layer order', (t) => {
  const state = makeProject(t, 'claude-attest-caveats');
  prepared(state);
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  const caveats = output.result.precedenceCaveat.join('\n');

  assert.ok(output.result.precedenceCaveat.length >= 1);
  assert.ok(output.result.knownLimitations.length >= 1);
  for (const pattern of [
    /managed/iu,
    /command line/iu,
    /settings\.local\.json/u,
    /~\/\.claude\/settings\.json/u,
    /merge/iu,
    /trust/iu,
  ]) {
    assert.match(caveats, pattern);
  }
  assert.equal(
    caveats.includes('.codex/config.toml'),
    false,
    'the codex caveats must not leak into the claude attestation',
  );
  for (const entry of output.result.knownLimitations) {
    assert.match(entry.source, /claude/iu);
    assert.match(entry.note, /\S/u);
  }
});

test('the classification breakdown comes from the compiled claude adapter', (t) => {
  const state = makeProject(t, 'claude-attest-classification');
  prepared(state);
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  const adapter = readJson(path.join(
    state.project,
    '.agent-governance/adapters/claude',
    `${output.result.policyId}.json`,
  ));

  const expected = {};
  for (const control of [...adapter.mappedControls, ...adapter.unsupportedControls]) {
    expected[control.support] = (expected[control.support] ?? 0) + 1;
  }
  for (const [support, count] of Object.entries(expected)) {
    assert.equal(output.result.classificationBreakdown[support], count);
  }
  assert.equal(output.result.declared, 12);
  assert.equal(
    Object.values(output.result.materializationBreakdown)
      .reduce((sum, count) => sum + count, 0),
    12,
  );
});

test('a removed required deny or ask entry is drift', (t) => {
  const state = makeProject(t, 'claude-attest-entry-missing');
  prepared(state);
  const settings = readJson(targetFile(state.project));
  settings.permissions.ask = settings.permissions.ask.filter(
    (entry) => entry !== 'PowerShell',
  );
  writeSettings(state.project, settings);
  const snapshot = snapshotFiles(state.project);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  const reported = output.findings.find(
    (entry) => entry.code === 'TARGET_SETTINGS_ENTRY_MISSING',
  );
  assert.ok(reported, 'the missing entry must be named');
  assert.match(reported.subject, /PowerShell/u);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('extra deny entries are additional restrictions, not drift, and are never removed', (t) => {
  const state = makeProject(t, 'claude-attest-extra-entries');
  prepared(state);
  const settings = readJson(targetFile(state.project));
  settings.permissions.deny = ['Bash(rm -rf *)'];
  writeSettings(state.project, settings);
  const before = fs.readFileSync(targetFile(state.project));

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  assert.deepEqual(output.result.drift, []);
  const observed = output.result.observations.find(
    (entry) => entry.reason === 'TARGET_SETTINGS_ADDITIONAL_RESTRICTION',
  );
  assert.ok(observed, 'an extra restriction must be reported, not ignored');
  assert.match(observed.subject, /permissions\.deny/u);
  assert.deepEqual(fs.readFileSync(targetFile(state.project)), before);
});

test('a changed governed scalar is drift', (t) => {
  const state = makeProject(t, 'claude-attest-scalar-drift');
  prepared(state);
  const settings = readJson(targetFile(state.project));
  settings.permissions.disableBypassPermissionsMode = 'enable';
  writeSettings(state.project, settings);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  assert.ok(
    output.findings.some(
      (entry) => entry.code === 'TARGET_SETTINGS_SCALAR_CHANGED',
    ),
  );
});

test('an unrelated key added by a human is neither drift nor an observation', (t) => {
  const state = makeProject(t, 'claude-attest-unrelated-key');
  prepared(state);
  const settings = readJson(targetFile(state.project));
  settings.model = 'opus';
  writeSettings(state.project, settings);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  assert.deepEqual(output.result.drift, []);
  assert.deepEqual(output.result.observations, []);
});

test('a removed settings file is drift', (t) => {
  const state = makeProject(t, 'claude-attest-removed');
  prepared(state);
  fs.rmSync(targetFile(state.project));

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  assert.ok(
    output.findings.some((entry) => entry.code === 'TARGET_SETTINGS_REMOVED'),
  );
});

test('an unparseable settings file is drift, not a silent pass', (t) => {
  const state = makeProject(t, 'claude-attest-unparseable');
  prepared(state);
  fs.writeFileSync(targetFile(state.project), '{ broken\n', 'utf8');

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  assert.ok(
    output.findings.some(
      (entry) => entry.code === 'TARGET_SETTINGS_UNPARSEABLE',
    ),
  );
});

test('a policy compiled after materialize is stale, not silently accepted', (t) => {
  const state = makeProject(t, 'claude-attest-stale');
  prepared(state);
  setCeiling(state.project, 'filesystem.project-write', 'deny');
  assert.equal(runCli(state, compileArgs(state.project)).status, 0);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  assert.ok(
    output.findings.some(
      (entry) => entry.code === 'TARGET_SETTINGS_STALE_POLICY',
    ),
  );
});

test('a planted settings.local.json is reported as shadowing the governed scalars only', (t) => {
  const state = makeProject(t, 'claude-attest-local-shadow');
  prepared(state);
  fs.writeFileSync(
    localFile(state.project),
    `${JSON.stringify({ model: 'opus' }, null, 2)}\n`,
    'utf8',
  );

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  const observed = output.result.observations.find(
    (entry) => entry.reason === 'TARGET_SETTINGS_LOCAL_SCOPE_PRESENT',
  );
  assert.ok(observed, 'a gitignored higher-precedence file must be reported');
  assert.match(observed.subject, /settings\.local\.json/u);
  assert.deepEqual(
    output.result.drift,
    [],
    'permission rules merge across scopes, so a local file cannot remove a governed entry',
  );
  assert.ok(
    output.findings.some(
      (entry) => entry.code === 'TARGET_SETTINGS_LOCAL_SCOPE_PRESENT',
    ),
    'the observation must reach the CLI findings',
  );
});

test('a settings.local.json that overrides a governed scalar is drift', (t) => {
  const state = makeProject(t, 'claude-attest-local-override');
  prepared(state);
  writeJson(localFile(state.project), {
    permissions: { disableAutoMode: 'enable' },
  });

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  const reported = output.findings.find(
    (entry) => entry.code === 'TARGET_SETTINGS_LOCAL_SCOPE_OVERRIDES_SCALAR',
  );
  assert.ok(reported);
  assert.match(reported.subject, /permissions\.disableAutoMode/u);
});

test('attest without a claude materialize receipt needs input', (t) => {
  const state = makeProject(t, 'claude-attest-no-receipt');
  assert.equal(runCli(state, compileArgs(state.project)).status, 0);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 1);
  assert.equal(output.code, 'MATERIALIZE_RECEIPT_MISSING');
});

test('a codex receipt is not accepted as a claude attestation', (t) => {
  const state = makeProject(t, 'claude-attest-wrong-target-receipt');
  assert.equal(
    runCli(state, ['compile', state.project, '--target', 'codex', '--json']).status,
    0,
  );
  parseSingleJson(
    runCli(state, ['materialize', state.project, '--target', 'codex', '--json']),
    0,
  );
  assert.equal(runCli(state, compileArgs(state.project)).status, 0);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 1);
  assert.equal(output.code, 'MATERIALIZE_RECEIPT_MISSING');
});

test('attest is read-only: two claude runs leave the project byte-identical', (t) => {
  const state = makeProject(t, 'claude-attest-read-only');
  prepared(state);
  const snapshot = snapshotFiles(state.project);
  parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});
