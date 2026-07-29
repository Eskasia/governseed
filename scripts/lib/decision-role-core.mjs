const HASH = /^[a-f0-9]{64}$/u;
const DECISION_ID = /^DEC-(\d{3,})$/u;
const TASK_ID = /^TASK-(\d{3,})$/u;
const EFFECT_ORDER = new Map([
  ['deny', 0],
  ['require-human-approval', 1],
  ['constrained-allow', 2],
  ['allow', 3],
  ['advisory', 4],
]);

export const BUILTIN_CATALOG = Object.freeze({
  catalogId: 'builtin-governance-responsibilities',
  revision: 'builtin@1',
  license: 'MIT',
  sourceHash: 'eaf69549e7163f4cde40fb267c8afea30eda9941950562b5136e05a9eb95fe1a',
});

const TRIGGER_REASON_BY_FLAG = Object.freeze({
  userRequestedFourAi: 'USER_REQUESTED_FOUR_AI',
  consequential: 'CONSEQUENTIAL_OR_IRREVERSIBLE',
  irreversible: 'CONSEQUENTIAL_OR_IRREVERSIBLE',
  multipleReasonableOptions: 'MULTIPLE_REASONABLE_OPTIONS',
  evidenceConflict: 'EVIDENCE_CONFLICT',
  restrictedAuthoritySurface: 'RESTRICTED_AUTHORITY_SURFACE',
  threeOrMoreDomains: 'THREE_OR_MORE_DOMAINS',
  canonicalRuleConflict: 'CANONICAL_RULE_CONFLICT',
  highRepairCost: 'HIGH_REPAIR_COST',
});
const DELIBERATION_TRIGGER_REASONS = new Set(
  Object.values(TRIGGER_REASON_BY_FLAG),
);

const REQUIRED_TASK_ARRAYS = Object.freeze([
  'dataClasses',
  'surfaces',
  'sideEffects',
  'requestedCapabilities',
  'requiredEvidence',
]);
const RESPONSIBILITIES = Object.freeze([
  'decision-owner',
  'implementation-owner',
  'domain-reviewer',
  'risk-reviewer',
  'evidence-verifier',
]);
const RESPONSIBILITY_SET = new Set(RESPONSIBILITIES);

function unique(values) {
  return [...new Set(values)];
}

function sortedUnique(values) {
  return unique(values).sort((left, right) => left.localeCompare(right));
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value;
}

function sameCanonicalValue(left, right) {
  return JSON.stringify(canonicalValue(left))
    === JSON.stringify(canonicalValue(right));
}

function includesAny(values, expected) {
  return values.some((value) => expected.has(value));
}

function hasUnknown(values) {
  return !Array.isArray(values)
    || values.length === 0
    || values.some((value) => value === 'unknown');
}

function taskUnknowns(task) {
  const openQuestions = [];
  for (const field of REQUIRED_TASK_ARRAYS) {
    if (hasUnknown(task?.[field])) {
      openQuestions.push({
        questionId: `OPEN_LOOP-${String(openQuestions.length + 1).padStart(3, '0')}`,
        taskId: task?.taskId ?? 'TASK-UNKNOWN',
        field,
        question: `Declare ${field} for the task before risk classification.`,
      });
    }
  }
  if (!task?.triggerFlags || typeof task.triggerFlags !== 'object') {
    openQuestions.push({
      questionId: `OPEN_LOOP-${String(openQuestions.length + 1).padStart(3, '0')}`,
      taskId: task?.taskId ?? 'TASK-UNKNOWN',
      field: 'triggerFlags',
      question: 'Declare all deliberation trigger flags before risk classification.',
    });
  }
  return openQuestions;
}

export function deriveDeliberationReasons(task) {
  const reasons = [];
  for (const [flag, reason] of Object.entries(TRIGGER_REASON_BY_FLAG)) {
    if (task?.triggerFlags?.[flag] === true) reasons.push(reason);
  }
  if (includesAny(task?.dataClasses ?? [], new Set(['restricted']))) {
    reasons.push('RESTRICTED_AUTHORITY_SURFACE');
  }
  if (includesAny(
    task?.surfaces ?? [],
    new Set(['credential', 'network', 'publish', 'release', 'delete']),
  )) {
    reasons.push('RESTRICTED_AUTHORITY_SURFACE');
  }
  if (includesAny(task?.sideEffects ?? [], new Set(['network', 'publish', 'delete']))) {
    reasons.push('RESTRICTED_AUTHORITY_SURFACE');
  }
  return unique(reasons);
}

