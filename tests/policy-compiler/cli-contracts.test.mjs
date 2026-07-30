import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  sha256Canonical,
} from '../../scripts/lib/governance-artifacts.mjs';
import {
  assertSameSnapshot,
  compileArgs,
  governancePath,
  installPack,
  makeHighRisk,
  makeProject,
  makeRuntimeGuard,
  parseSingleJson,
  readAssignment,
  readJson,
  readRiskProfile,
  ROOT,
  runCli,
  snapshotFiles,
  writeJson,
  writeAssignment,
  writeRiskProfile,
} from './helpers.mjs';

function installDecisionFixture(project, { active = false } = {}) {
  const source = path.join(
    ROOT,
    'tests/decision-role/fixtures/architecture-decision',
    '.agent-governance/decisions/DEC-001',
  );
  const destination = governancePath(
    project,
    '.agent-governance/decisions/DEC-001',
  );
  fs.cpSync(source, destination, { recursive: true });
  if (!active) return;

  const decisionPath = path.join(destination, 'decision.json');
  const planPath = path.join(destination, 'deliberation-plan.json');
  const resultPath = path.join(destination, 'deliberation-result.json');
  const confirmationPath = path.join(
    destination,
    'human-confirmation.json',
  );
  const decision = readJson(decisionPath);
  decision.status = 'active';
  writeJson(decisionPath, decision);
  const decisionSha256 = sha256Canonical(decision);

  const plan = readJson(planPath);
  plan.decisionSha256 = decisionSha256;
  delete plan.planSha256;
  plan.planSha256 = sha256Canonical(plan);
  writeJson(planPath, plan);

  const result = readJson(resultPath);
  result.decisionSha256 = decisionSha256;
  result.planSha256 = plan.planSha256;
  result.beforeReceipt.decisionSha256 = decisionSha256;
  result.beforeReceipt.planSha256 = plan.planSha256;
  delete result.resultSha256;
  delete result.afterReceipt.normalizedResultSha256;
  const normalizedReceiptInput = structuredClone(result);
  normalizedReceiptInput.importStatus = 'imported';
  result.afterReceipt.normalizedResultSha256 = sha256Canonical(
    normalizedReceiptInput,
  );
  const resultHashInput = structuredClone(result);
  resultHashInput.importStatus = 'imported';
  result.resultSha256 = sha256Canonical(resultHashInput);
  writeJson(resultPath, result);

  const confirmation = readJson(confirmationPath);
  confirmation.decisionSha256 = decisionSha256;
  confirmation.planSha256 = plan.planSha256;
  confirmation.resultSha256 = result.resultSha256;
  writeJson(confirmationPath, confirmation);
}

test('compile creates canonical policy, Codex adapter, and receipt locally', (t) => {
  const state = makeProject(t, 'compile-low');
  const guard = makeRuntimeGuard(state);
  const result = runCli(state, compileArgs(state.project), {
    env: {
      GOVERNSEED_TEST_GUARD_MARKER: guard.marker,
      NODE_OPTIONS: `--require=${guard.guard}`,
    },
  });
  const output = parseSingleJson(result, 0);
  assert.equal(output.command, 'compile');
  assert.equal(output.status, 'compiled');
  assert.equal(output.code, 'OK');
  assert.equal(output.result.target, 'codex');
  assert.equal(output.result.dryRun, false);
  assert.equal(output.result.filesCreated.length, 3);
  assert.equal(fs.existsSync(guard.marker), false);

  const receipt = readJson(governancePath(state.project, output.artifact));
  assert.deepEqual(receipt, output.result);
  const policyPath = receipt.outputHashes.find(
    (item) => item.path.includes('/policies/'),
  ).path;
  const adapterPath = receipt.outputHashes.find(
    (item) => item.path.includes('/adapters/codex/'),
  ).path;
  const manifest = readJson(governancePath(state.project, policyPath));
  const adapter = readJson(governancePath(state.project, adapterPath));
  assert.equal(manifest.policyId, receipt.policyId);
  assert.equal(adapter.policyId, receipt.policyId);
  assert.equal(manifest.generatedAt, null);
  assert.equal(manifest.status, 'candidate');
  assert.equal(adapter.status, 'candidate');
  assert.equal(adapter.compatibility.projectConfigGenerated, false);
  assert.equal(
    fs.existsSync(path.join(state.project, '.codex/config.toml')),
    false,
  );
});

