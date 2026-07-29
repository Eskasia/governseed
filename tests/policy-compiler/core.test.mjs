import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildPolicyManifest,
  normalizePortablePath,
} from '../../scripts/lib/policy-compiler-core.mjs';
import {
  codexSupportForControl,
} from '../../scripts/lib/codex-policy-adapter.mjs';
import {
  clone,
  objectSha256,
  readJson,
  ROOT,
} from './helpers.mjs';

const riskProfile = readJson(
  `${ROOT}/tests/decision-role/fixtures/low-risk-docs-task/.agent-governance/risk-profile.json`,
);
const assignment = readJson(
  `${ROOT}/tests/decision-role/fixtures/low-risk-docs-task/.agent-governance/role-assignments/TASK-001.json`,
);

function inputs(overrides = {}) {
  return {
    projectId: riskProfile.profileId,
    riskProfile,
    riskProfileRef: {
      profileId: riskProfile.profileId,
      path: '.agent-governance/risk-profile.json',
      sha256: objectSha256(riskProfile),
    },
    governanceRuleRef: {
      path: 'AGENTS.md',
      sha256: '1'.repeat(64),
    },
    activeDecisionRefs: [],
    roleAssignments: [
      {
        path: '.agent-governance/role-assignments/TASK-001.json',
        sha256: objectSha256(assignment),
        value: assignment,
      },
    ],
    enabledPacks: [],
    inputHashes: [
      {
        path: '.agent-governance/risk-profile.json',
        sha256: objectSha256(riskProfile),
      },
      { path: 'AGENTS.md', sha256: '1'.repeat(64) },
    ],
    ...overrides,
  };
}

test('canonical manifest is deterministic and keeps time out of the policy hash', () => {
  const first = buildPolicyManifest(inputs(), {
    target: 'codex',
    supportForControl: codexSupportForControl,
  });
  const reordered = inputs({
    inputHashes: [...inputs().inputHashes].reverse(),
  });
  const second = buildPolicyManifest(reordered, {
    target: 'codex',
    supportForControl: codexSupportForControl,
  });
  assert.deepEqual(second, first);
  assert.equal(first.generatedAt, null);
  assert.match(first.policyId, /^POL-[A-F0-9]{12}$/);
  assert.equal(first.status, 'candidate');
});

test('permission merge uses the most restrictive meet and a Pack may narrow', () => {
  const pack = {
    schemaVersion: 1,
    packId: 'network-lock',
    version: '1.0.0',
    status: 'active',
    source: {
      sourceId: 'SRC-PACK',
      repository: 'https://example.com/pack.git',
      revision: 'a'.repeat(40),
      license: 'MIT',
      importedMode: 'metadata',
      sha256: 'b'.repeat(64),
    },
    controls: [
      {
        controlId: 'POL-PACK-NETWORK',
        effect: 'deny',
        capability: 'network',
        scope: 'all',
      },
    ],
    mechanicalChecks: [],
    humanReviewChecks: [],
    carryingCost: { level: 'low', description: 'Synthetic test.' },
    retirementCondition: 'Retire with this test.',
  };
  const permissiveRisk = clone(riskProfile);
  permissiveRisk.permissionCeiling.network = 'allow';
  const narrowed = buildPolicyManifest(
    inputs({
      riskProfile: permissiveRisk,
      enabledPacks: [
        {
          path: '.agent-governance/packs/network-lock.json',
          sha256: objectSha256(pack),
          value: pack,
        },
      ],
    }),
    {
      target: 'codex',
      supportForControl: codexSupportForControl,
    },
  );
  assert.equal(narrowed.controls.network[0].mode, 'deny');
  assert.ok(
    narrowed.controls.network[0].source.includes(
      'pack:network-lock@1.0.0',
    ),
  );
});

