import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  validateArtifact,
} from '../../scripts/lib/governance-artifacts.mjs';
import {
  ROOT,
} from './helpers.mjs';

const SCHEMAS = [
  'materialize-receipt.schema.json',
  'attest-output.schema.json',
];

const CLAIM = 'PROJECT_LAYER_OBSERVED_NOT_RUNTIME_ENFORCED';

function readSchema(name) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, 'schemas', name), 'utf8'),
  );
}

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

function baseAttest(overrides = {}) {
  return {
    schemaVersion: 1,
    level: 'materialized-unverified',
    trustStateObserved: 'unknown',
    target: 'codex',
    policyId: 'POL-7C0E73297E0E',
    policyHash: 'a'.repeat(64),
    materializeId: 'MAT-0123456789AB',
    declared: 12,
    materialized: 4,
    projectLayerObserved: 4,
    classificationBreakdown: {
      enforceable: 1,
      'representable-only': 7,
      unsupported: 2,
      'requires-human-approval': 2,
      'runtime-evidence-required': 0,
    },
    classificationSourceDivergence: [],
    materializationBreakdown: {
      'not-applicable': 5,
      materializable: 4,
      deferred: 3,
    },
    drift: [],
    precedenceCaveat: ['The command line sits above the project layer.'],
    knownLimitations: [
      {
        controlId: 'POL-CREDENTIALS',
        note: 'Project config cannot override provider keys.',
        source: 'docs/enforcement-boundary.md',
      },
    ],
    claim: CLAIM,
    ...overrides,
  };
}

test('both new schemas exist and are closed everywhere', () => {
  for (const name of SCHEMAS) {
    const schema = readSchema(name);
    assert.equal(schema.additionalProperties, false, `${name} root`);
    assertClosedObjects(schema, name);
  }
});

test('a valid attest output passes its schema', () => {
  // validateArtifact reports valid for an unknown schema name, so assert the
  // file exists first; otherwise this test would pass before the schema does.
  readSchema('attest-output.schema.json');
  const result = validateArtifact('attest-output.schema.json', baseAttest());
  assert.equal(result.valid, true, JSON.stringify(result.errors));
});

test('levels above the project layer are unrepresentable, not blacklisted', () => {
  const schema = readSchema('attest-output.schema.json');
  const levels = schema.properties.level.enum
    ?? schema.$defs?.[schema.properties.level.$ref?.split('/').pop()]?.enum;
  assert.deepEqual(
    [...levels].sort(),
    ['materialized-unverified', 'project-layer-observed'],
  );

  for (const level of ['observed', 'effective-observed', 'runtime-evidenced']) {
    const result = validateArtifact(
      'attest-output.schema.json',
      baseAttest({ level }),
    );
    assert.equal(result.valid, false, `${level} must be rejected`);
  }
});

test('trustStateObserved admits only unknown in both schemas', () => {
  for (const name of SCHEMAS) {
    const schema = readSchema(name);
    const property = schema.properties.trustStateObserved;
    const enumeration = property.enum
      ?? schema.$defs?.[property.$ref?.split('/').pop()]?.enum;
    assert.deepEqual(enumeration, ['unknown'], `${name} must admit only unknown`);
  }

  for (const trustStateObserved of ['trusted', 'untrusted']) {
    const result = validateArtifact(
      'attest-output.schema.json',
      baseAttest({ trustStateObserved }),
    );
    assert.equal(result.valid, false, `${trustStateObserved} must be rejected`);
  }
});

test('project-layer-observed cannot be paired with an admissible trust state', () => {
  const result = validateArtifact(
    'attest-output.schema.json',
    baseAttest({ level: 'project-layer-observed' }),
  );
  assert.equal(
    result.valid,
    false,
    'the reserved level must stay unproducible while trust is unknown',
  );
});

test('the claim is a schema constant', () => {
  const schema = readSchema('attest-output.schema.json');
  assert.equal(schema.properties.claim.const, CLAIM);
  const result = validateArtifact(
    'attest-output.schema.json',
    baseAttest({ claim: 'PROJECT_LAYER_RUNTIME_ENFORCED' }),
  );
  assert.equal(result.valid, false);
});

test('empty precedenceCaveat or knownLimitations fails validation', () => {
  for (const field of ['precedenceCaveat', 'knownLimitations']) {
    const result = validateArtifact(
      'attest-output.schema.json',
      baseAttest({ [field]: [] }),
    );
    assert.equal(result.valid, false, `${field} must reject an empty array`);
  }
});

test('classificationSourceDivergence may be empty but never omitted', () => {
  const present = validateArtifact(
    'attest-output.schema.json',
    baseAttest({ classificationSourceDivergence: [] }),
  );
  assert.equal(present.valid, true, JSON.stringify(present.errors));

  const missing = baseAttest();
  delete missing.classificationSourceDivergence;
  assert.equal(
    validateArtifact('attest-output.schema.json', missing).valid,
    false,
  );
});

test('the receipt schema requires modeCoverage on every materialized control', () => {
  const schema = readSchema('materialize-receipt.schema.json');
  const definition = schema.$defs.materializedControl;
  assert.ok(definition.required.includes('modeCoverage'));
  assert.deepEqual(
    [...definition.properties.modeCoverage.enum].sort(),
    ['approval-gate-only', 'full'],
  );
});

test('materializationStatus is a three-value enum and adds no classification', () => {
  const schema = readSchema('materialize-receipt.schema.json');
  assert.deepEqual(
    [...schema.$defs.materializationStatus.enum].sort(),
    ['deferred', 'materializable', 'not-applicable'],
  );
  const forbidden = ['enforceable', 'representable-only', 'unsupported'];
  for (const value of forbidden) {
    assert.equal(
      schema.$defs.materializationStatus.enum.includes(value),
      false,
      `${value} is a classification and must not appear here`,
    );
  }
});

test('the receipt status enum covers exactly the two transaction outcomes', () => {
  const schema = readSchema('materialize-receipt.schema.json');
  assert.deepEqual(
    [...schema.properties.status.enum].sort(),
    ['dry-run', 'target-materialized'],
  );
});

test('both schemas are reachable from the CLI output envelope', () => {
  const envelope = readSchema('cli-output.schema.json');
  const refs = JSON.stringify(envelope.properties.result);
  for (const name of SCHEMAS) {
    assert.ok(refs.includes(name), `${name} must be an accepted result shape`);
  }
});