test('compile validates proposed decisions and retains active confirmed decisions as provenance', async (t) => {
  await t.test('proposed decision is valid but inactive', () => {
    const state = makeProject(t, 'compile-proposed-decision');
    installDecisionFixture(state.project);
    parseSingleJson(
      runCli(state, compileArgs(state.project, '--dry-run')),
      0,
    );
  });

  await t.test('active confirmed decision is retained', () => {
    const state = makeProject(t, 'compile-active-decision');
    installDecisionFixture(state.project, { active: true });
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      0,
    );
    const policyPath = output.result.outputHashes.find(
      (entry) => entry.path.includes('/policies/'),
    ).path;
    const manifest = readJson(governancePath(state.project, policyPath));
    assert.ok(manifest.sourceRefs.includes('DEC-001@1'));
    assert.ok(manifest.inputHashes.some(
      (entry) => entry.path.endsWith('/DEC-001/decision.json'),
    ));
  });
});

test('second compile produces zero filesystem diff and reports unchanged files', (t) => {
  const state = makeProject(t, 'compile-double');
  const args = compileArgs(state.project);
  const first = parseSingleJson(runCli(state, args), 0);
  const before = snapshotFiles(state.project);
  const second = parseSingleJson(runCli(state, args), 0);
  assert.equal(second.result.compileId, first.result.compileId);
  assert.deepEqual(second.result.filesCreated, []);
  assert.deepEqual(second.result.filesUpdated, []);
  assert.deepEqual(
    second.result.filesUnchanged,
    [
      `.agent-governance/adapters/codex/${first.result.policyId}.json`,
      `.agent-governance/policies/${first.result.policyId}.json`,
      `.agent-governance/receipts/${first.result.compileId}.json`,
    ],
  );
  assertSameSnapshot(before, snapshotFiles(state.project));
});

test('dry-run returns the complete change plan without mutating the filesystem', (t) => {
  const state = makeProject(t, 'compile-dry-run');
  const before = snapshotFiles(state.project);
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    0,
  );
  const repeated = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    0,
  );
  assert.equal(output.status, 'dry-run');
  assert.equal(output.result.dryRun, true);
  assert.equal(output.result.filesCreated.length, 3);
  assert.deepEqual(repeated, output);
  assertSameSnapshot(before, snapshotFiles(state.project));
});

test('compile revalidates an external specialist catalog referenced by an assignment', (t) => {
  const state = makeProject(t, 'compile-external-role-catalog');
  const catalogRelative = 'imports/specialist-catalog.json';
  const source = {
    sourceId: 'SRC-901',
    repository: 'https://example.com/specialists/catalog.git',
    revision: 'c'.repeat(40),
    license: 'MIT',
    importedMode: 'metadata',
    sha256: 'd'.repeat(64),
  };
  writeJson(governancePath(state.project, catalogRelative), {
    schemaVersion: 1,
    catalogId: 'CAT-001',
    catalogType: 'specialist',
    source,
    roles: [
      {
        roleId: 'documentation-implementer',
        division: 'documentation',
        title: 'Documentation Implementer',
        supportedResponsibilities: ['implementation-owner'],
        supportedSurfaces: ['documentation'],
        requestedCapabilities: ['filesystem.project-write'],
      },
      {
        roleId: 'security-reviewer',
        division: 'security',
        title: 'Security Reviewer',
        supportedResponsibilities: ['risk-reviewer'],
        supportedSurfaces: ['security'],
        requestedCapabilities: ['filesystem.project-write'],
      },
    ],
  });
  const lockPath = governancePath(
    state.project,
    '.agent-governance/source-lock.json',
  );
  const sourceLock = readJson(lockPath);
  sourceLock.sources.push({
    sourceId: source.sourceId,
    repository: source.repository,
    commit: source.revision,
    license: source.license,
    importedFiles: [catalogRelative],
    importedMode: source.importedMode,
    sha256: source.sha256,
    attributionRequired: false,
    fetchedAt: '2026-07-29T00:00:00.000Z',
  });
  writeJson(lockPath, sourceLock);
  fs.unlinkSync(governancePath(
    state.project,
    '.agent-governance/role-assignments/TASK-001.json',
  ));
  parseSingleJson(
    runCli(state, [
      'roles',
      'assign',
      state.project,
      '--task',
      'TASK-001',
      '--catalog',
      catalogRelative,
      '--json',
    ]),
    0,
  );

  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    0,
  );
  const policyPath = output.result.outputHashes.find(
    (entry) => entry.path.includes('/policies/'),
  ).path;
  const manifest = readJson(governancePath(state.project, policyPath));
  assert.ok(manifest.inputHashes.some(
    (entry) => entry.path === catalogRelative,
  ));

  const assignmentPath = governancePath(
    state.project,
    '.agent-governance/role-assignments/TASK-001.json',
  );
  const assignment = readJson(assignmentPath);
  const originalRole = structuredClone(assignment.selectedRoles[0]);
  assignment.selectedRoles[0].specialistRoleId = 'security-reviewer';
  assignment.selectedRoles[0].requestedCapabilities = [
    'filesystem.project-write',
  ];
  writeJson(assignmentPath, assignment);
  const beforeIncompatibleRole = snapshotFiles(state.project);
  const incompatibleRole = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    4,
  );
  assert.equal(incompatibleRole.code, 'ROLE_CATALOG_INVALID');
  assertSameSnapshot(
    beforeIncompatibleRole,
    snapshotFiles(state.project),
  );

  assignment.selectedRoles[0] = originalRole;
  assignment.selectedRoles[0].requestedCapabilities = [];
  writeJson(assignmentPath, assignment);
  const beforeCapabilityMismatch = snapshotFiles(state.project);
  const capabilityMismatch = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    4,
  );
  assert.equal(capabilityMismatch.code, 'ROLE_CATALOG_INVALID');
  assertSameSnapshot(
    beforeCapabilityMismatch,
    snapshotFiles(state.project),
  );
});