test('Pack and role permission expansion fail closed', () => {
  const wideningPack = {
    schemaVersion: 1,
    packId: 'widening-pack',
    version: '1.0.0',
    status: 'active',
    source: {
      sourceId: 'SRC-PACK',
      repository: 'https://example.com/pack.git',
      revision: 'a'.repeat(40),
      license: 'MIT',
      importedMode: 'metadata',
      sha256: 'b'.repeat(64),
    },
    controls: [
      {
        controlId: 'POL-PACK-NETWORK',
        effect: 'allow',
        capability: 'network',
        scope: 'all',
      },
    ],
    mechanicalChecks: [],
    humanReviewChecks: [],
    carryingCost: { level: 'low', description: 'Synthetic test.' },
    retirementCondition: 'Retire with this test.',
  };
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        enabledPacks: [
          {
            path: '.agent-governance/packs/widening-pack.json',
            sha256: objectSha256(wideningPack),
            value: wideningPack,
          },
        ],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_PRIVILEGE_EXPANSION',
  );

  const wideningAssignment = clone(assignment);
  wideningAssignment.permissionCeiling.network = 'allow';
  wideningAssignment.selectedRoles[0].grantedCapabilityCeiling.network =
    'allow';
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        roleAssignments: [
          {
            path: '.agent-governance/role-assignments/TASK-001.json',
            sha256: objectSha256(wideningAssignment),
            value: wideningAssignment,
          },
        ],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_PRIVILEGE_EXPANSION',
  );
});

test('role capabilities are intersected and unsupported controls stay explicit', () => {
  const manifest = buildPolicyManifest(inputs(), {
    target: 'codex',
    supportForControl: codexSupportForControl,
  });
  assert.equal(manifest.controls.network[0].mode, 'deny');
  assert.ok(
    manifest.unsupportedControls.some(
      (control) => control.capability === 'credentials',
    ),
  );
  assert.ok(
    manifest.controls.publishActions[0].mode === 'deny',
  );
});

test('selected-role requests and grants are part of the permission meet', () => {
  const permissiveRisk = clone(riskProfile);
  permissiveRisk.permissionCeiling.network = 'allow';
  permissiveRisk.tasks[0].requestedCapabilities.push('network');
  const boundedAssignment = clone(assignment);
  boundedAssignment.permissionCeiling.network = 'allow';
  boundedAssignment.selectedRoles[0].requestedCapabilities.push('network');
  boundedAssignment.selectedRoles[0].grantedCapabilityCeiling.network = 'deny';
  const manifest = buildPolicyManifest(
    inputs({
      riskProfile: permissiveRisk,
      roleAssignments: [
        {
          path: '.agent-governance/role-assignments/TASK-001.json',
          sha256: objectSha256(boundedAssignment),
          value: boundedAssignment,
        },
      ],
    }),
    {
      target: 'codex',
      supportForControl: codexSupportForControl,
    },
  );
  assert.equal(manifest.controls.network[0].mode, 'deny');
  assert.ok(
    manifest.controls.network[0].reasonCodes.includes(
      'POLICY_ROLE_REQUEST_INTERSECTION',
    ),
  );
});

test('role requests must stay within the assigned active task contract', () => {
  const permissiveRisk = clone(riskProfile);
  permissiveRisk.permissionCeiling.network = 'allow';
  const unrelatedScope = clone(assignment);
  unrelatedScope.selectedRoles[0].assignedTaskScope = ['TASK-999'];
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        riskProfile: permissiveRisk,
        roleAssignments: [{
          path: '.agent-governance/role-assignments/TASK-001.json',
          sha256: objectSha256(unrelatedScope),
          value: unrelatedScope,
        }],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_PRIVILEGE_EXPANSION',
  );

  const undeclaredRequest = clone(assignment);
  undeclaredRequest.permissionCeiling.network = 'allow';
  undeclaredRequest.selectedRoles[0].requestedCapabilities.push('network');
  undeclaredRequest.selectedRoles[0].grantedCapabilityCeiling.network =
    'allow';
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        riskProfile: permissiveRisk,
        roleAssignments: [{
          path: '.agent-governance/role-assignments/TASK-001.json',
          sha256: objectSha256(undeclaredRequest),
          value: undeclaredRequest,
        }],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_PRIVILEGE_EXPANSION',
  );

  const secondKnownTaskRisk = clone(permissiveRisk);
  secondKnownTaskRisk.tasks.push({
    ...clone(secondKnownTaskRisk.tasks[0]),
    taskId: 'TASK-002',
    status: 'inactive',
  });
  const extraKnownScope = clone(assignment);
  extraKnownScope.selectedRoles[0].assignedTaskScope = [
    'TASK-001',
    'TASK-002',
  ];
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        riskProfile: secondKnownTaskRisk,
        roleAssignments: [{
          path: '.agent-governance/role-assignments/TASK-001.json',
          sha256: objectSha256(extraKnownScope),
          value: extraKnownScope,
        }],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_PRIVILEGE_EXPANSION',
  );
});