export function assessTaskRisk(task) {
  const openQuestions = taskUnknowns(task);
  if (openQuestions.length > 0) {
    return {
      status: 'needs-input',
      riskLevel: 'unknown',
      needsDeliberation: false,
      reasonCodes: ['RISK_INPUT_MISSING'],
      openQuestions,
    };
  }

  const reasonCodes = [];
  const data = new Set(task.dataClasses);
  const surfaces = new Set(task.surfaces);
  const effects = new Set(task.sideEffects);
  const capabilities = new Set(task.requestedCapabilities);
  const flags = task.triggerFlags;

  if (data.has('restricted')) reasonCodes.push('RISK_RESTRICTED_DATA');
  if (surfaces.has('credential') || capabilities.has('credentials')) {
    reasonCodes.push('RISK_CREDENTIAL_ACCESS');
  }
  if (
    surfaces.has('network')
    || effects.has('network')
    || capabilities.has('network')
  ) {
    reasonCodes.push('RISK_NETWORK_ACCESS');
  }
  if (
    surfaces.has('publish')
    || surfaces.has('release')
    || effects.has('publish')
    || capabilities.has('publish')
  ) {
    reasonCodes.push('RISK_PUBLISH_SIDE_EFFECT');
  }
  if (
    surfaces.has('delete')
    || effects.has('delete')
    || capabilities.has('delete')
  ) {
    reasonCodes.push('RISK_DELETE_SIDE_EFFECT');
  }
  if (flags.consequential || flags.irreversible) {
    reasonCodes.push('RISK_CONSEQUENTIAL_DECISION');
  }
  if (flags.highRepairCost) reasonCodes.push('RISK_HIGH_REPAIR_COST');

  const highRisk = reasonCodes.length > 0
    || flags.restrictedAuthoritySurface === true;
  const mediumRisk = includesAny(
    [...surfaces],
    new Set([
      'accessibility',
      'migration',
      'schema',
      'security',
      'source-code',
      'ui',
    ]),
  ) || flags.threeOrMoreDomains === true;
  const riskLevel = highRisk ? 'high' : mediumRisk ? 'medium' : 'low';

  if (riskLevel === 'low') reasonCodes.push('RISK_LOW_DOCS_ONLY');
  if (riskLevel === 'medium') reasonCodes.push('RISK_DOMAIN_REVIEW');

  const deliberationReasons = deriveDeliberationReasons(task);
  return {
    status: 'assessed',
    riskLevel,
    needsDeliberation: deliberationReasons.length > 0,
    reasonCodes: unique([
      ...reasonCodes,
      ...(deliberationReasons.length > 0
        ? deliberationReasons
        : ['DELIBERATION_NOT_REQUIRED']),
    ]),
    openQuestions: [],
  };
}

export function assessRiskProfile(profile, taskId = null) {
  const selected = taskId
    ? profile.tasks.filter((task) => task.taskId === taskId)
    : profile.tasks;
  if (selected.length === 0) {
    return {
      ok: false,
      code: 'TASK_REFERENCE_MISSING',
      status: 'blocked',
      profile,
      result: null,
    };
  }

  const assessedById = new Map();
  const openQuestions = [];
  for (const task of selected) {
    const assessment = assessTaskRisk(task);
    assessedById.set(task.taskId, assessment);
    openQuestions.push(...assessment.openQuestions);
  }
  if (openQuestions.length > 0) {
    const assessment = assessedById.get(selected[0].taskId);
    return {
      ok: false,
      code: 'RISK_INPUT_MISSING',
      status: 'needs-input',
      profile: {
        ...profile,
        status: 'needs-input',
        openQuestions,
      },
      result: {
        taskId: selected[0].taskId,
        riskLevel: assessment.riskLevel,
        needsDeliberation: assessment.needsDeliberation,
        reasonCodes: assessment.reasonCodes,
        openQuestions,
      },
    };
  }

  const tasks = profile.tasks.map((task) => {
    const assessment = assessedById.get(task.taskId);
    if (!assessment) return task;
    return {
      ...task,
      riskLevel: assessment.riskLevel,
      needsDeliberation: assessment.needsDeliberation,
      reasonCodes: assessment.reasonCodes,
    };
  });
  return {
    ok: true,
    code: 'OK',
    status: 'assessed',
    profile: {
      ...profile,
      status: 'assessed',
      tasks,
      openQuestions: [],
    },
    result: tasks.find((task) => task.taskId === selected[0].taskId),
  };
}

