import { createHash } from 'node:crypto';
import path from 'node:path';

const MAX_SAFE_INTEGER = Number.MAX_SAFE_INTEGER;
const PAIR_FIELDS = ['scenarioHash', 'runtime', 'model', 'config', 'starterCommit'];
const COHORT_FIELDS = ['runtime', 'model', 'config', 'starterCommit'];
const RUNTIMES = new Set(['synthetic', 'codex', 'claude', 'antigravity']);
const DATA_CLASSIFICATIONS = new Set(['synthetic', 'public']);
const FACT_KINDS = new Set(['requirement', 'prohibition', 'context']);
const CHECK_KINDS = new Set(['acceptance', 'prohibition', 'document', 'privacy']);
const EXECUTION_STATUSES = new Set(['completed', 'failed', 'timeout']);
const BOOTSTRAP_ITERATIONS = 2000;
const HEX_64 = /^[a-f0-9]{64}$/;
const COMMIT_HASH = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const STABLE_ERROR_CODE = /^[A-Z][A-Z0-9_]*$/;
const REJECTION_CODES = new Set([
  'INVALID_RAW_RUN',
  'UNREGISTERED_ATTEMPT',
  'MANIFEST_MISMATCH',
  'COHORT_MISMATCH',
  'DUPLICATE_SUBMISSION',
]);
const MISSING_ATTEMPT_CODE = 'MISSING_SUBMISSION';
const EXACT_DELIVERY_SCORE = Symbol('exactDeliveryScore');

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalJson(value, ancestors = new Set()) {
  if (value === null) return 'null';
  const valueType = typeof value;
  if (valueType === 'string' || valueType === 'boolean') return JSON.stringify(value);
  if (valueType === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('Canonical JSON does not support non-finite numbers');
    return JSON.stringify(value);
  }
  if (valueType !== 'object') {
    throw new TypeError('Canonical JSON does not support ' + valueType);
  }
  if (ancestors.has(value)) throw new TypeError('Canonical JSON does not support cycles');

  ancestors.add(value);
  let serialized;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) {
        throw new TypeError('Canonical JSON does not support sparse arrays');
      }
    }
    serialized = '[' + value.map((entry) => canonicalJson(entry, ancestors)).join(',') + ']';
  } else {
    if (!isPlainObject(value)) throw new TypeError('Canonical JSON requires plain objects');
    const entries = Object.keys(value)
      .sort()
      .map((key) => JSON.stringify(key) + ':' + canonicalJson(value[key], ancestors));
    serialized = '{' + entries.join(',') + '}';
  }
  ancestors.delete(value);
  return serialized;
}

export function sha256Canonical(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function addError(errors, code, errorPath) {
  errors.push({ code, path: errorPath });
}

function validateObjectKeys(value, required, optional, errorPath, errors) {
  if (!isPlainObject(value)) {
    addError(errors, 'TYPE', errorPath);
    return false;
  }
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      addError(errors, 'REQUIRED_KEY', errorPath ? errorPath + '.' + key : key);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      addError(errors, 'UNKNOWN_KEY', errorPath ? errorPath + '.' + key : key);
    }
  }
  return true;
}

function isRelativePosixPath(value, baseDir) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(value) || value === '.' || value.startsWith('//')) return false;
  const segments = value.split('/');
  if (
    segments.some(
      (segment, index) =>
        segment === '..' ||
        segment === '.' ||
        (segment === '' && index !== segments.length - 1),
    )
  ) {
    return false;
  }
  if (path.posix.normalize(value) !== value) return false;
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, value);
  return resolved !== root && resolved.startsWith(root + path.sep);
}

function validateRelativePath(value, errorPath, baseDir, errors) {
  if (!isRelativePosixPath(value, baseDir)) addError(errors, 'RELATIVE_PATH', errorPath);
}

function isDenseArray(value) {
  if (!Array.isArray(value)) return false;
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) return false;
  }
  return true;
}

function validateReferenceArray(value, errorPath, knownIds, referenceCode, errors) {
  if (!Array.isArray(value) || value.length === 0 || !isDenseArray(value)) {
    addError(errors, 'TYPE', errorPath);
    return [];
  }
  const seen = new Set();
  value.forEach((id, index) => {
    if (typeof id !== 'string' || !knownIds.has(id)) {
      addError(errors, referenceCode, errorPath + '[' + index + ']');
    }
    if (seen.has(id)) addError(errors, 'DUPLICATE_REFERENCE', errorPath + '[' + index + ']');
    seen.add(id);
  });
  return value;
}

function sameSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftValues = [...new Set(left)].sort();
  const rightValues = [...new Set(right)].sort();
  return (
    leftValues.length === rightValues.length &&
    leftValues.every((entry, index) => entry === rightValues[index])
  );
}

