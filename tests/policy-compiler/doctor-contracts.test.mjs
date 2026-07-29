import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256Canonical,
} from '../../scripts/lib/governance-artifacts.mjs';
import {
  buildCodexPolicyAdapter,
} from '../../scripts/lib/codex-policy-adapter.mjs';
import {
  compileArgs,
  governancePath,
  makeHighRisk,
  makeProject,
  parseSingleJson,
  readAssignment,
  readJson,
  readRiskProfile,
  runCli,
  runDoctor,
  writeAssignment,
  writeJson,
  writeRiskProfile,
} from './helpers.mjs';

function doctorJson(state, strict = false, expectedExit = 0) {
  const result = runDoctor(
    state,
    [...(strict ? ['--strict'] : []), '--json'],
  );
  assert.equal(
    result.status,
    expectedExit,
    `doctor exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return JSON.parse(result.stdout);
}

function warningCodes(output) {
  return output.warnings.map((warning) => {
    const match = warning.match(/^\[([A-Z0-9_]+)\]/u);
    return match?.[1] ?? '';
  });
}

test('legacy project without policy artifacts remains doctor-compatible', (t) => {
  const state = makeProject(t, 'doctor-legacy');
  const normal = doctorJson(state, false, 0);
  const strict = doctorJson(state, true, 0);
  assert.equal(normal.status, 'ready');
  assert.equal(strict.status, 'ready');
  assert.equal(
    warningCodes(normal).some((code) => code.startsWith('POLICY_')),
    false,
  );
  assert.equal(
    warningCodes(strict).some((code) => code.startsWith('POLICY_')),
    false,
  );
});

test('compiled low-risk project passes strict doctor with honest warnings only', (t) => {
  const state = makeProject(t, 'doctor-low');
  parseSingleJson(runCli(state, compileArgs(state.project)), 0);
  const output = doctorJson(state, true, 0);
  const codes = warningCodes(output);
  assert.ok(codes.includes('POLICY_UNSUPPORTED_CONTROL'));
  assert.ok(codes.includes('CODEX_CONTROL_NOT_ENFORCEABLE'));
  assert.equal(
    codes.some((code) => [
      'POLICY_OUTPUT_STALE',
      'POLICY_OUTPUT_DRIFT',
      'POLICY_SOURCE_HASH_MISMATCH',
      'COMPILE_PARTIAL_OUTPUT',
    ].includes(code)),
    false,
  );
});

test('stale source hash is a strict failure', (t) => {
  const state = makeProject(t, 'doctor-stale');
  parseSingleJson(runCli(state, compileArgs(state.project)), 0);
  const riskPath = governancePath(
    state.project,
    '.agent-governance/risk-profile.json',
  );
  const risk = readJson(riskPath);
  risk.sourceRefs.push('SRC-NEW');
  writeJson(riskPath, risk);
  const normal = doctorJson(state, false, 0);
  assert.ok(
    warningCodes(normal).includes('POLICY_SOURCE_HASH_MISMATCH'),
  );
  const strict = doctorJson(state, true, 1);
  assert.ok(
    warningCodes(strict).includes('POLICY_SOURCE_HASH_MISMATCH'),
  );
});

test('source lock drift is detected even when no Pack is active', (t) => {
  const state = makeProject(t, 'doctor-source-lock-stale');
  parseSingleJson(runCli(state, compileArgs(state.project)), 0);
  const lockPath = governancePath(
    state.project,
    '.agent-governance/source-lock.json',
  );
  const lock = readJson(lockPath);
  lock.sources[0].fetchedAt = '2026-07-29T01:00:00.000Z';
  writeJson(lockPath, lock);
  const strict = doctorJson(state, true, 1);
  const codes = warningCodes(strict);
  assert.ok(codes.includes('POLICY_SOURCE_HASH_MISMATCH'));
  assert.ok(codes.includes('POLICY_OUTPUT_STALE'));
});

test('output drift and partial compile fail strict doctor', async (t) => {
  await t.test('drift', () => {
    const state = makeProject(t, 'doctor-drift');
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      0,
    );
    const adapterPath = output.result.outputHashes.find(
      (entry) => entry.path.includes('/adapters/codex/'),
    ).path;
    const adapter = readJson(governancePath(state.project, adapterPath));
    adapter.status = 'blocked';
    writeJson(governancePath(state.project, adapterPath), adapter);
    const doctor = doctorJson(state, true, 1);
    assert.ok(warningCodes(doctor).includes('POLICY_OUTPUT_DRIFT'));
  });

  await t.test('byte-only drift', () => {
    const state = makeProject(t, 'doctor-byte-drift');
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      0,
    );
    const adapterPath = output.result.outputHashes.find(
      (entry) => entry.path.includes('/adapters/codex/'),
    ).path;
    const absolute = governancePath(state.project, adapterPath);
    writeJson(absolute, readJson(absolute));
    const doctor = doctorJson(state, true, 1);
    assert.ok(warningCodes(doctor).includes('POLICY_OUTPUT_DRIFT'));
    const second = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      4,
    );
    assert.equal(second.code, 'POLICY_OUTPUT_DRIFT');
  });

  await t.test('partial', () => {
    const state = makeProject(t, 'doctor-partial');
    const planned = parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      0,
    );
    const manifestPath =
      `.agent-governance/policies/${planned.result.policyId}.json`;
    fs.mkdirSync(
      governancePath(state.project, '.agent-governance/policies'),
      { recursive: true },
    );
    fs.writeFileSync(
      governancePath(state.project, manifestPath),
      '{"schemaVersion":1}\n',
      'utf8',
    );
    const doctor = doctorJson(state, true, 1);
    assert.ok(warningCodes(doctor).includes('COMPILE_PARTIAL_OUTPUT'));
  });
});

test('high-risk publish policy without approval evidence fails strict doctor', (t) => {
  const state = makeProject(t, 'doctor-approval');
  makeHighRisk(state.project);
  parseSingleJson(runCli(state, compileArgs(state.project)), 0);
  const doctor = doctorJson(state, true, 1);
  assert.ok(warningCodes(doctor).includes('POLICY_APPROVAL_MISSING'));
});

test('destructive work without approval evidence fails strict doctor', (t) => {
  const state = makeProject(t, 'doctor-delete-approval');
  makeHighRisk(state.project);
  const profile = readRiskProfile(state.project);
  profile.permissionCeiling.publish = 'deny';
  profile.permissionCeiling.delete = 'require-human-approval';
  profile.tasks[0].sideEffects = ['delete'];
  profile.tasks[0].requestedCapabilities = profile.tasks[0]
    .requestedCapabilities
    .filter((capability) => capability !== 'publish');
  profile.tasks[0].requestedCapabilities.push('delete');
  writeRiskProfile(state.project, profile);

  const assignment = readAssignment(state.project);
  assignment.permissionCeiling = structuredClone(
    profile.permissionCeiling,
  );
  for (const role of assignment.selectedRoles) {
    role.grantedCapabilityCeiling = structuredClone(
      profile.permissionCeiling,
    );
  }
  assignment.selectedRoles[0].requestedCapabilities = structuredClone(
    profile.tasks[0].requestedCapabilities,
  );
  writeAssignment(state.project, assignment);

  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    0,
  );
  const adapterPath = output.result.outputHashes.find(
    (entry) => entry.path.includes('/adapters/codex/'),
  ).path;
  const adapter = readJson(governancePath(state.project, adapterPath));
  assert.ok(
    adapter.humanReviewRequired.includes('POL-DESTRUCTIVE-ACTIONS'),
  );
  const doctor = doctorJson(state, true, 1);
  assert.ok(warningCodes(doctor).includes('POLICY_APPROVAL_MISSING'));
});

test('owner conflict and invalid adapter have stable doctor findings', (t) => {
  const state = makeProject(t, 'doctor-owner');
  const planned = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    0,
  );
  const adapterPath =
    `.agent-governance/adapters/codex/${planned.result.policyId}.json`;
  writeJson(governancePath(state.project, adapterPath), {
    schemaVersion: 1,
    owner: 'user',
  });
  const doctor = doctorJson(state, true, 1);
  const codes = warningCodes(doctor);
  assert.ok(
    codes.includes('CODEX_ADAPTER_OWNER_CONFLICT')
      || codes.includes('CODEX_ADAPTER_INVALID'),
  );
});

test('strict doctor rejects a hash-consistent adapter that misstates the manifest mapping', (t) => {
  const state = makeProject(t, 'doctor-adapter-semantic-drift');
  const compiled = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    0,
  ).result;
  const policyPath = compiled.outputHashes.find(
    (entry) => entry.path.includes('/policies/'),
  ).path;
  const adapterPath = compiled.outputHashes.find(
    (entry) => entry.path.includes('/adapters/codex/'),
  ).path;
  const oldReceiptPath = compiled.filesCreated.find(
    (entry) => entry.includes('/receipts/'),
  );
  const manifest = readJson(governancePath(state.project, policyPath));
  const adapter = readJson(governancePath(state.project, adapterPath));
  adapter.mappedControls[0].representation = 'false-guidance';
  const outputHashes = [
    {
      path: adapterPath,
      sha256: sha256Bytes(canonicalJsonBytes(adapter)),
    },
    {
      path: policyPath,
      sha256: sha256Bytes(canonicalJsonBytes(manifest)),
    },
  ];
  const compileId =
    `COMPILE-${sha256Canonical({
      policyId: manifest.policyId,
      target: 'codex',
      outputHashes,
    }).slice(0, 12).toUpperCase()}`;
  const receiptPath =
    `.agent-governance/receipts/${compileId}.json`;
  const receipt = {
    ...structuredClone(compiled),
    compileId,
    outputHashes,
    filesCreated: [adapterPath, policyPath, receiptPath].sort(),
    filesUpdated: [],
    filesUnchanged: [],
  };

  fs.writeFileSync(
    governancePath(state.project, adapterPath),
    canonicalJsonBytes(adapter),
  );
  fs.unlinkSync(governancePath(state.project, oldReceiptPath));
  fs.writeFileSync(
    governancePath(state.project, receiptPath),
    canonicalJsonBytes(receipt),
  );

  const doctor = doctorJson(state, true, 1);
  assert.ok(warningCodes(doctor).includes('CODEX_ADAPTER_INVALID'));
});

test('strict doctor rejects AGENTS hardlink drift after compile', (t) => {
  const state = makeProject(t, 'doctor-agents-hardlink');
  parseSingleJson(runCli(state, compileArgs(state.project)), 0);
  fs.linkSync(
    path.join(state.project, 'AGENTS.md'),
    path.join(state.sandbox, 'AGENTS-hardlink.md'),
  );
  const doctor = doctorJson(state, true, 1);
  assert.ok(warningCodes(doctor).includes('SYMLINK_BLOCKED'));
});

test('strict doctor rejects a second current-input compile transaction', (t) => {
  const state = makeProject(t, 'doctor-parallel-transaction');
  const compiled = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    0,
  ).result;
  const policyPath = compiled.outputHashes.find(
    (entry) => entry.path.includes('/policies/'),
  ).path;
  const original = readJson(governancePath(state.project, policyPath));
  const seed = structuredClone(original);
  delete seed.policyId;
  seed.controls.network[0].mode = 'allow';
  seed.controls.externalContent[0].mode = 'allow';
  const manifest = {
    ...seed,
    policyId:
      `POL-${sha256Canonical(seed).slice(0, 12).toUpperCase()}`,
  };
  const adapter = buildCodexPolicyAdapter(manifest);
  const forgedPolicyPath =
    `.agent-governance/policies/${manifest.policyId}.json`;
  const forgedAdapterPath =
    `.agent-governance/adapters/codex/${manifest.policyId}.json`;
  const outputHashes = [
    {
      path: forgedAdapterPath,
      sha256: sha256Bytes(canonicalJsonBytes(adapter)),
    },
    {
      path: forgedPolicyPath,
      sha256: sha256Bytes(canonicalJsonBytes(manifest)),
    },
  ];
  const compileId =
    `COMPILE-${sha256Canonical({
      policyId: manifest.policyId,
      target: 'codex',
      outputHashes,
    }).slice(0, 12).toUpperCase()}`;
  const forgedReceiptPath =
    `.agent-governance/receipts/${compileId}.json`;
  const receipt = {
    ...structuredClone(compiled),
    compileId,
    policyId: manifest.policyId,
    outputHashes,
    filesCreated: [
      forgedAdapterPath,
      forgedPolicyPath,
      forgedReceiptPath,
    ],
    filesUpdated: [],
    filesUnchanged: [],
    compiledAt: '2026-07-29T13:00:00.000Z',
  };
  for (const [relative, value] of [
    [forgedPolicyPath, manifest],
    [forgedAdapterPath, adapter],
    [forgedReceiptPath, receipt],
  ]) {
    const absolute = governancePath(state.project, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, canonicalJsonBytes(value));
  }

  const doctor = doctorJson(state, true, 1);
  assert.ok(
    warningCodes(doctor).some((code) => (
      code === 'POLICY_CONFLICT'
      || code === 'POLICY_OUTPUT_DRIFT'
    )),
  );
});
