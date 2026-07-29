import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  BUILTIN_CATALOG,
} from '../../scripts/lib/decision-role-core.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const DOCTOR = path.join(ROOT, 'scripts/doctor.mjs');
const DOCTOR_BRIDGE = path.join(
  ROOT,
  'scripts/lib/decision-role-doctor.mjs',
);
const BASE_FIXTURE = path.join(
  ROOT,
  'examples/template-adoption/base-minimal',
);
const DOCTOR_BRIDGE_PRESENT = fs.existsSync(DOCTOR_BRIDGE);
const FIXED_DATE = '2026-07-29T00:00:00.000Z';
const EXTERNAL_COMMIT = '1'.repeat(40);
const EXTERNAL_SHA256 = '2'.repeat(64);
const ALL_NEW_CODES = new Set([
  'RISK_INPUT_MISSING',
  'RISK_PROFILE_INVALID',
  'DECISION_REFERENCE_MISSING',
  'DELIBERATION_REQUIRED',
  'DELIBERATION_RESULT_INVALID',
  'DELIBERATION_VERSION_MISMATCH',
  'DELIBERATION_NOT_HUMAN_CONFIRMED',
  'TASK_REFERENCE_MISSING',
  'ROLE_ASSIGNMENT_MISSING',
  'ROLE_CATALOG_INVALID',
  'ROLE_PRIVILEGE_EXPANSION',
  'ROLE_SEPARATION_VIOLATION',
  'SOURCE_REVISION_UNPINNED',
  'SOURCE_LICENSE_MISSING',
  'PRIVATE_CONTENT_BLOCKED',
  'PATH_ESCAPE_BLOCKED',
  'SYMLINK_BLOCKED',
  'SECRET_VALUE_BLOCKED',
]);

function jsonBytes(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
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

function objectSha256(value) {
  return sha256(JSON.stringify(canonicalValue(value)));
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, jsonBytes(value), 'utf8');
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function projectPath(project, relative) {
  return path.join(project, '.agent-governance', relative);
}

function makeProject(t, label = 'doctor') {
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), `decision-role-${label}-`),
  );
  const project = path.join(sandbox, 'project');
  fs.cpSync(BASE_FIXTURE, project, { recursive: true });
  fs.mkdirSync(projectPath(project, 'local'), { recursive: true });
  fs.writeFileSync(projectPath(project, '.gitignore'), 'local/\n', 'utf8');
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  return { sandbox, project };
}

function makeTask(overrides = {}) {
  return {
    taskId: 'TASK-001',
    status: 'active',
    declaredAt: FIXED_DATE,
    dataClasses: ['public'],
    surfaces: ['documentation'],
    sideEffects: ['project-local-write'],
    triggerFlags: {
      userRequestedFourAi: false,
      consequential: false,
      irreversible: false,
      multipleReasonableOptions: false,
      evidenceConflict: false,
      restrictedAuthoritySurface: false,
      threeOrMoreDomains: false,
      canonicalRuleConflict: false,
      highRepairCost: false,
    },
    requestedCapabilities: ['filesystem.project-write'],
    requiredEvidence: ['EVD-001'],
    riskLevel: 'low',
    needsDeliberation: false,
    reasonCodes: ['LOW_RISK_DECLARED'],
    ...overrides,
  };
}

function highRiskTask(overrides = {}) {
  return makeTask({
    dataClasses: ['restricted'],
    surfaces: ['credential', 'network', 'publish'],
    sideEffects: ['publish'],
    triggerFlags: {
      ...makeTask().triggerFlags,
      consequential: true,
      restrictedAuthoritySurface: true,
      threeOrMoreDomains: true,
    },
    requestedCapabilities: [
      'filesystem.project-write',
      'network',
      'credentials',
      'publish',
    ],
    riskLevel: 'high',
    needsDeliberation: true,
    reasonCodes: [
      'RISK_HIGH',
      'RISK_RESTRICTED_DATA',
      'RISK_CREDENTIAL_ACCESS',
      'RISK_PUBLISH_SIDE_EFFECT',
    ],
    ...overrides,
  });
}

function permissionCeiling() {
  return {
    'filesystem.project-read': 'allow',
    'filesystem.project-write': 'constrained-allow',
    'filesystem.root-write': 'deny',
    network: 'deny',
    credentials: 'deny',
    publish: 'require-human-approval',
    delete: 'deny',
  };
}

