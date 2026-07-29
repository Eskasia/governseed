import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256Canonical,
  validateArtifact,
} from '../../scripts/lib/governance-artifacts.mjs';
import {
  buildCodexPolicyAdapter,
} from '../../scripts/lib/codex-policy-adapter.mjs';
import {
  ROOT,
} from './helpers.mjs';

const SCHEMAS = [
  'policy-manifest.schema.json',
  'codex-policy-adapter.schema.json',
  'compile-receipt.schema.json',
];

function assertClosedObjects(value, location = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertClosedObjects(entry, `${location}[${index}]`);
    });
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (value.type === 'object') {
    assert.equal(
      value.additionalProperties,
      false,
      `${location} must set additionalProperties:false`,
    );
  }
  for (const [key, entry] of Object.entries(value)) {
    assertClosedObjects(entry, `${location}.${key}`);
  }
}

function control(controlId, capability, mode, support) {
  return {
    controlId,
    capability,
    mode,
    source: ['risk-profile:RISK-001'],
    reasonCodes: ['POLICY_RISK_CEILING'],
    scope: ['project-local'],
    targetSupport: { codex: support },
    evidenceRequirement: ['EVD-001'],
  };
}

export function sampleManifest() {
  const seed = {
    schemaVersion: 1,
    revision: 1,
    projectId: 'RISK-001',
    generatedAt: null,
    compilerVersion: '1.0.0',
    inputHashes: [
      {
        path: '.agent-governance/risk-profile.json',
        sha256: '1'.repeat(64),
      },
    ],
    riskProfileRef: {
      profileId: 'RISK-001',
      path: '.agent-governance/risk-profile.json',
      sha256: '1'.repeat(64),
    },
    sourceRefs: ['SRC-001'],
    roleAssignmentRefs: [
      {
        assignmentId: 'ROLE-001',
        taskId: 'TASK-001',
        revision: 1,
        path: '.agent-governance/role-assignments/TASK-001.json',
        sha256: '2'.repeat(64),
      },
    ],
    enabledPacks: [],
    controls: {
      filesystem: [
        control(
          'POL-FILESYSTEM-PROJECT-WRITE',
          'filesystem.project-write',
          'constrained-allow',
          'representable-only',
        ),
      ],
      shell: [
        control(
          'POL-SHELL-EXECUTION',
          'shell.execution',
          'require-approval',
          'requires-human-approval',
        ),
      ],
      network: [
        control(
          'POL-NETWORK',
          'network',
          'deny',
          'representable-only',
        ),
      ],
      credentials: [
        control(
          'POL-CREDENTIALS',
          'credentials',
          'deny',
          'unsupported',
        ),
      ],
      destructiveActions: [
        control(
          'POL-DESTRUCTIVE-ACTIONS',
          'delete',
          'deny',
          'requires-human-approval',
        ),
      ],
      publishActions: [
        control(
          'POL-PUBLISH-ACTIONS',
          'publish',
          'require-approval',
          'requires-human-approval',
        ),
      ],
      externalContent: [
        control(
          'POL-EXTERNAL-CONTENT',
          'external-content',
          'deny',
          'representable-only',
        ),
      ],
      generatedArtifacts: [
        control(
          'POL-GENERATED-ARTIFACTS',
          'generated-artifacts',
          'constrained-allow',
          'enforceable',
        ),
      ],
      retention: [
        control(
          'POL-RETENTION',
          'provider-retention',
          'advisory',
          'unsupported',
        ),
      ],
      verification: [
        control(
          'POL-VERIFICATION',
          'verification',
          'require-approval',
          'representable-only',
        ),
      ],
    },
    targets: [
      {
        target: 'codex',
        adapterVersion: '1.0.0',
        status: 'candidate',
      },
    ],
    unsupportedControls: [
      {
        controlId: 'POL-CREDENTIALS',
        capability: 'credentials',
        target: 'codex',
        support: 'unsupported',
        reasonCode: 'CODEX_CONTROL_NOT_ENFORCEABLE',
      },
      {
        controlId: 'POL-RETENTION',
        capability: 'provider-retention',
        target: 'codex',
        support: 'unsupported',
        reasonCode: 'CODEX_CONTROL_NOT_ENFORCEABLE',
      },
    ],
    humanApprovalControls: [
      'POL-PUBLISH-ACTIONS',
      'POL-SHELL-EXECUTION',
      'POL-VERIFICATION',
    ],
    evidenceRequirements: ['EVD-001'],
    ownership: {
      generator: 'GovernSeed',
      artifactType: 'policy-manifest',
    },
    status: 'candidate',
  };
  return {
    ...seed,
    policyId:
      `POL-${sha256Canonical(seed).slice(0, 12).toUpperCase()}`,
  };
}

export function sampleAdapter(manifest = sampleManifest()) {
  return buildCodexPolicyAdapter(manifest);
}

