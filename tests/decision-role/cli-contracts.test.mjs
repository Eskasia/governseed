import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CLI = path.join(ROOT, 'scripts/agent-governance.mjs');
const DOCTOR = path.join(ROOT, 'scripts/doctor.mjs');
const BASE_FIXTURE = path.join(
  ROOT,
  'examples/template-adoption/base-minimal',
);
const CLI_PRESENT = fs.existsSync(CLI);
const FIXED_DATE = '2026-07-29T00:00:00.000Z';
const SOURCE_REVISION = 'DEC-001@1';
const EXTERNAL_COMMIT = '1'.repeat(40);
const EXTERNAL_SHA256 = '2'.repeat(64);

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

function makeProject(t, label = 'cli') {
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), `decision-role-${label}-`),
  );
  const project = path.join(sandbox, 'project');
  const isolatedHome = path.join(sandbox, 'isolated-home');
  fs.cpSync(BASE_FIXTURE, project, { recursive: true });
  fs.mkdirSync(isolatedHome, { recursive: true });
  fs.mkdirSync(path.join(project, '.agent-governance/local'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(project, '.agent-governance/.gitignore'),
    'local/\n',
    'utf8',
  );
  writeJson(path.join(project, '.agent-governance/source-lock.json'), {
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
  writeJson(path.join(project, '.agent-governance/packs.lock.json'), {
    schemaVersion: 1,
    packs: [],
  });
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  return { sandbox, project, isolatedHome };
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
    ...overrides,
  };
}

function makeRiskProfile(task = makeTask(), overrides = {}) {
  return {
    schemaVersion: 1,
    profileId: 'project-risk',
    status: 'declared',
    sourceRefs: ['SRC-001'],
    permissionCeiling: {
      'filesystem.project-read': 'allow',
      'filesystem.project-write': 'constrained-allow',
      'filesystem.root-write': 'deny',
      network: 'deny',
      credentials: 'deny',
      publish: 'require-human-approval',
      delete: 'deny',
    },
    tasks: [task],
    openQuestions: [],
    ...overrides,
  };
}

function writeRiskProfile(project, profile) {
  writeJson(
    path.join(project, '.agent-governance/risk-profile.json'),
    profile,
  );
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
    triggerReasonCodes: ['MULTIPLE_REASONABLE_OPTIONS'],
    needsDeliberation: true,
    humanApprovalRequired: true,
    createdAt: FIXED_DATE,
    supersedes: null,
    ...overrides,
  };
}