function makeRiskProfile(task = makeTask(), overrides = {}) {
  return {
    schemaVersion: 1,
    profileId: 'project-risk',
    status: 'assessed',
    sourceRefs: ['SRC-001'],
    permissionCeiling: permissionCeiling(),
    tasks: [task],
    openQuestions: [],
    ...overrides,
  };
}

function makeDecision(overrides = {}) {
  return {
    schemaVersion: 1,
    decisionId: 'DEC-001',
    revision: 1,
    status: 'proposed',
    topic: 'Select the first-version architecture',
    normalizedBrief:
      'Select one local architecture while preserving the runtime boundary.',
    sourceRefs: ['SRC-001'],
    requirementRefs: ['REQ-001@1'],
    riskRefs: ['project-risk#TASK-001'],
    options: [
      { optionId: 'OPT-001', summary: 'Single local package' },
      { optionId: 'OPT-002', summary: 'Immediate monorepo split' },
      { optionId: 'OPT-003', summary: 'Hosted control plane' },
    ],
    triggerReasonCodes: [],
    needsDeliberation: false,
    humanApprovalRequired: true,
    createdAt: FIXED_DATE,
    supersedes: null,
    ...overrides,
  };
}

function makePlan(decisionSha256, overrides = {}) {
  const hashable = {
    schemaVersion: 1,
    deliberationId: 'DLB-001',
    decisionId: 'DEC-001',
    decisionRevision: 1,
    decisionSha256,
    planRevision: 1,
    sourceRevision: 'DEC-001@1',
    topic: 'Select the first-version architecture',
    normalizedBrief:
      'Select one local architecture while preserving the runtime boundary.',
    sourceRefs: ['SRC-001'],
    riskRefs: ['project-risk#TASK-001'],
    triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
    needsDeliberation: true,
    profile: 'four-seat-default',
    graphId: 'four-ai-deliberation',
    graphVersion: '1.0.0',
    seats: [
      { seatId: 'DLB-001-SEAT-01', function: 'explorer' },
      { seatId: 'DLB-001-SEAT-02', function: 'constraint-analyst' },
      { seatId: 'DLB-001-SEAT-03', function: 'adversarial-reviewer' },
      { seatId: 'DLB-001-SEAT-04', function: 'synthesizer' },
    ],
    rounds: [
      { round: 1, kind: 'independent-proposal' },
      { round: 2, kind: 'cross-critique' },
      { round: 3, kind: 'option-ranking' },
      { round: 4, kind: 'synthesis' },
    ],
    maxTurns: 16,
    terminationConditions: ['four-rounds-complete', 'max-turns-reached'],
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
    ...overrides,
  };
  delete hashable.planSha256;
  return {
    ...hashable,
    planSha256: objectSha256(hashable),
  };
}

function makeResult(plan, overrides = {}) {
  const hashable = {
    schemaVersion: 1,
    deliberationId: 'DLB-001',
    decisionId: 'DEC-001',
    decisionRevision: plan.decisionRevision,
    decisionSha256: plan.decisionSha256,
    planRevision: plan.planRevision,
    planSha256: plan.planSha256,
    graphId: 'four-ai-deliberation',
    graphVersion: '1.0.0',
    adapter: 'manual-file',
    adapterVersion: '1.0.0',
    sourceRevision: 'DEC-001@1',
    executedAt: FIXED_DATE,
    redactionTier: 'metadata-only',
    seatResults: [
      { seatId: 'DLB-001-SEAT-01', status: 'ready' },
      { seatId: 'DLB-001-SEAT-02', status: 'ready' },
      { seatId: 'DLB-001-SEAT-03', status: 'ready' },
      { seatId: 'DLB-001-SEAT-04', status: 'ready' },
    ],
    claims: [
      {
        claimId: 'CLM-001',
        statement: 'A local package fits the current boundary.',
        evidenceRefs: ['EVD-001'],
      },
    ],
    evidenceRefs: ['EVD-001'],
    disagreements: [],
    assumptions: ['The core remains local-only.'],
    unknowns: [],
    rankedOptions: [
      { optionId: 'OPT-001', rank: 1 },
      { optionId: 'OPT-002', rank: 2 },
      { optionId: 'OPT-003', rank: 3 },
    ],
    recommendation: {
      optionId: 'OPT-001',
      summary: 'Use the single local package.',
    },
    confidence: 'medium',
    humanDecisionRequired: true,
    importStatus: 'imported',
    beforeReceipt: {
      receiptId: 'RCP-BEFORE-001',
      stage: 'before',
      status: 'accepted',
      snapshotSha256: '3'.repeat(64),
    },
    afterReceipt: {
      receiptId: 'RCP-AFTER-001',
      stage: 'after',
      status: 'ready',
      snapshotSha256: '4'.repeat(64),
    },
    ...overrides,
  };
  delete hashable.resultSha256;
  return {
    ...hashable,
    resultSha256: objectSha256(hashable),
  };
}