export function validateDecisionRecord(decision, expectedId = null) {
  const allowed = new Set([
    'schemaVersion',
    'decisionId',
    'revision',
    'status',
    'topic',
    'normalizedBrief',
    'sourceRefs',
    'requirementRefs',
    'riskRefs',
    'triggerReasonCodes',
    'options',
    'needsDeliberation',
    'humanApprovalRequired',
    'createdAt',
    'supersedes',
  ]);
  const errors = [];
  if (!decision || typeof decision !== 'object' || Array.isArray(decision)) {
    return [{ code: 'DECISION_RECORD_INVALID', subject: 'decision-record' }];
  }
  if (Object.keys(decision).some((key) => !allowed.has(key))) {
    errors.push({ code: 'DECISION_RECORD_INVALID', subject: decision.decisionId });
  }
  if (decision.schemaVersion !== 1) {
    errors.push({ code: 'SCHEMA_VERSION_UNSUPPORTED', subject: decision.decisionId });
  }
  if (!DECISION_ID.test(decision.decisionId ?? '')) {
    errors.push({ code: 'DECISION_RECORD_INVALID', subject: 'decision-record' });
  }
  if (expectedId && decision.decisionId !== expectedId) {
    errors.push({ code: 'DECISION_REFERENCE_MISSING', subject: expectedId });
  }
  if (!Number.isInteger(decision.revision) || decision.revision < 1) {
    errors.push({ code: 'DECISION_RECORD_INVALID', subject: decision.decisionId });
  }
  if (!['proposed', 'active', 'rejected', 'superseded'].includes(decision.status)) {
    errors.push({ code: 'INVALID_STATUS_TRANSITION', subject: decision.decisionId });
  }
  for (const field of ['sourceRefs', 'requirementRefs', 'riskRefs', 'triggerReasonCodes']) {
    if (!Array.isArray(decision[field])
      || new Set(decision[field]).size !== decision[field].length) {
      errors.push({ code: 'DUPLICATE_ID', subject: decision.decisionId });
    }
  }
  if (!Array.isArray(decision.options) || decision.options.length === 0) {
    errors.push({ code: 'DECISION_RECORD_INVALID', subject: decision.decisionId });
  } else {
    const optionIds = decision.options.map((option) => option?.optionId);
    if (new Set(optionIds).size !== optionIds.length) {
      errors.push({ code: 'DUPLICATE_ID', subject: decision.decisionId });
    }
    if (decision.options.some((option) => (
      !option
      || typeof option !== 'object'
      || Array.isArray(option)
      || Object.keys(option).some((key) => !['optionId', 'summary'].includes(key))
      || typeof option.optionId !== 'string'
      || option.optionId.length === 0
      || typeof option.summary !== 'string'
      || option.summary.length === 0
    ))) {
      errors.push({ code: 'DECISION_RECORD_INVALID', subject: decision.decisionId });
    }
  }
  if (
    decision.triggerReasonCodes?.includes('MULTIPLE_REASONABLE_OPTIONS')
    && decision.options?.length < 2
  ) {
    errors.push({ code: 'DECISION_RECORD_INVALID', subject: decision.decisionId });
  }
  const hasDeliberationTrigger = decision.triggerReasonCodes?.some(
    (reason) => DELIBERATION_TRIGGER_REASONS.has(reason),
  );
  if (
    typeof decision.needsDeliberation !== 'boolean'
    || decision.needsDeliberation !== Boolean(hasDeliberationTrigger)
    || typeof decision.humanApprovalRequired !== 'boolean'
    || (decision.needsDeliberation && !decision.humanApprovalRequired)
  ) {
    errors.push({ code: 'DECISION_RECORD_INVALID', subject: decision.decisionId });
  }
  return errors;
}

function deliberationIdFor(decisionId) {
  const match = String(decisionId).match(DECISION_ID);
  return `DLB-${match?.[1] ?? '000'}`;
}