function writeDecision(project, decision = makeDecision()) {
  const file = path.join(
    project,
    '.agent-governance/decisions',
    decision.decisionId,
    'decision.json',
  );
  writeJson(file, decision);
  return {
    file,
    decision,
    decisionSha256: objectSha256(decision),
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
    sourceRevision: SOURCE_REVISION,
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

function writePlan(project, decisionSha256, overrides = {}) {
  const plan = makePlan(decisionSha256, overrides);
  const file = path.join(
    project,
    '.agent-governance/decisions/DEC-001/deliberation-plan.json',
  );
  writeJson(file, plan);
  return { file, plan };
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
    sourceRevision: SOURCE_REVISION,
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
        statement: 'A single local package fits the current boundary.',
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

function writeImportFile(project, value, name = 'deliberation-result.json') {
  const relative = path.join('imports', name);
  writeJson(path.join(project, relative), value);
  return relative;
}

function makeConfirmation({
  decisionSha256,
  planSha256,
  resultSha256,
  overrides = {},
}) {
  return {
    schemaVersion: 1,
    confirmationId: 'CONF-001',
    recordType: 'declared-human-confirmation',
    deliberationId: 'DLB-001',
    decisionId: 'DEC-001',
    decisionRevision: 1,
    decisionSha256,
    planSha256,
    resultSha256,
    decision: 'accept',
    confirmedBy: 'project-owner-declared',
    confirmedAt: FIXED_DATE,
    statement: 'I confirm OPT-001 for this decision revision.',
    status: 'human-confirmed',
    ...overrides,
  };
}

function makeGuard(sandbox) {
  const marker = path.join(sandbox, 'forbidden-runtime-attempted');
  const guard = path.join(sandbox, 'local-only-guard.cjs');
  fs.writeFileSync(
    guard,
    `
const fs = require('node:fs');
const marker = process.env.AG_TEST_GUARD_MARKER;
function blocked(name) {
  return function () {
    fs.appendFileSync(marker, name + '\\n');
    throw new Error('forbidden operation: ' + name);
  };
}
for (const [moduleName, methods] of Object.entries({
  'node:child_process': ['exec', 'execFile', 'execFileSync', 'execSync', 'fork', 'spawn', 'spawnSync'],
  'node:http': ['get', 'request'],
  'node:https': ['get', 'request'],
  'node:net': ['connect', 'createConnection'],
  'node:tls': ['connect'],
  'node:dgram': ['createSocket']
})) {
  const target = require(moduleName);
  for (const method of methods) target[method] = blocked(moduleName + '.' + method);
}
globalThis.fetch = blocked('fetch');
require('node:module').syncBuiltinESMExports();
`,
    'utf8',
  );
  return { guard, marker };
}

function runCli(projectState, args, options = {}) {
  const { isolatedHome } = projectState;
  const env = {
    ...process.env,
    HOME: isolatedHome,
    USERPROFILE: isolatedHome,
    XDG_CONFIG_HOME: path.join(isolatedHome, '.config'),
    APPDATA: path.join(isolatedHome, 'AppData/Roaming'),
    ...options.env,
  };
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
    env,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function parseSingleJson(result, expectedExit) {
  assert.equal(
    result.status,
    expectedExit,
    `unexpected exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  const trimmed = result.stdout.trim();
  assert.notEqual(trimmed, '', 'JSON mode must emit one object to stdout');
  const parsed = JSON.parse(trimmed);
  assert.equal(Array.isArray(parsed), false);
  assert.equal(typeof parsed, 'object');
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(typeof parsed.command, 'string');
  assert.equal(typeof parsed.code, 'string');
  assert.equal(typeof parsed.status, 'string');
  assert.equal(Array.isArray(parsed.findings), true);
  return parsed;
}

function artifactPath(project, output) {
  assert.equal(path.isAbsolute(output.artifact), false);
  return path.join(project, output.artifact);
}

function snapshotFiles(root) {
  const entries = new Map();
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) entries.set(relative, fs.readFileSync(absolute));
    }
  }
  visit(root);
  return entries;
}

function assertSameSnapshot(before, after) {
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [file, bytes] of before) {
    assert.deepEqual(after.get(file), bytes, `unexpected change in ${file}`);
  }
}

function highRiskTask() {
  return makeTask({
    taskId: 'TASK-002',
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
    requiredEvidence: ['EVD-002'],
  });
}

function mediumRiskTask(surfaces) {
  return makeTask({
    surfaces,
    sideEffects: surfaces.includes('migration')
      ? ['schema-change']
      : ['project-local-write'],
    triggerFlags: {
      ...makeTask().triggerFlags,
      threeOrMoreDomains: false,
    },
    requestedCapabilities: ['filesystem.project-write'],
    requiredEvidence: ['EVD-001'],
  });
}

test('RED prerequisite: umbrella CLI entrypoint exists', () => {
  assert.equal(
    CLI_PRESENT,
    true,
    'scripts/agent-governance.mjs must be added before CLI contracts can pass',
  );
});

test(
  'assess derives low and high risk only from declared fields',
  { skip: !CLI_PRESENT },
  (t) => {
    const low = makeProject(t, 'assess-low');
    writeRiskProfile(low.project, makeRiskProfile());
    const lowResult = runCli(low, [
      'assess',
      low.project,
      '--task',
      'TASK-001',
      '--json',
    ]);
    const lowOutput = parseSingleJson(lowResult, 0);
    assert.equal(lowOutput.command, 'assess');
    assert.equal(lowOutput.status, 'assessed');
    const lowArtifact = readJson(artifactPath(low.project, lowOutput));
    assert.equal(lowArtifact.status, 'assessed');
    assert.equal(lowArtifact.tasks[0].riskLevel, 'low');
    assert.equal(lowArtifact.tasks[0].needsDeliberation, false);
    assert.ok(lowArtifact.tasks[0].reasonCodes.length > 0);

    const high = makeProject(t, 'assess-high');
    writeRiskProfile(
      high.project,
      makeRiskProfile(highRiskTask(), { sourceRefs: ['SRC-001'] }),
    );
    const highResult = runCli(high, [
      'assess',
      high.project,
      '--task',
      'TASK-002',
      '--json',
    ]);
    const highOutput = parseSingleJson(highResult, 0);
    const highArtifact = readJson(artifactPath(high.project, highOutput));
    const task = highArtifact.tasks[0];
    assert.equal(task.riskLevel, 'high');
    assert.equal(task.needsDeliberation, true);
    assert.ok(task.reasonCodes.includes('RISK_RESTRICTED_DATA'));
    assert.ok(task.reasonCodes.includes('RISK_CREDENTIAL_ACCESS'));
    assert.ok(task.reasonCodes.includes('RISK_PUBLISH_SIDE_EFFECT'));
  },
);

test(
  'assess returns needs-input without guessing unknown risk facts',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'assess-needs-input');
    writeRiskProfile(
      state.project,
      makeRiskProfile(
        makeTask({
          dataClasses: ['unknown'],
          surfaces: ['unknown'],
          sideEffects: ['unknown'],
          requestedCapabilities: ['unknown'],
        }),
      ),
    );
    const result = runCli(state, [
      'assess',
      state.project,
      '--task',
      'TASK-001',
      '--json',
    ]);
    const output = parseSingleJson(result, 1);
    assert.equal(output.status, 'needs-input');
    assert.equal(output.code, 'RISK_INPUT_MISSING');
    assert.ok(output.result.openQuestions.length > 0);
    assert.equal(output.result.riskLevel, 'unknown');
  },
);

test(
  'deliberate plan writes a deterministic metadata-only four-seat four-round graph',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'plan');
    writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
    writeDecision(state.project);
    const guard = makeGuard(state.sandbox);
    const args = [
      'deliberate',
      'plan',
      state.project,
      '--decision',
      'DEC-001',
      '--json',
    ];
    const first = runCli(state, args, {
      env: {
        AG_TEST_GUARD_MARKER: guard.marker,
        NODE_OPTIONS: `--require=${guard.guard}`,
      },
    });
    const firstOutput = parseSingleJson(first, 0);
    assert.equal(firstOutput.command, 'deliberate.plan');
    const file = artifactPath(state.project, firstOutput);
    const firstBytes = fs.readFileSync(file);
    const plan = JSON.parse(firstBytes);
    assert.deepEqual(
      plan.seats.map((seat) => seat.function),
      [
        'explorer',
        'constraint-analyst',
        'adversarial-reviewer',
        'synthesizer',
      ],
    );
    assert.equal(new Set(plan.seats.map((seat) => seat.seatId)).size, 4);
    assert.deepEqual(
      plan.rounds.map((round) => round.kind),
      [
        'independent-proposal',
        'cross-critique',
        'option-ranking',
        'synthesis',
      ],
    );
    assert.equal(plan.redactionTier, 'metadata-only');
    assert.equal(plan.humanApprovalRequired, true);
    assert.equal(plan.status, 'planned');
    const { planSha256, ...hashablePlan } = plan;
    assert.equal(planSha256, objectSha256(hashablePlan));
    assert.equal(fs.existsSync(guard.marker), false);

    const beforeSecond = snapshotFiles(state.project);
    const second = runCli(state, args, {
      env: {
        AG_TEST_GUARD_MARKER: guard.marker,
        NODE_OPTIONS: `--require=${guard.guard}`,
      },
    });
    const secondOutput = parseSingleJson(second, 0);
    assert.equal(second.stdout, first.stdout);
    assert.deepEqual(fs.readFileSync(file), firstBytes);
    assertSameSnapshot(beforeSecond, snapshotFiles(state.project));
    assert.equal(fs.existsSync(guard.marker), false);
  },
);

test(
  'deliberate plan records not-required without writing a plan',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'plan-not-required');
    writeRiskProfile(state.project, makeRiskProfile());
    writeDecision(
      state.project,
      makeDecision({
        options: [
          { optionId: 'OPT-001', summary: 'Keep the current local design' },
        ],
        triggerReasonCodes: ['DELIBERATION_NOT_REQUIRED'],
        needsDeliberation: false,
      }),
    );
    const decisionDirectory = path.join(
      state.project,
      '.agent-governance/decisions/DEC-001',
    );
    const before = snapshotFiles(state.project);
    const output = parseSingleJson(
      runCli(state, [
        'deliberate',
        'plan',
        state.project,
        '--decision',
        'DEC-001',
        '--json',
      ]),
      0,
    );
    assert.equal(output.code, 'DELIBERATION_NOT_REQUIRED');
    assert.equal(output.status, 'not-required');
    assert.equal(output.artifact, null);
    assert.equal(output.result.needsDeliberation, false);
    assert.equal(
      fs.existsSync(path.join(decisionDirectory, 'deliberation-plan.json')),
      false,
    );
    assertSameSnapshot(before, snapshotFiles(state.project));
  },
);

test(
  'deliberate import always imports without approving or editing canonical documents',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'import');
    writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
    const { decisionSha256 } = writeDecision(state.project);
    const { plan } = writePlan(state.project, decisionSha256);
    const importFile = writeImportFile(
      state.project,
      makeResult(plan),
    );
    const specBefore = fs.readFileSync(path.join(state.project, 'SPEC.md'));
    const stackBefore = fs.readFileSync(
      path.join(state.project, 'TECH_STACK.md'),
    );
    const result = runCli(state, [
      'deliberate',
      'import',
      state.project,
      '--file',
      importFile,
      '--json',
    ]);
    const output = parseSingleJson(result, 0);
    assert.equal(output.command, 'deliberate.import');
    assert.equal(output.status, 'imported');
    const imported = readJson(artifactPath(state.project, output));
    assert.equal(imported.importStatus, 'imported');
    assert.equal('confirmation' in imported, false);
    assert.equal(imported.decisionSha256, plan.decisionSha256);
    assert.equal(imported.planSha256, plan.planSha256);
    assert.equal(imported.beforeReceipt.stage, 'before');
    assert.equal(imported.afterReceipt.stage, 'after');
    const { resultSha256, ...hashableResult } = imported;
    assert.equal(resultSha256, objectSha256(hashableResult));
    assert.deepEqual(fs.readFileSync(path.join(state.project, 'SPEC.md')), specBefore);
    assert.deepEqual(
      fs.readFileSync(path.join(state.project, 'TECH_STACK.md')),
      stackBefore,
    );
  },
);

test(
  'deliberate import fails closed on graph, source, decision, and lineage hash mismatch',
  { skip: !CLI_PRESENT },
  async (t) => {
    const cases = [
      [
        'graph id',
        { graphId: 'different-graph' },
        'DELIBERATION_VERSION_MISMATCH',
      ],
      [
        'graph version',
        { graphVersion: '2.0.0' },
        'DELIBERATION_VERSION_MISMATCH',
      ],
      [
        'source revision',
        { sourceRevision: 'DEC-001@2' },
        'DELIBERATION_SOURCE_MISMATCH',
      ],
      [
        'decision',
        { decisionId: 'DEC-999' },
        'DECISION_REFERENCE_MISSING',
      ],
      [
        'decision hash',
        { decisionSha256: 'f'.repeat(64) },
        'DELIBERATION_DECISION_HASH_MISMATCH',
      ],
      [
        'plan hash',
        { planSha256: 'e'.repeat(64) },
        'DELIBERATION_PLAN_HASH_MISMATCH',
      ],
    ];

    for (const [label, mutation, code] of cases) {
      await t.test(label, () => {
        const state = makeProject(t, `import-${label.replaceAll(' ', '-')}`);
        writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
        const { decisionSha256 } = writeDecision(state.project);
        const { plan } = writePlan(state.project, decisionSha256);
        const importFile = writeImportFile(
          state.project,
          makeResult(plan, mutation),
        );
        const result = runCli(state, [
          'deliberate',
          'import',
          state.project,
          '--file',
          importFile,
          '--json',
        ]);
        const output = parseSingleJson(result, 4);
        assert.equal(output.code, code);
        assert.equal(
          fs.existsSync(
            path.join(
              state.project,
              '.agent-governance/decisions/DEC-001/deliberation-result.json',
            ),
          ),
          false,
        );
      });
    }
  },
);

test(
  'deliberate import rejects external human-confirmed or confirmation-like claims',
  { skip: !CLI_PRESENT },
  async (t) => {
    const cases = [
      [
        'human-confirmed status',
        { importStatus: 'human-confirmed' },
      ],
      [
        'embedded confirmation',
        {
          humanConfirmation: {
            confirmedBy: 'external-adapter',
            status: 'human-confirmed',
          },
        },
      ],
    ];
    for (const [label, mutation] of cases) {
      await t.test(label, () => {
        const state = makeProject(
          t,
          `import-approval-${label.replaceAll(' ', '-')}`,
        );
        writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
        const { decisionSha256 } = writeDecision(state.project);
        const { plan } = writePlan(state.project, decisionSha256);
        const importFile = writeImportFile(
          state.project,
          makeResult(plan, mutation),
        );
        const output = parseSingleJson(
          runCli(state, [
            'deliberate',
            'import',
            state.project,
            '--file',
            importFile,
            '--json',
          ]),
          4,
        );
        assert.equal(output.code, 'DELIBERATION_IMPORT_APPROVAL_BLOCKED');
        assert.equal(
          fs.existsSync(
            path.join(
              state.project,
              '.agent-governance/decisions/DEC-001/deliberation-result.json',
            ),
          ),
          false,
        );
      });
    }
  },
);

test(
  'deliberate confirm stores an independent declared confirmation bound to decision and result hashes',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'confirm');
    writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
    const { decisionSha256 } = writeDecision(state.project);
    const { plan } = writePlan(state.project, decisionSha256);
    const importFile = writeImportFile(
      state.project,
      makeResult(plan),
    );
    const importedOutput = parseSingleJson(
      runCli(state, [
        'deliberate',
        'import',
        state.project,
        '--file',
        importFile,
        '--json',
      ]),
      0,
    );
    const importedFile = artifactPath(state.project, importedOutput);
    const importedBytes = fs.readFileSync(importedFile);
    const resultSha256 = readJson(importedFile).resultSha256;
    const wrongFile = writeImportFile(
      state.project,
      makeConfirmation({
        decisionSha256,
        planSha256: plan.planSha256,
        resultSha256: '0'.repeat(64),
      }),
      'wrong-confirmation.json',
    );
    const wrong = parseSingleJson(
      runCli(state, [
        'deliberate',
        'confirm',
        state.project,
        '--decision',
        'DEC-001',
        '--file',
        wrongFile,
        '--json',
      ]),
      4,
    );
    assert.equal(wrong.code, 'DELIBERATION_CONFIRMATION_HASH_MISMATCH');
    const storedConfirmation = path.join(
      state.project,
      '.agent-governance/decisions/DEC-001/human-confirmation.json',
    );
    assert.equal(fs.existsSync(storedConfirmation), false);
    assert.deepEqual(fs.readFileSync(importedFile), importedBytes);

    const confirmation = makeConfirmation({
      decisionSha256,
      planSha256: plan.planSha256,
      resultSha256,
    });
    const missingRecordType = structuredClone(confirmation);
    delete missingRecordType.recordType;
    const missingRecordTypeFile = writeImportFile(
      state.project,
      missingRecordType,
      'missing-record-type-confirmation.json',
    );
    const missingType = parseSingleJson(
      runCli(state, [
        'deliberate',
        'confirm',
        state.project,
        '--decision',
        'DEC-001',
        '--file',
        missingRecordTypeFile,
        '--json',
      ]),
      4,
    );
    assert.equal(missingType.code, 'DELIBERATION_CONFIRMATION_INVALID');
    assert.equal(fs.existsSync(storedConfirmation), false);
    assert.deepEqual(fs.readFileSync(importedFile), importedBytes);

    const confirmationFile = writeImportFile(
      state.project,
      confirmation,
      'confirmation.json',
    );
    const confirmed = parseSingleJson(
      runCli(state, [
        'deliberate',
        'confirm',
        state.project,
        '--decision',
        'DEC-001',
        '--file',
        confirmationFile,
        '--json',
      ]),
      0,
    );
    assert.equal(confirmed.command, 'deliberate.confirm');
    assert.equal(confirmed.status, 'human-confirmed');
    assert.deepEqual(readJson(storedConfirmation), confirmation);
    const confirmedResult = readJson(importedFile);
    assert.equal(confirmedResult.importStatus, 'human-confirmed');
    assert.equal(confirmedResult.resultSha256, resultSha256);
    assert.notDeepEqual(fs.readFileSync(importedFile), importedBytes);

    const beforeReplay = snapshotFiles(state.project);
    const replay = parseSingleJson(
      runCli(state, [
        'deliberate',
        'confirm',
        state.project,
        '--decision',
        'DEC-001',
        '--file',
        confirmationFile,
        '--json',
      ]),
      0,
    );
    assert.equal(replay.status, 'human-confirmed');
    assertSameSnapshot(beforeReplay, snapshotFiles(state.project));
  },
);

test(
  'roles assign selects the minimum bounded responsibilities with explainable separation',
  { skip: !CLI_PRESENT },
  (t) => {
    const low = makeProject(t, 'roles-low');
    writeRiskProfile(low.project, makeRiskProfile());
    const lowOutput = parseSingleJson(
      runCli(low, [
        'roles',
        'assign',
        low.project,
        '--task',
        'TASK-001',
        '--json',
      ]),
      0,
    );
    const lowAssignment = readJson(artifactPath(low.project, lowOutput));
    assert.deepEqual(
      lowAssignment.selectedRoles.map((role) => role.responsibility),
      ['implementation-owner'],
    );
    assert.ok(lowAssignment.reasonCodes.length > 0);

    const high = makeProject(t, 'roles-high');
    writeRiskProfile(high.project, makeRiskProfile(highRiskTask()));
    const args = [
      'roles',
      'assign',
      high.project,
      '--task',
      'TASK-002',
      '--json',
    ];
    const first = parseSingleJson(runCli(high, args), 0);
    const assignmentFile = artifactPath(high.project, first);
    const firstBytes = fs.readFileSync(assignmentFile);
    const assignment = JSON.parse(firstBytes);
    const responsibilities = assignment.selectedRoles.map(
      (role) => role.responsibility,
    );
    assert.ok(responsibilities.includes('implementation-owner'));
    assert.ok(responsibilities.includes('risk-reviewer'));
    assert.ok(responsibilities.includes('evidence-verifier'));
    assert.ok(responsibilities.length <= 4);
    assert.ok(assignment.reasonCodes.includes('ROLE_HIGH_RISK_REVIEW'));
    assert.ok(
      assignment.reasonCodes.includes('ROLE_RESTRICTED_DATA_REVIEW'),
    );
    assert.ok(assignment.reasonCodes.includes('ROLE_CREDENTIAL_REVIEW'));
    assert.ok(
      assignment.reasonCodes.includes('ROLE_PUBLISH_EVIDENCE_REVIEW'),
    );
    assert.equal(
      assignment.selectedRoles.find(
        (role) => role.responsibility === 'implementation-owner',
      ).cannotApprove,
      true,
    );
    assert.notEqual(
      assignment.separationOfDuties.implementationOwner,
      assignment.separationOfDuties.finalVerifier,
    );
    for (const role of assignment.selectedRoles) {
      assert.equal(typeof role.source, 'string');
      assert.equal(typeof role.sourceRevision, 'string');
      assert.equal(typeof role.sourceLicense, 'string');
      assert.match(role.sourceHash, /^[a-f0-9]{64}$/);
      assert.notEqual(role.grantedCapabilityCeiling.network, 'allow');
      assert.notEqual(role.grantedCapabilityCeiling.credentials, 'allow');
      assert.notEqual(
        role.grantedCapabilityCeiling['filesystem.root-write'],
        'allow',
      );
    }

    const beforeSecond = snapshotFiles(high.project);
    const second = parseSingleJson(runCli(high, args), 0);
    assert.equal(second.command, 'roles.assign');
    assert.deepEqual(fs.readFileSync(assignmentFile), firstBytes);
    assertSameSnapshot(beforeSecond, snapshotFiles(high.project));
  },
);

test(
  'roles assign maps UI accessibility and schema migration surfaces to independent domain review',
  { skip: !CLI_PRESENT },
  async (t) => {
    const cases = [
      {
        label: 'ui-accessibility',
        task: mediumRiskTask(['ui', 'accessibility']),
        reasonCode: 'ROLE_UI_ACCESSIBILITY_REVIEW',
      },
      {
        label: 'schema-migration',
        task: mediumRiskTask(['schema', 'migration']),
        reasonCode: 'ROLE_SCHEMA_COMPATIBILITY_REVIEW',
      },
    ];
    for (const scenario of cases) {
      await t.test(scenario.label, () => {
        const state = makeProject(t, `roles-${scenario.label}`);
        writeRiskProfile(state.project, makeRiskProfile(scenario.task));
        const output = parseSingleJson(
          runCli(state, [
            'roles',
            'assign',
            state.project,
            '--task',
            'TASK-001',
            '--json',
          ]),
          0,
        );
        const assignment = readJson(artifactPath(state.project, output));
        assert.deepEqual(
          assignment.selectedRoles.map((role) => role.responsibility),
          ['implementation-owner', 'domain-reviewer'],
        );
        assert.ok(assignment.reasonCodes.includes(scenario.reasonCode));
        assert.equal(
          assignment.selectedRoles.find(
            (role) => role.responsibility === 'domain-reviewer',
          ).cannotApprove,
          true,
        );
      });
    }
  },
);

test(
  'roles assign blocks a catalog that requests capabilities above the project ceiling',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'roles-malicious');
    writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
    const catalogRelative =
      '.agent-governance/role-catalogs/malicious-role-catalog.json';
    writeJson(path.join(state.project, catalogRelative), {
      schemaVersion: 1,
      catalogId: 'CAT-001',
      catalogType: 'specialist',
      source: {
        sourceId: 'SRC-901',
        repository: 'https://example.com/malicious/catalog.git',
        revision: EXTERNAL_COMMIT,
        license: 'MIT',
        importedMode: 'metadata',
        sha256: EXTERNAL_SHA256,
      },
      roles: [
        {
          roleId: 'root-publisher',
          division: 'security',
          title: 'Root Publisher',
          supportedResponsibilities: ['implementation-owner'],
          supportedSurfaces: ['publish'],
          requestedCapabilities: [
            'network.unrestricted',
            'credentials.broad',
            'filesystem.root-write',
          ],
        },
      ],
    });
    const sourceLockFile = path.join(
      state.project,
      '.agent-governance/source-lock.json',
    );
    const sourceLock = readJson(sourceLockFile);
    sourceLock.sources.push({
      sourceId: 'SRC-901',
      repository: 'https://example.com/malicious/catalog.git',
      commit: EXTERNAL_COMMIT,
      license: 'MIT',
      importedFiles: [catalogRelative],
      importedMode: 'metadata',
      sha256: EXTERNAL_SHA256,
      attributionRequired: false,
      fetchedAt: FIXED_DATE,
    });
    writeJson(sourceLockFile, sourceLock);
    const result = runCli(state, [
      'roles',
      'assign',
      state.project,
      '--task',
      'TASK-002',
      '--catalog',
      catalogRelative,
      '--json',
    ]);
    const output = parseSingleJson(result, 4);
    assert.equal(output.code, 'ROLE_PRIVILEGE_EXPANSION');
    assert.ok(
      output.findings.some(
        (finding) => finding.code === 'ROLE_PRIVILEGE_EXPANSION',
      ),
    );
    assert.equal(
      fs.existsSync(
        path.join(
          state.project,
          '.agent-governance/role-assignments/TASK-002.json',
        ),
      ),
      false,
    );
  },
);

test(
  'roles assign persists an exact external catalog path that strict doctor can revalidate',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'roles-external-provenance');
    writeRiskProfile(state.project, makeRiskProfile());
    const catalogRelative = 'imports/specialist-catalog.json';
    const source = {
      sourceId: 'SRC-901',
      repository: 'https://example.com/specialists/catalog.git',
      revision: EXTERNAL_COMMIT,
      license: 'MIT',
      importedMode: 'metadata',
      sha256: EXTERNAL_SHA256,
    };
    writeJson(path.join(state.project, catalogRelative), {
      schemaVersion: 1,
      catalogId: 'CAT-001',
      catalogType: 'specialist',
      source,
      roles: [
        {
          roleId: 'documentation-implementer',
          division: 'documentation',
          title: 'Documentation Implementer',
          supportedResponsibilities: ['implementation-owner'],
          supportedSurfaces: ['documentation'],
          requestedCapabilities: ['filesystem.project-write'],
        },
      ],
    });
    const sourceLockFile = path.join(
      state.project,
      '.agent-governance/source-lock.json',
    );
    const sourceLock = readJson(sourceLockFile);
    sourceLock.sources.push({
      sourceId: source.sourceId,
      repository: source.repository,
      commit: source.revision,
      license: source.license,
      importedFiles: [catalogRelative],
      importedMode: source.importedMode,
      sha256: source.sha256,
      attributionRequired: false,
      fetchedAt: FIXED_DATE,
    });
    writeJson(sourceLockFile, sourceLock);

    const output = parseSingleJson(
      runCli(state, [
        'roles',
        'assign',
        state.project,
        '--task',
        'TASK-001',
        '--catalog',
        catalogRelative,
        '--json',
      ]),
      0,
    );
    const assignment = readJson(artifactPath(state.project, output));
    assert.equal(
      assignment.selectedRoles[0].sourceCatalog,
      catalogRelative,
    );
    const doctor = spawnSync(
      process.execPath,
      [DOCTOR, '--json', '--strict', state.project],
      {
        cwd: ROOT,
        encoding: 'utf8',
        shell: false,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    assert.equal(
      doctor.status,
      0,
      `strict doctor failed\nstdout:\n${doctor.stdout}\nstderr:\n${doctor.stderr}`,
    );
  },
);

test(
  'roles assign applies active Pack restrictions to the effective permission ceiling',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'roles-pack-meet');
    writeRiskProfile(
      state.project,
      makeRiskProfile(
        makeTask({
          requestedCapabilities: [
            'filesystem.project-write',
            'network',
          ],
        }),
        {
          permissionCeiling: {
            ...makeRiskProfile().permissionCeiling,
            network: 'allow',
          },
        },
      ),
    );
    const packRelative = '.agent-governance/packs/minimal-change.json';
    const packSource = {
      sourceId: 'SRC-901',
      repository: 'https://example.com/minimal-change.git',
      revision: EXTERNAL_COMMIT,
      license: 'MIT',
      importedMode: 'metadata',
      sha256: EXTERNAL_SHA256,
    };
    writeJson(path.join(state.project, packRelative), {
      schemaVersion: 1,
      packId: 'minimal-change',
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
    });
    const sourceLockFile = path.join(
      state.project,
      '.agent-governance/source-lock.json',
    );
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
    writeJson(path.join(state.project, '.agent-governance/packs.lock.json'), {
      schemaVersion: 1,
      packs: [
        {
          packId: 'minimal-change',
          version: '1.0.0',
          status: 'active',
          artifact: packRelative,
          source: packSource,
        },
      ],
    });

    const output = parseSingleJson(
      runCli(state, [
        'roles',
        'assign',
        state.project,
        '--task',
        'TASK-001',
        '--json',
      ]),
      0,
    );
    const assignment = readJson(artifactPath(state.project, output));
    const implementation = assignment.selectedRoles.find(
      (role) => role.responsibility === 'implementation-owner',
    );
    assert.equal(assignment.permissionCeiling.network, 'deny');
    assert.equal(implementation.grantedCapabilityCeiling.network, 'deny');
    assert.ok(
      assignment.reasonCodes.includes('ROLE_PACK_CONSTRAINT_APPLIED'),
    );
    assert.ok(assignment.sourceRefs.includes('PACK:minimal-change@1.0.0'));
  },
);

test(
  'roles human override appends one revision and identical replay is byte-stable',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'roles-override');
    writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
    const baseArgs = [
      'roles',
      'assign',
      state.project,
      '--task',
      'TASK-002',
      '--json',
    ];
    const first = parseSingleJson(runCli(state, baseArgs), 0);
    const assignmentFile = artifactPath(state.project, first);
    const revisionOne = readJson(assignmentFile);
    const overrideRelative = 'imports/role-override.json';
    writeJson(path.join(state.project, overrideRelative), {
      schemaVersion: 1,
      overrideId: 'ROLE-OVERRIDE-001',
      assignmentId: revisionOne.assignmentId,
      taskId: 'TASK-002',
      baseRevision: 1,
      addResponsibilities: ['domain-reviewer'],
      removeResponsibilities: [],
      reasonCodes: ['ROLE_HUMAN_DOMAIN_REVIEW_REQUIRED'],
      confirmedBy: 'project-owner-declared',
      confirmedAt: FIXED_DATE,
    });
    const overrideArgs = [
      'roles',
      'assign',
      state.project,
      '--task',
      'TASK-002',
      '--override',
      overrideRelative,
      '--json',
    ];
    const second = parseSingleJson(runCli(state, overrideArgs), 0);
    const revisionTwoBytes = fs.readFileSync(artifactPath(state.project, second));
    const revisionTwo = JSON.parse(revisionTwoBytes);
    assert.equal(revisionTwo.revision, 2);
    assert.equal(revisionTwo.supersedes, `${revisionOne.assignmentId}@1`);
    assert.equal(revisionTwo.history.length, 1);
    assert.equal(revisionTwo.history[0].revision, 1);
    assert.ok(
      revisionTwo.selectedRoles.some(
        (role) => role.responsibility === 'domain-reviewer',
      ),
    );
    assert.ok(revisionTwo.selectedRoles.length <= 4);

    const beforeReplay = snapshotFiles(state.project);
    parseSingleJson(runCli(state, overrideArgs), 0);
    assert.deepEqual(fs.readFileSync(assignmentFile), revisionTwoBytes);
    assertSameSnapshot(beforeReplay, snapshotFiles(state.project));
  },
);

test(
  'roles override recomputes separation of duties for an added verifier',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'roles-override-separation');
    writeRiskProfile(state.project, makeRiskProfile());
    const first = parseSingleJson(
      runCli(state, [
        'roles',
        'assign',
        state.project,
        '--task',
        'TASK-001',
        '--json',
      ]),
      0,
    );
    const assignmentFile = artifactPath(state.project, first);
    const revisionOne = readJson(assignmentFile);
    const overrideRelative = 'imports/role-override.json';
    writeJson(path.join(state.project, overrideRelative), {
      schemaVersion: 1,
      overrideId: 'ROLE-OVERRIDE-001',
      assignmentId: revisionOne.assignmentId,
      taskId: 'TASK-001',
      baseRevision: 1,
      addResponsibilities: ['evidence-verifier'],
      removeResponsibilities: [],
      reasonCodes: ['ROLE_HUMAN_EVIDENCE_REVIEW_REQUIRED'],
      confirmedBy: 'project-owner-declared',
      confirmedAt: FIXED_DATE,
    });
    const output = parseSingleJson(
      runCli(state, [
        'roles',
        'assign',
        state.project,
        '--task',
        'TASK-001',
        '--override',
        overrideRelative,
        '--json',
      ]),
      0,
    );
    const revisionTwo = readJson(artifactPath(state.project, output));
    const implementation = revisionTwo.selectedRoles.find(
      (role) => role.responsibility === 'implementation-owner',
    );
    const verifier = revisionTwo.selectedRoles.find(
      (role) => role.responsibility === 'evidence-verifier',
    );
    assert.equal(revisionTwo.separationOfDuties.required, true);
    assert.equal(implementation.cannotApprove, true);
    assert.equal(
      revisionTwo.separationOfDuties.implementationOwner,
      implementation.specialistRoleId,
    );
    assert.equal(
      revisionTwo.separationOfDuties.finalVerifier,
      verifier.specialistRoleId,
    );
    assert.deepEqual(revisionTwo.separationOfDuties.rules, [
      {
        responsibility: 'implementation-owner',
        cannotApprove: ['final-evidence', 'publish', 'security'],
      },
    ]);
  },
);

test(
  'pack list is deterministic, read-only, local, and writes no user-global state',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'pack-list');
    writeJson(path.join(state.project, '.agent-governance/packs.lock.json'), {
      schemaVersion: 1,
      packs: [
        {
          packId: 'minimal-change',
          version: '1.0.0',
          status: 'active',
          artifact: '.agent-governance/packs/minimal-change.json',
          source: {
            sourceId: 'SRC-901',
            repository: 'https://example.com/minimal-change.git',
            revision: EXTERNAL_COMMIT,
            license: 'MIT',
            importedMode: 'metadata',
            sha256: EXTERNAL_SHA256,
          },
        },
      ],
    });
    const beforeProject = snapshotFiles(state.project);
    const beforeHome = snapshotFiles(state.isolatedHome);
    const args = ['pack', 'list', state.project, '--json'];
    const first = parseSingleJson(runCli(state, args), 0);
    const second = parseSingleJson(runCli(state, args), 0);
    assert.equal(first.command, 'pack.list');
    assert.equal(first.result.packs.length, 1);
    assert.equal(first.result.packs[0].packId, 'minimal-change');
    assert.equal(second.stdout, first.stdout);
    assertSameSnapshot(beforeProject, snapshotFiles(state.project));
    assertSameSnapshot(beforeHome, snapshotFiles(state.isolatedHome));
  },
);

test(
  'JSON mode uses one stdout object and stable exit codes 0 through 5',
  { skip: !CLI_PRESENT },
  async (t) => {
    await t.test('0 success', () => {
      const state = makeProject(t, 'exit-0');
      writeRiskProfile(state.project, makeRiskProfile());
      parseSingleJson(
        runCli(state, [
          'assess',
          state.project,
          '--task',
          'TASK-001',
          '--json',
        ]),
        0,
      );
    });

    await t.test('1 needs input', () => {
      const state = makeProject(t, 'exit-1');
      writeRiskProfile(
        state.project,
        makeRiskProfile(makeTask({ dataClasses: ['unknown'] })),
      );
      parseSingleJson(
        runCli(state, [
          'assess',
          state.project,
          '--task',
          'TASK-001',
          '--json',
        ]),
        1,
      );
    });

    await t.test('2 usage', () => {
      const state = makeProject(t, 'exit-2');
      parseSingleJson(runCli(state, ['unknown-command', '--json']), 2);
    });

    await t.test('3 schema validation', () => {
      const state = makeProject(t, 'exit-3');
      writeRiskProfile(state.project, {
        ...makeRiskProfile(),
        schemaVersion: 99,
      });
      parseSingleJson(
        runCli(state, [
          'assess',
          state.project,
          '--task',
          'TASK-001',
          '--json',
        ]),
        3,
      );
    });

    await t.test('4 fail-closed mismatch', () => {
      const state = makeProject(t, 'exit-4');
      writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
      const { decisionSha256 } = writeDecision(state.project);
      const { plan } = writePlan(state.project, decisionSha256);
      const importFile = writeImportFile(
        state.project,
        makeResult(plan, { graphVersion: '99.0.0' }),
      );
      parseSingleJson(
        runCli(state, [
          'deliberate',
          'import',
          state.project,
          '--file',
          importFile,
          '--json',
        ]),
        4,
      );
    });

    await t.test('5 bounded local I/O', () => {
      const state = makeProject(t, 'exit-5');
      parseSingleJson(
        runCli(state, [
          'assess',
          path.join(state.sandbox, 'absent-project'),
          '--json',
        ]),
        5,
      );
    });
  },
);

test(
  'normal CLI operation attempts no network, child process, or user-global write',
  { skip: !CLI_PRESENT },
  (t) => {
    const state = makeProject(t, 'local-only');
    writeRiskProfile(state.project, makeRiskProfile(highRiskTask()));
    writeDecision(state.project);
    const guard = makeGuard(state.sandbox);
    const beforeHome = snapshotFiles(state.isolatedHome);
    const result = runCli(
      state,
      [
        'deliberate',
        'plan',
        state.project,
        '--decision',
        'DEC-001',
        '--json',
      ],
      {
        env: {
          AG_TEST_GUARD_MARKER: guard.marker,
          NODE_OPTIONS: `--require=${guard.guard}`,
        },
      },
    );
    parseSingleJson(result, 0);
    assert.equal(fs.existsSync(guard.marker), false);
    assertSameSnapshot(beforeHome, snapshotFiles(state.isolatedHome));
  },
);
