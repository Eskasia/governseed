import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  assertSameSnapshot,
  compileArgs,
  governancePath,
  makeProject,
  parseSingleJson,
  readJson,
  runCli,
  snapshotFiles,
  writeJson,
} from './helpers.mjs';

const CLAIM = 'PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED';

function materializeArgs(project, ...extra) {
  return ['materialize', project, '--target', 'codex', ...extra, '--json'];
}

function attestArgs(project, ...extra) {
  return ['attest', project, '--target', 'codex', ...extra, '--json'];
}

function targetFile(project) {
  return path.join(project, '.codex', 'config.toml');
}

function prepared(state) {
  assert.equal(runCli(state, compileArgs(state.project)).status, 0);
  return parseSingleJson(runCli(state, materializeArgs(state.project)), 0);
}

function receiptPath(project, materializeId) {
  return governancePath(
    project,
    `.agent-governance/receipts/${materializeId}.json`,
  );
}

test('attest reports the project layer and never claims runtime enforcement', (t) => {
  const state = makeProject(t, 'attest-clean');
  const materialized = prepared(state);
  const snapshot = snapshotFiles(state.project);
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);

  assert.equal(output.ok, true);
  assert.equal(output.result.claim, CLAIM);
  assert.equal(output.result.level, 'materialized-unverified');
  assert.equal(output.result.trustStateObserved, 'unknown');
  assert.equal(output.result.target, 'codex');
  assert.equal(output.result.materializeId, materialized.result.materializeId);
  assert.deepEqual(output.result.drift, []);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('the reachable level is materialized-unverified and no argument can raise it', (t) => {
  const state = makeProject(t, 'attest-downgrade');
  prepared(state);

  for (const extra of [
    ['--level', 'project-layer-observed'],
    ['--level', 'runtime-evidenced'],
    ['--trust', 'trusted'],
    ['--force'],
  ]) {
    const output = parseSingleJson(
      runCli(state, ['attest', state.project, '--target', 'codex', ...extra, '--json']),
      2,
    );
    assert.equal(output.code, 'CLI_USAGE_ERROR');
  }

  for (const env of [
    { GOVERNSEED_TRUST_STATE: 'trusted' },
    { GOVERNSEED_ATTEST_LEVEL: 'project-layer-observed' },
  ]) {
    const output = parseSingleJson(
      runCli(state, attestArgs(state.project), { env }),
      0,
    );
    assert.equal(output.result.level, 'materialized-unverified');
    assert.equal(output.result.trustStateObserved, 'unknown');
  }
});

test('caveats and known limitations are populated, not placeholders', (t) => {
  const state = makeProject(t, 'attest-caveats');
  prepared(state);
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  const caveats = output.result.precedenceCaveat.join('\n');

  assert.ok(output.result.precedenceCaveat.length >= 1);
  assert.ok(output.result.knownLimitations.length >= 1);
  assert.match(caveats, /trust/iu);
  assert.match(caveats, /requirements\.toml/u);
  assert.match(caveats, /allowed_sandbox_modes/u);
  assert.match(caveats, /default_permissions/u);
  assert.match(caveats, /--config|command line/u);

  const notes = output.result.knownLimitations.map((entry) => entry.note).join('\n');
  assert.match(notes, /read-only/u);
  assert.match(notes, /approval/u);
  for (const entry of output.result.knownLimitations) {
    assert.match(entry.source, /\S/u);
    assert.match(entry.note, /\S/u);
  }
});

test('the classification breakdown comes from the compiled adapter', (t) => {
  const state = makeProject(t, 'attest-classification');
  prepared(state);
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  const adapterFile = governancePath(
    state.project,
    `.agent-governance/adapters/codex/${output.result.policyId}.json`,
  );
  const adapter = readJson(adapterFile);

  const expected = {};
  for (const control of adapter.mappedControls) {
    expected[control.support] = (expected[control.support] ?? 0) + 1;
  }
  for (const control of adapter.unsupportedControls) {
    expected[control.support] = (expected[control.support] ?? 0) + 1;
  }
  for (const [support, count] of Object.entries(expected)) {
    assert.equal(
      output.result.classificationBreakdown[support],
      count,
      `${support} must be counted from the adapter`,
    );
  }
  assert.equal(Array.isArray(output.result.classificationSourceDivergence), true);
  const shell = output.result.classificationSourceDivergence.find(
    (entry) => entry.controlId === 'POL-SHELL-EXECUTION',
  );
  assert.ok(shell, 'the known matrix/adapter divergence must be carried');
  assert.equal(shell.adapterValue, 'requires-human-approval');
  assert.equal(shell.matrixValue, 'representable-only');
});

test('counts are defined: declared, materialized and project-layer observed', (t) => {
  const state = makeProject(t, 'attest-counts');
  const materialized = prepared(state);
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 0);

  assert.equal(output.result.declared, 12);
  assert.equal(
    output.result.materialized,
    materialized.result.materializedControls.length,
  );
  assert.equal(
    output.result.declared - output.result.materialized,
    materialized.result.unmaterializedControls.length,
  );
  assert.equal(output.result.projectLayerObserved, output.result.materialized);

  const totals = Object.values(output.result.materializationBreakdown)
    .reduce((sum, count) => sum + count, 0);
  assert.equal(totals, output.result.declared);
});