export function buildDeliberationPlan(decision, { sha256Canonical }) {
  const deliberationId = deliberationIdFor(decision.decisionId);
  const decisionSha256 = sha256Canonical(decision);
  const seatDefinitions = [
    ['01', 'explorer', 'Generate independent feasible options.'],
    ['02', 'constraint-analyst', 'Test options against explicit constraints.'],
    ['03', 'adversarial-reviewer', 'Find verifiable failure modes.'],
    ['04', 'synthesizer', 'Bound consensus, disagreement, and recommendation.'],
  ];
  const seats = seatDefinitions.map(([number, seatFunction, purpose]) => ({
    seatId: `${deliberationId}-SEAT-${number}`,
    function: seatFunction,
    purpose,
  }));
  const allSeatIds = seats.map((seat) => seat.seatId);
  const planWithoutHash = {
    schemaVersion: 1,
    deliberationId,
    decisionId: decision.decisionId,
    decisionRevision: decision.revision,
    decisionSha256,
    planRevision: 1,
    sourceRevision: `${decision.decisionId}@${decision.revision}`,
    topic: decision.topic,
    normalizedBrief: decision.normalizedBrief,
    sourceRefs: decision.sourceRefs,
    riskRefs: decision.riskRefs,
    triggerReasonCodes: decision.triggerReasonCodes,
    needsDeliberation: decision.needsDeliberation,
    profile: 'four-seat-default',
    graphId: 'four-ai-deliberation',
    graphVersion: '1.0.0',
    seats,
    rounds: [
      {
        round: 1,
        kind: 'independent-proposal',
        participants: allSeatIds,
        requiredFields: ['assumptions', 'evidence', 'risks', 'unknowns'],
      },
      {
        round: 2,
        kind: 'cross-critique',
        participants: allSeatIds,
        requiredFields: ['targetSeatId', 'verifiableIssues'],
      },
      {
        round: 3,
        kind: 'option-ranking',
        participants: allSeatIds,
        requiredFields: ['rankedOptions', 'rubricScores'],
      },
      {
        round: 4,
        kind: 'synthesis',
        participants: [`${deliberationId}-SEAT-04`],
        requiredFields: [
          'consensus',
          'disagreements',
          'rejectedOptions',
          'missingEvidence',
          'recommendation',
          'uncertainty',
          'humanDecisions',
        ],
      },
    ],
    maxTurns: 16,
    terminationConditions: [
      'four-rounds-complete',
      'max-turns-reached',
      'adapter-failed',
    ],
    evaluationRubric: [
      'requirement-fit',
      'feasibility',
      'safety',
      'reversibility',
      'maintenance-cost',
      'evidence-strength',
    ],
    redactionTier: 'metadata-only',
    requiredOutput: [
      'consensus',
      'disagreements',
      'rejected-options',
      'missing-evidence',
      'recommendation',
      'uncertainty',
      'human-decisions',
    ],
    preflight: {
      decisionRecordValid: true,
      sourceRefsResolved: true,
      riskRefsResolved: true,
      redactionTierAllowed: true,
    },
    expectedReceipts: {
      before: [
        'decisionSha256',
        'planSha256',
        'graphId',
        'graphVersion',
        'sourceRevision',
      ],
      after: [
        'normalizedResultSha256',
        'graphId',
        'graphVersion',
        'sourceRevision',
      ],
    },
    humanApprovalRequired: true,
    status: 'planned',
  };
  return {
    ...planWithoutHash,
    planSha256: sha256Canonical(planWithoutHash),
  };
}

export function validateDeliberationImport(result, decision, plan) {
  if (
    result?.importStatus === 'human-confirmed'
    || Object.hasOwn(result ?? {}, 'humanConfirmation')
    || Object.hasOwn(result ?? {}, 'confirmation')
  ) {
    return 'DELIBERATION_IMPORT_APPROVAL_BLOCKED';
  }
  if (result?.decisionId !== decision.decisionId) {
    return 'DECISION_REFERENCE_MISSING';
  }
  if (
    result.deliberationId !== plan.deliberationId
    || plan.decisionId !== decision.decisionId
  ) {
    return 'DECISION_REFERENCE_MISSING';
  }
  if (
    result.graphId !== plan.graphId
    || result.graphVersion !== plan.graphVersion
  ) {
    return 'DELIBERATION_VERSION_MISMATCH';
  }
  if (result.sourceRevision !== plan.sourceRevision) {
    return 'DELIBERATION_SOURCE_MISMATCH';
  }
  if (
    result.decisionRevision !== decision.revision
    || result.decisionSha256 !== plan.decisionSha256
  ) {
    return 'DELIBERATION_DECISION_HASH_MISMATCH';
  }
  if (
    result.planRevision !== plan.planRevision
    || result.planSha256 !== plan.planSha256
  ) {
    return 'DELIBERATION_PLAN_HASH_MISMATCH';
  }
  if (result.importStatus !== 'imported') {
    return 'INVALID_STATUS_TRANSITION';
  }
  return null;
}

export function normalizeImportedResult(result, { sha256Canonical }) {
  const normalized = structuredClone(result);
  delete normalized.resultSha256;
  normalized.importStatus = 'imported';
  return {
    ...normalized,
    resultSha256: sha256Canonical(normalized),
  };
}

export function validateHumanConfirmation(record, {
  decision,
  plan,
  result,
}) {
  const allowed = new Set([
    'schemaVersion',
    'confirmationId',
    'recordType',
    'deliberationId',
    'decisionId',
    'decisionRevision',
    'decisionSha256',
    'planSha256',
    'resultSha256',
    'decision',
    'confirmedBy',
    'confirmedAt',
    'statement',
    'status',
  ]);
  if (
    !record
    || typeof record !== 'object'
    || Array.isArray(record)
    || Object.keys(record).some((key) => !allowed.has(key))
  ) {
    return 'DELIBERATION_CONFIRMATION_INVALID';
  }
  if (
    record.schemaVersion !== 1
    || record.recordType !== 'declared-human-confirmation'
    || record.status !== 'human-confirmed'
    || !['accept', 'reject'].includes(record.decision)
    || typeof record.confirmationId !== 'string'
    || record.confirmationId.length === 0
    || typeof record.confirmedBy !== 'string'
    || record.confirmedBy.length === 0
    || typeof record.confirmedAt !== 'string'
    || !Number.isFinite(Date.parse(record.confirmedAt))
    || typeof record.statement !== 'string'
    || record.statement.length === 0
    || !['imported', 'human-confirmed'].includes(result.importStatus)
  ) {
    return 'DELIBERATION_CONFIRMATION_INVALID';
  }
  if (
    record.decisionId !== decision.decisionId
    || record.deliberationId !== plan.deliberationId
    || record.decisionRevision !== decision.revision
    || record.decisionSha256 !== plan.decisionSha256
    || record.planSha256 !== plan.planSha256
    || record.resultSha256 !== result.resultSha256
  ) {
    return 'DELIBERATION_CONFIRMATION_HASH_MISMATCH';
  }
  return null;
}