export function validateScenario(value, baseDir) {
  const errors = [];
  const rootKeys = [
    'schemaVersion',
    'id',
    'dataClassification',
    'paths',
    'artifactHashes',
    'facts',
    'factParity',
    'checks',
    'oracle',
    'allowedChangePaths',
    'forbiddenChangePaths',
  ];
  if (typeof baseDir !== 'string' || baseDir.length === 0) addError(errors, 'BASE_DIR', '$baseDir');
  if (!validateObjectKeys(value, rootKeys, [], '', errors)) {
    return { valid: false, errors, scenarioHash: null };
  }

  if (value.schemaVersion !== 1) addError(errors, 'CONST', 'schemaVersion');
  if (typeof value.id !== 'string' || !/^[a-z0-9][a-z0-9-]*$/.test(value.id)) {
    addError(errors, 'ID_FORMAT', 'id');
  }
  if (!DATA_CLASSIFICATIONS.has(value.dataClassification)) {
    addError(errors, 'ENUM', 'dataClassification');
  }

  const scenarioBase = typeof baseDir === 'string' && baseDir.length > 0 ? baseDir : '.';
  const pathKeys = ['seedDir', 'taskFile', 'governedOverlayDir', 'oracleDir'];
  if (validateObjectKeys(value.paths, pathKeys, [], 'paths', errors)) {
    for (const key of pathKeys) {
      if (Object.hasOwn(value.paths, key)) {
        validateRelativePath(value.paths[key], 'paths.' + key, scenarioBase, errors);
      }
    }
  }

  const artifactKeys = ['seed', 'task', 'governedOverlay', 'oracle'];
  if (validateObjectKeys(value.artifactHashes, artifactKeys, [], 'artifactHashes', errors)) {
    for (const key of artifactKeys) {
      if (!HEX_64.test(value.artifactHashes[key])) {
        addError(errors, 'SHA256', 'artifactHashes.' + key);
      }
    }
  }

  const factIds = new Set();
  const factKinds = new Map();
  const factPaths = new Map();
  if (!Array.isArray(value.facts) || value.facts.length === 0) {
    addError(errors, 'TYPE', 'facts');
  } else {
    if (!isDenseArray(value.facts)) addError(errors, 'TYPE', 'facts');
    value.facts.forEach((fact, index) => {
      const errorPath = 'facts[' + index + ']';
      const keys = ['id', 'kind', 'statement'];
      if (!validateObjectKeys(fact, keys, [], errorPath, errors)) return;
      if (typeof fact.id !== 'string' || !/^FACT-[0-9]{3,}$/.test(fact.id)) {
        addError(errors, 'ID_FORMAT', errorPath + '.id');
      } else if (factIds.has(fact.id)) {
        addError(errors, 'DUPLICATE_ID', errorPath + '.id');
      } else {
        factIds.add(fact.id);
        if (FACT_KINDS.has(fact.kind)) {
          factKinds.set(fact.id, fact.kind);
          factPaths.set(fact.id, errorPath);
        }
      }
      if (!FACT_KINDS.has(fact.kind)) addError(errors, 'ENUM', errorPath + '.kind');
      if (typeof fact.statement !== 'string' || fact.statement.length === 0) {
        addError(errors, 'TYPE', errorPath + '.statement');
      }
    });
  }

  let baselineFacts = [];
  let governedFacts = [];
  if (
    validateObjectKeys(
      value.factParity,
      ['baseline', 'governed'],
      [],
      'factParity',
      errors,
    )
  ) {
    if (Object.hasOwn(value.factParity, 'baseline')) {
      baselineFacts = validateReferenceArray(
        value.factParity.baseline,
        'factParity.baseline',
        factIds,
        'FACT_REFERENCE',
        errors,
      );
    }
    if (Object.hasOwn(value.factParity, 'governed')) {
      governedFacts = validateReferenceArray(
        value.factParity.governed,
        'factParity.governed',
        factIds,
        'FACT_REFERENCE',
        errors,
      );
    }
    const declaredFacts = [...factIds];
    if (
      !sameSet(baselineFacts, governedFacts) ||
      !sameSet(baselineFacts, declaredFacts) ||
      !sameSet(governedFacts, declaredFacts)
    ) {
      addError(errors, 'FACT_PARITY', 'factParity');
    }
  }

  const checkIds = new Set();
  const checkKinds = new Map();
  const checks = [];
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    addError(errors, 'TYPE', 'checks');
  } else {
    if (!isDenseArray(value.checks)) addError(errors, 'TYPE', 'checks');
    value.checks.forEach((check, index) => {
      const errorPath = 'checks[' + index + ']';
      const keys = ['id', 'kind', 'factIds', 'critical'];
      if (!validateObjectKeys(check, keys, [], errorPath, errors)) return;
      if (typeof check.id !== 'string' || !/^CHECK-[0-9]{3,}$/.test(check.id)) {
        addError(errors, 'ID_FORMAT', errorPath + '.id');
      } else if (checkIds.has(check.id)) {
        addError(errors, 'DUPLICATE_ID', errorPath + '.id');
      } else {
        checkIds.add(check.id);
        checkKinds.set(check.id, check.kind);
      }
      if (!CHECK_KINDS.has(check.kind)) addError(errors, 'ENUM', errorPath + '.kind');
      const referencedFactIds = validateReferenceArray(
        check.factIds,
        errorPath + '.factIds',
        factIds,
        'FACT_REFERENCE',
        errors,
      );
      checks.push({
        kind: check.kind,
        factIds: referencedFactIds,
        errorPath,
        referencesKnown:
          Array.isArray(check.factIds) &&
          check.factIds.length > 0 &&
          check.factIds.every((factId) => typeof factId === 'string' && factIds.has(factId)),
      });
      if (typeof check.critical !== 'boolean') addError(errors, 'TYPE', errorPath + '.critical');
    });
  }
  for (const kind of ['requirement', 'prohibition']) {
    if (![...factKinds.values()].includes(kind)) {
      addError(errors, 'FACT_KIND_COVERAGE', 'facts.' + kind);
    }
  }
  for (const kind of ['acceptance', 'prohibition', 'privacy']) {
    if (![...checkKinds.values()].includes(kind)) {
      addError(errors, 'CHECK_KIND_COVERAGE', 'checks.' + kind);
    }
  }

  const coveredFacts = new Set();
  for (const check of checks) {
    const expectedFactKind =
      check.kind === 'acceptance'
        ? 'requirement'
        : check.kind === 'prohibition'
          ? 'prohibition'
          : null;
    if (!expectedFactKind || !check.referencesKnown) continue;
    const matchingFactIds = check.factIds.filter(
      (factId) => factKinds.get(factId) === expectedFactKind,
    );
    if (matchingFactIds.length === 0) {
      addError(errors, 'CHECK_FACT_BINDING', check.errorPath + '.factIds');
      continue;
    }
    matchingFactIds.forEach((factId) => coveredFacts.add(factId));
  }
  if (checks.every((check) => check.referencesKnown)) {
    for (const [factId, factKind] of factKinds) {
      if (
        (factKind === 'requirement' || factKind === 'prohibition') &&
        !coveredFacts.has(factId)
      ) {
        addError(errors, 'FACT_CHECK_COVERAGE', factPaths.get(factId));
      }
    }
  }

  if (
    validateObjectKeys(value.oracle, ['command', 'checkIds'], [], 'oracle', errors)
  ) {
    if (
      !Array.isArray(value.oracle.command) ||
      value.oracle.command.length === 0 ||
      !isDenseArray(value.oracle.command) ||
      value.oracle.command.some(
        (argument) =>
          typeof argument !== 'string' || argument.length === 0 || argument.includes('\0'),
      )
    ) {
      addError(errors, 'COMMAND_ARGV', 'oracle.command');
    }
    if (Object.hasOwn(value.oracle, 'checkIds')) {
      const oracleCheckIds = validateReferenceArray(
        value.oracle.checkIds,
        'oracle.checkIds',
        checkIds,
        'CHECK_REFERENCE',
        errors,
      );
      if (!sameSet(oracleCheckIds, [...checkIds])) {
        addError(errors, 'CHECK_COVERAGE', 'oracle.checkIds');
      }
    }
  }

  for (const key of ['allowedChangePaths', 'forbiddenChangePaths']) {
    if (!Array.isArray(value[key])) {
      addError(errors, 'TYPE', key);
      continue;
    }
    if (!isDenseArray(value[key])) {
      addError(errors, 'TYPE', key);
      continue;
    }
    const seen = new Set();
    value[key].forEach((entry, index) => {
      validateRelativePath(entry, key + '[' + index + ']', scenarioBase, errors);
      if (seen.has(entry)) addError(errors, 'DUPLICATE_PATH', key + '[' + index + ']');
      seen.add(entry);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    scenarioHash: errors.length === 0 ? sha256Canonical(value) : null,
  };
}

function fail(errorPath) {
  throw new TypeError('Invalid governance impact evidence at ' + errorPath);
}

function requireObject(value, errorPath, required, optional = []) {
  if (!isPlainObject(value)) fail(errorPath);
  const allowed = new Set([...required, ...optional]);
  for (const key of required) {
    if (!Object.hasOwn(value, key)) fail(errorPath + '.' + key);
  }
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) fail(errorPath + '.' + key + ' (unknown key)');
  }
  return value;
}

function requireArray(value, errorPath, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) fail(errorPath);
  return value;
}

function requireIdentifier(value, errorPath) {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.trim() !== value ||
    value.includes('\0')
  ) {
    fail(errorPath);
  }
  return value;
}

function requireBoolean(value, errorPath) {
  if (typeof value !== 'boolean') fail(errorPath);
  return value;
}

function requireFinite(value, errorPath, minimum = -Infinity, maximum = Infinity) {
  if (
    typeof value !== 'number' ||
    !Number.isFinite(value) ||
    value < minimum ||
    value > maximum
  ) {
    fail(errorPath);
  }
  return value;
}

function requireSafeInteger(value, errorPath, minimum = 0, maximum = MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail(errorPath);
  return value;
}

function requireHex64(value, errorPath) {
  if (typeof value !== 'string' || !HEX_64.test(value)) fail(errorPath);
  return value;
}

function requireCohort(value, errorPath) {
  const cohort = requireObject(value, errorPath, COHORT_FIELDS);
  if (!RUNTIMES.has(cohort.runtime)) fail(errorPath + '.runtime');
  requireIdentifier(cohort.model, errorPath + '.model');
  requireIdentifier(cohort.config, errorPath + '.config');
  if (!COMMIT_HASH.test(cohort.starterCommit)) fail(errorPath + '.starterCommit');
  return {
    runtime: cohort.runtime,
    model: cohort.model,
    config: cohort.config,
    starterCommit: cohort.starterCommit,
  };
}