test('compiler requires explicit Pack and source locks', async (t) => {
  for (const relative of [
    '.agent-governance/packs.lock.json',
    '.agent-governance/source-lock.json',
  ]) {
    await t.test(relative, () => {
      const state = makeProject(t, 'compile-required-lock');
      fs.unlinkSync(governancePath(state.project, relative));
      const before = snapshotFiles(state.project);
      const output = parseSingleJson(
        runCli(state, compileArgs(state.project)),
        1,
      );
      assert.equal(output.code, 'POLICY_INPUT_MISSING');
      assertSameSnapshot(before, snapshotFiles(state.project));
    });
  }
});

test('source lock always participates in the policy identity', (t) => {
  const state = makeProject(t, 'compile-source-lock-hash');
  const first = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    0,
  );
  const lockPath = governancePath(
    state.project,
    '.agent-governance/source-lock.json',
  );
  const lock = readJson(lockPath);
  lock.sources[0].fetchedAt = '2026-07-29T01:00:00.000Z';
  writeJson(lockPath, lock);
  const second = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    0,
  );
  assert.notEqual(second.result.policyId, first.result.policyId);
});

test('Pack lock status and source lock paths use closed portable contracts', async (t) => {
  await t.test('invalid Pack status', () => {
    const state = makeProject(t, 'compile-pack-status');
    const lockPath = governancePath(
      state.project,
      '.agent-governance/packs.lock.json',
    );
    writeJson(lockPath, {
      schemaVersion: 1,
      packs: [
        {
          packId: 'test-pack',
          version: '1.0.0',
          status: 'actve',
          artifact: '.agent-governance/packs/test-pack.json',
          source: {},
        },
      ],
    });
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      3,
    );
    assert.equal(output.code, 'POLICY_MANIFEST_INVALID');
  });

  await t.test('Windows-style imported file', () => {
    const state = makeProject(t, 'compile-source-path');
    const lockPath = governancePath(
      state.project,
      '.agent-governance/source-lock.json',
    );
    const lock = readJson(lockPath);
    lock.sources[0].importedFiles[0] =
      '.agent-governance\\catalogs\\role-catalog.json';
    writeJson(lockPath, lock);
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      3,
    );
    assert.equal(output.code, 'POLICY_MANIFEST_INVALID');
  });

  await t.test('Windows-style Pack artifact path', () => {
    const state = makeProject(t, 'compile-pack-path');
    const lockPath = governancePath(
      state.project,
      '.agent-governance/packs.lock.json',
    );
    writeJson(lockPath, {
      schemaVersion: 1,
      packs: [
        {
          packId: 'test-pack',
          version: '1.0.0',
          status: 'suspended',
          artifact: '.agent-governance\\packs\\test-pack.json',
          source: {},
        },
      ],
    });
    const output = parseSingleJson(
      runCli(state, compileArgs(state.project)),
      3,
    );
    assert.equal(output.code, 'POLICY_MANIFEST_INVALID');
  });
});

test('restricted data remains visibly non-enforced in the Codex adapter', (t) => {
  const state = makeProject(t, 'compile-restricted');
  makeHighRisk(state.project);
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    0,
  );
  const receipt = output.result;
  const adapterPath = receipt.outputHashes.find(
    (item) => item.path.includes('/adapters/codex/'),
  ).path;
  const adapter = readJson(governancePath(state.project, adapterPath));
  assert.ok(
    adapter.mappedControls.some(
      (control) => control.capability === 'network'
        && control.support === 'representable-only',
    ),
  );
  assert.ok(
    adapter.unsupportedControls.some(
      (control) => control.capability === 'credentials',
    ),
  );
  assert.equal(
    adapter.mappedControls.some(
      (control) => control.support === 'enforced',
    ),
    false,
  );
});