test('Pack scope, checks, and network-derived content remain explicit', () => {
  const pack = {
    schemaVersion: 1,
    packId: 'bounded-network-pack',
    version: '1.0.0',
    status: 'active',
    source: {
      sourceId: 'SRC-PACK',
      repository: 'https://example.com/pack.git',
      revision: 'a'.repeat(40),
      license: 'MIT',
      importedMode: 'metadata',
      sha256: 'b'.repeat(64),
    },
    controls: [{
      controlId: 'POL-PACK-NETWORK',
      effect: 'deny',
      capability: 'network',
      scope: 'TASK-001',
    }],
    mechanicalChecks: [{
      checkId: 'CHECK-NETWORK-DENY',
      findingCode: 'PACK_NETWORK_NOT_DENIED',
      description: 'Verify the network mode is denied.',
    }],
    humanReviewChecks: [{
      checkId: 'REVIEW-EXTERNAL-CONTENT',
      description: 'Review all external-content evidence.',
    }],
    carryingCost: { level: 'low', description: 'Synthetic test.' },
    retirementCondition: 'Retire with this test.',
  };
  const manifest = buildPolicyManifest(
    inputs({
      enabledPacks: [{
        path: '.agent-governance/packs/bounded-network-pack.json',
        sha256: objectSha256(pack),
        value: pack,
      }],
    }),
    {
      target: 'codex',
      supportForControl: codexSupportForControl,
    },
  );
  assert.equal(manifest.controls.network[0].mode, 'deny');
  assert.deepEqual(manifest.controls.network[0].scope, ['TASK-001']);
  assert.equal(manifest.controls.externalContent[0].mode, 'deny');
  assert.deepEqual(
    manifest.controls.externalContent[0].scope,
    ['TASK-001'],
  );
  assert.ok(
    manifest.controls.externalContent[0].source.includes(
      'pack:bounded-network-pack@1.0.0',
    ),
  );
  assert.deepEqual(manifest.enabledPacks[0].mechanicalCheckIds, [
    'CHECK-NETWORK-DENY',
  ]);
  assert.deepEqual(manifest.enabledPacks[0].humanReviewCheckIds, [
    'REVIEW-EXTERNAL-CONTENT',
  ]);
  assert.equal(manifest.enabledPacks[0].checkRequirements.length, 2);
  for (const requirement of (
    manifest.enabledPacks[0].checkRequirements
  )) {
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

  const unknownScope = clone(pack);
  unknownScope.controls[0].scope = 'project-local';
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        enabledPacks: [{
          path: '.agent-governance/packs/bounded-network-pack.json',
          sha256: objectSha256(unknownScope),
          value: unknownScope,
        }],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_CONFLICT',
  );

  const multiTaskRisk = clone(riskProfile);
  multiTaskRisk.tasks.push({
    ...clone(multiTaskRisk.tasks[0]),
    taskId: 'TASK-002',
  });
  const secondAssignment = clone(assignment);
  secondAssignment.assignmentId = 'ROLE-002';
  secondAssignment.taskId = 'TASK-002';
  secondAssignment.selectedRoles[0].assignedTaskScope = ['TASK-002'];
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        riskProfile: multiTaskRisk,
        roleAssignments: [
          {
            path: '.agent-governance/role-assignments/TASK-001.json',
            sha256: objectSha256(assignment),
            value: assignment,
          },
          {
            path: '.agent-governance/role-assignments/TASK-002.json',
            sha256: objectSha256(secondAssignment),
            value: secondAssignment,
          },
        ],
        enabledPacks: [{
          path: '.agent-governance/packs/bounded-network-pack.json',
          sha256: objectSha256(pack),
          value: pack,
        }],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_CONFLICT',
  );
});

