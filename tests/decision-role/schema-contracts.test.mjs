import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  readJsonArtifact,
  sha256Canonical,
  validateArtifact,
} from '../../scripts/lib/governance-artifacts.mjs';
import {
  BUILTIN_CATALOG,
} from '../../scripts/lib/decision-role-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURES = path.join(ROOT, 'tests/decision-role/fixtures');
const SCHEMA_NAMES = [
  'risk-profile.schema.json',
  'source-lock.schema.json',
  'governance-pack.schema.json',
  'role-catalog.schema.json',
  'role-assignment.schema.json',
  'deliberation-plan.schema.json',
  'deliberation-result.schema.json',
];

function loadJson(...segments) {
  return JSON.parse(fs.readFileSync(path.join(FIXTURES, ...segments), 'utf8'));
}

function clone(value) {
  return structuredClone(value);
}

function errorCodes(result) {
  return result.errors.map((error) => error.code);
}

function assertValid(schemaName, value, context = {}) {
  const result = validateArtifact(schemaName, value, context);
  assert.equal(
    result.valid,
    true,
    `${schemaName}: ${JSON.stringify(result.errors)}`,
  );
  assert.deepEqual(result.errors, []);
}

function assertInvalid(schemaName, value, code, context = {}) {
  const result = validateArtifact(schemaName, value, context);
  assert.equal(result.valid, false, `${schemaName} unexpectedly accepted input`);
  assert.ok(
    errorCodes(result).includes(code),
    `${schemaName} expected ${code}, got ${JSON.stringify(result.errors)}`,
  );
}

function assertThrowsCode(run, code) {
  assert.throws(run, (error) => {
    assert.equal(error?.code, code);
    assert.equal(typeof error.message, 'string');
    return true;
  });
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

const lowRisk = loadJson(
  'low-risk-docs-task',
  '.agent-governance',
  'risk-profile.json',
);
const sourceLock = loadJson(
  'low-risk-docs-task',
  '.agent-governance',
  'source-lock.json',
);
const governancePack = loadJson(
  'low-risk-docs-task',
  '.agent-governance',
  'packs',
  'minimal-change.json',
);
const roleCatalog = loadJson(
  'low-risk-docs-task',
  '.agent-governance',
  'catalogs',
  'role-catalog.json',
);
const lowAssignment = loadJson(
  'low-risk-docs-task',
  '.agent-governance',
  'role-assignments',
  'TASK-001.json',
);
const decision = loadJson(
  'architecture-decision',
  '.agent-governance',
  'decisions',
  'DEC-001',
  'decision.json',
);
const plan = loadJson(
  'architecture-decision',
  '.agent-governance',
  'decisions',
  'DEC-001',
  'deliberation-plan.json',
);
const importedResult = loadJson(
  'architecture-decision',
  '.agent-governance',
  'decisions',
  'DEC-001',
  'deliberation-result.json',
);
const confirmation = loadJson(
  'architecture-decision',
  '.agent-governance',
  'decisions',
  'DEC-001',
  'human-confirmation.json',
);

const lowContext = {
  knownTaskIds: ['TASK-001'],
  riskProfile: lowRisk,
  sourceLock,
  roleCatalog,
  roleCatalogPath: '.agent-governance/catalogs/role-catalog.json',
};
const deliberationContext = {
  knownDecisionIds: ['DEC-001'],
  decision,
  plan,
};

test('seven public schemas are closed JSON Schema draft 2020-12 contracts', () => {
  for (const schemaName of SCHEMA_NAMES) {
    const schema = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'schemas', schemaName), 'utf8'),
    );
    assert.equal(
      schema.$schema,
      'https://json-schema.org/draft/2020-12/schema',
    );
    assert.equal(schema.additionalProperties, false);
    assertClosedObjects(schema);
  }
});

