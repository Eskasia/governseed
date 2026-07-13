import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const schemaUrls = [
  new URL('../../schemas/governance-impact-scenario.schema.json', import.meta.url),
  new URL('../../schemas/governance-impact-run.schema.json', import.meta.url),
  new URL('../../schemas/governance-impact-result.schema.json', import.meta.url),
];

const schemas = schemaUrls.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const { sha256Canonical, validateScenario } = await import(
  '../../scripts/lib/governance-impact-core.mjs'
);

function validScenario() {
  return {
    schemaVersion: 1,
    id: 'scope-guard',
    dataClassification: 'synthetic',
    paths: {
      seedDir: 'seed',
      taskFile: 'task.md',
      governedOverlayDir: 'governed-overlay',
      oracleDir: 'oracle',
    },
    facts: [
      { id: 'FACT-001', kind: 'requirement', statement: 'Update src/message.txt.' },
      { id: 'FACT-002', kind: 'prohibition', statement: 'Do not change package.json.' },
    ],
    factParity: {
      baseline: ['FACT-001', 'FACT-002'],
      governed: ['FACT-001', 'FACT-002'],
    },
    checks: [
      { id: 'CHECK-001', kind: 'acceptance', factIds: ['FACT-001'], critical: true },
      { id: 'CHECK-002', kind: 'prohibition', factIds: ['FACT-002'], critical: true },
    ],
    oracle: {
      command: ['node', 'oracle/verify.mjs', '--json'],
      checkIds: ['CHECK-001', 'CHECK-002'],
    },
    allowedChangePaths: ['src/'],
    forbiddenChangePaths: ['package.json'],
  };
}

function assertClosedObjects(value, at = '$') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertClosedObjects(entry, `${at}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (value.type === 'object') {
    assert.equal(value.additionalProperties, false, `${at} must set additionalProperties:false`);
  }
  for (const [key, entry] of Object.entries(value)) {
    assertClosedObjects(entry, `${at}.${key}`);
  }
}

test('all governance impact schemas are draft 2020-12 closed contracts', () => {
  for (const schema of schemas) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assertClosedObjects(schema);
  }
});

test('run schema closes runtime and starter commit label ambiguity', () => {
  const runSchema = schemas[1];
  assert.deepEqual(runSchema.$defs.arm.properties.runtime.enum, [
    'synthetic',
    'codex',
    'claude',
    'antigravity',
  ]);
  assert.equal(runSchema.$defs.arm.properties.starterCommit.pattern, '^(?:[a-f0-9]{40}|[a-f0-9]{64})$');
});

test('schema relative paths use the same normalized POSIX semantics as validation', () => {
  const relativePath = new RegExp(schemas[0].$defs.relativePath.pattern);
  for (const valid of ['task.md', 'src/', 'oracle/verify.mjs']) {
    assert.equal(relativePath.test(valid), true, valid);
  }
  for (const invalid of ['/task.md', 'C:/task.md', '../task.md', 'src/../task.md', './task.md', 'src//task.md', 'src\\task.md']) {
    assert.equal(relativePath.test(invalid), false, invalid);
  }
});

test('valid scenario returns a canonical scenario hash without absolute paths', () => {
  const scenario = validScenario();
  const result = validateScenario(scenario, '/tmp/governance-impact/scenario');
  assert.deepEqual(result, {
    valid: true,
    errors: [],
    scenarioHash: sha256Canonical(scenario),
  });
});

test('scenario validation enforces exact required and allowed keys', () => {
  const missing = validScenario();
  delete missing.paths.taskFile;
  const extra = { ...validScenario(), privatePrompt: 'must never be accepted' };

  assert.deepEqual(validateScenario(missing, '/tmp/scenario').errors, [
    { code: 'REQUIRED_KEY', path: 'paths.taskFile' },
  ]);
  assert.deepEqual(validateScenario(extra, '/tmp/scenario').errors, [
    { code: 'UNKNOWN_KEY', path: 'privatePrompt' },
  ]);
});

test('scenario validation enforces enums and relative POSIX paths', () => {
  const scenario = validScenario();
  scenario.dataClassification = 'private';
  scenario.paths.taskFile = '/private/task.md';
  scenario.allowedChangePaths = ['../outside'];

  assert.deepEqual(validateScenario(scenario, '/tmp/scenario').errors, [
    { code: 'ENUM', path: 'dataClassification' },
    { code: 'RELATIVE_PATH', path: 'paths.taskFile' },
    { code: 'RELATIVE_PATH', path: 'allowedChangePaths[0]' },
  ]);
});

test('oracle command must be an argv array rather than a shell command string', () => {
  const scenario = validScenario();
  scenario.oracle.command = 'node oracle/verify.mjs';
  assert.deepEqual(validateScenario(scenario, '/tmp/scenario').errors, [
    { code: 'COMMAND_ARGV', path: 'oracle.command' },
  ]);
});

test('fact parity is exact and cannot add governed requirements', () => {
  const scenario = validScenario();
  scenario.factParity.governed = ['FACT-001', 'FACT-002', 'FACT-999'];
  assert.deepEqual(validateScenario(scenario, '/tmp/scenario').errors, [
    { code: 'FACT_REFERENCE', path: 'factParity.governed[2]' },
    { code: 'FACT_PARITY', path: 'factParity' },
  ]);
});

test('checks and oracle entries must reference declared IDs', () => {
  const scenario = validScenario();
  scenario.checks[0].factIds = ['FACT-999'];
  scenario.oracle.checkIds[1] = 'CHECK-999';

  assert.deepEqual(validateScenario(scenario, '/tmp/scenario').errors, [
    { code: 'FACT_REFERENCE', path: 'checks[0].factIds[0]' },
    { code: 'CHECK_REFERENCE', path: 'oracle.checkIds[1]' },
    { code: 'CHECK_COVERAGE', path: 'oracle.checkIds' },
  ]);
});
