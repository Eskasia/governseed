import { createHash } from 'node:crypto';
import path from 'node:path';

const PAIR_FIELDS = ['scenarioHash', 'runtime', 'model', 'config', 'starterCommit'];
const FACT_KINDS = new Set(['requirement', 'prohibition', 'context']);
const CHECK_KINDS = new Set(['acceptance', 'prohibition', 'scope', 'document']);
const DATA_CLASSIFICATIONS = new Set(['synthetic', 'public']);
const EXECUTION_STATUSES = new Set(['completed', 'failed', 'timeout']);
const RUNTIMES = new Set(['synthetic', 'codex', 'claude', 'antigravity']);
const BOOTSTRAP_ITERATIONS = 2000;

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
    throw new TypeError(`Canonical JSON does not support ${valueType}`);
  }
  if (ancestors.has(value)) throw new TypeError('Canonical JSON does not support cycles');

  ancestors.add(value);
  let serialized;
  if (Array.isArray(value)) {
    serialized = `[${value.map((entry) => canonicalJson(entry, ancestors)).join(',')}]`;
  } else {
    if (!isPlainObject(value)) throw new TypeError('Canonical JSON requires plain objects');
    const entries = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key], ancestors)}`);
    serialized = `{${entries.join(',')}}`;
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

function checkObjectKeys(value, required, allowed, errorPath, errors) {
  if (!isPlainObject(value)) {
    addError(errors, 'TYPE', errorPath);
    return false;
  }

  for (const key of required) {
    if (!Object.hasOwn(value, key)) {
      addError(errors, 'REQUIRED_KEY', errorPath ? `${errorPath}.${key}` : key);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      addError(errors, 'UNKNOWN_KEY', errorPath ? `${errorPath}.${key}` : key);
    }
  }
  return true;
}

function isRelativePosixPath(value, baseDir) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(value) || value === '.' || value.startsWith('//')) return false;

  const segments = value.split('/');
  if (segments.some((segment, index) => segment === '..' || segment === '.' || (segment === '' && index !== segments.length - 1))) {
    return false;
  }
  if (path.posix.normalize(value) !== value) return false;

  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, value);
  return resolved !== root && resolved.startsWith(`${root}${path.sep}`);
}

function validateRelativePath(value, errorPath, baseDir, errors) {
  if (!isRelativePosixPath(value, baseDir)) addError(errors, 'RELATIVE_PATH', errorPath);
}

function validateReferenceArray(value, errorPath, knownIds, referenceCode, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    addError(errors, 'TYPE', errorPath);
    return [];
  }

  const seen = new Set();
  value.forEach((id, index) => {
    if (typeof id !== 'string' || !knownIds.has(id)) {
      addError(errors, referenceCode, `${errorPath}[${index}]`);
    }
    if (seen.has(id)) addError(errors, 'DUPLICATE_REFERENCE', `${errorPath}[${index}]`);
    seen.add(id);
  });
  return value;
}

function sameIdSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const leftIds = [...new Set(left)].sort();
  const rightIds = [...new Set(right)].sort();
  return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
}

export function validateScenario(value, baseDir) {
  const errors = [];
  const rootKeys = [
    'schemaVersion',
    'id',
    'dataClassification',
    'paths',
    'facts',
    'factParity',
    'checks',
    'oracle',
    'allowedChangePaths',
    'forbiddenChangePaths',
  ];

  if (typeof baseDir !== 'string' || baseDir.length === 0) addError(errors, 'BASE_DIR', '$baseDir');
  if (!checkObjectKeys(value, rootKeys, rootKeys, '', errors)) {
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
  if (checkObjectKeys(value.paths, pathKeys, pathKeys, 'paths', errors)) {
    for (const key of pathKeys) {
      if (Object.hasOwn(value.paths, key)) {
        validateRelativePath(value.paths[key], `paths.${key}`, scenarioBase, errors);
      }
    }
  }

  const factIds = new Set();
  if (!Array.isArray(value.facts) || value.facts.length === 0) {
    addError(errors, 'TYPE', 'facts');
  } else {
    value.facts.forEach((fact, index) => {
      const errorPath = `facts[${index}]`;
      const keys = ['id', 'kind', 'statement'];
      if (!checkObjectKeys(fact, keys, keys, errorPath, errors)) return;
      if (typeof fact.id !== 'string' || !/^FACT-[0-9]{3,}$/.test(fact.id)) {
        addError(errors, 'ID_FORMAT', `${errorPath}.id`);
      } else if (factIds.has(fact.id)) {
        addError(errors, 'DUPLICATE_ID', `${errorPath}.id`);
      } else {
        factIds.add(fact.id);
      }
      if (!FACT_KINDS.has(fact.kind)) addError(errors, 'ENUM', `${errorPath}.kind`);
      if (typeof fact.statement !== 'string' || fact.statement.length === 0) {
        addError(errors, 'TYPE', `${errorPath}.statement`);
      }
    });
  }

  let baselineFacts = [];
  let governedFacts = [];
  const parityKeys = ['baseline', 'governed'];
  if (checkObjectKeys(value.factParity, parityKeys, parityKeys, 'factParity', errors)) {
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
      !sameIdSet(baselineFacts, governedFacts) ||
      !sameIdSet(baselineFacts, declaredFacts) ||
      !sameIdSet(governedFacts, declaredFacts)
    ) {
      addError(errors, 'FACT_PARITY', 'factParity');
    }
  }

  const checkIds = new Set();
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    addError(errors, 'TYPE', 'checks');
  } else {
    value.checks.forEach((check, index) => {
      const errorPath = `checks[${index}]`;
      const keys = ['id', 'kind', 'factIds', 'critical'];
      if (!checkObjectKeys(check, keys, keys, errorPath, errors)) return;
      if (typeof check.id !== 'string' || !/^CHECK-[0-9]{3,}$/.test(check.id)) {
        addError(errors, 'ID_FORMAT', `${errorPath}.id`);
      } else if (checkIds.has(check.id)) {
        addError(errors, 'DUPLICATE_ID', `${errorPath}.id`);
      } else {
        checkIds.add(check.id);
      }
      if (!CHECK_KINDS.has(check.kind)) addError(errors, 'ENUM', `${errorPath}.kind`);
      validateReferenceArray(check.factIds, `${errorPath}.factIds`, factIds, 'FACT_REFERENCE', errors);
      if (typeof check.critical !== 'boolean') addError(errors, 'TYPE', `${errorPath}.critical`);
    });
  }

  const oracleKeys = ['command', 'checkIds'];
  if (checkObjectKeys(value.oracle, oracleKeys, oracleKeys, 'oracle', errors)) {
    if (
      !Array.isArray(value.oracle.command) ||
      value.oracle.command.length === 0 ||
      value.oracle.command.some(
        (argument) => typeof argument !== 'string' || argument.length === 0 || argument.includes('\0'),
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
      if (!sameIdSet(oracleCheckIds, [...checkIds])) {
        addError(errors, 'CHECK_COVERAGE', 'oracle.checkIds');
      }
    }
  }

  for (const key of ['allowedChangePaths', 'forbiddenChangePaths']) {
    const entries = value[key];
    if (!Array.isArray(entries)) {
      addError(errors, 'TYPE', key);
      continue;
    }
    const seen = new Set();
    entries.forEach((entry, index) => {
      validateRelativePath(entry, `${key}[${index}]`, scenarioBase, errors);
      if (seen.has(entry)) addError(errors, 'DUPLICATE_PATH', `${key}[${index}]`);
      seen.add(entry);
    });
  }

  return {
    valid: errors.length === 0,
    errors,
    scenarioHash: errors.length === 0 ? sha256Canonical(value) : null,
  };
}

function failEvidence(errorPath) {
  throw new TypeError(`Invalid governance impact evidence at ${errorPath}`);
}

function requirePlainObject(value, errorPath) {
  if (!isPlainObject(value)) failEvidence(errorPath);
  return value;
}

function requireArray(value, errorPath, minimum = 0) {
  if (!Array.isArray(value) || value.length < minimum) failEvidence(errorPath);
  return value;
}

function requireBoolean(value, errorPath) {
  if (typeof value !== 'boolean') failEvidence(errorPath);
  return value;
}

function requireNonNegativeInteger(value, errorPath) {
  if (!Number.isSafeInteger(value) || value < 0) failEvidence(errorPath);
  return value;
}

function requireNonNegativeNumber(value, errorPath) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) failEvidence(errorPath);
  return value;
}

function assertUniqueIds(entries, errorPath) {
  const seen = new Set();
  entries.forEach((entry, index) => {
    requirePlainObject(entry, `${errorPath}[${index}]`);
    if (typeof entry.id !== 'string' || entry.id.length === 0 || seen.has(entry.id)) {
      failEvidence(`${errorPath}[${index}].id`);
    }
    seen.add(entry.id);
  });
}

function requirePathList(value, errorPath) {
  const entries = requireArray(value, errorPath);
  const seen = new Set();
  entries.forEach((entry, index) => {
    if (!isRelativePosixPath(entry, '/governance-impact-root') || seen.has(entry)) {
      failEvidence(`${errorPath}[${index}]`);
    }
    seen.add(entry);
  });
  return entries;
}

function pathMatches(changedPath, rule) {
  return rule.endsWith('/') ? changedPath.startsWith(rule) : changedPath === rule;
}

function normalizeTime(value) {
  requirePlainObject(value, 'time');
  if (value.availability === 'unavailable') {
    if (value.wallTimeMs !== null) failEvidence('time.wallTimeMs');
    return { availability: 'unavailable', wallTimeMs: null };
  }
  if (value.availability !== 'available') failEvidence('time.availability');
  return {
    availability: 'available',
    wallTimeMs: requireNonNegativeNumber(value.wallTimeMs, 'time.wallTimeMs'),
  };
}

function normalizeTokens(value) {
  requirePlainObject(value, 'tokens');
  if (value.availability === 'unavailable') {
    if (value.total !== null) failEvidence('tokens.total');
    return { availability: 'unavailable', total: null };
  }
  if (value.availability !== 'available') failEvidence('tokens.availability');
  return {
    availability: 'available',
    total: requireNonNegativeInteger(value.total, 'tokens.total'),
  };
}

function rate(numerator, denominator) {
  return denominator === 0 ? 0 : numerator / denominator;
}

function scoreArm(value) {
  const arm = requirePlainObject(value, 'arm');
  if (typeof arm.scenarioHash !== 'string' || !/^[a-f0-9]{64}$/.test(arm.scenarioHash)) {
    failEvidence('arm.scenarioHash');
  }
  if (!RUNTIMES.has(arm.runtime)) failEvidence('arm.runtime');
  for (const key of ['model', 'config']) {
    if (typeof arm[key] !== 'string' || arm[key].length === 0) failEvidence(`arm.${key}`);
  }
  if (
    typeof arm.starterCommit !== 'string' ||
    !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(arm.starterCommit)
  ) {
    failEvidence('arm.starterCommit');
  }

  const execution = requirePlainObject(arm.execution, 'execution');
  if (!EXECUTION_STATUSES.has(execution.status)) failEvidence('execution.status');
  const repairRounds = requireNonNegativeInteger(execution.repairRounds, 'execution.repairRounds');
  if (execution.errorCode !== undefined && execution.errorCode !== null && typeof execution.errorCode !== 'string') {
    failEvidence('execution.errorCode');
  }

  const acceptanceChecks = requireArray(arm.acceptanceChecks, 'acceptanceChecks', 1);
  assertUniqueIds(acceptanceChecks, 'acceptanceChecks');
  let acceptancePassed = 0;
  let acceptanceCriticalFailures = 0;
  acceptanceChecks.forEach((check, index) => {
    const passed = requireBoolean(check.passed, `acceptanceChecks[${index}].passed`);
    const critical = requireBoolean(check.critical, `acceptanceChecks[${index}].critical`);
    if (passed) acceptancePassed += 1;
    if (!passed && critical) acceptanceCriticalFailures += 1;
  });
  const acceptance = {
    total: acceptanceChecks.length,
    passed: acceptancePassed,
    failed: acceptanceChecks.length - acceptancePassed,
    rate: rate(acceptancePassed, acceptanceChecks.length),
    criticalFailureCount: acceptanceCriticalFailures,
  };

  const requirementResults = requireArray(arm.requirements, 'requirements', 1);
  assertUniqueIds(requirementResults, 'requirements');
  let omitted = 0;
  requirementResults.forEach((requirement, index) => {
    if (requireBoolean(requirement.omitted, `requirements[${index}].omitted`)) omitted += 1;
  });
  const requirements = {
    total: requirementResults.length,
    omitted,
    omissionRate: rate(omitted, requirementResults.length),
  };

  const rawScope = requirePlainObject(arm.scope, 'scope');
  const changedPaths = requirePathList(rawScope.changedPaths, 'scope.changedPaths');
  const allowedPaths = requirePathList(rawScope.allowedPaths, 'scope.allowedPaths');
  const forbiddenPaths = requirePathList(rawScope.forbiddenPaths, 'scope.forbiddenPaths');
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

  const prohibitionResults = requireArray(arm.prohibitions, 'prohibitions', 1);
  assertUniqueIds(prohibitionResults, 'prohibitions');
  let violated = 0;
  let prohibitionCriticalFailures = 0;
  prohibitionResults.forEach((prohibition, index) => {
    const isViolated = requireBoolean(prohibition.violated, `prohibitions[${index}].violated`);
    const critical = requireBoolean(prohibition.critical, `prohibitions[${index}].critical`);
    if (isViolated) violated += 1;
    if (isViolated && critical) prohibitionCriticalFailures += 1;
  });
  const prohibitions = {
    total: prohibitionResults.length,
    violated,
    violationRate: rate(violated, prohibitionResults.length),
    criticalFailureCount: prohibitionCriticalFailures,
  };

  const documentResults = requireArray(arm.documentChecks, 'documentChecks');
  assertUniqueIds(documentResults, 'documentChecks');
  let drifted = 0;
  let criticalDriftCount = 0;
  documentResults.forEach((documentCheck, index) => {
    const isDrifted = requireBoolean(documentCheck.drifted, `documentChecks[${index}].drifted`);
    const critical = requireBoolean(documentCheck.critical, `documentChecks[${index}].critical`);
    if (isDrifted) drifted += 1;
    if (isDrifted && critical) criticalDriftCount += 1;
  });
  const documents = {
    total: documentResults.length,
    drifted,
    criticalDriftCount,
  };

  const privacyResults = requireArray(arm.privacyChecks ?? [], 'privacyChecks');
  assertUniqueIds(privacyResults, 'privacyChecks');
  let privacyFailed = 0;
  let privacyCriticalFailures = 0;
  privacyResults.forEach((privacyCheck, index) => {
    const passed = requireBoolean(privacyCheck.passed, `privacyChecks[${index}].passed`);
    const critical = requireBoolean(privacyCheck.critical, `privacyChecks[${index}].critical`);
    if (!passed) privacyFailed += 1;
    if (!passed && critical) privacyCriticalFailures += 1;
  });
  const privacy = {
    total: privacyResults.length,
    failed: privacyFailed,
    criticalFailureCount: privacyCriticalFailures,
  };

  const time = normalizeTime(arm.time);
  const tokens = normalizeTokens(arm.tokens);
  const deliveryScore = Number(
    (
      100 *
      (0.5 * acceptance.rate +
        0.2 * (1 - requirements.omissionRate) +
        0.15 * (1 - scope.violationRate) +
        0.15 * (1 - prohibitions.violationRate))
    ).toFixed(6),
  );
  const deliveryPass =
    execution.status === 'completed' &&
    acceptance.failed === 0 &&
    acceptance.criticalFailureCount === 0 &&
    prohibitions.criticalFailureCount === 0 &&
    privacy.criticalFailureCount === 0 &&
    requirements.omitted === 0 &&
    scope.forbiddenPathCount === 0 &&
    documents.criticalDriftCount === 0;

  return {
    scenarioHash: arm.scenarioHash,
    runtime: arm.runtime,
    model: arm.model,
    config: arm.config,
    starterCommit: arm.starterCommit,
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
}

function telemetryComparable(baseline, governed, field, valueKey) {
  return (
    baseline.deliveryPass &&
    governed.deliveryPass &&
    baseline[field]?.availability === 'available' &&
    governed[field]?.availability === 'available' &&
    typeof baseline[field][valueKey] === 'number' &&
    Number.isFinite(baseline[field][valueKey]) &&
    typeof governed[field][valueKey] === 'number' &&
    Number.isFinite(governed[field][valueKey])
  );
}

export function compareArms(baseline, governed) {
  requirePlainObject(baseline, 'baseline');
  requirePlainObject(governed, 'governed');
  requireBoolean(baseline.deliveryPass, 'baseline.deliveryPass');
  requireBoolean(governed.deliveryPass, 'governed.deliveryPass');
  requireNonNegativeNumber(baseline.deliveryScore, 'baseline.deliveryScore');
  requireNonNegativeNumber(governed.deliveryScore, 'governed.deliveryScore');
  requireNonNegativeInteger(baseline.repairRounds, 'baseline.repairRounds');
  requireNonNegativeInteger(governed.repairRounds, 'governed.repairRounds');

  const scoreDelta = governed.deliveryScore - baseline.deliveryScore;
  let winner = 'tie';
  let reason = 'tie';
  if (baseline.deliveryPass !== governed.deliveryPass) {
    winner = baseline.deliveryPass ? 'baseline' : 'governed';
    reason = 'delivery-pass';
  } else if (Math.abs(scoreDelta) >= 1) {
    winner = scoreDelta > 0 ? 'governed' : 'baseline';
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

export function scoreRun(run) {
  requirePlainObject(run, 'run');
  if (run.schemaVersion !== 1) failEvidence('run.schemaVersion');
  if (typeof run.runId !== 'string' || run.runId.length === 0) failEvidence('run.runId');
  requireNonNegativeInteger(run.seed, 'run.seed');
  requirePlainObject(run.arms, 'run.arms');

  const baseline = scoreArm(run.arms.baseline);
  const governed = scoreArm(run.arms.governed);
  return {
    schemaVersion: 1,
    runId: run.runId,
    seed: run.seed,
    arms: { baseline, governed },
    comparison: compareArms(baseline, governed),
  };
}

function hasScoredArms(result) {
  return (
    isPlainObject(result?.arms?.baseline) &&
    typeof result.arms.baseline.deliveryScore === 'number' &&
    isPlainObject(result?.arms?.governed) &&
    typeof result.arms.governed.deliveryScore === 'number'
  );
}

function pairMatches(result) {
  const baseline = result?.arms?.baseline;
  const governed = result?.arms?.governed;
  return PAIR_FIELDS.every(
    (field) =>
      baseline?.[field] !== undefined &&
      governed?.[field] !== undefined &&
      baseline[field] === governed[field],
  );
}

function seedToUint32(seed) {
  if (Number.isSafeInteger(seed) && seed >= 0) return seed >>> 0;
  if (typeof seed === 'string' && seed.length > 0) {
    return Number.parseInt(createHash('sha256').update(seed).digest('hex').slice(0, 8), 16) >>> 0;
  }
  throw new TypeError('Aggregate seed must be a non-negative integer or non-empty string');
}

function seededRandom(seed) {
  let state = seedToUint32(seed);
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

function summarizeMetric(values, random) {
  if (values.length === 0) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (values.length === 1) {
    return {
      n: 1,
      mean: rounded(mean),
      confidence95: { lower: rounded(mean), upper: rounded(mean) },
    };
  }

  const bootstrapMeans = [];
  for (let iteration = 0; iteration < BOOTSTRAP_ITERATIONS; iteration += 1) {
    let sum = 0;
    for (let sample = 0; sample < values.length; sample += 1) {
      sum += values[Math.floor(random() * values.length)];
    }
    bootstrapMeans.push(sum / values.length);
  }
  bootstrapMeans.sort((left, right) => left - right);
  const lower = bootstrapMeans[Math.floor((bootstrapMeans.length - 1) * 0.025)];
  const upper = bootstrapMeans[Math.floor((bootstrapMeans.length - 1) * 0.975)];
  return {
    n: values.length,
    mean: rounded(mean),
    confidence95: { lower: rounded(lower), upper: rounded(upper) },
  };
}

export function aggregateResults(results, seed) {
  requireArray(results, 'results');
  const random = seededRandom(seed);
  const scored = results.map((result) => (hasScoredArms(result) ? result : scoreRun(result)));
  const seenRunIds = new Set();
  const comparable = scored.filter((result) => {
    if (!pairMatches(result) || typeof result.runId !== 'string' || seenRunIds.has(result.runId)) {
      return false;
    }
    seenRunIds.add(result.runId);
    return true;
  });
  const totalPairs = scored.length;
  const comparablePairs = comparable.length;

  const scenarioRepetitions = new Map();
  for (const result of comparable) {
    const scenarioHash = result.arms.baseline.scenarioHash;
    scenarioRepetitions.set(scenarioHash, (scenarioRepetitions.get(scenarioHash) ?? 0) + 1);
  }

  const deliveryPassDeltas = comparable.map((result) => result.comparison.deliveryPassDelta);
  const deliveryScoreDeltas = comparable.map((result) => result.comparison.scoreDelta);
  const repairRoundDeltas = comparable.map((result) => result.comparison.repairRoundsDelta);
  const timeDeltas = comparable
    .filter((result) => result.comparison.comparableFields.includes('time'))
    .map((result) => result.comparison.timeDeltaMs);
  const tokenDeltas = comparable
    .filter((result) => result.comparison.comparableFields.includes('tokens'))
    .map((result) => result.comparison.tokenDelta);

  const regressionCount = (governedPath, baselinePath) =>
    comparable.filter((result) => governedPath(result) > baselinePath(result)).length;

  return {
    pairing: {
      totalPairs,
      comparablePairs,
      rejectedPairs: totalPairs - comparablePairs,
      completeness: totalPairs === 0 ? 0 : comparablePairs / totalPairs,
    },
    scenarios: {
      count: scenarioRepetitions.size,
      minimumCompleteRepetitions:
        scenarioRepetitions.size === 0 ? 0 : Math.min(...scenarioRepetitions.values()),
    },
    metrics: {
      deliveryPassDelta: summarizeMetric(deliveryPassDeltas, random),
      deliveryScoreDelta: summarizeMetric(deliveryScoreDeltas, random),
      repairRoundsDelta: summarizeMetric(repairRoundDeltas, random),
      time: summarizeMetric(timeDeltas, random),
      tokens: summarizeMetric(tokenDeltas, random),
    },
    coverage: {
      time: comparablePairs === 0 ? 0 : timeDeltas.length / comparablePairs,
      tokens: comparablePairs === 0 ? 0 : tokenDeltas.length / comparablePairs,
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
  };
}

const DEFAULT_GATE_POLICY = Object.freeze({
  claim: 'improves',
  minScenarios: 5,
  minCompleteRepetitions: 3,
  minPairCompleteness: 0.9,
  confidenceLevel: 0.95,
  confidenceMetric: 'deliveryPassDelta',
  minConfidenceLowerBound: 0,
  minTelemetryCoverage: 0.8,
  telemetryClaims: [],
});

export function evaluateGate(report, policy = {}) {
  requirePlainObject(report, 'report');
  requirePlainObject(policy, 'policy');
  const effective = { ...DEFAULT_GATE_POLICY, ...policy };
  if (!['observed', 'improves'].includes(effective.claim)) failEvidence('policy.claim');
  if (!Array.isArray(effective.telemetryClaims)) failEvidence('policy.telemetryClaims');
  const thresholdKeys = [
    'minScenarios',
    'minCompleteRepetitions',
    'minPairCompleteness',
    'confidenceLevel',
    'minConfidenceLowerBound',
    'minTelemetryCoverage',
  ];
  for (const key of thresholdKeys) {
    if (typeof effective[key] !== 'number' || !Number.isFinite(effective[key])) {
      failEvidence(`policy.${key}`);
    }
  }
  if (effective.claim === 'improves') {
    for (const key of thresholdKeys) {
      effective[key] = Math.max(effective[key], DEFAULT_GATE_POLICY[key]);
    }
  }

  const failures = [];
  if (
    typeof report.scenarios?.count !== 'number' ||
    report.scenarios.count < effective.minScenarios
  ) {
    failures.push('MIN_SCENARIOS');
  }
  if (
    typeof report.scenarios?.minimumCompleteRepetitions !== 'number' ||
    report.scenarios.minimumCompleteRepetitions < effective.minCompleteRepetitions
  ) {
    failures.push('MIN_COMPLETE_REPETITIONS');
  }
  if (
    typeof report.pairing?.completeness !== 'number' ||
    report.pairing.completeness < effective.minPairCompleteness
  ) {
    failures.push('PAIR_COMPLETENESS');
  }

  const deliveryPassMean = report.metrics?.deliveryPassDelta?.mean;
  if (typeof deliveryPassMean !== 'number' || deliveryPassMean < 0) {
    failures.push('DELIVERY_PASS_DELTA');
  }

  if (effective.claim === 'improves') {
    const metric = report.metrics?.[effective.confidenceMetric];
    const confidenceKey = `confidence${Math.round(effective.confidenceLevel * 100)}`;
    const lower = metric?.[confidenceKey]?.lower;
    if (typeof lower !== 'number') {
      failures.push('CONFIDENCE_UNAVAILABLE');
    } else if (lower <= effective.minConfidenceLowerBound) {
      failures.push('CONFIDENCE_LOWER_BOUND');
    }
  }

  const regressionKeys = ['criticalScope', 'criticalProhibition', 'privacy', 'criticalDocument'];
  const regressionValues = regressionKeys.map((key) => report.regressions?.[key]);
  if (regressionValues.some((value) => typeof value !== 'number')) {
    failures.push('CRITICAL_REGRESSION_EVIDENCE');
  } else if (regressionValues.some((value) => value > 0)) {
    failures.push('CRITICAL_REGRESSION');
  }

  for (const metric of effective.telemetryClaims) {
    if (!['time', 'tokens'].includes(metric)) failEvidence('policy.telemetryClaims');
    if (
      typeof report.coverage?.[metric] !== 'number' ||
      report.coverage[metric] < effective.minTelemetryCoverage
    ) {
      failures.push(`TELEMETRY_COVERAGE_${metric.toUpperCase()}`);
    }
  }

  return {
    pass: failures.length === 0,
    claim: effective.claim,
    failures,
  };
}