function selectedRole(responsibility, overrides = {}) {
  return {
    responsibility,
    specialistRoleId: 'unassigned',
    source: 'builtin',
    sourceCatalog: 'builtin-governance-responsibilities',
    sourceRevision: BUILTIN_CATALOG.revision,
    sourceLicense: BUILTIN_CATALOG.license,
    sourceHash: BUILTIN_CATALOG.sourceHash,
    assignedTaskScope: ['TASK-001'],
    requiredInputs: ['TASK-001', 'REQ-001@1', 'AC-001'],
    expectedDeliverables: [`${responsibility} deliverable`],
    requestedCapabilities: ['filesystem.project-write'],
    grantedCapabilityCeiling: permissionCeiling(),
    reviewResponsibility:
      responsibility === 'implementation-owner'
        ? 'implementation'
        : 'independent-review',
    cannotApprove: responsibility === 'implementation-owner',
    reasonCodes: ['ROLE_REQUIRED_BY_RISK'],
    ...overrides,
  };
}

function makeAssignment({ highRisk = false, overrides = {} } = {}) {
  const roles = highRisk
    ? [
        selectedRole('implementation-owner'),
        selectedRole('risk-reviewer'),
        selectedRole('evidence-verifier'),
      ]
    : [selectedRole('implementation-owner', { cannotApprove: false })];
  return {
    schemaVersion: 1,
    assignmentId: 'ROLE-001',
    taskId: 'TASK-001',
    revision: 1,
    status: 'assigned',
    sourceRefs: ['SRC-001'],
    riskRefs: ['project-risk#TASK-001'],
    selectedRoles: roles,
    rejectedRoles: [],
    reasonCodes: highRisk
      ? [
          'ROLE_HIGH_RISK_REVIEW',
          'ROLE_RESTRICTED_DATA_REVIEW',
          'ROLE_CREDENTIAL_REVIEW',
          'ROLE_PUBLISH_EVIDENCE_REVIEW',
        ]
      : ['ROLE_LOW_RISK_MINIMUM'],
    permissionCeiling: permissionCeiling(),
    separationOfDuties: {
      implementationOwner: 'implementation-owner',
      finalVerifier: highRisk ? 'evidence-verifier' : 'none',
    },
    humanOverride: null,
    createdAt: FIXED_DATE,
    supersedes: null,
    history: [],
    ...overrides,
  };
}

function writeDecisionBundle(
  project,
  {
    decision = makeDecision(),
    plan = null,
    result = null,
    confirmation = null,
  } = {},
) {
  const directory = projectPath(
    project,
    `decisions/${decision.decisionId}`,
  );
  const decisionFile = path.join(directory, 'decision.json');
  writeJson(decisionFile, decision);
  const decisionSha256 = objectSha256(decision);
  let storedPlan = null;
  if (plan) {
    storedPlan = plan === true ? makePlan(decisionSha256) : plan;
    writeJson(
      path.join(directory, 'deliberation-plan.json'),
      storedPlan,
    );
  }
  if (result) {
    storedPlan ??= readJson(path.join(directory, 'deliberation-plan.json'));
    writeJson(
      path.join(directory, 'deliberation-result.json'),
      result === true ? makeResult(storedPlan) : result,
    );
  }
  if (confirmation) {
    const resultFile = path.join(directory, 'deliberation-result.json');
    const resultSha256 = readJson(resultFile).resultSha256;
    writeJson(
      path.join(directory, 'human-confirmation.json'),
      confirmation === true
          ? {
            schemaVersion: 1,
            confirmationId: 'CONF-001',
            recordType: 'declared-human-confirmation',
            deliberationId: 'DLB-001',
            decisionId: 'DEC-001',
            decisionRevision: 1,
            decisionSha256,
            planSha256: storedPlan.planSha256,
            resultSha256,
            decision: 'accept',
            confirmedBy: 'project-owner-declared',
            confirmedAt: FIXED_DATE,
            statement: 'I confirm OPT-001 for this decision revision.',
            status: 'human-confirmed',
          }
        : confirmation,
    );
  }
  return { decisionSha256, directory, plan: storedPlan };
}