export function catalogPrivilegeExpansion(catalog, permissionCeiling) {
  for (const role of catalog?.roles ?? []) {
    for (const requested of role.requestedCapabilities ?? []) {
      const effect = permissionCeiling[requested];
      if (effect === undefined || effect === 'deny') {
        return {
          code: 'ROLE_PRIVILEGE_EXPANSION',
          roleId: role.roleId,
          capability: requested,
        };
      }
    }
  }
  return null;
}

function reviewCeiling(permissionCeiling) {
  return Object.fromEntries(Object.keys(permissionCeiling).map((capability) => [
    capability,
    capability === 'filesystem.project-read'
      ? permissionCeiling[capability]
      : 'deny',
  ]));
}

function requestedCeiling(permissionCeiling, requestedCapabilities) {
  const requested = new Set(requestedCapabilities);
  return Object.fromEntries(
    Object.keys(permissionCeiling).map((capability) => [
      capability,
      requested.has(capability) ? permissionCeiling[capability] : 'deny',
    ]),
  );
}

function roleReasonCodes(responsibility, task, assignmentReasons) {
  if (responsibility === 'decision-owner') {
    return ['ROLE_HUMAN_DECISION_OWNER'];
  }
  if (responsibility === 'implementation-owner') {
    return task.riskLevel === 'high'
      ? ['ROLE_MINIMUM_IMPLEMENTATION', 'ROLE_AUTHOR_CANNOT_APPROVE']
      : ['ROLE_MINIMUM_IMPLEMENTATION'];
  }
  if (responsibility === 'risk-reviewer') {
    const reasons = assignmentReasons.filter((code) => (
      code.includes('RISK')
      || code.includes('RESTRICTED')
      || code.includes('CREDENTIAL')
      || code.includes('SECURITY')
    ));
    return reasons.length > 0 ? reasons : ['ROLE_RESTRICTED_SURFACE_REVIEW'];
  }
  if (responsibility === 'evidence-verifier') {
    const reasons = assignmentReasons.filter((code) => (
      code.includes('EVIDENCE')
      || code.includes('PUBLISH')
      || code.includes('RELEASE')
    ));
    return reasons.length > 0 ? reasons : ['ROLE_EVIDENCE_REQUIRED'];
  }
  const reasons = assignmentReasons.filter((code) => (
    code.includes('UI_')
    || code.includes('SCHEMA_')
    || code.includes('SECURITY')
    || code.includes('DOMAIN_')
  ));
  return reasons.length > 0 ? reasons : ['ROLE_DOMAIN_REVIEW'];
}

function expectedDeliverables(responsibility) {
  return {
    'decision-owner': ['Declared project decision'],
    'implementation-owner': ['Bounded task implementation'],
    'domain-reviewer': ['Domain review findings'],
    'risk-reviewer': ['Risk and authority review findings'],
    'evidence-verifier': ['Acceptance evidence verification'],
  }[responsibility];
}

function reviewResponsibility(responsibility) {
  return {
    'decision-owner': ['decision'],
    'implementation-owner': [],
    'domain-reviewer': ['domain'],
    'risk-reviewer': ['security', 'privacy', 'authority'],
    'evidence-verifier': ['final-evidence'],
  }[responsibility];
}