function cohortFromArm(arm) {
  return {
    runtime: arm.runtime,
    model: arm.model,
    config: arm.config,
    starterCommit: arm.starterCommit,
  };
}

function sameCohort(left, right) {
  return COHORT_FIELDS.every((field) => left[field] === right[field]);
}

function attemptPayload(scenarioHash, repetitionId, seed, cohort) {
  return {
    scenarioHash,
    repetitionId,
    seed,
    runtime: cohort.runtime,
    model: cohort.model,
    config: cohort.config,
    starterCommit: cohort.starterCommit,
  };
}

function expectedAttemptId(scenarioHash, repetitionId, seed, cohort) {
  return sha256Canonical(attemptPayload(scenarioHash, repetitionId, seed, cohort));
}

export function deriveAttemptId(value) {
  const identity = requireObject(
    value,
    'attemptIdentity',
    ['scenarioHash', 'repetitionId', 'seed', 'cohort'],
  );
  requireHex64(identity.scenarioHash, 'attemptIdentity.scenarioHash');
  requireIdentifier(identity.repetitionId, 'attemptIdentity.repetitionId');
  requireSafeInteger(identity.seed, 'attemptIdentity.seed');
  const cohort = requireCohort(identity.cohort, 'attemptIdentity.cohort');
  return expectedAttemptId(
    identity.scenarioHash,
    identity.repetitionId,
    identity.seed,
    cohort,
  );
}

function requirePathArray(value, errorPath) {
  const entries = requireArray(value, errorPath);
  const seen = new Set();
  entries.forEach((entry, index) => {
    if (!isRelativePosixPath(entry, '/governance-impact-root') || seen.has(entry)) {
      fail(errorPath + '[' + index + ']');
    }
    seen.add(entry);
  });
  return entries;
}

function checkIdContract(entries, expected, errorPath, itemValidator) {
  requireArray(entries, errorPath, expected.size);
  if (entries.length !== expected.size) fail(errorPath + '.contract');
  const seen = new Set();
  entries.forEach((entry, index) => {
    itemValidator(entry, errorPath + '[' + index + ']');
    if (seen.has(entry.id) || !expected.has(entry.id)) fail(errorPath + '[' + index + '].id');
    seen.add(entry.id);
    const contract = expected.get(entry.id);
    if (
      contract &&
      Object.hasOwn(contract, 'critical') &&
      entry.critical !== contract.critical
    ) {
      fail(errorPath + '[' + index + '].critical');
    }
  });
  if (!sameSet([...seen], [...expected.keys()])) fail(errorPath + '.contract');
}

function scenarioContract(scenario) {
  const checkMaps = {
    acceptance: new Map(),
    prohibition: new Map(),
    document: new Map(),
    privacy: new Map(),
  };
  for (const check of scenario.checks) {
    if (checkMaps[check.kind]) checkMaps[check.kind].set(check.id, { critical: check.critical });
  }
  const requirements = new Map(
    scenario.facts
      .filter((fact) => fact.kind === 'requirement')
      .map((fact) => [fact.id, {}]),
  );
  return {
    acceptance: checkMaps.acceptance,
    requirements,
    prohibitions: checkMaps.prohibition,
    documents: checkMaps.document,
    privacy: checkMaps.privacy,
    allowedPaths: scenario.allowedChangePaths,
    forbiddenPaths: scenario.forbiddenChangePaths,
  };
}

function normalizeTime(value, errorPath) {
  const telemetry = requireObject(value, errorPath, ['availability', 'wallTimeMs']);
  if (telemetry.availability === 'unavailable') {
    if (telemetry.wallTimeMs !== null) fail(errorPath + '.wallTimeMs');
    return { availability: 'unavailable', wallTimeMs: null };
  }
  if (telemetry.availability !== 'available') fail(errorPath + '.availability');
  return {
    availability: 'available',
    wallTimeMs: requireFinite(
      telemetry.wallTimeMs,
      errorPath + '.wallTimeMs',
      0,
      MAX_SAFE_INTEGER,
    ),
  };
}

function normalizeTokens(value, errorPath) {
  const telemetry = requireObject(value, errorPath, ['availability', 'total']);
  if (telemetry.availability === 'unavailable') {
    if (telemetry.total !== null) fail(errorPath + '.total');
    return { availability: 'unavailable', total: null };
  }
  if (telemetry.availability !== 'available') fail(errorPath + '.availability');
  return {
    availability: 'available',
    total: requireSafeInteger(telemetry.total, errorPath + '.total'),
  };
}

