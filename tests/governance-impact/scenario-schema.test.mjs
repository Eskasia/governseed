import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const schemaUrls = [
  new URL('../../schemas/governance-impact-scenario.schema.json', import.meta.url),
  new URL('../../schemas/governance-impact-run.schema.json', import.meta.url),
  new URL('../../schemas/governance-impact-result.schema.json', import.meta.url),
  new URL('../../schemas/governance-impact-preflight.schema.json', import.meta.url),
];

const schemas = schemaUrls.map((file) => JSON.parse(fs.readFileSync(file, 'utf8')));
const { scoreRun, sha256Canonical, validateScenario } = await import(
  '../../scripts/lib/governance-impact-core.mjs'
);
const { hashScenarioArtifacts } = await import('../../scripts/governance-impact-eval.mjs');

function loadControl(name) {
  const file = new URL('./controls/' + name + '/run.json', import.meta.url);
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function matchesSchemaType(schema, value) {
  if (schema.type === 'null') return value === null;
  if (schema.type === 'string') return typeof value === 'string';
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (schema.type === 'integer') return Number.isSafeInteger(value);
  if (schema.type !== 'object' || value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const keys = Object.keys(value);
  if (schema.additionalProperties === false && keys.some((key) => !Object.hasOwn(schema.properties, key))) {
    return false;
  }
  if ((schema.required ?? []).some((key) => !Object.hasOwn(value, key))) return false;
  return Object.entries(schema.properties).every(([key, property]) => {
    if (!Object.hasOwn(value, key)) return true;
    const entry = value[key];
    if (!matchesSchemaType(property, entry)) return false;
    if (Object.hasOwn(property, 'const') && entry !== property.const) return false;
    if (typeof entry === 'number' && property.minimum !== undefined && entry < property.minimum) return false;
    if (typeof entry === 'number' && property.maximum !== undefined && entry > property.maximum) return false;
    return true;
  });
}

function matchesExactlyOneBranch(schema, value) {
  return schema.oneOf.filter((branch) => matchesSchemaType(branch, value)).length === 1;
}

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
    artifactHashes: {
      seed: 'a'.repeat(64),
      task: 'b'.repeat(64),
      governedOverlay: 'c'.repeat(64),
      oracle: 'd'.repeat(64),
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
      { id: 'CHECK-003', kind: 'document', factIds: ['FACT-001'], critical: true },
      { id: 'CHECK-004', kind: 'privacy', factIds: ['FACT-001'], critical: true },
    ],
    oracle: {
      command: ['node', 'oracle/verify.mjs', '--json'],
      checkIds: ['CHECK-001', 'CHECK-002', 'CHECK-003', 'CHECK-004'],
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

function assertObjectContract(value, schema, label) {
  assert.equal(value !== null && typeof value === 'object' && !Array.isArray(value), true, label);
  const required = new Set(schema.required ?? []);
  const allowed = new Set(Object.keys(schema.properties ?? {}));
  for (const key of required) assert.equal(Object.hasOwn(value, key), true, `${label}.${key}`);
  for (const key of Object.keys(value)) assert.equal(allowed.has(key), true, `${label}.${key}`);
}

test('all governance impact schemas are draft 2020-12 closed contracts', () => {
  for (const schema of schemas) {
    assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
    assert.equal(schema.additionalProperties, false);
    assertClosedObjects(schema);
  }
});

test('every distributed synthetic scenario validates and matches its pinned artifact hashes', async () => {
  const scenariosUrl = new URL('./scenarios/', import.meta.url);
  const scenarioIds = fs.readdirSync(scenariosUrl, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(scenarioIds, [
    'ambiguity-no-invention',
    'requirements-sync',
    'scope-guard',
  ]);

  for (const scenarioId of scenarioIds) {
    const scenarioRoot = fileURLToPath(new URL(`./scenarios/${scenarioId}/`, import.meta.url));
    const scenario = JSON.parse(fs.readFileSync(
      new URL(`./scenarios/${scenarioId}/scenario.json`, import.meta.url),
      'utf8',
    ));
    const validation = validateScenario(scenario, scenarioRoot);
    assert.equal(validation.valid, true, `${scenarioId}: ${JSON.stringify(validation.errors)}`);
    assert.deepEqual(
      await hashScenarioArtifacts(scenarioRoot, scenario),
      scenario.artifactHashes,
      scenarioId,
    );
  }
});

test('every distributed schema regex compiles under Node.js', () => {
  function visit(value, at = '$') {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${at}[${index}]`));
      return;
    }
    if (!value || typeof value !== 'object') return;
    if (Object.hasOwn(value, 'pattern')) {
      assert.doesNotThrow(() => new RegExp(value.pattern), `${at}.pattern`);
    }
    for (const [key, entry] of Object.entries(value)) visit(entry, `${at}.${key}`);
  }
  schemas.forEach((schema, index) => visit(schema, `$schemas[${index}]`));
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

test('schemas require immutable artifacts, raw scenario identity, repetition identity, and privacy evidence', () => {
  const [scenarioSchema, runSchema, resultSchema] = schemas;
  assert.equal(scenarioSchema.required.includes('artifactHashes'), true);
  assert.equal(scenarioSchema.properties.checks.minContains, 1);
  assert.equal(
    scenarioSchema.properties.checks.contains.allOf[1].properties.kind.const,
    'privacy',
  );
  assert.deepEqual(
    ['attemptId', 'repetitionId', 'seed', 'scenario'].map((key) => runSchema.required.includes(key)),
    [true, true, true, true],
  );
  assert.equal(runSchema.$defs.arm.required.includes('privacyChecks'), true);
  assert.equal(runSchema.$defs.attemptManifest.properties.attempts.uniqueItems, true);
  assert.equal(resultSchema.required.includes('attemptId'), true);
  assert.equal(resultSchema.required.includes('repetitionId'), true);
});

test('v2 schemas require a Codex execution boundary without widening v1 controls', () => {
  const runSchema = schemas[1];
  const resultSchema = schemas[2];

  assert.deepEqual(runSchema.properties.schemaVersion.enum, [1, 2]);
  assert.equal(runSchema.$defs.cohort.required.includes('executionBoundaryId'), false);
  assert.equal(runSchema.$defs.arm.required.includes('boundaryEvidence'), false);
  assert.notEqual(runSchema.$defs.cohortV2, undefined);
  assert.notEqual(runSchema.$defs.armV2, undefined);
  assert.notEqual(resultSchema.$defs.scoredArmV2, undefined);
  assert.deepEqual(runSchema.$defs.cohortV2.properties.runtime, {
    type: 'string',
    const: 'codex',
  });
  assert.equal(
    runSchema.$defs.cohortV2.required.includes('executionBoundaryId'),
    true,
  );
  assert.equal(runSchema.$defs.armV2.required.includes('executionBoundaryId'), true);
  assert.equal(runSchema.$defs.armV2.required.includes('boundaryEvidence'), true);
  assert.equal(
    resultSchema.$defs.scoredArmV2.required.includes('executionBoundaryId'),
    true,
  );
  assert.equal(
    resultSchema.$defs.scoredArmV2.required.includes('boundaryEvidence'),
    true,
  );
});

test('raw and scored boundary evidence schemas are identical closed proof contracts', () => {
  const rawEvidence = schemas[1].$defs.boundaryEvidence;
  const scoredEvidence = schemas[2].$defs.boundaryEvidence;
  const preflightEvidence = schemas[3].$defs.boundaryEvidence;
  const expectedFields = [
    'observedImageDigest',
    'codexVersion',
    'codexBinarySha256',
    'containmentPolicyHash',
    'networkPolicyHash',
    'proxyPolicyHash',
    'hardening',
    'pidNamespaceStopped',
    'cgroupEmpty',
    'cleanupComplete',
  ];
  const expectedHardening = [
    'nonRootUser',
    'readOnlyRootFilesystem',
    'capDropAll',
    'noNewPrivileges',
    'privatePidNamespace',
    'privateCgroupNamespace',
    'pidLimit',
    'cpuLimit',
    'memoryLimit',
    'dockerSocketAbsent',
    'devicesAbsent',
    'cgroupMountAbsent',
  ];

  assert.notEqual(rawEvidence, undefined);
  assert.notEqual(scoredEvidence, undefined);
  assert.notEqual(preflightEvidence, undefined);
  assert.deepEqual(rawEvidence, scoredEvidence);
  assert.deepEqual(rawEvidence, preflightEvidence);
  assert.deepEqual(rawEvidence.required, expectedFields);
  assert.deepEqual(Object.keys(rawEvidence.properties), expectedFields);
  assert.equal(rawEvidence.additionalProperties, false);
  assert.equal(rawEvidence.properties.observedImageDigest.$ref, '#/$defs/sha256');
  assert.equal(schemas[1].$defs.sha256.pattern, '^[a-f0-9]{64}$');
  assert.deepEqual(rawEvidence.properties.hardening.required, expectedHardening);
  assert.deepEqual(
    Object.values(rawEvidence.properties.hardening.properties).map(
      (property) => property.const,
    ),
    expectedHardening.map(() => true),
  );
  for (const field of ['pidNamespaceStopped', 'cgroupEmpty', 'cleanupComplete']) {
    assert.equal(rawEvidence.properties[field].const, true);
  }
  for (const forbidden of ['containerId', 'bearer', 'socketPath', 'privatePath']) {
    assert.equal(Object.hasOwn(rawEvidence.properties, forbidden), false);
  }
});

test('preflight receipt is a closed non-claim artifact with bounded timeout and provenance', () => {
  const preflightSchema = schemas[3];
  assert.deepEqual(preflightSchema.required, [
    'schemaVersion',
    'kind',
    'preflightStatus',
    'claimDisposition',
    'runtime',
    'model',
    'timeoutMs',
    'provenance',
    'executionBoundaryId',
    'boundaryEvidence',
  ]);
  assert.equal(preflightSchema.properties.preflightStatus.const, 'READY');
  assert.equal(
    preflightSchema.properties.claimDisposition.const,
    'NOT_EVALUATED',
  );
  assert.equal(preflightSchema.properties.timeoutMs.maximum, 600_000);
  assert.equal(
    preflightSchema.properties.provenance.additionalProperties,
    false,
  );
});

test('all raw controls and recomputed results match the schemas exact object surfaces', () => {
  const runSchema = schemas[1];
  const resultSchema = schemas[2];
  for (const name of [
    'baseline-wins',
    'governed-wins',
    'tie',
    'missing-telemetry',
    'forbidden-change',
  ]) {
    const run = loadControl(name);
    assertObjectContract(run, runSchema, `${name}.run`);
    assertObjectContract(run.arms, runSchema.properties.arms, `${name}.run.arms`);
    for (const armName of ['baseline', 'governed']) {
      const arm = run.arms[armName];
      assertObjectContract(arm, runSchema.$defs.arm, `${name}.run.arms.${armName}`);
      assertObjectContract(
        arm.execution,
        runSchema.$defs.execution,
        `${name}.run.arms.${armName}.execution`,
      );
      assertObjectContract(
        arm.scope,
        runSchema.$defs.scopeEvidence,
        `${name}.run.arms.${armName}.scope`,
      );
    }

    const result = scoreRun(run);
    assertObjectContract(result, resultSchema, `${name}.result`);
    assertObjectContract(result.arms, resultSchema.properties.arms, `${name}.result.arms`);
    assertObjectContract(result.comparison, resultSchema.$defs.comparison, `${name}.comparison`);
    for (const armName of ['baseline', 'governed']) {
      const arm = result.arms[armName];
      assertObjectContract(arm, resultSchema.$defs.scoredArm, `${name}.result.arms.${armName}`);
      for (const [field, definition] of [
        ['execution', 'execution'],
        ['acceptance', 'acceptanceSummary'],
        ['requirements', 'requirementSummary'],
        ['scope', 'scopeSummary'],
        ['prohibitions', 'prohibitionSummary'],
        ['documents', 'documentSummary'],
        ['privacy', 'checkSummary'],
      ]) {
        assertObjectContract(
          arm[field],
          resultSchema.$defs[definition],
          `${name}.result.arms.${armName}.${field}`,
        );
      }
    }
  }
});

test('telemetry schemas encode available/null states and JavaScript safe integer limits', () => {
  const runSchema = schemas[1];
  assert.equal(runSchema.$defs.timeTelemetry.oneOf.length, 2);
  assert.equal(runSchema.$defs.tokenTelemetry.oneOf.length, 2);
  assert.equal(
    runSchema.$defs.execution.properties.repairRounds.maximum,
    Number.MAX_SAFE_INTEGER,
  );
  assert.equal(
    runSchema.properties.seed.maximum,
    Number.MAX_SAFE_INTEGER,
  );
});

test('telemetry oneOf schemas and manual scoring accept and reject the same edge cases', () => {
  const tokenSchema = schemas[1].$defs.tokenTelemetry;
  const cases = [
    [{ availability: 'available', total: 1 }, true],
    [{ availability: 'unavailable', total: null }, true],
    [{ availability: 'available', total: null }, false],
    [{ availability: 'unavailable', total: 1 }, false],
    [{ availability: 'available', total: 1, estimated: true }, false],
    [{ availability: 'available', total: Number.MAX_SAFE_INTEGER + 1 }, false],
  ];

  for (const [tokens, expected] of cases) {
    assert.equal(matchesExactlyOneBranch(tokenSchema, tokens), expected);
    const run = loadControl('tie');
    run.arms.baseline.tokens = tokens;
    let manualAccepted = true;
    try {
      scoreRun(run);
    } catch {
      manualAccepted = false;
    }
    assert.equal(manualAccepted, expected);
  }
});

test('execution error codes are stable schema/manual identifiers, never raw messages or paths', () => {
  const runErrorCode = schemas[1].$defs.execution.properties.errorCode;
  const resultErrorCode = schemas[2].$defs.execution.properties.errorCode;
  assert.equal(runErrorCode.pattern, '^[A-Z][A-Z0-9_]*$');
  assert.equal(resultErrorCode.pattern, runErrorCode.pattern);
  const pattern = new RegExp(runErrorCode.pattern);
  const cases = [
    [null, true],
    ['RUNTIME_TIMEOUT', true],
    ['runtime timeout', false],
    ['/Users/private/error.txt', false],
    ['RUNTIME_TIMEOUT\0private', false],
  ];

  for (const [errorCode, expected] of cases) {
    const schemaAccepted = errorCode === null || pattern.test(errorCode);
    assert.equal(schemaAccepted, expected);
    const run = loadControl('tie');
    run.arms.baseline.execution.errorCode = errorCode;
    let manualAccepted = true;
    try {
      scoreRun(run);
    } catch {
      manualAccepted = false;
    }
    assert.equal(manualAccepted, expected);
  }
});

test('schema bounds and manual scoring both reject unsafe seeds', () => {
  const seedSchema = schemas[1].properties.seed;
  const unsafeSeed = Number.MAX_SAFE_INTEGER + 1;
  assert.equal(matchesSchemaType(seedSchema, unsafeSeed), false);
  const run = loadControl('tie');
  run.seed = unsafeSeed;
  assert.throws(() => scoreRun(run), /seed/i);
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

test('artifact digest schema and manual validation fail closed on missing or invalid hashes', () => {
  const artifactSchema = schemas[0].$defs.artifactHashes;
  assert.equal(artifactSchema.required.includes('oracle'), true);
  const digestPattern = new RegExp(schemas[0].$defs.sha256.pattern);
  assert.equal(digestPattern.test('f'.repeat(64)), true);
  assert.equal(digestPattern.test('not-a-digest'), false);

  const missing = validScenario();
  delete missing.artifactHashes.oracle;
  assert.equal(validateScenario(missing, '/tmp/scenario').valid, false);

  const invalid = validScenario();
  invalid.artifactHashes.oracle = 'not-a-digest';
  assert.equal(validateScenario(invalid, '/tmp/scenario').valid, false);
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

test('scenario schema and manual validation both reject edge whitespace paths and NUL argv', () => {
  const relativePath = new RegExp(schemas[0].$defs.relativePath.pattern);
  const argv = new RegExp(schemas[0].$defs.argv.properties.command.items.pattern);
  assert.equal(relativePath.test(' task.md'), false);
  assert.equal(relativePath.test('task.md '), false);
  assert.equal(argv.test('oracle/verify.mjs\0--leak'), false);

  const scenario = validScenario();
  scenario.paths.taskFile = ' task.md';
  scenario.oracle.command[1] = 'oracle/verify.mjs\0--leak';
  assert.deepEqual(validateScenario(scenario, '/tmp/scenario').errors, [
    { code: 'RELATIVE_PATH', path: 'paths.taskFile' },
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

test('scenario contracts require every scoreable kind before scoreRun', () => {
  const scenarioSchema = schemas[0];
  const factKinds = (scenarioSchema.properties.facts.allOf ?? []).map(
    (entry) => entry.contains.allOf[1].properties.kind.const,
  );
  const checkKinds = (scenarioSchema.properties.checks.allOf ?? []).map(
    (entry) => entry.contains.allOf[1].properties.kind.const,
  );
  assert.deepEqual(factKinds, ['requirement', 'prohibition']);
  assert.deepEqual(checkKinds, ['acceptance', 'prohibition', 'privacy']);

  const missingRequirement = validScenario();
  missingRequirement.facts[0].kind = 'context';
  const validation = validateScenario(missingRequirement, '/tmp/scenario');
  assert.equal(validation.valid, false);
  assert.equal(
    validation.errors.some((error) => error.code === 'FACT_KIND_COVERAGE'),
    true,
  );

  const run = loadControl('tie');
  run.scenario = missingRequirement;
  assert.throws(() => scoreRun(run), /FACT_KIND_COVERAGE/);

  for (const kind of ['acceptance', 'prohibition', 'privacy']) {
    const scenario = validScenario();
    scenario.checks = scenario.checks.filter((check) => check.kind !== kind);
    scenario.oracle.checkIds = scenario.checks.map((check) => check.id);
    assert.equal(validateScenario(scenario, '/tmp/scenario').valid, false, kind);
  }
});

test('scenario contracts bind acceptance and prohibition checks to complete fact coverage', () => {
  const acceptanceBoundToProhibition = validScenario();
  acceptanceBoundToProhibition.checks[0].factIds = ['FACT-002'];
  assert.equal(
    validateScenario(acceptanceBoundToProhibition, '/tmp/scenario').errors.some(
      (error) => error.code === 'CHECK_FACT_BINDING',
    ),
    true,
  );

  const prohibitionBoundToRequirement = validScenario();
  prohibitionBoundToRequirement.checks[1].factIds = ['FACT-001'];
  assert.equal(
    validateScenario(prohibitionBoundToRequirement, '/tmp/scenario').errors.some(
      (error) => error.code === 'CHECK_FACT_BINDING',
    ),
    true,
  );

  const uncoveredRequirement = validScenario();
  uncoveredRequirement.facts.push({
    id: 'FACT-003',
    kind: 'requirement',
    statement: 'Keep this requirement covered.',
  });
  uncoveredRequirement.factParity = {
    baseline: ['FACT-001', 'FACT-002', 'FACT-003'],
    governed: ['FACT-001', 'FACT-002', 'FACT-003'],
  };
  assert.equal(
    validateScenario(uncoveredRequirement, '/tmp/scenario').errors.some(
      (error) => error.code === 'FACT_CHECK_COVERAGE',
    ),
    true,
  );
});

test('scenario contracts reserve scope evidence for canonical path contracts', () => {
  const scenarioSchema = schemas[0];
  assert.equal(scenarioSchema.$defs.check.properties.kind.enum.includes('scope'), false);

  const scenario = validScenario();
  scenario.checks[0].kind = 'scope';
  assert.deepEqual(validateScenario(scenario, '/tmp/scenario').errors, [
    { code: 'ENUM', path: 'checks[0].kind' },
    { code: 'CHECK_KIND_COVERAGE', path: 'checks.acceptance' },
    { code: 'FACT_CHECK_COVERAGE', path: 'facts[0]' },
  ]);
});

test('scenario validation is total across malformed nested surfaces', () => {
  const mutations = [
    ['paths null', (scenario) => { scenario.paths = null; }],
    ['paths non-object', (scenario) => { scenario.paths = []; }],
    ['paths missing fields', (scenario) => { scenario.paths = {}; }],
    ['artifactHashes null', (scenario) => { scenario.artifactHashes = null; }],
    ['artifactHashes non-object', (scenario) => { scenario.artifactHashes = []; }],
    ['artifactHashes missing fields', (scenario) => { scenario.artifactHashes = {}; }],
    ['facts null', (scenario) => { scenario.facts = null; }],
    ['facts non-array', (scenario) => { scenario.facts = {}; }],
    ['facts empty', (scenario) => { scenario.facts = []; }],
    ['facts null entry', (scenario) => { scenario.facts = [null]; }],
    ['facts non-object entry', (scenario) => { scenario.facts = ['FACT-001']; }],
    ['facts entry missing fields', (scenario) => { scenario.facts = [{}]; }],
    ['factParity null', (scenario) => { scenario.factParity = null; }],
    ['factParity non-object', (scenario) => { scenario.factParity = []; }],
    ['factParity missing fields', (scenario) => { scenario.factParity = {}; }],
    ['checks null', (scenario) => { scenario.checks = null; }],
    ['checks non-array', (scenario) => { scenario.checks = {}; }],
    ['checks empty', (scenario) => { scenario.checks = []; }],
    ['checks null entry', (scenario) => { scenario.checks = [null]; }],
    ['checks non-object entry', (scenario) => { scenario.checks = ['CHECK-001']; }],
    ['checks entry missing fields', (scenario) => { scenario.checks = [{}]; }],
    ['oracle null', (scenario) => { scenario.oracle = null; }],
    ['oracle non-object', (scenario) => { scenario.oracle = []; }],
    ['oracle missing fields', (scenario) => { scenario.oracle = {}; }],
    ['allowedChangePaths null', (scenario) => { scenario.allowedChangePaths = null; }],
    ['allowedChangePaths non-array', (scenario) => { scenario.allowedChangePaths = {}; }],
    ['forbiddenChangePaths null', (scenario) => { scenario.forbiddenChangePaths = null; }],
    ['forbiddenChangePaths non-array', (scenario) => { scenario.forbiddenChangePaths = {}; }],
    ['facts sparse', (scenario) => { scenario.facts.length += 1; }],
    ['factParity sparse', (scenario) => { scenario.factParity.baseline.length += 1; }],
    ['checks sparse', (scenario) => { scenario.checks.length += 1; }],
    ['oracle command sparse', (scenario) => { scenario.oracle.command.length += 1; }],
    ['oracle checkIds sparse', (scenario) => { scenario.oracle.checkIds.length += 1; }],
    ['allowedChangePaths sparse', (scenario) => { scenario.allowedChangePaths.length += 1; }],
    ['forbiddenChangePaths sparse', (scenario) => { scenario.forbiddenChangePaths.length += 1; }],
    [
      'invalid facts with no checks',
      (scenario) => {
        scenario.facts = null;
        scenario.checks = [];
        scenario.oracle.checkIds = [];
      },
    ],
    [
      'invalid fact entries with no checks',
      (scenario) => {
        scenario.facts = [null];
        scenario.checks = [];
        scenario.oracle.checkIds = [];
      },
    ],
  ];

  for (const [label, mutate] of mutations) {
    const scenario = validScenario();
    mutate(scenario);
    let result;
    assert.doesNotThrow(() => {
      result = validateScenario(scenario, '/tmp/scenario');
    }, label);
    assert.equal(result.valid, false, label);
    assert.equal(Array.isArray(result.errors), true, label);
    assert.equal(result.errors.length > 0, true, label);
    assert.equal(result.scenarioHash, null, label);
  }
});