function selectResponsibilities(task) {
  const responsibilities = ['implementation-owner'];
  const reasons = [];
  const surfaces = new Set(task.surfaces ?? []);
  if (task.riskLevel === 'high') {
    responsibilities.push('risk-reviewer', 'evidence-verifier');
    reasons.push('ROLE_HIGH_RISK_REVIEW');
  }
  if (surfaces.has('credential')) reasons.push('ROLE_CREDENTIAL_REVIEW');
  if ((task.dataClasses ?? []).includes('restricted')) {
    reasons.push('ROLE_RESTRICTED_DATA_REVIEW');
  }
  if (
    surfaces.has('publish')
    || surfaces.has('release')
    || (task.sideEffects ?? []).includes('publish')
  ) {
    reasons.push('ROLE_PUBLISH_EVIDENCE_REVIEW');
    if (!responsibilities.includes('risk-reviewer')) {
      responsibilities.push('risk-reviewer');
    }
    if (!responsibilities.includes('evidence-verifier')) {
      responsibilities.push('evidence-verifier');
    }
  }
  if (surfaces.has('ui') || surfaces.has('accessibility')) {
    responsibilities.push('domain-reviewer');
    reasons.push('ROLE_UI_ACCESSIBILITY_REVIEW');
  }
  if (surfaces.has('schema') || surfaces.has('migration')) {
    responsibilities.push('domain-reviewer');
    reasons.push('ROLE_SCHEMA_COMPATIBILITY_REVIEW');
  }
  if (surfaces.has('security')) {
    responsibilities.push('risk-reviewer');
    reasons.push('ROLE_SECURITY_REVIEW', 'ROLE_AUTHOR_CANNOT_APPROVE');
  }
  if (
    task.riskLevel === 'medium'
    && !responsibilities.some((responsibility) => (
      responsibility === 'domain-reviewer'
      || responsibility === 'risk-reviewer'
      || responsibility === 'evidence-verifier'
    ))
  ) {
    responsibilities.push('domain-reviewer');
  }
  if (task.riskLevel === 'low') reasons.push('ROLE_LOW_RISK_SINGLE_OWNER');
  if (task.riskLevel === 'medium') reasons.push('ROLE_DOMAIN_REVIEW');
  return {
    responsibilities: unique(responsibilities).slice(0, 4),
    reasonCodes: unique(reasons),
  };
}

function matchingSpecialist(catalog, responsibility, task) {
  if (!catalog) return { role: null, ambiguous: false };
  const surfaces = new Set(task.surfaces ?? []);
  const matches = (catalog.roles ?? []).filter((role) => (
    role.supportedResponsibilities?.includes(responsibility)
    && (role.supportedSurfaces ?? []).some((surface) => surfaces.has(surface))
  ));
  return {
    role: matches.length === 1 ? matches[0] : null,
    ambiguous: matches.length > 1,
  };
}

function selectedRole({
  responsibility,
  task,
  permissionCeiling,
  reasonCodes,
  catalog,
  catalogPath,
}) {
  const specialist = matchingSpecialist(catalog, responsibility, task);
  if (specialist.ambiguous) return { ambiguous: true };
  const external = specialist.role;
  const requestedCapabilities = external?.requestedCapabilities
    ?? (responsibility === 'implementation-owner'
      ? task.requestedCapabilities
      : ['filesystem.project-read']);
  return {
    ambiguous: false,
    value: {
      responsibility,
      specialistRoleId: external?.roleId ?? `builtin/${responsibility}`,
      source: external ? 'external' : 'builtin',
      sourceCatalog: external
        ? catalogPath
        : BUILTIN_CATALOG.catalogId,
      sourceRevision: external
        ? catalog.source.revision
        : BUILTIN_CATALOG.revision,
      sourceLicense: external
        ? catalog.source.license
        : BUILTIN_CATALOG.license,
      sourceHash: external
        ? catalog.source.sha256
        : BUILTIN_CATALOG.sourceHash,
      assignedTaskScope: [task.taskId],
      requiredInputs: sortedUnique([
        task.taskId,
        ...(task.requiredEvidence ?? []),
      ]),
      expectedDeliverables: expectedDeliverables(responsibility),
      requestedCapabilities,
      grantedCapabilityCeiling: responsibility === 'implementation-owner'
        ? requestedCeiling(permissionCeiling, requestedCapabilities)
        : reviewCeiling(permissionCeiling),
      reviewResponsibility: reviewResponsibility(responsibility),
      cannotApprove: responsibility !== 'implementation-owner'
        || task.riskLevel === 'high',
      reasonCodes: unique(
        roleReasonCodes(responsibility, task, reasonCodes),
      ),
    },
  };
}

function separationOfDuties(selectedRoles, task) {
  const implementation = selectedRoles.find(
    (role) => role.responsibility === 'implementation-owner',
  );
  const finalReview = selectedRoles.find(
    (role) => role.responsibility === 'evidence-verifier',
  ) ?? selectedRoles.find(
    (role) => role.responsibility === 'domain-reviewer',
  ) ?? selectedRoles.find(
    (role) => role.responsibility === 'risk-reviewer',
  );
  const required = selectedRoles.length > 1 || task.riskLevel === 'high';
  const normalizedRoles = selectedRoles.map((role) => (
    role.responsibility === 'implementation-owner'
      ? { ...role, cannotApprove: required }
      : role
  ));
  return {
    selectedRoles: normalizedRoles,
    separation: {
      required,
      implementationOwner: implementation?.specialistRoleId ?? null,
      finalVerifier: finalReview?.specialistRoleId ?? null,
      rules: required
        ? [{
            responsibility: 'implementation-owner',
            cannotApprove: ['final-evidence', 'publish', 'security'],
          }]
        : [],
    },
  };
}