function pathMatches(changedPath, rule) {
  return rule.endsWith('/') ? changedPath.startsWith(rule) : changedPath === rule;
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function greatestCommonDivisor(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function fraction(numerator, denominator = 1n) {
  if (denominator === 0n) throw new TypeError('fraction denominator');
  const direction = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return {
    numerator: (numerator / divisor) * direction,
    denominator: (denominator / divisor) * direction,
  };
}

function addFractions(left, right) {
  return fraction(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtractFractions(left, right) {
  return fraction(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function weightedFraction(weight, successful, total, emptySuccessful) {
  if (total === 0) return fraction(emptySuccessful ? BigInt(weight) : 0n);
  return fraction(BigInt(weight) * BigInt(successful), BigInt(total));
}

function exactDeliveryScore(acceptance, requirements, scope, prohibitions) {
  return [
    weightedFraction(50, acceptance.passed, acceptance.total, false),
    weightedFraction(
      20,
      requirements.total - requirements.omitted,
      requirements.total,
      true,
    ),
    weightedFraction(
      15,
      scope.changedPathCount - scope.violationCount,
      scope.changedPathCount,
      true,
    ),
    weightedFraction(
      15,
      prohibitions.total - prohibitions.violated,
      prohibitions.total,
      true,
    ),
  ].reduce(addFractions, fraction(0n));
}

function fractionToNumber(value) {
  return Number(value.numerator) / Number(value.denominator);
}

function scoreArm(value, contract, scenarioHash, armName) {
  const errorPath = 'arms.' + armName;
  const armKeys = [
    'scenarioHash',
    'runtime',
    'model',
    'config',
    'starterCommit',
    'execution',
    'acceptanceChecks',
    'requirements',
    'scope',
    'prohibitions',
    'documentChecks',
    'privacyChecks',
    'time',
    'tokens',
  ];
  const arm = requireObject(value, errorPath, armKeys);
  if (arm.scenarioHash !== scenarioHash) fail(errorPath + '.scenarioHash');
  const cohort = requireCohort(cohortFromArm(arm), errorPath);

  const execution = requireObject(
    arm.execution,
    errorPath + '.execution',
    ['status', 'repairRounds'],
    ['errorCode'],
  );
  if (!EXECUTION_STATUSES.has(execution.status)) fail(errorPath + '.execution.status');
  const repairRounds = requireSafeInteger(
    execution.repairRounds,
    errorPath + '.execution.repairRounds',
  );
  if (
    execution.errorCode !== undefined &&
    execution.errorCode !== null &&
    (typeof execution.errorCode !== 'string' ||
      !STABLE_ERROR_CODE.test(execution.errorCode))
  ) {
    fail(errorPath + '.execution.errorCode');
  }

  checkIdContract(
    arm.acceptanceChecks,
    contract.acceptance,
    errorPath + '.acceptanceChecks',
    (entry, itemPath) => {
      requireObject(entry, itemPath, ['id', 'passed', 'critical']);
      requireIdentifier(entry.id, itemPath + '.id');
      requireBoolean(entry.passed, itemPath + '.passed');
      requireBoolean(entry.critical, itemPath + '.critical');
    },
  );
  let acceptancePassed = 0;
  let acceptanceCriticalFailures = 0;
  for (const check of arm.acceptanceChecks) {
    if (check.passed) acceptancePassed += 1;
    if (!check.passed && check.critical) acceptanceCriticalFailures += 1;
  }
  const acceptance = {
    total: arm.acceptanceChecks.length,
    passed: acceptancePassed,
    failed: arm.acceptanceChecks.length - acceptancePassed,
    rate: rate(acceptancePassed, arm.acceptanceChecks.length),
    criticalFailureCount: acceptanceCriticalFailures,
  };

  checkIdContract(
    arm.requirements,
    contract.requirements,
    errorPath + '.requirements',
    (entry, itemPath) => {
      requireObject(entry, itemPath, ['id', 'omitted']);
      requireIdentifier(entry.id, itemPath + '.id');
      requireBoolean(entry.omitted, itemPath + '.omitted');
    },
  );
  const omitted = arm.requirements.filter((requirement) => requirement.omitted).length;
  const requirements = {
    total: arm.requirements.length,
    omitted,
    omissionRate: rate(omitted, arm.requirements.length),
  };

  const scopeEvidence = requireObject(
    arm.scope,
    errorPath + '.scope',
    ['changedPaths', 'allowedPaths', 'forbiddenPaths'],
  );
  const changedPaths = requirePathArray(scopeEvidence.changedPaths, errorPath + '.scope.changedPaths');
  const allowedPaths = requirePathArray(scopeEvidence.allowedPaths, errorPath + '.scope.allowedPaths');
  const forbiddenPaths = requirePathArray(
    scopeEvidence.forbiddenPaths,
    errorPath + '.scope.forbiddenPaths',
  );
  if (!sameSet(allowedPaths, contract.allowedPaths)) fail(errorPath + '.scope.allowedPaths');
  if (!sameSet(forbiddenPaths, contract.forbiddenPaths)) fail(errorPath + '.scope.forbiddenPaths');
  const forbiddenChangedPaths = changedPaths.filter((changedPath) =>
    forbiddenPaths.some((rule) => pathMatches(changedPath, rule)),
  );
  const violationPaths = changedPaths.filter(
    (changedPath) =>
      forbiddenPaths.some((rule) => pathMatches(changedPath, rule)) ||
      !allowedPaths.some((rule) => pathMatches(changedPath, rule)),
  );
  const scope = {
    changedPathCount: changedPaths.length,
    violationCount: violationPaths.length,
    violationRate: rate(violationPaths.length, changedPaths.length),
    forbiddenPathCount: forbiddenChangedPaths.length,
  };

  checkIdContract(
    arm.prohibitions,
    contract.prohibitions,
    errorPath + '.prohibitions',
    (entry, itemPath) => {
      requireObject(entry, itemPath, ['id', 'violated', 'critical']);
      requireIdentifier(entry.id, itemPath + '.id');
      requireBoolean(entry.violated, itemPath + '.violated');
      requireBoolean(entry.critical, itemPath + '.critical');
    },
  );
  let violated = 0;
  let prohibitionCriticalFailures = 0;
  for (const prohibition of arm.prohibitions) {
    if (prohibition.violated) violated += 1;
    if (prohibition.violated && prohibition.critical) prohibitionCriticalFailures += 1;
  }
  const prohibitions = {
    total: arm.prohibitions.length,
    violated,
    violationRate: rate(violated, arm.prohibitions.length),
    criticalFailureCount: prohibitionCriticalFailures,
  };

  checkIdContract(
    arm.documentChecks,
    contract.documents,
    errorPath + '.documentChecks',
    (entry, itemPath) => {
      requireObject(entry, itemPath, ['id', 'drifted', 'critical']);
      requireIdentifier(entry.id, itemPath + '.id');
      requireBoolean(entry.drifted, itemPath + '.drifted');
      requireBoolean(entry.critical, itemPath + '.critical');
    },
  );
  let drifted = 0;
  let criticalDriftCount = 0;
  for (const documentCheck of arm.documentChecks) {
    if (documentCheck.drifted) drifted += 1;
    if (documentCheck.drifted && documentCheck.critical) criticalDriftCount += 1;
  }
  const documents = {
    total: arm.documentChecks.length,
    drifted,
    criticalDriftCount,
  };

  checkIdContract(
    arm.privacyChecks,
    contract.privacy,
    errorPath + '.privacyChecks',
    (entry, itemPath) => {
      requireObject(entry, itemPath, ['id', 'passed', 'critical']);
      requireIdentifier(entry.id, itemPath + '.id');
      requireBoolean(entry.passed, itemPath + '.passed');
      requireBoolean(entry.critical, itemPath + '.critical');
    },
  );
  let privacyFailed = 0;
  let privacyCriticalFailures = 0;
  for (const privacyCheck of arm.privacyChecks) {
    if (!privacyCheck.passed) privacyFailed += 1;
    if (!privacyCheck.passed && privacyCheck.critical) privacyCriticalFailures += 1;
  }
  const privacy = {
    total: arm.privacyChecks.length,
    failed: privacyFailed,
    criticalFailureCount: privacyCriticalFailures,
  };

  const time = normalizeTime(arm.time, errorPath + '.time');
  const tokens = normalizeTokens(arm.tokens, errorPath + '.tokens');
  const exactScore = exactDeliveryScore(
    acceptance,
    requirements,
    scope,
    prohibitions,
  );
  const deliveryScore = fractionToNumber(exactScore);
  const deliveryPass =
    execution.status === 'completed' &&
    acceptance.failed === 0 &&
    acceptance.criticalFailureCount === 0 &&
    prohibitions.criticalFailureCount === 0 &&
    privacy.criticalFailureCount === 0 &&
    requirements.omitted === 0 &&
    scope.forbiddenPathCount === 0 &&
    documents.criticalDriftCount === 0;

  const result = {
    scenarioHash,
    ...cohort,
    execution: {
      status: execution.status,
      errorCode: execution.errorCode ?? null,
    },
    acceptance,
    requirements,
    scope,
    prohibitions,
    documents,
    privacy,
    repairRounds,
    firstPassSuccess: deliveryPass && repairRounds === 0,
    time,
    tokens,
    deliveryScore,
    deliveryPass,
  };
  Object.defineProperty(result, EXACT_DELIVERY_SCORE, { value: exactScore });
  return result;
}

function telemetryComparable(baseline, governed, field, valueKey) {
  return (
    baseline.deliveryPass &&
    governed.deliveryPass &&
    baseline[field]?.availability === 'available' &&
    governed[field]?.availability === 'available' &&
    Number.isFinite(baseline[field][valueKey]) &&
    Number.isFinite(governed[field][valueKey])
  );
}

export function compareArms(baseline, governed) {
  if (!isPlainObject(baseline) || !isPlainObject(governed)) fail('compareArms');
  if (typeof baseline.deliveryPass !== 'boolean') fail('baseline.deliveryPass');
  if (typeof governed.deliveryPass !== 'boolean') fail('governed.deliveryPass');
  requireFinite(baseline.deliveryScore, 'baseline.deliveryScore', 0, 100);
  requireFinite(governed.deliveryScore, 'governed.deliveryScore', 0, 100);
  requireSafeInteger(baseline.repairRounds, 'baseline.repairRounds');
  requireSafeInteger(governed.repairRounds, 'governed.repairRounds');

  const exactScoreDelta =
    baseline[EXACT_DELIVERY_SCORE] && governed[EXACT_DELIVERY_SCORE]
      ? subtractFractions(
          governed[EXACT_DELIVERY_SCORE],
          baseline[EXACT_DELIVERY_SCORE],
        )
      : null;
  const scoreDelta = exactScoreDelta
    ? fractionToNumber(exactScoreDelta)
    : governed.deliveryScore - baseline.deliveryScore;
  const scoreThresholdReached = exactScoreDelta
    ? (exactScoreDelta.numerator < 0n
        ? -exactScoreDelta.numerator
        : exactScoreDelta.numerator) >= exactScoreDelta.denominator
    : Math.abs(scoreDelta) >= 1;
  let winner = 'tie';
  let reason = 'tie';
  if (baseline.deliveryPass !== governed.deliveryPass) {
    winner = baseline.deliveryPass ? 'baseline' : 'governed';
    reason = 'delivery-pass';
  } else if (scoreThresholdReached) {
    const scoreDirection = exactScoreDelta?.numerator ?? scoreDelta;
    winner = scoreDirection > 0 ? 'governed' : 'baseline';
    reason = 'delivery-score';
  } else if (baseline.repairRounds !== governed.repairRounds) {
    winner = baseline.repairRounds < governed.repairRounds ? 'baseline' : 'governed';
    reason = 'repair-rounds';
  }

  const comparableFields = ['deliveryPass', 'deliveryScore', 'repairRounds'];
  const timeIsComparable = telemetryComparable(baseline, governed, 'time', 'wallTimeMs');
  const tokensAreComparable = telemetryComparable(baseline, governed, 'tokens', 'total');
  if (timeIsComparable) comparableFields.push('time');
  if (tokensAreComparable) comparableFields.push('tokens');
  return {
    winner,
    reason,
    comparableFields,
    deliveryPassDelta: Number(governed.deliveryPass) - Number(baseline.deliveryPass),
    scoreDelta,
    repairRoundsDelta: governed.repairRounds - baseline.repairRounds,
    timeDeltaMs: timeIsComparable
      ? governed.time.wallTimeMs - baseline.time.wallTimeMs
      : null,
    tokenDelta: tokensAreComparable ? governed.tokens.total - baseline.tokens.total : null,
  };
}

export function scoreRun(value) {
  const runKeys = [
    'schemaVersion',
    'runId',
    'attemptId',
    'repetitionId',
    'seed',
    'scenario',
    'arms',
  ];
  const run = requireObject(value, 'run', runKeys);
  if (run.schemaVersion !== 1) fail('run.schemaVersion');
  requireIdentifier(run.runId, 'run.runId');
  requireHex64(run.attemptId, 'run.attemptId');
  requireIdentifier(run.repetitionId, 'run.repetitionId');
  requireSafeInteger(run.seed, 'run.seed');

  const scenarioValidation = validateScenario(run.scenario, '/governance-impact-scenario');
  if (!scenarioValidation.valid) {
    const first = scenarioValidation.errors[0];
    fail('run.scenario.' + first.code + '@' + first.path);
  }
  const scenarioHash = scenarioValidation.scenarioHash;
  const contract = scenarioContract(run.scenario);

  const arms = requireObject(run.arms, 'run.arms', ['baseline', 'governed']);
  const baseline = scoreArm(arms.baseline, contract, scenarioHash, 'baseline');
  const governed = scoreArm(arms.governed, contract, scenarioHash, 'governed');
  if (!PAIR_FIELDS.every((field) => baseline[field] === governed[field])) {
    fail('run.arms.pairContract');
  }
  const cohort = cohortFromArm(baseline);
  const calculatedAttemptId = expectedAttemptId(
    scenarioHash,
    run.repetitionId,
    run.seed,
    cohort,
  );
  if (run.attemptId !== calculatedAttemptId) fail('run.attemptId');

  return {
    schemaVersion: 1,
    runId: run.runId,
    attemptId: run.attemptId,
    repetitionId: run.repetitionId,
    seed: run.seed,
    scenarioHash,
    arms: { baseline, governed },
    comparison: compareArms(baseline, governed),
  };
}

function validateManifest(value) {
  const manifest = requireObject(
    value,
    'manifest',
    ['schemaVersion', 'cohort', 'attempts'],
  );
  if (manifest.schemaVersion !== 1) fail('manifest.schemaVersion');
  const cohort = requireCohort(manifest.cohort, 'manifest.cohort');
  const attempts = requireArray(manifest.attempts, 'manifest.attempts', 1);
  const seenAttemptIds = new Set();
  const seenRepetitions = new Set();
  const normalizedAttempts = attempts.map((attempt, index) => {
    const errorPath = 'manifest.attempts[' + index + ']';
    requireObject(
      attempt,
      errorPath,
      ['attemptId', 'scenarioHash', 'repetitionId', 'seed'],
    );
    requireHex64(attempt.attemptId, errorPath + '.attemptId');
    requireHex64(attempt.scenarioHash, errorPath + '.scenarioHash');
    requireIdentifier(attempt.repetitionId, errorPath + '.repetitionId');
    requireSafeInteger(attempt.seed, errorPath + '.seed');
    const calculated = expectedAttemptId(
      attempt.scenarioHash,
      attempt.repetitionId,
      attempt.seed,
      cohort,
    );
    if (attempt.attemptId !== calculated) fail(errorPath + '.attemptId');
    const repetitionKey = attempt.scenarioHash + '\0' + attempt.repetitionId;
    if (seenAttemptIds.has(attempt.attemptId)) fail(errorPath + '.attemptId duplicate');
    if (seenRepetitions.has(repetitionKey)) fail(errorPath + '.repetitionId duplicate');
    seenAttemptIds.add(attempt.attemptId);
    seenRepetitions.add(repetitionKey);
    return {
      attemptId: attempt.attemptId,
      scenarioHash: attempt.scenarioHash,
      repetitionId: attempt.repetitionId,
      seed: attempt.seed,
    };
  });
  normalizedAttempts.sort((left, right) =>
    compareText(
      [
      left.scenarioHash,
      left.repetitionId,
      String(left.seed).padStart(16, '0'),
      left.attemptId,
      ].join('\0'),
      [
        right.scenarioHash,
        right.repetitionId,
        String(right.seed).padStart(16, '0'),
        right.attemptId,
      ].join('\0'),
    ),
  );
  const normalized = { schemaVersion: 1, cohort, attempts: normalizedAttempts };
  return { normalized, manifestHash: sha256Canonical(normalized) };
}

export function normalizeAttemptManifest(value) {
  const { normalized, manifestHash } = validateManifest(value);
  return { manifest: normalized, manifestHash };
}

function seedToUint32(seed, errorPath = 'aggregate.seed') {
  if (Number.isSafeInteger(seed) && seed >= 0) return seed >>> 0;
  if (typeof seed === 'string' && seed.length > 0 && seed.trim() === seed) {
    return Number.parseInt(
      createHash('sha256').update(seed).digest('hex').slice(0, 8),
      16,
    ) >>> 0;
  }
  fail(errorPath);
}

function metricRandom(seed, metricName) {
  let state = Number.parseInt(
    sha256Canonical({ seed, metricName }).slice(0, 8),
    16,
  ) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rounded(value) {
  return Number(value.toFixed(12));
}

function summarizeMetric(values, seed, metricName) {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) {
    return {
      n: 1,
      mean: rounded(mean),
      confidence95: { lower: rounded(mean), upper: rounded(mean) },
    };
  }
  const random = metricRandom(seed, metricName);
  const bootstrapMeans = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    let sum = 0;
    for (let sample = 0; sample < values.length; sample += 1) {
      sum += values[Math.floor(random() * values.length)];
    }
    bootstrapMeans.push(sum / values.length);
  }
  bootstrapMeans.sort((left, right) => left - right);
  return {
    n: values.length,
    mean: rounded(mean),
    confidence95: {
      lower: rounded(bootstrapMeans[Math.floor((bootstrapMeans.length - 1) * 0.025)]),
      upper: rounded(bootstrapMeans[Math.floor((bootstrapMeans.length - 1) * 0.975)]),
    },
  };
}

function safeAttemptId(value) {
  return isPlainObject(value) && HEX_64.test(value.attemptId) ? value.attemptId : null;
}

export function aggregateResults(rawRuns, seed, manifestValue) {
  requireArray(rawRuns, 'rawRuns');
  seedToUint32(seed);
  if (manifestValue === undefined) fail('manifest');
  const { normalized: manifest, manifestHash } = validateManifest(manifestValue);
  const expected = new Map(manifest.attempts.map((attempt) => [attempt.attemptId, attempt]));
  const candidates = new Map();
  const rejected = [];

  for (const rawRun of rawRuns) {
    let result;
    let rawRunHash;
    try {
      result = scoreRun(rawRun);
      rawRunHash = sha256Canonical(rawRun);
    } catch {
      rejected.push({ attemptId: safeAttemptId(rawRun), code: 'INVALID_RAW_RUN' });
      continue;
    }
    const attempt = expected.get(result.attemptId);
    if (!attempt) {
      rejected.push({ attemptId: result.attemptId, code: 'UNREGISTERED_ATTEMPT' });
      continue;
    }
    if (
      result.scenarioHash !== attempt.scenarioHash ||
      result.repetitionId !== attempt.repetitionId ||
      result.seed !== attempt.seed
    ) {
      rejected.push({ attemptId: result.attemptId, code: 'MANIFEST_MISMATCH' });
      continue;
    }
    if (!sameCohort(cohortFromArm(result.arms.baseline), manifest.cohort)) {
      rejected.push({ attemptId: result.attemptId, code: 'COHORT_MISMATCH' });
      continue;
    }
    const existing = candidates.get(result.attemptId) ?? [];
    existing.push({ result, rawRunHash });
    candidates.set(result.attemptId, existing);
  }

  const acceptedById = new Map();
  for (const [attemptId, results] of candidates) {
    if (results.length === 1) {
      acceptedById.set(attemptId, results[0]);
    } else {
      for (let index = 0; index < results.length; index += 1) {
        rejected.push({ attemptId, code: 'DUPLICATE_SUBMISSION' });
      }
    }
  }
  const acceptedEntries = manifest.attempts
    .map((attempt) => acceptedById.get(attempt.attemptId))
    .filter(Boolean);
  const accepted = acceptedEntries.map((entry) => entry.result);
  const acceptedRunCommitments = acceptedEntries.map((entry) => ({
    attemptId: entry.result.attemptId,
    rawRunHash: entry.rawRunHash,
  }));
  const missingAttempts = manifest.attempts
    .filter((attempt) => !acceptedById.has(attempt.attemptId))
    .map((attempt) => ({ ...attempt, code: MISSING_ATTEMPT_CODE }));
  rejected.sort((left, right) =>
    compareText(
      (left.attemptId ?? '~') + '\0' + left.code,
      (right.attemptId ?? '~') + '\0' + right.code,
    ),
  );

  const scenarioCounts = new Map();
  for (const attempt of manifest.attempts) scenarioCounts.set(attempt.scenarioHash, 0);
  for (const result of accepted) {
    scenarioCounts.set(result.scenarioHash, scenarioCounts.get(result.scenarioHash) + 1);
  }

  const metricValues = {
    deliveryPassDelta: accepted.map((result) => result.comparison.deliveryPassDelta),
    deliveryScoreDelta: accepted.map((result) => result.comparison.scoreDelta),
    repairRoundsDelta: accepted.map((result) => result.comparison.repairRoundsDelta),
    time: accepted
      .filter((result) => result.comparison.comparableFields.includes('time'))
      .map((result) => result.comparison.timeDeltaMs),
    tokens: accepted
      .filter((result) => result.comparison.comparableFields.includes('tokens'))
      .map((result) => result.comparison.tokenDelta),
  };
  const comparablePairs = accepted.length;
  const regressionCount = (governedValue, baselineValue) =>
    accepted.filter((result) => governedValue(result) > baselineValue(result)).length;
  const evidence = {
    acceptedRuns: acceptedRunCommitments,
    commitment: sha256Canonical({ manifestHash, acceptedRuns: acceptedRunCommitments }),
  };

  return {
    manifest,
    manifestHash,
    evidence,
    cohort: manifest.cohort,
    pairing: {
      expectedPairs: manifest.attempts.length,
      submittedRuns: rawRuns.length,
      comparablePairs,
      missingPairs: missingAttempts.length,
      rejectedPairs: rejected.length,
      completeness: comparablePairs / manifest.attempts.length,
    },
    scenarios: {
      count: scenarioCounts.size,
      minimumCompleteRepetitions: Math.min(...scenarioCounts.values()),
    },
    metrics: {
      deliveryPassDelta: summarizeMetric(
        metricValues.deliveryPassDelta,
        seed,
        'deliveryPassDelta',
      ),
      deliveryScoreDelta: summarizeMetric(
        metricValues.deliveryScoreDelta,
        seed,
        'deliveryScoreDelta',
      ),
      repairRoundsDelta: summarizeMetric(
        metricValues.repairRoundsDelta,
        seed,
        'repairRoundsDelta',
      ),
      time: summarizeMetric(metricValues.time, seed, 'time'),
      tokens: summarizeMetric(metricValues.tokens, seed, 'tokens'),
    },
    coverage: {
      time: comparablePairs === 0 ? 0 : metricValues.time.length / comparablePairs,
      tokens: comparablePairs === 0 ? 0 : metricValues.tokens.length / comparablePairs,
    },
    regressions: {
      criticalScope: regressionCount(
        (result) => result.arms.governed.scope.forbiddenPathCount,
        (result) => result.arms.baseline.scope.forbiddenPathCount,
      ),
      criticalProhibition: regressionCount(
        (result) => result.arms.governed.prohibitions.criticalFailureCount,
        (result) => result.arms.baseline.prohibitions.criticalFailureCount,
      ),
      privacy: regressionCount(
        (result) => result.arms.governed.privacy.criticalFailureCount,
        (result) => result.arms.baseline.privacy.criticalFailureCount,
      ),
      criticalDocument: regressionCount(
        (result) => result.arms.governed.documents.criticalDriftCount,
        (result) => result.arms.baseline.documents.criticalDriftCount,
      ),
    },
    bootstrap: {
      seed,
      iterations: BOOTSTRAP_ITERATIONS,
      confidenceLevel: 0.95,
    },
    missingAttempts,
    rejectedAttempts: rejected,
  };
}

const DEFAULT_GATE_POLICY = Object.freeze({
  claim: 'improves',
  expectedManifestHash: null,
  expectedBootstrapSeed: null,
  minScenarios: 5,
  minCompleteRepetitions: 3,
  minPairCompleteness: 0.9,
  confidenceLevel: 0.95,
  minConfidenceLowerBound: 0,
  minTelemetryCoverage: 0.8,
  telemetryClaims: [],
});

function validateMetricSummary(value, errorPath, expectedN, range) {
  if (value === null) {
    if (expectedN !== undefined && expectedN !== 0) fail(errorPath);
    return null;
  }
  const summary = requireObject(value, errorPath, ['n', 'mean', 'confidence95']);
  requireSafeInteger(summary.n, errorPath + '.n', 1);
  if (expectedN !== undefined && summary.n !== expectedN) fail(errorPath + '.n');
  requireFinite(summary.mean, errorPath + '.mean', range[0], range[1]);
  const confidence = requireObject(
    summary.confidence95,
    errorPath + '.confidence95',
    ['lower', 'upper'],
  );
  const lower = requireFinite(
    confidence.lower,
    errorPath + '.confidence95.lower',
    range[0],
    range[1],
  );
  const upper = requireFinite(
    confidence.upper,
    errorPath + '.confidence95.upper',
    range[0],
    range[1],
  );
  if (lower > upper) fail(errorPath + '.confidence95 ordering');
  if (summary.mean < lower || summary.mean > upper) {
    fail(errorPath + '.confidence95 mean consistency');
  }
  if (summary.n === 1 && (lower !== summary.mean || upper !== summary.mean)) {
    fail(errorPath + '.confidence95 singleton consistency');
  }
  return summary;
}

function validateAggregateReport(value) {
  const reportKeys = [
    'manifest',
    'manifestHash',
    'evidence',
    'cohort',
    'pairing',
    'scenarios',
    'metrics',
    'coverage',
    'regressions',
    'bootstrap',
    'missingAttempts',
    'rejectedAttempts',
  ];
  const report = requireObject(value, 'report', reportKeys);
  const { normalized: manifest, manifestHash } = validateManifest(report.manifest);
  requireHex64(report.manifestHash, 'report.manifestHash');
  if (report.manifestHash !== manifestHash) fail('report.manifestHash consistency');
  const reportCohort = requireCohort(report.cohort, 'report.cohort');
  if (!sameCohort(reportCohort, manifest.cohort)) fail('report.cohort consistency');

  const pairing = requireObject(
    report.pairing,
    'report.pairing',
    [
      'expectedPairs',
      'submittedRuns',
      'comparablePairs',
      'missingPairs',
      'rejectedPairs',
      'completeness',
    ],
  );
  requireSafeInteger(pairing.expectedPairs, 'report.pairing.expectedPairs', 1);
  requireSafeInteger(pairing.submittedRuns, 'report.pairing.submittedRuns');
  requireSafeInteger(
    pairing.comparablePairs,
    'report.pairing.comparablePairs',
    0,
    pairing.expectedPairs,
  );
  requireSafeInteger(pairing.missingPairs, 'report.pairing.missingPairs');
  requireSafeInteger(pairing.rejectedPairs, 'report.pairing.rejectedPairs');
  requireFinite(pairing.completeness, 'report.pairing.completeness', 0, 1);
  if (pairing.expectedPairs !== manifest.attempts.length) {
    fail('report.pairing.expectedPairs consistency');
  }
  if (pairing.missingPairs !== pairing.expectedPairs - pairing.comparablePairs) {
    fail('report.pairing.missingPairs consistency');
  }
  if (pairing.rejectedPairs !== pairing.submittedRuns - pairing.comparablePairs) {
    fail('report.pairing.rejectedPairs consistency');
  }
  if (pairing.completeness !== pairing.comparablePairs / pairing.expectedPairs) {
    fail('report.pairing.completeness consistency');
  }

  const missingAttempts = requireArray(report.missingAttempts, 'report.missingAttempts');
  if (missingAttempts.length !== pairing.missingPairs) fail('report.missingAttempts consistency');
  const expectedById = new Map(
    manifest.attempts.map((attempt) => [attempt.attemptId, attempt]),
  );
  const seenMissing = new Set();
  missingAttempts.forEach((missing, index) => {
    const errorPath = 'report.missingAttempts[' + index + ']';
    requireObject(
      missing,
      errorPath,
      ['attemptId', 'scenarioHash', 'repetitionId', 'seed', 'code'],
    );
    requireHex64(missing.attemptId, errorPath + '.attemptId');
    requireHex64(missing.scenarioHash, errorPath + '.scenarioHash');
    requireIdentifier(missing.repetitionId, errorPath + '.repetitionId');
    requireSafeInteger(missing.seed, errorPath + '.seed');
    if (missing.code !== MISSING_ATTEMPT_CODE) fail(errorPath + '.code');
    const expectedAttempt = expectedById.get(missing.attemptId);
    if (
      !expectedAttempt ||
      expectedAttempt.scenarioHash !== missing.scenarioHash ||
      expectedAttempt.repetitionId !== missing.repetitionId ||
      expectedAttempt.seed !== missing.seed
    ) {
      fail(errorPath + '.manifest consistency');
    }
    if (seenMissing.has(missing.attemptId)) fail(errorPath + '.attemptId duplicate');
    seenMissing.add(missing.attemptId);
  });

  const evidence = requireObject(
    report.evidence,
    'report.evidence',
    ['acceptedRuns', 'commitment'],
  );
  const acceptedRunCommitments = requireArray(
    evidence.acceptedRuns,
    'report.evidence.acceptedRuns',
  );
  if (acceptedRunCommitments.length !== pairing.comparablePairs) {
    fail('report.evidence.acceptedRuns consistency');
  }
  const expectedAcceptedIds = manifest.attempts
    .filter((attempt) => !seenMissing.has(attempt.attemptId))
    .map((attempt) => attempt.attemptId);
  acceptedRunCommitments.forEach((acceptedRun, index) => {
    const errorPath = 'report.evidence.acceptedRuns[' + index + ']';
    requireObject(acceptedRun, errorPath, ['attemptId', 'rawRunHash']);
    requireHex64(acceptedRun.attemptId, errorPath + '.attemptId');
    requireHex64(acceptedRun.rawRunHash, errorPath + '.rawRunHash');
    if (acceptedRun.attemptId !== expectedAcceptedIds[index]) {
      fail(errorPath + '.attemptId order consistency');
    }
  });
  requireHex64(evidence.commitment, 'report.evidence.commitment');
  if (
    evidence.commitment !==
    sha256Canonical({
      manifestHash: report.manifestHash,
      acceptedRuns: acceptedRunCommitments,
    })
  ) {
    fail('report.evidence.commitment consistency');
  }

  const acceptedScenarioCounts = new Map();
  for (const attempt of manifest.attempts) {
    if (!acceptedScenarioCounts.has(attempt.scenarioHash)) {
      acceptedScenarioCounts.set(attempt.scenarioHash, 0);
    }
    if (!seenMissing.has(attempt.attemptId)) {
      acceptedScenarioCounts.set(
        attempt.scenarioHash,
        acceptedScenarioCounts.get(attempt.scenarioHash) + 1,
      );
    }
  }

  const scenarios = requireObject(
    report.scenarios,
    'report.scenarios',
    ['count', 'minimumCompleteRepetitions'],
  );
  requireSafeInteger(scenarios.count, 'report.scenarios.count', 1);
  requireSafeInteger(
    scenarios.minimumCompleteRepetitions,
    'report.scenarios.minimumCompleteRepetitions',
  );
  const expectedScenarioCount = acceptedScenarioCounts.size;
  const expectedMinimumCompleteRepetitions = Math.min(...acceptedScenarioCounts.values());
  if (
    scenarios.count !== expectedScenarioCount ||
    scenarios.minimumCompleteRepetitions !== expectedMinimumCompleteRepetitions
  ) fail('report.scenarios consistency');

  const metrics = requireObject(
    report.metrics,
    'report.metrics',
    ['deliveryPassDelta', 'deliveryScoreDelta', 'repairRoundsDelta', 'time', 'tokens'],
  );
  validateMetricSummary(
    metrics.deliveryPassDelta,
    'report.metrics.deliveryPassDelta',
    pairing.comparablePairs,
    [-1, 1],
  );
  validateMetricSummary(
    metrics.deliveryScoreDelta,
    'report.metrics.deliveryScoreDelta',
    pairing.comparablePairs,
    [-100, 100],
  );
  validateMetricSummary(
    metrics.repairRoundsDelta,
    'report.metrics.repairRoundsDelta',
    pairing.comparablePairs,
    [-MAX_SAFE_INTEGER, MAX_SAFE_INTEGER],
  );
  const timeSummary = validateMetricSummary(
    metrics.time,
    'report.metrics.time',
    undefined,
    [-MAX_SAFE_INTEGER, MAX_SAFE_INTEGER],
  );
  const tokenSummary = validateMetricSummary(
    metrics.tokens,
    'report.metrics.tokens',
    undefined,
    [-MAX_SAFE_INTEGER, MAX_SAFE_INTEGER],
  );
  if (pairing.comparablePairs === 0 && (timeSummary !== null || tokenSummary !== null)) {
    fail('report.metrics telemetry');
  }

  const coverage = requireObject(
    report.coverage,
    'report.coverage',
    ['time', 'tokens'],
  );
  requireFinite(coverage.time, 'report.coverage.time', 0, 1);
  requireFinite(coverage.tokens, 'report.coverage.tokens', 0, 1);
  const expectedTimeCoverage =
    pairing.comparablePairs === 0 ? 0 : (timeSummary?.n ?? 0) / pairing.comparablePairs;
  const expectedTokenCoverage =
    pairing.comparablePairs === 0 ? 0 : (tokenSummary?.n ?? 0) / pairing.comparablePairs;
  if (coverage.time !== expectedTimeCoverage) fail('report.coverage.time consistency');
  if (coverage.tokens !== expectedTokenCoverage) fail('report.coverage.tokens consistency');

  const regressions = requireObject(
    report.regressions,
    'report.regressions',
    ['criticalScope', 'criticalProhibition', 'privacy', 'criticalDocument'],
  );
  for (const key of Object.keys(regressions)) {
    requireSafeInteger(
      regressions[key],
      'report.regressions.' + key,
      0,
      pairing.comparablePairs,
    );
  }

  const bootstrap = requireObject(
    report.bootstrap,
    'report.bootstrap',
    ['seed', 'iterations', 'confidenceLevel'],
  );
  seedToUint32(bootstrap.seed, 'report.bootstrap.seed');
  requireSafeInteger(bootstrap.iterations, 'report.bootstrap.iterations', 1);
  if (bootstrap.iterations !== BOOTSTRAP_ITERATIONS) fail('report.bootstrap.iterations');
  if (bootstrap.confidenceLevel !== 0.95) fail('report.bootstrap.confidenceLevel');

  const rejectedAttempts = requireArray(report.rejectedAttempts, 'report.rejectedAttempts');
  if (rejectedAttempts.length !== pairing.rejectedPairs) {
    fail('report.rejectedAttempts consistency');
  }
  rejectedAttempts.forEach((rejection, index) => {
    const errorPath = 'report.rejectedAttempts[' + index + ']';
    requireObject(rejection, errorPath, ['attemptId', 'code']);
    if (rejection.attemptId !== null) requireHex64(rejection.attemptId, errorPath + '.attemptId');
    if (!REJECTION_CODES.has(rejection.code)) fail(errorPath + '.code');
  });
  return report;
}

function validatePolicy(value) {
  const policy = requireObject(
    value,
    'policy',
    Object.keys(DEFAULT_GATE_POLICY),
  );
  if (!['observed', 'improves'].includes(policy.claim)) fail('policy.claim');
  if (policy.expectedManifestHash !== null) {
    requireHex64(policy.expectedManifestHash, 'policy.expectedManifestHash');
  }
  if (policy.expectedBootstrapSeed !== null) {
    seedToUint32(policy.expectedBootstrapSeed, 'policy.expectedBootstrapSeed');
  }
  requireSafeInteger(policy.minScenarios, 'policy.minScenarios');
  requireSafeInteger(policy.minCompleteRepetitions, 'policy.minCompleteRepetitions');
  requireFinite(policy.minPairCompleteness, 'policy.minPairCompleteness', 0, 1);
  requireFinite(policy.confidenceLevel, 'policy.confidenceLevel', 0, 1);
  requireFinite(
    policy.minConfidenceLowerBound,
    'policy.minConfidenceLowerBound',
    -1,
    1,
  );
  requireFinite(policy.minTelemetryCoverage, 'policy.minTelemetryCoverage', 0, 1);
  requireArray(policy.telemetryClaims, 'policy.telemetryClaims');
  const seen = new Set();
  policy.telemetryClaims.forEach((metric, index) => {
    if (!['time', 'tokens'].includes(metric) || seen.has(metric)) {
      fail('policy.telemetryClaims[' + index + ']');
    }
    seen.add(metric);
  });
  return policy;
}

export function evaluateGate(reportValue, policyValue = {}, rawRunsValue) {
  const report = validateAggregateReport(reportValue);
  const supplied = requireObject(
    policyValue,
    'policy',
    [],
    Object.keys(DEFAULT_GATE_POLICY),
  );
  const effective = validatePolicy({ ...DEFAULT_GATE_POLICY, ...supplied });
  if (effective.claim === 'improves') {
    effective.minScenarios = Math.max(
      effective.minScenarios,
      DEFAULT_GATE_POLICY.minScenarios,
    );
    effective.minCompleteRepetitions = Math.max(
      effective.minCompleteRepetitions,
      DEFAULT_GATE_POLICY.minCompleteRepetitions,
    );
    effective.minPairCompleteness = Math.max(
      effective.minPairCompleteness,
      DEFAULT_GATE_POLICY.minPairCompleteness,
    );
    effective.confidenceLevel = Math.max(
      effective.confidenceLevel,
      DEFAULT_GATE_POLICY.confidenceLevel,
    );
    effective.minConfidenceLowerBound = Math.max(
      effective.minConfidenceLowerBound,
      DEFAULT_GATE_POLICY.minConfidenceLowerBound,
    );
    effective.minTelemetryCoverage = Math.max(
      effective.minTelemetryCoverage,
      DEFAULT_GATE_POLICY.minTelemetryCoverage,
    );
  }

  const failures = [];
  if (effective.claim === 'improves') {
    if (rawRunsValue === undefined) {
      failures.push('EVIDENCE_UNVERIFIED');
    } else {
      let recomputed;
      try {
        recomputed = aggregateResults(
          rawRunsValue,
          report.bootstrap.seed,
          report.manifest,
        );
      } catch {
        failures.push('EVIDENCE_UNVERIFIED');
      }
      if (
        recomputed &&
        sha256Canonical(recomputed) !== sha256Canonical(report)
      ) {
        failures.push('REPORT_EVIDENCE_MISMATCH');
      }
    }
  }
  if (report.scenarios.count < effective.minScenarios) failures.push('MIN_SCENARIOS');
  if (
    report.scenarios.minimumCompleteRepetitions <
    effective.minCompleteRepetitions
  ) {
    failures.push('MIN_COMPLETE_REPETITIONS');
  }
  if (report.pairing.completeness < effective.minPairCompleteness) {
    failures.push('PAIR_COMPLETENESS');
  }
  if (effective.claim === 'improves') {
    if (effective.expectedBootstrapSeed === null) {
      failures.push('BOOTSTRAP_SEED_UNPINNED');
    } else if (effective.expectedBootstrapSeed !== report.bootstrap.seed) {
      failures.push('BOOTSTRAP_SEED_MISMATCH');
    }
    if (effective.expectedManifestHash === null) {
      failures.push('MANIFEST_HASH_UNPINNED');
    } else if (effective.expectedManifestHash !== report.manifestHash) {
      failures.push('MANIFEST_HASH_MISMATCH');
    }
  }
  if (report.pairing.rejectedPairs > 0) failures.push('REJECTED_ATTEMPTS');

  const deliveryPass = report.metrics.deliveryPassDelta;
  if (deliveryPass === null || deliveryPass.mean < 0) {
    failures.push('DELIVERY_PASS_DELTA');
  }
  if (effective.claim === 'improves') {
    if (report.bootstrap.confidenceLevel < effective.confidenceLevel) {
      failures.push('CONFIDENCE_LEVEL');
    } else if (deliveryPass === null) {
      failures.push('CONFIDENCE_UNAVAILABLE');
    } else if (
      deliveryPass.confidence95.lower <= effective.minConfidenceLowerBound
    ) {
      failures.push('CONFIDENCE_LOWER_BOUND');
    }
  }

  if (Object.values(report.regressions).some((value) => value > 0)) {
    failures.push('CRITICAL_REGRESSION');
  }
  for (const metric of effective.telemetryClaims) {
    if (report.coverage[metric] < effective.minTelemetryCoverage) {
      failures.push('TELEMETRY_COVERAGE_' + metric.toUpperCase());
    }
  }
  return { pass: failures.length === 0, claim: effective.claim, failures };
}