export function sampleReceipt(
  manifest = sampleManifest(),
  adapter = sampleAdapter(manifest),
) {
  const outputHashes = [
    {
      path:
        `.agent-governance/policies/${manifest.policyId}.json`,
      sha256: sha256Bytes(canonicalJsonBytes(manifest)),
    },
    {
      path:
        `.agent-governance/adapters/codex/${manifest.policyId}.json`,
      sha256: sha256Bytes(canonicalJsonBytes(adapter)),
    },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const compileId =
    `COMPILE-${sha256Canonical({
      policyId: manifest.policyId,
      target: 'codex',
      outputHashes,
    }).slice(0, 12).toUpperCase()}`;
  return {
    schemaVersion: 1,
    compileId,
    policyId: manifest.policyId,
    inputHashes: manifest.inputHashes,
    outputHashes,
    target: 'codex',
    dryRun: false,
    filesCreated: [
      `.agent-governance/policies/${manifest.policyId}.json`,
      `.agent-governance/adapters/codex/${manifest.policyId}.json`,
      `.agent-governance/receipts/${compileId}.json`,
    ],
    filesUpdated: [],
    filesUnchanged: [],
    unsupportedControls: manifest.unsupportedControls,
    warnings: [
      'CODEX_CONTROL_NOT_ENFORCEABLE',
      'POLICY_UNSUPPORTED_CONTROL',
    ],
    compiledAt: '2026-07-29T12:00:00.000Z',
    ownership: {
      generator: 'GovernSeed',
      artifactType: 'compile-receipt',
    },
  };
}

function assertArtifactInvalid(schema, value, expectedCode) {
  const validation = validateArtifact(schema, value);
  assert.equal(
    validation.valid,
    false,
    `${schema} unexpectedly accepted ${JSON.stringify(value)}`,
  );
  assert.ok(
    validation.errors.some((error) => error.code === expectedCode),
    `${schema} did not report ${expectedCode}: ${JSON.stringify(validation.errors)}`,
  );
}

test('three policy compiler schemas are closed Draft 2020-12 contracts', () => {
  for (const name of SCHEMAS) {
    const schema = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'schemas', name), 'utf8'),
    );
    assert.equal(
      schema.$schema,
      'https://json-schema.org/draft/2020-12/schema',
    );
    assert.equal(schema.additionalProperties, false);
    assertClosedObjects(schema);
  }
});

test('positive policy, Codex adapter, and receipt samples validate', () => {
  const manifest = sampleManifest();
  const adapter = sampleAdapter(manifest);
  const receipt = sampleReceipt(manifest, adapter);
  for (const [name, value, context] of [
    ['policy-manifest.schema.json', manifest, {}],
    ['codex-policy-adapter.schema.json', adapter, { manifest }],
    [
      'compile-receipt.schema.json',
      receipt,
      { manifest, adapter },
    ],
  ]) {
    const result = validateArtifact(name, value, context);
    assert.equal(result.valid, true, JSON.stringify(result.errors));
  }
});

test('policy transactions reject incomplete derived claims and forged links', () => {
  const manifest = sampleManifest();
  const adapter = sampleAdapter(manifest);
  const receipt = sampleReceipt(manifest, adapter);

  for (const mutate of [
    (value) => { value.unsupportedControls = []; },
    (value) => { value.humanApprovalControls = []; },
    (value) => { value.generatedAt = '2026-07-29T12:00:00.000Z'; },
  ]) {
    const candidate = structuredClone(manifest);
    mutate(candidate);
    assertArtifactInvalid(
      'policy-manifest.schema.json',
      candidate,
      'SCHEMA_VALIDATION_FAILED',
    );
  }

  const incompleteAdapter = structuredClone(adapter);
  incompleteAdapter.mappedControls = incompleteAdapter.mappedControls.slice(1);
  assert.equal(
    validateArtifact(
      'codex-policy-adapter.schema.json',
      incompleteAdapter,
      { manifest },
    ).valid,
    false,
  );

  const mismatchedReceipt = structuredClone(receipt);
  mismatchedReceipt.inputHashes[0].sha256 = 'f'.repeat(64);
  assert.equal(
    validateArtifact(
      'compile-receipt.schema.json',
      mismatchedReceipt,
      { manifest, adapter },
    ).valid,
    false,
  );

  const privateInput = structuredClone(manifest);
  privateInput.inputHashes[0].path =
    '.agent-governance/local/private.json';
  delete privateInput.policyId;
  privateInput.policyId =
    `POL-${sha256Canonical(privateInput).slice(0, 12).toUpperCase()}`;
  assertArtifactInvalid(
    'policy-manifest.schema.json',
    privateInput,
    'PRIVATE_CONTENT_BLOCKED',
  );
});

test('policy schemas reject unknown versions, secrets, home paths, and open objects', () => {
  const cases = [
    [
      'policy-manifest.schema.json',
      { ...sampleManifest(), schemaVersion: 99 },
      'SCHEMA_VERSION_UNSUPPORTED',
    ],
    [
      'codex-policy-adapter.schema.json',
      { ...sampleAdapter(), credential: 'sk-proj-' + 'x'.repeat(32) },
      'SCHEMA_VALIDATION_FAILED',
    ],
    [
      'compile-receipt.schema.json',
      {
        ...sampleReceipt(),
        warnings: ['/Users/example/.codex/config.toml'],
      },
      'PATH_ESCAPE_BLOCKED',
    ],
  ];
  for (const [name, value, code] of cases) {
    let validation;
    try {
      validation = validateArtifact(name, value);
    } catch (error) {
      assert.equal(error.code, code);
      continue;
    }
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.some((error) => error.code === code));
  }
});