export function buildRoleAssignment(profile, taskId, {
  catalog = null,
  catalogPath = null,
  constraintReasonCodes = [],
  constraintRefs = [],
} = {}) {
  const sourceTask = profile.tasks.find((task) => task.taskId === taskId);
  if (!sourceTask) {
    return { ok: false, code: 'TASK_REFERENCE_MISSING', status: 'blocked' };
  }
  const assessment = assessTaskRisk(sourceTask);
  if (assessment.status === 'needs-input') {
    return {
      ok: false,
      code: 'RISK_INPUT_MISSING',
      status: 'needs-input',
      result: assessment,
    };
  }
  const task = {
    ...sourceTask,
    riskLevel: assessment.riskLevel,
    needsDeliberation: assessment.needsDeliberation,
    reasonCodes: assessment.reasonCodes,
  };
  const selection = selectResponsibilities(task);
  const assignmentReasonCodes = unique([
    ...selection.reasonCodes,
    ...constraintReasonCodes,
  ]);
  const selectedRoles = [];
  for (const responsibility of selection.responsibilities) {
    const selected = selectedRole({
      responsibility,
      task,
      permissionCeiling: profile.permissionCeiling,
      reasonCodes: assignmentReasonCodes,
      catalog,
      catalogPath,
    });
    if (selected.ambiguous) {
      return {
        ok: false,
        code: 'ROLE_NEEDS_HUMAN_SELECTION',
        status: 'needs-human-selection',
      };
    }
    selectedRoles.push(selected.value);
  }

  if (
    selectedRoles.some((role) => role.source === 'external')
    && typeof catalogPath !== 'string'
  ) {
    return { ok: false, code: 'ROLE_CATALOG_INVALID', status: 'blocked' };
  }

  const numericId = task.taskId.match(TASK_ID)?.[1] ?? '000';
  const separated = separationOfDuties(selectedRoles, task);
  const implementation = separated.selectedRoles.find(
    (role) => role.responsibility === 'implementation-owner',
  );
  const finalVerifier = separated.separation.finalVerifier;
  if (
    separated.separation.required
    && implementation?.specialistRoleId
    && implementation.specialistRoleId === finalVerifier
  ) {
    return {
      ok: false,
      code: 'ROLE_NEEDS_HUMAN_SELECTION',
      status: 'needs-human-selection',
    };
  }
  const assignment = {
    schemaVersion: 1,
    assignmentId: `ROLE-${numericId}`,
    taskId: task.taskId,
    revision: 1,
    status: 'assigned',
    sourceRefs: sortedUnique([
      ...profile.sourceRefs,
      task.taskId,
      ...constraintRefs,
    ]),
    riskRefs: [profile.profileId],
    selectedRoles: separated.selectedRoles,
    rejectedRoles: [],
    reasonCodes: assignmentReasonCodes,
    permissionCeiling: structuredClone(profile.permissionCeiling),
    separationOfDuties: separated.separation,
    humanOverride: null,
    createdAt: task.declaredAt,
    supersedes: null,
    history: [],
  };
  return { ok: true, code: 'OK', status: 'assigned', assignment };
}

