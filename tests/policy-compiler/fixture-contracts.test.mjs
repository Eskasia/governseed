import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  normalizePortablePath,
} from '../../scripts/lib/policy-compiler-core.mjs';
import {
  assertSameSnapshot,
  compileArgs,
  governancePath,
  installPack,
  makeHighRisk,
  makeProject,
  parseSingleJson,
  readJson,
  readRiskProfile,
  ROOT,
  runCli,
  runDoctor,
  snapshotFiles,
  writeJson,
  writeRiskProfile,
} from './helpers.mjs';

const FIXTURE_ROOT = path.join(ROOT, 'tests/policy-compiler/fixtures');
const EXPECTED_FIXTURES = [
  'cross-platform-paths',
  'dry-run',
  'low-risk-codex',
  'malicious-pack-expansion',
  'owner-conflict',
  'publish-approval-codex',
  'restricted-data-codex',
  'stale-policy',
];

function fixtureCases() {
  const names = fs.readdirSync(FIXTURE_ROOT)
    .filter((name) => fs.statSync(path.join(FIXTURE_ROOT, name)).isDirectory())
    .sort();
  assert.deepEqual(names, EXPECTED_FIXTURES);
  return names.map((name) => {
    const value = readJson(path.join(FIXTURE_ROOT, name, 'case.json'));
    assert.equal(value.fixture, name);
    assert.ok(Array.isArray(value.expected) && value.expected.length > 0);
    return value;
  });
}

function warningCodes(output) {
  return output.warnings.map((warning) => (
    warning.match(/^\[([A-Z0-9_]+)\]/u)?.[1] ?? ''
  ));
}

const RUNNERS = {
  'low-risk-codex'(t) {
    const state = makeProject(t, 'fixture-low');
    const first = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      0,
    );
    const before = snapshotFiles(state.project);
    const second = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      0,
    );
    assert.equal(second.result.compileId, first.result.compileId);
    assert.deepEqual(second.result.filesCreated, []);
    assertSameSnapshot(before, snapshotFiles(state.project));
    assert.equal(
      runDoctor(state, ['--strict', '--json']).status,
      0,
    );
  },
  'restricted-data-codex'(t) {
    const state = makeProject(t, 'fixture-restricted');
    makeHighRisk(state.project);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      0,
    );
    const adapterPath = output.result.outputHashes.find(
      (entry) => entry.path.includes('/adapters/codex/'),
    ).path;
    const adapter = readJson(governancePath(state.project, adapterPath));
    assert.ok(adapter.mappedControls.some((control) => (
      control.capability === 'network'
      && control.support === 'representable-only'
    )));
    assert.ok(adapter.unsupportedControls.some(
      (control) => control.capability === 'credentials',
    ));
  },
  'publish-approval-codex'(t) {
    const state = makeProject(t, 'fixture-publish');
    makeHighRisk(state.project);
    parseSingleJson(runCli(state, compileArgs(state.project)), 0);
    const doctor = runDoctor(state, ['--strict', '--json']);
    assert.equal(doctor.status, 1);
    assert.ok(
      warningCodes(JSON.parse(doctor.stdout)).includes(
        'POLICY_APPROVAL_MISSING',
      ),
    );
  },
  'malicious-pack-expansion'(t) {
    const state = makeProject(t, 'fixture-pack');
    installPack(state.project, {
      effect: 'allow',
      capability: 'network',
    });
    const before = snapshotFiles(state.project);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      4,
    );
    assert.equal(output.code, 'POLICY_PRIVILEGE_EXPANSION');
    assertSameSnapshot(before, snapshotFiles(state.project));
  },
  'owner-conflict'(t) {
    const state = makeProject(t, 'fixture-owner');
    const planned = parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      0,
    );
    const relative =
      `.agent-governance/adapters/codex/${planned.result.policyId}.json`;
    const absolute = governancePath(state.project, relative);
    writeJson(absolute, { schemaVersion: 1, owner: 'user' });
    const before = fs.readFileSync(absolute);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      4,
    );
    assert.equal(output.code, 'CODEX_ADAPTER_OWNER_CONFLICT');
    assert.deepEqual(fs.readFileSync(absolute), before);
  },
  'stale-policy'(t) {
    const state = makeProject(t, 'fixture-stale');
    parseSingleJson(runCli(state, compileArgs(state.project)), 0);
    const profile = readRiskProfile(state.project);
    profile.sourceRefs.push('SRC-NEW');
    writeRiskProfile(state.project, profile);
    const doctor = runDoctor(state, ['--strict', '--json']);
    assert.equal(doctor.status, 1);
    assert.ok(
      warningCodes(JSON.parse(doctor.stdout)).includes(
        'POLICY_SOURCE_HASH_MISMATCH',
      ),
    );
  },
  'dry-run'(t) {
    const state = makeProject(t, 'fixture-dry');
    const before = snapshotFiles(state.project);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      0,
    );
    assert.equal(output.status, 'dry-run');
    assertSameSnapshot(before, snapshotFiles(state.project));
  },
  'cross-platform-paths'(t, fixture) {
    const expected =
      '.agent-governance/role-assignments/TASK-001.json';
    assert.equal(normalizePortablePath(expected), expected);
    assert.equal(
      normalizePortablePath(
        '.agent-governance\\role-assignments\\TASK-001.json',
      ),
      expected,
    );
    assert.throws(
      () => normalizePortablePath(
        'C:\\Users\\example\\.codex\\config.toml',
      ),
      (error) => error?.code === 'COMPILE_PATH_BLOCKED',
    );
    const state = makeProject(t, 'fixture-cross-platform');
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      0,
    );
    const policy = output.result.outputHashes.find(
      (entry) => entry.path.includes('/policies/'),
    );
    const adapter = output.result.outputHashes.find(
      (entry) => entry.path.includes('/adapters/codex/'),
    );
    assert.deepEqual(
      {
        policyId: output.result.policyId,
        policySha256: policy.sha256,
        adapterSha256: adapter.sha256,
      },
      fixture.artifactEvidence,
    );
  },
};

for (const fixture of fixtureCases()) {
  test(`policy compiler fixture: ${fixture.fixture}`, (t) => {
    RUNNERS[fixture.fixture](t, fixture);
  });
}