function writeBaseline(project, { highRisk = false } = {}) {
  writeJson(
    projectPath(project, 'risk-profile.json'),
    makeRiskProfile(highRisk ? highRiskTask() : makeTask()),
  );
  writeJson(projectPath(project, 'source-lock.json'), {
    schemaVersion: 1,
    sources: [
      {
        sourceId: 'SRC-900',
        repository: 'https://example.com/governance/catalog.git',
        commit: EXTERNAL_COMMIT,
        license: 'MIT',
        importedFiles: [],
        importedMode: 'metadata',
        sha256: EXTERNAL_SHA256,
        attributionRequired: false,
        fetchedAt: FIXED_DATE,
      },
    ],
  });
  writeJson(projectPath(project, 'packs.lock.json'), {
    schemaVersion: 1,
    packs: [],
  });
  writeDecisionBundle(project);
  writeJson(
    projectPath(project, 'role-assignments/TASK-001.json'),
    makeAssignment({ highRisk }),
  );
}

function runDoctor(project, { strict = false } = {}) {
  const args = [DOCTOR, '--json'];
  if (strict) args.push('--strict');
  args.push(project);
  return spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function parseDoctor(result, expectedExit) {
  assert.equal(
    result.status,
    expectedExit,
    `unexpected exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  assert.equal(result.stderr, '');
  const output = JSON.parse(result.stdout.trim());
  assert.equal(Array.isArray(output), false);
  assert.equal(typeof output, 'object');
  return output;
}

function findingCodes(output) {
  const codes = new Set();
  for (const finding of output.findings ?? []) {
    if (finding && typeof finding.code === 'string') codes.add(finding.code);
  }
  for (const warning of output.warnings ?? []) {
    const match = String(warning).match(/^\[([A-Z0-9_]+)\]/);
    if (match) codes.add(match[1]);
  }
  return codes;
}

function assertCode(output, code) {
  assert.ok(
    findingCodes(output).has(code),
    `expected ${code}; received ${[...findingCodes(output)].join(', ')}`,
  );
}

function removeIfPresent(file) {
  fs.rmSync(file, { recursive: true, force: true });
}

const findingScenarios = [
  {
    code: 'RISK_INPUT_MISSING',
    mutate(project) {
      writeJson(
        projectPath(project, 'risk-profile.json'),
        makeRiskProfile(
          makeTask({
            dataClasses: ['unknown'],
            surfaces: ['unknown'],
            sideEffects: ['unknown'],
            riskLevel: 'unknown',
            needsDeliberation: false,
            reasonCodes: ['RISK_INPUT_MISSING'],
          }),
          {
            status: 'needs-input',
            openQuestions: ['What data class does TASK-001 use?'],
          },
        ),
      );
    },
  },
  {
    code: 'RISK_PROFILE_INVALID',
    mutate(project) {
      const profile = readJson(projectPath(project, 'risk-profile.json'));
      writeJson(projectPath(project, 'risk-profile.json'), {
        ...profile,
        schemaVersion: 99,
      });
    },
  },
  {
    code: 'DECISION_REFERENCE_MISSING',
    mutate(project) {
      const decisionFile = projectPath(
        project,
        'decisions/DEC-001/decision.json',
      );
      const decisionSha256 = objectSha256(readJson(decisionFile));
      const plan = makePlan(decisionSha256);
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-plan.json',
        ),
        plan,
      );
      removeIfPresent(decisionFile);
    },
  },
  {
    code: 'DELIBERATION_REQUIRED',
    mutate(project) {
      writeJson(
        projectPath(project, 'decisions/DEC-001/decision.json'),
        makeDecision({
          status: 'active',
          triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
          needsDeliberation: true,
        }),
      );
    },
  },
  {
    code: 'DELIBERATION_RESULT_INVALID',
    mutate(project) {
      const decision = makeDecision({
        triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
        needsDeliberation: true,
      });
      const { decisionSha256 } = writeDecisionBundle(project, { decision });
      const plan = makePlan(decisionSha256);
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-plan.json',
        ),
        plan,
      );
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-result.json',
        ),
        { schemaVersion: 1, decisionId: 'DEC-001' },
      );
    },
  },
  {
    code: 'DELIBERATION_VERSION_MISMATCH',
    mutate(project) {
      const decision = makeDecision({
        triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
        needsDeliberation: true,
      });
      const { decisionSha256 } = writeDecisionBundle(project, { decision });
      const plan = makePlan(decisionSha256);
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-plan.json',
        ),
        plan,
      );
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-result.json',
        ),
        makeResult(plan, { graphVersion: '2.0.0' }),
      );
    },
  },
  {
    code: 'DELIBERATION_NOT_HUMAN_CONFIRMED',
    mutate(project) {
      const decision = makeDecision({
        status: 'active',
        triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
        needsDeliberation: true,
      });
      const { decisionSha256 } = writeDecisionBundle(project, { decision });
      const plan = makePlan(decisionSha256);
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-plan.json',
        ),
        plan,
      );
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-result.json',
        ),
        makeResult(plan),
      );
    },
  },
  {
    code: 'TASK_REFERENCE_MISSING',
    mutate(project) {
      const profile = makeRiskProfile(makeTask({ taskId: 'TASK-999' }));
      writeJson(projectPath(project, 'risk-profile.json'), profile);
      const assignment = makeAssignment({
        overrides: {
          assignmentId: 'ROLE-999',
          taskId: 'TASK-999',
        },
      });
      assignment.selectedRoles[0].assignedTaskScope = ['TASK-999'];
      writeJson(
        projectPath(project, 'role-assignments/TASK-999.json'),
        assignment,
      );
    },
  },
  {
    code: 'ROLE_ASSIGNMENT_MISSING',
    mutate(project) {
      writeJson(
        projectPath(project, 'risk-profile.json'),
        makeRiskProfile(highRiskTask()),
      );
      removeIfPresent(
        projectPath(project, 'role-assignments/TASK-001.json'),
      );
    },
  },
  {
    code: 'ROLE_CATALOG_INVALID',
    mutate(project) {
      const assignment = makeAssignment();
      assignment.selectedRoles[0].source = 'external-catalog';
      assignment.selectedRoles[0].sourceCatalog =
        'role-catalogs/CAT-001.json';
      writeJson(
        projectPath(project, 'role-assignments/TASK-001.json'),
        assignment,
      );
      writeJson(projectPath(project, 'role-catalogs/CAT-001.json'), {
        schemaVersion: 99,
        catalogId: 'CAT-001',
      });
    },
  },
  {
    code: 'ROLE_PRIVILEGE_EXPANSION',
    mutate(project) {
      const assignment = makeAssignment({ highRisk: true });
      assignment.selectedRoles[0].grantedCapabilityCeiling.network = 'allow';
      assignment.selectedRoles[0].grantedCapabilityCeiling.credentials =
        'allow';
      writeJson(
        projectPath(project, 'role-assignments/TASK-001.json'),
        assignment,
      );
    },
  },
  {
    code: 'ROLE_SEPARATION_VIOLATION',
    mutate(project) {
      const assignment = makeAssignment({ highRisk: true });
      assignment.selectedRoles[0].cannotApprove = false;
      assignment.selectedRoles[0].reviewResponsibility =
        'final-security-approval';
      assignment.separationOfDuties.finalVerifier =
        'implementation-owner';
      writeJson(
        projectPath(project, 'role-assignments/TASK-001.json'),
        assignment,
      );
    },
  },
  {
    code: 'SOURCE_REVISION_UNPINNED',
    mutate(project) {
      const lock = readJson(projectPath(project, 'source-lock.json'));
      lock.sources[0].commit = 'main';
      writeJson(projectPath(project, 'source-lock.json'), lock);
    },
  },
  {
    code: 'SOURCE_LICENSE_MISSING',
    mutate(project) {
      const lock = readJson(projectPath(project, 'source-lock.json'));
      delete lock.sources[0].license;
      writeJson(projectPath(project, 'source-lock.json'), lock);
    },
  },
  {
    code: 'PRIVATE_CONTENT_BLOCKED',
    mutate(project) {
      const decision = makeDecision({
        triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
        needsDeliberation: true,
      });
      const { decisionSha256 } = writeDecisionBundle(project, { decision });
      const plan = makePlan(decisionSha256);
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-plan.json',
        ),
        plan,
      );
      writeJson(
        projectPath(
          project,
          'decisions/DEC-001/deliberation-result.json',
        ),
        {
          ...makeResult(plan),
          rawPrompt: 'CANARY_RAW_PROMPT_MUST_NOT_BE_REFLECTED',
        },
      );
    },
    canary: 'CANARY_RAW_PROMPT_MUST_NOT_BE_REFLECTED',
  },
  {
    code: 'PATH_ESCAPE_BLOCKED',
    mutate(project) {
      const lock = readJson(projectPath(project, 'source-lock.json'));
      lock.sources[0].importedFiles = ['../outside.json'];
      writeJson(projectPath(project, 'source-lock.json'), lock);
    },
  },
  {
    code: 'SYMLINK_BLOCKED',
    mutate(project, sandbox) {
      const riskFile = projectPath(project, 'risk-profile.json');
      const outside = path.join(sandbox, 'outside-risk-profile.json');
      fs.renameSync(riskFile, outside);
      fs.symlinkSync(outside, riskFile);
    },
  },
  {
    code: 'SECRET_VALUE_BLOCKED',
    mutate(project) {
      const secret = `sk-proj-${'A'.repeat(48)}`;
      writeJson(
        projectPath(project, 'decisions/DEC-001/decision.json'),
        makeDecision({ normalizedBrief: `Do not reflect ${secret}` }),
      );
    },
    canary: `sk-proj-${'A'.repeat(48)}`,
  },
];

test('RED prerequisite: Milestone 1 doctor bridge exists', () => {
  assert.equal(
    DOCTOR_BRIDGE_PRESENT,
    true,
    'scripts/lib/decision-role-doctor.mjs must be added before doctor contracts can pass',
  );
});

test(
  'doctor emits every requested stable Milestone 1 finding code',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  async (t) => {
    const observed = new Set();
    for (const scenario of findingScenarios) {
      await t.test(scenario.code, () => {
        const state = makeProject(t, scenario.code.toLowerCase());
        writeBaseline(state.project);
        scenario.mutate(state.project, state.sandbox);
        const result = runDoctor(state.project, { strict: true });
        const output = parseDoctor(result, 1);
        assertCode(output, scenario.code);
        observed.add(scenario.code);
        if (scenario.canary) {
          assert.equal(
            `${result.stdout}${result.stderr}`.includes(scenario.canary),
            false,
          );
        }
      });
    }
    assert.deepEqual(observed, ALL_NEW_CODES);
  },
);

test(
  'normal doctor warns while strict doctor fails for missing high-risk assignment',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  (t) => {
    const state = makeProject(t, 'doctor-role-mode');
    writeBaseline(state.project, { highRisk: true });
    removeIfPresent(
      projectPath(state.project, 'role-assignments/TASK-001.json'),
    );
    const normal = parseDoctor(runDoctor(state.project), 0);
    const strict = parseDoctor(
      runDoctor(state.project, { strict: true }),
      1,
    );
    assertCode(normal, 'ROLE_ASSIGNMENT_MISSING');
    assertCode(strict, 'ROLE_ASSIGNMENT_MISSING');
  },
);

test(
  'normal doctor warns while strict doctor fails for imported but unconfirmed deliberation',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  (t) => {
    const state = makeProject(t, 'doctor-confirmation-mode');
    writeBaseline(state.project, { highRisk: true });
    const decision = makeDecision({
      status: 'active',
      triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
      needsDeliberation: true,
    });
    const { decisionSha256 } = writeDecisionBundle(state.project, {
      decision,
    });
    const plan = makePlan(decisionSha256);
    writeJson(
      projectPath(
        state.project,
        'decisions/DEC-001/deliberation-plan.json',
      ),
      plan,
    );
    writeJson(
      projectPath(
        state.project,
        'decisions/DEC-001/deliberation-result.json',
      ),
      makeResult(plan),
    );
    const normal = parseDoctor(runDoctor(state.project), 0);
    const strict = parseDoctor(
      runDoctor(state.project, { strict: true }),
      1,
    );
    assertCode(normal, 'DELIBERATION_NOT_HUMAN_CONFIRMED');
    assertCode(strict, 'DELIBERATION_NOT_HUMAN_CONFIRMED');
  },
);

test(
  'strict doctor accepts a hash-bound declared confirmation without claiming identity proof',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  (t) => {
    const state = makeProject(t, 'doctor-confirmed');
    writeBaseline(state.project, { highRisk: true });
    const decision = makeDecision({
      status: 'active',
      triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
      needsDeliberation: true,
    });
    const { decisionSha256 } = writeDecisionBundle(state.project, {
      decision,
    });
    const plan = makePlan(decisionSha256);
    writeJson(
      projectPath(
        state.project,
        'decisions/DEC-001/deliberation-plan.json',
      ),
      plan,
    );
    writeJson(
      projectPath(
        state.project,
        'decisions/DEC-001/deliberation-result.json',
      ),
      makeResult(plan),
    );
    const resultFile = projectPath(
      state.project,
      'decisions/DEC-001/deliberation-result.json',
    );
    writeJson(
      projectPath(
        state.project,
        'decisions/DEC-001/human-confirmation.json',
      ),
      {
        schemaVersion: 1,
        confirmationId: 'CONF-001',
        recordType: 'declared-human-confirmation',
        deliberationId: 'DLB-001',
        decisionId: 'DEC-001',
        decisionRevision: 1,
        decisionSha256,
        planSha256: plan.planSha256,
        resultSha256: readJson(resultFile).resultSha256,
        decision: 'accept',
        confirmedBy: 'project-owner-declared',
        confirmedAt: FIXED_DATE,
        statement: 'I confirm OPT-001 for this decision revision.',
        status: 'human-confirmed',
      },
    );
    const recordOnly = parseDoctor(
      runDoctor(state.project, { strict: true }),
      1,
    );
    assertCode(recordOnly, 'DELIBERATION_NOT_HUMAN_CONFIRMED');
    const humanConfirmedResult = readJson(resultFile);
    humanConfirmedResult.importStatus = 'human-confirmed';
    writeJson(resultFile, humanConfirmedResult);
    const result = runDoctor(state.project, { strict: true });
    const output = parseDoctor(result, 0);
    assert.equal(
      findingCodes(output).has('DELIBERATION_NOT_HUMAN_CONFIRMED'),
      false,
    );
    assert.doesNotMatch(
      `${result.stdout}${result.stderr}`,
      /authenticated-human|verified-human/i,
    );
  },
);

test(
  'doctor applies active Pack restrictions when checking persisted role grants',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  (t) => {
    const state = makeProject(t, 'doctor-pack-meet');
    writeBaseline(state.project, { highRisk: true });
    const profileFile = projectPath(state.project, 'risk-profile.json');
    const profile = readJson(profileFile);
    profile.permissionCeiling.network = 'allow';
    profile.tasks[0] = highRiskTask({
      dataClasses: ['public'],
      surfaces: ['network'],
      sideEffects: ['network'],
      requestedCapabilities: ['filesystem.project-write', 'network'],
    });
    writeJson(profileFile, profile);

    const assignmentFile = projectPath(
      state.project,
      'role-assignments/TASK-001.json',
    );
    const assignment = readJson(assignmentFile);
    assignment.permissionCeiling.network = 'allow';
    assignment.selectedRoles.find(
      (role) => role.responsibility === 'implementation-owner',
    ).grantedCapabilityCeiling.network = 'allow';
    writeJson(assignmentFile, assignment);

    const packRelative = '.agent-governance/packs/network-deny.json';
    const packSource = {
      sourceId: 'SRC-PACK-001',
      repository: 'https://example.com/governance/packs.git',
      revision: EXTERNAL_COMMIT,
      license: 'MIT',
      importedMode: 'metadata',
      sha256: EXTERNAL_SHA256,
    };
    const pack = {
      schemaVersion: 1,
      packId: 'PACK-NETWORK-DENY',
      version: '1.0.0',
      source: packSource,
      status: 'active',
      controls: [
        {
          controlId: 'POL-NETWORK-DENY',
          effect: 'deny',
          capability: 'network',
          scope: 'all',
        },
      ],
      mechanicalChecks: [],
      humanReviewChecks: [],
      carryingCost: {
        level: 'low',
        description: 'One deterministic permission meet.',
      },
      retirementCondition: 'Retire after an equivalent canonical deny exists.',
    };
    writeJson(path.join(state.project, packRelative), pack);
    const sourceLockFile = projectPath(state.project, 'source-lock.json');
    const sourceLock = readJson(sourceLockFile);
    sourceLock.sources.push({
      sourceId: packSource.sourceId,
      repository: packSource.repository,
      commit: packSource.revision,
      license: packSource.license,
      importedFiles: [packRelative],
      importedMode: packSource.importedMode,
      sha256: packSource.sha256,
      attributionRequired: false,
      fetchedAt: FIXED_DATE,
    });
    writeJson(sourceLockFile, sourceLock);
    writeJson(projectPath(state.project, 'packs.lock.json'), {
      schemaVersion: 1,
      packs: [
        {
          packId: pack.packId,
          version: pack.version,
          status: pack.status,
          artifact: packRelative,
          source: packSource,
        },
      ],
    });

    const normal = parseDoctor(runDoctor(state.project), 0);
    const strict = parseDoctor(
      runDoctor(state.project, { strict: true }),
      1,
    );
    assertCode(normal, 'ROLE_PRIVILEGE_EXPANSION');
    assertCode(strict, 'ROLE_PRIVILEGE_EXPANSION');
  },
);

test(
  'privacy, path, symlink, and secret violations fail in normal and strict mode',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  async (t) => {
    for (const code of [
      'PRIVATE_CONTENT_BLOCKED',
      'PATH_ESCAPE_BLOCKED',
      'SYMLINK_BLOCKED',
      'SECRET_VALUE_BLOCKED',
    ]) {
      await t.test(code, () => {
        const scenario = findingScenarios.find((item) => item.code === code);
        const state = makeProject(t, `fatal-${code.toLowerCase()}`);
        writeBaseline(state.project);
        scenario.mutate(state.project, state.sandbox);
        const normalResult = runDoctor(state.project);
        const strictResult = runDoctor(state.project, { strict: true });
        const normal = parseDoctor(normalResult, 1);
        const strict = parseDoctor(strictResult, 1);
        assertCode(normal, code);
        assertCode(strict, code);
        if (scenario.canary) {
          assert.equal(
            `${normalResult.stdout}${normalResult.stderr}`.includes(
              scenario.canary,
            ),
            false,
          );
        }
      });
    }
  },
);

test(
  'invalid external source warns normally and fails strict doctor',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  (t) => {
    const state = makeProject(t, 'doctor-source-mode');
    writeBaseline(state.project);
    const lock = readJson(projectPath(state.project, 'source-lock.json'));
    lock.sources[0].commit = 'main';
    writeJson(projectPath(state.project, 'source-lock.json'), lock);
    const normal = parseDoctor(runDoctor(state.project), 0);
    const strict = parseDoctor(
      runDoctor(state.project, { strict: true }),
      1,
    );
    assertCode(normal, 'SOURCE_REVISION_UNPINNED');
    assertCode(strict, 'SOURCE_REVISION_UNPINNED');
  },
);

test(
  'legacy projects without .agent-governance keep normal and strict compatibility',
  { skip: !DOCTOR_BRIDGE_PRESENT },
  () => {
    const normal = parseDoctor(runDoctor(BASE_FIXTURE), 0);
    const strict = parseDoctor(runDoctor(BASE_FIXTURE, { strict: true }), 0);
    assert.equal(normal.status, 'ready');
    assert.equal(strict.status, 'ready');
    for (const code of ALL_NEW_CODES) {
      assert.equal(findingCodes(normal).has(code), false);
      assert.equal(findingCodes(strict).has(code), false);
    }
  },
);