test('Packs cannot widen fixed controls, invent capabilities, or collide IDs', () => {
  const basePack = {
    schemaVersion: 1,
    packId: 'fixed-control-pack',
    version: '1.0.0',
    status: 'active',
    source: {
      sourceId: 'SRC-PACK',
      repository: 'https://example.com/pack.git',
      revision: 'a'.repeat(40),
      license: 'MIT',
      importedMode: 'metadata',
      sha256: 'b'.repeat(64),
    },
    controls: [],
    mechanicalChecks: [],
    humanReviewChecks: [],
    carryingCost: { level: 'low', description: 'Synthetic test.' },
    retirementCondition: 'Retire with this test.',
  };
  for (const control of [
    {
      controlId: 'POL-PACK-SHELL',
      effect: 'constrained-allow',
      capability: 'shell.execution',
      scope: 'all',
    },
    {
      controlId: 'POL-PACK-UNKNOWN',
      effect: 'deny',
      capability: 'unknown-capability',
      scope: 'all',
    },
  ]) {
    const pack = { ...clone(basePack), controls: [control] };
    assert.throws(
      () => buildPolicyManifest(
        inputs({
          enabledPacks: [
            {
              path: '.agent-governance/packs/fixed-control-pack.json',
              sha256: objectSha256(pack),
              value: pack,
            },
          ],
        }),
        {
          target: 'codex',
          supportForControl: codexSupportForControl,
        },
      ),
      (error) => error?.code === 'POLICY_PRIVILEGE_EXPANSION',
    );
  }

  const collision = {
    ...clone(basePack),
    controls: [
      {
        controlId: 'POL-NETWORK',
        effect: 'deny',
        capability: 'network',
        scope: 'all',
      },
    ],
  };
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        enabledPacks: [
          {
            path: '.agent-governance/packs/fixed-control-pack.json',
            sha256: objectSha256(collision),
            value: collision,
          },
        ],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_CONFLICT',
  );
});

test('portable path normalization is platform-independent and rejects escape', () => {
  assert.equal(
    normalizePortablePath(
      '.agent-governance\\role-assignments\\TASK-001.json',
    ),
    '.agent-governance/role-assignments/TASK-001.json',
  );
  assert.equal(
    normalizePortablePath(
      '.agent-governance/role-assignments/TASK-001.json',
    ),
    '.agent-governance/role-assignments/TASK-001.json',
  );
  for (const unsafe of [
    '../outside.json',
    '/Users/example/.codex/config.toml',
    'C:\\Users\\example\\.codex\\config.toml',
    '\\\\server\\share\\config.toml',
    'CON.json',
    'policy?.json',
  ]) {
    assert.throws(
      () => normalizePortablePath(unsafe),
      (error) => error?.code === 'COMPILE_PATH_BLOCKED',
    );
  }
});

test('portable input paths reject case-fold collisions', () => {
  assert.throws(
    () => buildPolicyManifest(
      inputs({
        inputHashes: [
          ...inputs().inputHashes,
          {
            path: '.agent-governance/RISK-PROFILE.json',
            sha256: '2'.repeat(64),
          },
        ],
      }),
      {
        target: 'codex',
        supportForControl: codexSupportForControl,
      },
    ),
    (error) => error?.code === 'POLICY_CONFLICT',
  );
});