test('publish approval is preserved as human review guidance', (t) => {
  const state = makeProject(t, 'compile-publish');
  makeHighRisk(state.project);
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    0,
  );
  const adapterPath = output.result.outputHashes.find(
    (item) => item.path.includes('/adapters/codex/'),
  ).path;
  const adapter = readJson(governancePath(state.project, adapterPath));
  assert.ok(
    adapter.humanReviewRequired.includes('POL-PUBLISH-ACTIONS'),
  );
  assert.ok(
    adapter.approvalGuidance.some((line) => /publish/iu.test(line)),
  );
});

test('malicious Pack expansion blocks without leaving outputs', (t) => {
  const state = makeProject(t, 'compile-malicious-pack');
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
});

test('compile preserves active Pack checks as effective evidence obligations', (t) => {
  const state = makeProject(t, 'compile-pack-checks');
  installPack(state.project, {
    effect: 'deny',
    capability: 'network',
    scope: 'TASK-001',
    mechanicalChecks: [{
      checkId: 'network-deny',
      findingCode: 'PACK_NETWORK_NOT_DENIED',
      description: 'Verify that network remains denied.',
    }],
    humanReviewChecks: [{
      checkId: 'external-content-review',
      description: 'Review external-content provenance.',
    }],
  });
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    0,
  );
  const policyPath = output.result.outputHashes.find(
    (entry) => entry.path.includes('/policies/'),
  ).path;
  const manifest = readJson(governancePath(state.project, policyPath));
  const [enabledPack] = manifest.enabledPacks;
  assert.deepEqual(enabledPack.mechanicalCheckIds, ['network-deny']);
  assert.deepEqual(enabledPack.humanReviewCheckIds, [
    'external-content-review',
  ]);
  assert.equal(enabledPack.checkRequirements.length, 2);
  for (const requirement of enabledPack.checkRequirements) {
    assert.ok(
      manifest.evidenceRequirements.includes(requirement.evidenceRef),
    );
    assert.ok(
      Object.values(manifest.controls).flat().every(
        (control) => control.evidenceRequirement.includes(
          requirement.evidenceRef,
        ),
      ),
    );
  }
});

test('role scope and capability requests cannot exceed the active task', async (t) => {
  for (const [label, mutate] of [
    [
      'unrelated-scope',
      (assignment) => {
        assignment.selectedRoles[0].assignedTaskScope = ['TASK-999'];
      },
    ],
    [
      'undeclared-capability',
      (assignment) => {
        assignment.selectedRoles[0].requestedCapabilities.push('network');
      },
    ],
  ]) {
    await t.test(label, () => {
      const state = makeProject(t, `compile-role-${label}`);
      const assignment = readAssignment(state.project);
      mutate(assignment);
      writeAssignment(state.project, assignment);
      const before = snapshotFiles(state.project);
      const output = parseSingleJson(
        runCli(state, compileArgs(state.project)),
        4,
      );
      assert.equal(output.code, 'POLICY_PRIVILEGE_EXPANSION');
      assertSameSnapshot(before, snapshotFiles(state.project));
    });
  }
});

test('malformed role assignment is classified as invalid input', (t) => {
  const state = makeProject(t, 'compile-malformed-assignment');
  const assignment = readAssignment(state.project);
  assignment.selectedRoles = {};
  writeAssignment(state.project, assignment);
  const before = snapshotFiles(state.project);
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    3,
  );
  assert.equal(output.code, 'POLICY_MANIFEST_INVALID');
  assertSameSnapshot(before, snapshotFiles(state.project));
});

test('high-risk role separation must reference selected canonical reviewers', (t) => {
  const state = makeProject(t, 'compile-role-separation');
  makeHighRisk(state.project);
  const assignment = readAssignment(state.project);
  assignment.selectedRoles = [assignment.selectedRoles[0]];
  assignment.separationOfDuties = {
    required: true,
    implementationOwner: 'builtin/fake-author',
    finalVerifier: 'builtin/fake-reviewer',
    rules: assignment.separationOfDuties.rules,
  };
  writeAssignment(state.project, assignment);
  const before = snapshotFiles(state.project);
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'ROLE_SEPARATION_VIOLATION');
  assertSameSnapshot(before, snapshotFiles(state.project));
});