test('the separate CLI-output schema validates one closed stdout object', () => {
  const schemaName = 'cli-output.schema.json';
  const schema = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'schemas', schemaName), 'utf8'),
  );
  assert.equal(
    schema.$schema,
    'https://json-schema.org/draft/2020-12/schema',
  );
  assert.equal(schema.additionalProperties, false);
  assertClosedObjects(schema);

  const output = {
    schemaVersion: 1,
    ok: true,
    command: 'assess',
    code: 'OK',
    status: 'assessed',
    artifact: '.agent-governance/risk-profile.json',
    result: lowRisk,
    findings: [],
  };
  assertValid(schemaName, output);
  assertInvalid(
    schemaName,
    { ...output, unexpected: true },
    'SCHEMA_VALIDATION_FAILED',
  );
  assertInvalid(
    schemaName,
    { ...output, schemaVersion: 99 },
    'SCHEMA_VERSION_UNSUPPORTED',
  );
});

test('the six named fixtures exist and cover every public schema positively', () => {
  assert.deepEqual(
    fs
      .readdirSync(FIXTURES, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort(),
    [
      'architecture-decision',
      'low-risk-docs-task',
      'malicious-role-catalog',
      'privacy-negative',
      'replay-version-mismatch',
      'restricted-publish-task',
    ],
  );

  assertValid('risk-profile.schema.json', lowRisk);
  assertValid('source-lock.schema.json', sourceLock);
  assertValid('governance-pack.schema.json', governancePack, { sourceLock });
  assertValid('role-catalog.schema.json', roleCatalog, { sourceLock });
  assertValid(
    'role-assignment.schema.json',
    lowAssignment,
    lowContext,
  );
  assertValid('deliberation-plan.schema.json', plan, deliberationContext);
  assertValid(
    'deliberation-result.schema.json',
    importedResult,
    {
      ...deliberationContext,
      operation: 'stored',
      humanConfirmation: confirmation,
    },
  );
});

test('canonical JSON and cross-file hashes are deterministic and content-bound', () => {
  assert.equal(
    canonicalJson({ z: 1, a: { y: 2, x: 3 } }),
    '{"a":{"x":3,"y":2},"z":1}',
  );
  assert.equal(
    sha256Canonical({ z: 1, a: { y: 2, x: 3 } }),
    sha256Canonical({ a: { x: 3, y: 2 }, z: 1 }),
  );
  assert.equal(plan.decisionSha256, sha256Canonical(decision));
  const unhashedPlan = clone(plan);
  delete unhashedPlan.planSha256;
  assert.equal(plan.planSha256, sha256Canonical(unhashedPlan));
  assert.equal(importedResult.decisionSha256, plan.decisionSha256);
  assert.equal(importedResult.planSha256, plan.planSha256);
  const unhashedResult = clone(importedResult);
  delete unhashedResult.resultSha256;
  unhashedResult.importStatus = 'imported';
  assert.equal(importedResult.resultSha256, sha256Canonical(unhashedResult));
  assert.equal(confirmation.decisionSha256, plan.decisionSha256);
  assert.equal(confirmation.planSha256, plan.planSha256);
  assert.equal(confirmation.resultSha256, importedResult.resultSha256);
});

test('every public schema rejects an unknown schema version', () => {
  const cases = [
    ['risk-profile.schema.json', lowRisk, {}],
    ['source-lock.schema.json', sourceLock, {}],
    ['governance-pack.schema.json', governancePack, { sourceLock }],
    ['role-catalog.schema.json', roleCatalog, { sourceLock }],
    ['role-assignment.schema.json', lowAssignment, lowContext],
    ['deliberation-plan.schema.json', plan, deliberationContext],
    ['deliberation-result.schema.json', importedResult, deliberationContext],
  ];
  for (const [schemaName, value, context] of cases) {
    assertInvalid(
      schemaName,
      { ...clone(value), schemaVersion: 99 },
      'SCHEMA_VERSION_UNSUPPORTED',
      context,
    );
  }
});

test('duplicate stable IDs fail closed across lock, catalog, and deliberation graph', () => {
  const duplicateSource = clone(sourceLock);
  duplicateSource.sources.push(clone(duplicateSource.sources[0]));
  assertInvalid(
    'source-lock.schema.json',
    duplicateSource,
    'DUPLICATE_ID',
  );

  const duplicateRole = clone(roleCatalog);
  duplicateRole.roles.push(clone(duplicateRole.roles[0]));
  assertInvalid(
    'role-catalog.schema.json',
    duplicateRole,
    'DUPLICATE_ID',
    { sourceLock },
  );

  const duplicateSeat = clone(plan);
  duplicateSeat.seats.push(clone(duplicateSeat.seats[0]));
  assertInvalid(
    'deliberation-plan.schema.json',
    duplicateSeat,
    'DUPLICATE_ID',
    deliberationContext,
  );
});

test('external source provenance requires pinned revision, license, and hash', () => {
  for (const [field, code] of [
    ['commit', 'SOURCE_REVISION_UNPINNED'],
    ['license', 'SOURCE_LICENSE_MISSING'],
    ['sha256', 'SOURCE_HASH_MISSING'],
  ]) {
    const value = clone(sourceLock);
    delete value.sources[0][field];
    assertInvalid('source-lock.schema.json', value, code);
  }

  for (const [field, code] of [
    ['revision', 'SOURCE_REVISION_UNPINNED'],
    ['license', 'SOURCE_LICENSE_MISSING'],
    ['sha256', 'SOURCE_HASH_MISSING'],
  ]) {
    const value = clone(roleCatalog);
    delete value.source[field];
    assertInvalid('role-catalog.schema.json', value, code, { sourceLock });
  }
});

test('reader accepts UTF-8 and CRLF or LF without changing parsed meaning', (t) => {
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'governance-artifact-text-'),
  );
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const value = { schemaVersion: 1, label: '治理', status: 'normalized' };
  fs.writeFileSync(
    path.join(sandbox, 'lf.json'),
    `${JSON.stringify(value, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(sandbox, 'crlf.json'),
    `${JSON.stringify(value, null, 2).replaceAll('\n', '\r\n')}\r\n`,
    'utf8',
  );
  assert.deepEqual(readJsonArtifact(sandbox, 'lf.json'), value);
  assert.deepEqual(readJsonArtifact(sandbox, 'crlf.json'), value);
});

test('reader blocks traversal, absolute home paths, and symlink escape', (t) => {
  const privacyRoot = path.join(FIXTURES, 'privacy-negative');
  assertThrowsCode(
    () => readJsonArtifact(privacyRoot, '../outside.json'),
    'PATH_ESCAPE_BLOCKED',
  );
  for (const filename of [
    'absolute-home-macos.json',
    'absolute-home-linux.json',
    'absolute-home-windows.json',
    'path-traversal.json',
  ]) {
    assertThrowsCode(
      () => readJsonArtifact(privacyRoot, filename),
      'PATH_ESCAPE_BLOCKED',
    );
  }

  if (process.platform === 'win32') {
    t.diagnostic('symlink escape is exercised on POSIX; Windows path forms are covered above');
    return;
  }
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'governance-artifact-link-'),
  );
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  const project = path.join(sandbox, 'project');
  fs.mkdirSync(project);
  fs.writeFileSync(path.join(sandbox, 'outside.json'), '{"safe":true}\n');
  fs.symlinkSync(
    path.join(sandbox, 'outside.json'),
    path.join(project, 'linked.json'),
  );
  assertThrowsCode(
    () => readJsonArtifact(project, 'linked.json'),
    'SYMLINK_BLOCKED',
  );
});

test('reader rejects invalid UTF-8, duplicate keys, and files over one MiB', (t) => {
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'governance-artifact-bytes-'),
  );
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

  fs.writeFileSync(
    path.join(sandbox, 'invalid-utf8.json'),
    Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xc3, 0x28, 0x22, 0x7d]),
  );
  assertThrowsCode(
    () => readJsonArtifact(sandbox, 'invalid-utf8.json'),
    'INVALID_UTF8',
  );

  fs.writeFileSync(
    path.join(sandbox, 'duplicate-key.json'),
    '{"schemaVersion":1,"schemaVersion":1}\n',
    'utf8',
  );
  assertThrowsCode(
    () => readJsonArtifact(sandbox, 'duplicate-key.json'),
    'DUPLICATE_JSON_KEY',
  );

  fs.writeFileSync(
    path.join(sandbox, 'oversized.json'),
    `{"value":"${'a'.repeat(1024 * 1024)}"}\n`,
    'utf8',
  );
  assertThrowsCode(
    () => readJsonArtifact(sandbox, 'oversized.json'),
    'FILE_TOO_LARGE',
  );
});

test('reader blocks raw provider content, credentials, cookies, and secret query strings', () => {
  const privacyRoot = path.join(FIXTURES, 'privacy-negative');
  assert.deepEqual(
    readJsonArtifact(privacyRoot, 'safe-metadata.json'),
    loadJson('privacy-negative', 'safe-metadata.json'),
  );
  assertThrowsCode(
    () => readJsonArtifact(privacyRoot, 'raw-prompt.json'),
    'PRIVATE_CONTENT_BLOCKED',
  );
  for (const filename of [
    'api-key.json',
    'provider-cookie.json',
    'secret-query-string.json',
  ]) {
    assertThrowsCode(
      () => readJsonArtifact(privacyRoot, filename),
      'SECRET_VALUE_BLOCKED',
    );
  }
});

test('catalog requests cannot expand the project permission ceiling', () => {
  const maliciousLock = loadJson(
    'malicious-role-catalog',
    '.agent-governance',
    'source-lock.json',
  );
  const maliciousRisk = loadJson(
    'malicious-role-catalog',
    '.agent-governance',
    'risk-profile.json',
  );
  const maliciousCatalog = loadJson(
    'malicious-role-catalog',
    '.agent-governance',
    'role-catalogs',
    'malicious-role-catalog.json',
  );
  const unsafeAssignment = loadJson(
    'malicious-role-catalog',
    '.agent-governance',
    'role-assignments',
    'unsafe-TASK-001.json',
  );
  const blockedAssignment = loadJson(
    'malicious-role-catalog',
    '.agent-governance',
    'role-assignments',
    'expected-blocked-TASK-001.json',
  );
  const context = {
    knownTaskIds: ['TASK-001'],
    riskProfile: maliciousRisk,
    sourceLock: maliciousLock,
    roleCatalog: maliciousCatalog,
  };

  assertValid('role-catalog.schema.json', maliciousCatalog, {
    sourceLock: maliciousLock,
  });
  assertInvalid(
    'role-assignment.schema.json',
    unsafeAssignment,
    'ROLE_PRIVILEGE_EXPANSION',
    context,
  );
  assertValid(
    'role-assignment.schema.json',
    blockedAssignment,
    context,
  );
});

test('external-catalog assignments exact-match catalog provenance and role identity', () => {
  const compatibleCatalog = clone(roleCatalog);
  compatibleCatalog.roles[0].supportedResponsibilities = [
    'implementation-owner',
  ];
  compatibleCatalog.roles[0].requestedCapabilities = clone(
    lowAssignment.selectedRoles[0].requestedCapabilities,
  );
  const compatibleContext = {
    ...lowContext,
    roleCatalog: compatibleCatalog,
  };
  const assignment = clone(lowAssignment);
  assignment.selectedRoles[0] = {
    ...assignment.selectedRoles[0],
    specialistRoleId: compatibleCatalog.roles[0].roleId,
    source: 'external-catalog',
    sourceCatalog: lowContext.roleCatalogPath,
    sourceRevision: compatibleCatalog.source.revision,
    sourceLicense: compatibleCatalog.source.license,
    sourceHash: compatibleCatalog.source.sha256,
  };
  assertValid(
    'role-assignment.schema.json',
    assignment,
    compatibleContext,
  );

  const forged = clone(assignment);
  forged.selectedRoles[0].sourceRevision = 'f'.repeat(40);
  assertInvalid(
    'role-assignment.schema.json',
    forged,
    'SOURCE_PROVENANCE_MISMATCH',
    compatibleContext,
  );

  const unknownRole = clone(assignment);
  unknownRole.selectedRoles[0].specialistRoleId = 'not-in-catalog';
  assertInvalid(
    'role-assignment.schema.json',
    unknownRole,
    'SOURCE_PROVENANCE_MISMATCH',
    compatibleContext,
  );
});

test('built-in responsibility provenance hash is bound to the declared roles hash scope', () => {
  const catalog = JSON.parse(
    fs.readFileSync(
      path.join(ROOT, 'catalogs/governance-responsibilities.json'),
      'utf8',
    ),
  );
  assert.equal(catalog.source.hashScope, 'roles');
  assert.equal(catalog.source.sha256, sha256Canonical(catalog.roles));
  assert.equal(BUILTIN_CATALOG.sourceHash, catalog.source.sha256);
});

test('state transitions, decision references, and task references are validated semantically', () => {
  const invalidTransition = clone(lowAssignment);
  invalidTransition.revision = 2;
  invalidTransition.status = 'needs-human-selection';
  invalidTransition.supersedes = `${lowAssignment.assignmentId}@1`;
  assertInvalid(
    'role-assignment.schema.json',
    invalidTransition,
    'INVALID_STATUS_TRANSITION',
    { ...lowContext, previousArtifact: lowAssignment },
  );

  const unknownDecision = clone(plan);
  unknownDecision.decisionId = 'DEC-999';
  assertInvalid(
    'deliberation-plan.schema.json',
    unknownDecision,
    'DECISION_REFERENCE_MISSING',
    deliberationContext,
  );

  const unknownTask = clone(lowAssignment);
  unknownTask.taskId = 'TASK-999';
  assertInvalid(
    'role-assignment.schema.json',
    unknownTask,
    'TASK_REFERENCE_MISSING',
    lowContext,
  );
});

test('replay and content hash mismatches fail closed', () => {
  const replayResult = loadJson(
    'replay-version-mismatch',
    '.agent-governance',
    'decisions',
    'DEC-001',
    'deliberation-result.json',
  );
  assertInvalid(
    'deliberation-result.schema.json',
    replayResult,
    'DELIBERATION_VERSION_MISMATCH',
    deliberationContext,
  );

  const wrongDecisionHash = clone(importedResult);
  wrongDecisionHash.decisionSha256 = 'f'.repeat(64);
  assertInvalid(
    'deliberation-result.schema.json',
    wrongDecisionHash,
    'DELIBERATION_HASH_MISMATCH',
    deliberationContext,
  );

  const wrongPlanHash = clone(importedResult);
  wrongPlanHash.planSha256 = 'f'.repeat(64);
  assertInvalid(
    'deliberation-result.schema.json',
    wrongPlanHash,
    'DELIBERATION_HASH_MISMATCH',
    deliberationContext,
  );

  const wrongResultHash = clone(importedResult);
  wrongResultHash.resultSha256 = 'f'.repeat(64);
  assertInvalid(
    'deliberation-result.schema.json',
    wrongResultHash,
    'DELIBERATION_HASH_MISMATCH',
    deliberationContext,
  );

  const wrongBeforeReceipt = clone(importedResult);
  wrongBeforeReceipt.beforeReceipt.decisionSha256 = 'f'.repeat(64);
  assertInvalid(
    'deliberation-result.schema.json',
    wrongBeforeReceipt,
    'DELIBERATION_HASH_MISMATCH',
    deliberationContext,
  );

  const wrongAfterReceipt = clone(importedResult);
  wrongAfterReceipt.afterReceipt.normalizedResultSha256 = 'f'.repeat(64);
  assertInvalid(
    'deliberation-result.schema.json',
    wrongAfterReceipt,
    'DELIBERATION_HASH_MISMATCH',
    deliberationContext,
  );
});

test('human-confirmed requires a separate exact confirmation record', () => {
  const humanConfirmed = {
    ...clone(importedResult),
    importStatus: 'human-confirmed',
  };
  assertInvalid(
    'deliberation-result.schema.json',
    humanConfirmed,
    'DELIBERATION_NOT_HUMAN_CONFIRMED',
    deliberationContext,
  );
  assertValid(
    'deliberation-result.schema.json',
    humanConfirmed,
    {
      ...deliberationContext,
      operation: 'stored',
      humanConfirmation: confirmation,
    },
  );
  assertInvalid(
    'deliberation-result.schema.json',
    humanConfirmed,
    'INVALID_STATUS_TRANSITION',
    {
      ...deliberationContext,
      operation: 'import',
      humanConfirmation: confirmation,
    },
  );
});