test('a hand edit to the target file is drift, not a silent rewrite', (t) => {
  const state = makeProject(t, 'attest-drift');
  prepared(state);
  const before = fs.readFileSync(targetFile(state.project), 'utf8');
  fs.writeFileSync(
    targetFile(state.project),
    `${before}\n# edited by hand\n`,
    'utf8',
  );
  const snapshot = snapshotFiles(state.project);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.ok, false);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  assert.ok(
    output.findings.some(
      (entry) => entry.code === 'TARGET_SETTINGS_EDITED_OUTSIDE_GOVERNSEED',
    ),
    'the drift reason must be reported',
  );
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});

test('a removed target file is drift', (t) => {
  const state = makeProject(t, 'attest-removed');
  prepared(state);
  fs.rmSync(targetFile(state.project));

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  assert.ok(
    output.findings.some((entry) => entry.code === 'TARGET_SETTINGS_REMOVED'),
  );
});

test('a policy compiled after materialize is stale, not silently accepted', (t) => {
  const state = makeProject(t, 'attest-stale');
  prepared(state);
  const profilePath = governancePath(
    state.project,
    '.agent-governance/risk-profile.json',
  );
  const profile = readJson(profilePath);
  profile.permissionCeiling['filesystem.project-write'] = 'deny';
  fs.writeFileSync(profilePath, `${JSON.stringify(profile, null, 2)}\n`, 'utf8');
  assert.equal(runCli(state, compileArgs(state.project)).status, 0);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_DRIFT');
  assert.ok(
    output.findings.some(
      (entry) => entry.code === 'TARGET_SETTINGS_STALE_POLICY',
    ),
  );
});

test('a nearer config file added after materialize is reported as shadowing', (t) => {
  const state = makeProject(t, 'attest-shadowed');
  prepared(state);
  fs.mkdirSync(path.join(state.project, 'app/.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(state.project, 'app/.codex/config.toml'),
    'sandbox_mode = "workspace-write"\n',
    'utf8',
  );

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_SHADOWED');
});

test('a permission profile added after materialize is reported as a model conflict', (t) => {
  const state = makeProject(t, 'attest-profile-drift');
  prepared(state);
  fs.mkdirSync(path.join(state.project, 'app/.codex'), { recursive: true });
  fs.writeFileSync(
    path.join(state.project, 'app/.codex/config.toml'),
    'default_permissions = ":workspace"\n',
    'utf8',
  );

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 4);
  assert.equal(output.code, 'TARGET_SETTINGS_PROFILE_MODEL_CONFLICT');
});

test('attest without a materialize receipt needs input', (t) => {
  const state = makeProject(t, 'attest-no-receipt');
  assert.equal(runCli(state, compileArgs(state.project)).status, 0);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 1);
  assert.equal(output.code, 'MATERIALIZE_RECEIPT_MISSING');
});

test('attest without a compiled policy needs input', (t) => {
  const state = makeProject(t, 'attest-no-policy');
  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 1);
  assert.equal(output.code, 'POLICY_NOT_COMPILED');
});

test('a tampered receipt is invalid rather than trusted', (t) => {
  const state = makeProject(t, 'attest-tampered-receipt');
  const materialized = prepared(state);
  const file = receiptPath(state.project, materialized.result.materializeId);
  const receipt = readJson(file);
  receipt.trustStateObserved = 'trusted';
  writeJson(file, receipt);

  const output = parseSingleJson(runCli(state, attestArgs(state.project)), 3);
  assert.equal(output.code, 'MATERIALIZE_RECEIPT_INVALID');
});

test('attest rejects a non-codex target', (t) => {
  const state = makeProject(t, 'attest-usage');
  prepared(state);
  const output = parseSingleJson(
    runCli(state, ['attest', state.project, '--target', 'antigravity', '--json']),
    2,
  );
  assert.equal(output.code, 'CLI_TARGET_UNSUPPORTED');
});

test('attest is read-only: two runs leave the project byte-identical', (t) => {
  const state = makeProject(t, 'attest-read-only');
  prepared(state);
  const snapshot = snapshotFiles(state.project);
  parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  parseSingleJson(runCli(state, attestArgs(state.project)), 0);
  assertSameSnapshot(snapshot, snapshotFiles(state.project));
});