test('generated-artifact deny permits preview but blocks commit', (t) => {
  const state = makeProject(t, 'compile-generated-artifact-deny');
  installPack(state.project, {
    effect: 'deny',
    capability: 'generated-artifacts',
  });
  const before = snapshotFiles(state.project);
  const preview = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    0,
  );
  assert.equal(preview.result.dryRun, true);
  assertSameSnapshot(before, snapshotFiles(state.project));
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'POLICY_CONFLICT');
  assertSameSnapshot(before, snapshotFiles(state.project));
});

test('missing or unresolved risk input returns needs-input with no partial output', (t) => {
  const state = makeProject(t, 'compile-needs-input');
  const profile = readRiskProfile(state.project);
  profile.status = 'needs-input';
  profile.openQuestions = [
    {
      questionId: 'OPEN_LOOP-001',
      taskId: 'TASK-001',
      field: 'dataClasses',
      question: 'Confirm the governed data class.',
    },
  ];
  writeRiskProfile(state.project, profile);
  const before = snapshotFiles(state.project);
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    1,
  );
  assert.equal(output.code, 'POLICY_INPUT_MISSING');
  assert.equal(output.status, 'needs-input');
  assertSameSnapshot(before, snapshotFiles(state.project));
});

test('owner conflict fails closed and preserves the non-owned file', (t) => {
  const state = makeProject(t, 'compile-owner-conflict');
  const planned = parseSingleJson(
    runCli(state, compileArgs(state.project, '--dry-run')),
    0,
  );
  const adapterPath = `.agent-governance/adapters/codex/${planned.result.policyId}.json`;
  const conflict = governancePath(state.project, adapterPath);
  fs.mkdirSync(path.dirname(conflict), { recursive: true });
  fs.writeFileSync(
    conflict,
    '{"schemaVersion":1,"owner":"user"}\n',
    'utf8',
  );
  const original = fs.readFileSync(conflict);
  const output = parseSingleJson(
    runCli(state, compileArgs(state.project)),
    4,
  );
  assert.equal(output.code, 'CODEX_ADAPTER_OWNER_CONFLICT');
  assert.deepEqual(fs.readFileSync(conflict), original);
  assert.equal(
    fs.existsSync(
      governancePath(
        state.project,
        `.agent-governance/receipts/${planned.result.compileId}.json`,
      ),
    ),
    false,
  );
});

test('CRLF and LF inputs produce the same manifest and adapter bytes', (t) => {
  const lf = makeProject(t, 'compile-lf');
  const crlf = makeProject(t, 'compile-crlf');
  const crlfRisk = readRiskProfile(crlf.project);
  writeRiskProfile(crlf.project, crlfRisk, '\r\n');
  const crlfAgents = fs.readFileSync(
    path.join(crlf.project, 'AGENTS.md'),
    'utf8',
  );
  fs.writeFileSync(
    path.join(crlf.project, 'AGENTS.md'),
    crlfAgents.replaceAll(/\r?\n/gu, '\r\n'),
    'utf8',
  );
  const lfOutput = parseSingleJson(
    runCli(lf, compileArgs(lf.project)),
    0,
  );
  const crlfOutput = parseSingleJson(
    runCli(crlf, compileArgs(crlf.project)),
    0,
  );
  assert.equal(crlfOutput.result.policyId, lfOutput.result.policyId);
  for (const marker of ['/policies/', '/adapters/codex/']) {
    const left = lfOutput.result.outputHashes.find(
      (entry) => entry.path.includes(marker),
    );
    const right = crlfOutput.result.outputHashes.find(
      (entry) => entry.path.includes(marker),
    );
    assert.equal(right.sha256, left.sha256);
    assert.deepEqual(
      fs.readFileSync(governancePath(crlf.project, right.path)),
      fs.readFileSync(governancePath(lf.project, left.path)),
    );
  }
});

test('unsupported target and malformed option use stable usage contracts', (t) => {
  const state = makeProject(t, 'compile-usage');
  const unsupported = parseSingleJson(
    runCli(state, [
      'compile',
      state.project,
      '--target',
      // Not a registered target. claude used to serve this role and no longer
      // can, because it is now registered for compile.
      'gemini',
      '--json',
    ]),
    2,
  );
  assert.equal(unsupported.code, 'CLI_TARGET_UNSUPPORTED');
  const duplicate = parseSingleJson(
    runCli(state, [
      'compile',
      state.project,
      '--target',
      'codex',
      '--dry-run',
      '--dry-run',
      '--json',
    ]),
    2,
  );
  assert.equal(duplicate.code, 'CLI_USAGE_ERROR');
});