test('unsupported control lists cannot claim target enforcement', () => {
  for (const [schema, value] of [
    ['policy-manifest.schema.json', sampleManifest()],
    ['codex-policy-adapter.schema.json', sampleAdapter()],
    ['compile-receipt.schema.json', sampleReceipt()],
  ]) {
    value.unsupportedControls[0].support = 'enforceable';
    assertArtifactInvalid(schema, value, 'SCHEMA_VALIDATION_FAILED');
  }
});

test('manifest rejects duplicate hash paths, control IDs, and capabilities', () => {
  const duplicateHashPath = sampleManifest();
  duplicateHashPath.inputHashes.push({
    ...duplicateHashPath.inputHashes[0],
    sha256: 'f'.repeat(64),
  });
  assertArtifactInvalid(
    'policy-manifest.schema.json',
    duplicateHashPath,
    'DUPLICATE_ID',
  );

  const duplicateControlId = sampleManifest();
  duplicateControlId.controls.externalContent.push(
    control(
      'POL-NETWORK',
      'network.audit',
      'deny',
      'representable-only',
    ),
  );
  assertArtifactInvalid(
    'policy-manifest.schema.json',
    duplicateControlId,
    'DUPLICATE_ID',
  );

  const duplicateCapability = sampleManifest();
  duplicateCapability.controls.network.push(
    control(
      'POL-NETWORK-ALTERNATE',
      'network',
      'deny',
      'representable-only',
    ),
  );
  assertArtifactInvalid(
    'policy-manifest.schema.json',
    duplicateCapability,
    'DUPLICATE_ID',
  );
});

test('Codex adapter rejects duplicate mappings and invalid generated files', () => {
  const duplicateMappedId = sampleAdapter();
  duplicateMappedId.mappedControls.push({
    controlId: 'POL-NETWORK',
    capability: 'network.audit',
    mode: 'deny',
    support: 'representable-only',
    representation: 'guidance',
  });
  assertArtifactInvalid(
    'codex-policy-adapter.schema.json',
    duplicateMappedId,
    'DUPLICATE_ID',
  );

  const mappedUnsupportedOverlap = sampleAdapter();
  mappedUnsupportedOverlap.mappedControls.push({
    controlId: 'POL-CREDENTIALS',
    capability: 'credentials',
    mode: 'deny',
    support: 'representable-only',
    representation: 'guidance',
  });
  assertArtifactInvalid(
    'codex-policy-adapter.schema.json',
    mappedUnsupportedOverlap,
    'DUPLICATE_ID',
  );

  const invalidGeneratedFiles = sampleAdapter();
  invalidGeneratedFiles.generatedFiles = ['README.md'];
  assertArtifactInvalid(
    'codex-policy-adapter.schema.json',
    invalidGeneratedFiles,
    'SCHEMA_VALIDATION_FAILED',
  );
});

test('compile receipt rejects duplicate paths, state overlap, and partial outputs', () => {
  const duplicateInputPath = sampleReceipt();
  duplicateInputPath.inputHashes.push({
    ...duplicateInputPath.inputHashes[0],
    sha256: 'f'.repeat(64),
  });
  assertArtifactInvalid(
    'compile-receipt.schema.json',
    duplicateInputPath,
    'DUPLICATE_ID',
  );

  const duplicateOutputPath = sampleReceipt();
  duplicateOutputPath.outputHashes.push({
    ...duplicateOutputPath.outputHashes[0],
    sha256: 'e'.repeat(64),
  });
  assertArtifactInvalid(
    'compile-receipt.schema.json',
    duplicateOutputPath,
    'DUPLICATE_ID',
  );

  const overlappingState = sampleReceipt();
  overlappingState.filesUnchanged.push(overlappingState.filesCreated[0]);
  assertArtifactInvalid(
    'compile-receipt.schema.json',
    overlappingState,
    'SCHEMA_VALIDATION_FAILED',
  );

  const partialOutputs = sampleReceipt();
  partialOutputs.outputHashes = partialOutputs.outputHashes.filter(
    (entry) => !entry.path.includes('/adapters/codex/'),
  );
  assertArtifactInvalid(
    'compile-receipt.schema.json',
    partialOutputs,
    'SCHEMA_VALIDATION_FAILED',
  );
});

test('CLI output schema accepts a compile receipt as the single result object', () => {
  const receipt = sampleReceipt();
  const output = {
    schemaVersion: 1,
    ok: true,
    command: 'compile',
    code: 'OK',
    status: 'compiled',
    artifact: `.agent-governance/receipts/${receipt.compileId}.json`,
    result: receipt,
    findings: [],
  };
  const result = validateArtifact('cli-output.schema.json', output);
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});