export function applyRoleOverride(current, override, profile, task) {
  if (
    current.humanOverride
    && sameCanonicalValue(current.humanOverride, override)
  ) {
    return { ok: true, code: 'OK', status: current.status, assignment: current };
  }
  const allowedOverrideKeys = new Set([
    'schemaVersion',
    'overrideId',
    'assignmentId',
    'taskId',
    'baseRevision',
    'addResponsibilities',
    'removeResponsibilities',
    'reasonCodes',
    'confirmedBy',
    'confirmedAt',
  ]);
  if (
    !override
    || typeof override !== 'object'
    || Array.isArray(override)
    || Object.keys(override).some((key) => !allowedOverrideKeys.has(key))
    || override.schemaVersion !== 1
    || override.assignmentId !== current.assignmentId
    || override.taskId !== current.taskId
    || override.baseRevision !== current.revision
    || typeof override.overrideId !== 'string'
    || override.overrideId.length === 0
    || typeof override.confirmedBy !== 'string'
    || override.confirmedBy.length === 0
    || typeof override.confirmedAt !== 'string'
    || !Number.isFinite(Date.parse(override.confirmedAt))
    || !Array.isArray(override.addResponsibilities)
    || !Array.isArray(override.removeResponsibilities)
    || !Array.isArray(override.reasonCodes)
    || override.reasonCodes.length === 0
    || new Set(override.addResponsibilities).size
      !== override.addResponsibilities.length
    || new Set(override.removeResponsibilities).size
      !== override.removeResponsibilities.length
    || new Set(override.reasonCodes).size !== override.reasonCodes.length
    || override.addResponsibilities.some(
      (responsibility) => !RESPONSIBILITY_SET.has(responsibility),
    )
    || override.removeResponsibilities.some(
      (responsibility) => !RESPONSIBILITY_SET.has(responsibility),
    )
    || override.addResponsibilities.some(
      (responsibility) => override.removeResponsibilities.includes(responsibility),
    )
  ) {
    return {
      ok: false,
      code: 'INVALID_STATUS_TRANSITION',
      status: 'blocked',
    };
  }

  const baseline = buildRoleAssignment(profile, task.taskId);
  if (!baseline.ok) return baseline;
  const required = new Set(
    baseline.assignment.selectedRoles.map((role) => role.responsibility),
  );
  for (const removed of override.removeResponsibilities ?? []) {
    if (required.has(removed)) {
      return {
        ok: false,
        code: 'ROLE_SEPARATION_VIOLATION',
        status: 'blocked',
      };
    }
  }

  const responsibilitySet = new Set(
    current.selectedRoles.map((role) => role.responsibility),
  );
  for (const removed of override.removeResponsibilities ?? []) {
    responsibilitySet.delete(removed);
  }
  for (const added of override.addResponsibilities ?? []) {
    responsibilitySet.add(added);
  }
  if (responsibilitySet.size > 4) {
    return {
      ok: false,
      code: 'ROLE_NEEDS_HUMAN_SELECTION',
      status: 'needs-human-selection',
    };
  }

  const base = baseline;
  const byResponsibility = new Map([
    ...current.selectedRoles,
    ...base.assignment.selectedRoles,
  ].map((role) => [role.responsibility, role]));
  for (const responsibility of responsibilitySet) {
    if (!byResponsibility.has(responsibility)) {
      const generated = selectedRole({
        responsibility,
        task,
        permissionCeiling: profile.permissionCeiling,
        reasonCodes: override.reasonCodes ?? [],
        catalog: null,
        catalogPath: null,
      });
      byResponsibility.set(responsibility, generated.value);
    }
  }
  const order = [
    'implementation-owner',
    'risk-reviewer',
    'evidence-verifier',
    'domain-reviewer',
    'decision-owner',
  ];
  const selectedRoles = order
    .filter((responsibility) => responsibilitySet.has(responsibility))
    .map((responsibility) => byResponsibility.get(responsibility));
  const separated = separationOfDuties(selectedRoles, task);
  const implementation = separated.selectedRoles.find(
    (role) => role.responsibility === 'implementation-owner',
  );
  if (
    separated.separation.required
    && implementation?.specialistRoleId
      === separated.separation.finalVerifier
  ) {
    return {
      ok: false,
      code: 'ROLE_SEPARATION_VIOLATION',
      status: 'blocked',
    };
  }

  const historyEntry = {
    assignmentId: current.assignmentId,
    taskId: current.taskId,
    revision: current.revision,
    status: current.status,
    selectedResponsibilities: current.selectedRoles.map(
      (role) => role.responsibility,
    ),
    permissionCeiling: structuredClone(current.permissionCeiling),
    createdAt: current.createdAt,
    supersedes: current.supersedes,
  };
  return {
    ok: true,
    code: 'OK',
    status: 'assigned',
    assignment: {
      ...current,
      revision: current.revision + 1,
      selectedRoles: separated.selectedRoles,
      separationOfDuties: separated.separation,
      reasonCodes: unique([
        ...current.reasonCodes,
        ...(override.reasonCodes ?? []),
      ]),
      humanOverride: structuredClone(override),
      supersedes: `${current.assignmentId}@${current.revision}`,
      createdAt: override.confirmedAt,
      history: [...current.history, historyEntry],
    },
  };
}

export function mostRestrictiveEffect(effects) {
  return [...effects].sort((left, right) => (
    (EFFECT_ORDER.get(left) ?? -1) - (EFFECT_ORDER.get(right) ?? -1)
  ))[0];
}

export function applyPackConstraints(permissionCeiling, packs, taskId) {
  const effective = structuredClone(permissionCeiling);
  const constraintRefs = [];
  let applied = false;
  for (const pack of packs) {
    if (pack.status !== 'active') continue;
    let packApplied = false;
    for (const control of pack.controls ?? []) {
      if (control.scope !== 'all' && control.scope !== taskId) continue;
      const capability = control.capability.startsWith('network.')
        ? 'network'
        : control.capability.startsWith('credentials.')
          ? 'credentials'
          : control.capability;
      if (!Object.hasOwn(effective, capability)) continue;
      effective[capability] = mostRestrictiveEffect([
        effective[capability],
        control.effect,
      ]);
      applied = true;
      packApplied = true;
    }
    if (packApplied) {
      constraintRefs.push(`PACK:${pack.packId}@${pack.version}`);
    }
  }
  return {
    permissionCeiling: effective,
    constraintRefs: sortedUnique(constraintRefs),
    reasonCodes: applied ? ['ROLE_PACK_CONSTRAINT_APPLIED'] : [],
  };
}

export function isHash(value) {
  return HASH.test(value ?? '');
}
