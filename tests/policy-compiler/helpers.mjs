import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);
export const CLI = path.join(ROOT, 'scripts/agent-governance.mjs');
export const DOCTOR = path.join(ROOT, 'scripts/doctor.mjs');
export const BASE_FIXTURE = path.join(
  ROOT,
  'examples/template-adoption/base-minimal',
);
export const LOW_RISK_FIXTURE = path.join(
  ROOT,
  'tests/decision-role/fixtures/low-risk-docs-task/.agent-governance',
);
export const FIXED_TIME = '2026-07-29T12:00:00.000Z';
export const PACK_COMMIT = 'a'.repeat(40);
export const PACK_SHA256 = 'b'.repeat(64);

export function clone(value) {
  return structuredClone(value);
}

export function canonicalValue(value) {
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

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function objectSha256(value) {
  return sha256(canonicalJson(value));
}

export function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

export function writeJson(file, value, lineEnding = '\n') {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const content = `${JSON.stringify(value, null, 2)}\n`;
  fs.writeFileSync(
    file,
    lineEnding === '\r\n'
      ? content.replaceAll('\n', '\r\n')
      : content,
    'utf8',
  );
}

export function governancePath(project, relative) {
  return path.join(project, ...relative.split('/'));
}

/**
 * A ceiling is bounded at three layers, so changing one alone is rejected as
 * privilege expansion rather than recompiled. Tests that need a different
 * compiled policy change all three together.
 */
export function setCeiling(project, capability, mode) {
  const profilePath = governancePath(
    project,
    '.agent-governance/risk-profile.json',
  );
  const profile = readJson(profilePath);
  profile.permissionCeiling[capability] = mode;
  writeJson(profilePath, profile);

  const assignmentPath = governancePath(
    project,
    '.agent-governance/role-assignments/TASK-001.json',
  );
  const assignment = readJson(assignmentPath);
  assignment.permissionCeiling[capability] = mode;
  for (const role of assignment.selectedRoles ?? []) {
    role.grantedCapabilityCeiling[capability] = mode;
  }
  writeJson(assignmentPath, assignment);
}

/**
 * An unrequested capability compiles to deny regardless of its ceiling, so a
 * test that needs a looser compiled mode must request it at the task and the
 * role as well as raise the ceiling.
 */
export function requestCapability(project, capability) {
  const profilePath = governancePath(
    project,
    '.agent-governance/risk-profile.json',
  );
  const profile = readJson(profilePath);
  for (const task of profile.tasks) {
    if (!task.requestedCapabilities.includes(capability)) {
      task.requestedCapabilities = [
        ...task.requestedCapabilities,
        capability,
      ].sort();
    }
  }
  writeJson(profilePath, profile);

  const assignmentPath = governancePath(
    project,
    '.agent-governance/role-assignments/TASK-001.json',
  );
  const assignment = readJson(assignmentPath);
  for (const role of assignment.selectedRoles ?? []) {
    if (!role.requestedCapabilities.includes(capability)) {
      role.requestedCapabilities = [
        ...role.requestedCapabilities,
        capability,
      ].sort();
    }
  }
  writeJson(assignmentPath, assignment);
}

export function snapshotFiles(root) {
  const entries = new Map();
  function visit(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute).replaceAll('\\', '/');
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) entries.set(relative, fs.readFileSync(absolute));
    }
  }
  visit(root);
  return entries;
}

export function assertSameSnapshot(before, after) {
  assert.deepEqual([...after.keys()].sort(), [...before.keys()].sort());
  for (const [file, bytes] of before) {
    assert.deepEqual(after.get(file), bytes, `unexpected change in ${file}`);
  }
}

export function makeProject(t, label = 'policy') {
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), `governseed-${label}-`),
  );
  const project = path.join(sandbox, 'project');
  const isolatedHome = path.join(sandbox, 'isolated-home');
  fs.cpSync(BASE_FIXTURE, project, { recursive: true });
  fs.mkdirSync(isolatedHome, { recursive: true });
  fs.mkdirSync(
    path.join(project, '.agent-governance/role-assignments'),
    { recursive: true },
  );
  fs.mkdirSync(path.join(project, '.agent-governance/local'), {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(project, '.agent-governance/.gitignore'),
    'local/\n',
    'utf8',
  );
  for (const relative of [
    'risk-profile.json',
    'source-lock.json',
    'role-assignments/TASK-001.json',
  ]) {
    const source = path.join(LOW_RISK_FIXTURE, ...relative.split('/'));
    const target = path.join(
      project,
      '.agent-governance',
      ...relative.split('/'),
    );
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(source, target);
  }
  writeJson(path.join(project, '.agent-governance/packs.lock.json'), {
    schemaVersion: 1,
    packs: [],
  });
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  return { sandbox, project, isolatedHome };
}

export function readRiskProfile(project) {
  return readJson(
    path.join(project, '.agent-governance/risk-profile.json'),
  );
}

export function writeRiskProfile(project, value, lineEnding = '\n') {
  writeJson(
    path.join(project, '.agent-governance/risk-profile.json'),
    value,
    lineEnding,
  );
}

export function readAssignment(project, taskId = 'TASK-001') {
  return readJson(
    path.join(
      project,
      '.agent-governance/role-assignments',
      `${taskId}.json`,
    ),
  );
}

export function writeAssignment(project, value, lineEnding = '\n') {
  writeJson(
    path.join(
      project,
      '.agent-governance/role-assignments',
      `${value.taskId}.json`,
    ),
    value,
    lineEnding,
  );
}

export function makeHighRisk(project) {
  const profile = readRiskProfile(project);
  profile.permissionCeiling = {
    'filesystem.project-read': 'allow',
    'filesystem.project-write': 'constrained-allow',
    'filesystem.root-write': 'deny',
    network: 'deny',
    credentials: 'deny',
    publish: 'require-human-approval',
    delete: 'deny',
  };
  profile.tasks[0] = {
    ...profile.tasks[0],
    dataClasses: ['restricted'],
    surfaces: ['credential', 'network', 'publish'],
    sideEffects: ['publish'],
    triggerFlags: {
      ...profile.tasks[0].triggerFlags,
      consequential: true,
      restrictedAuthoritySurface: true,
      threeOrMoreDomains: true,
    },
    requestedCapabilities: [
      'filesystem.project-read',
      'filesystem.project-write',
      'network',
      'credentials',
      'publish',
    ],
    requiredEvidence: ['EVD-RESTRICTED', 'EVD-PUBLISH-APPROVAL'],
    riskLevel: 'high',
    needsDeliberation: true,
    reasonCodes: [
      'RISK_RESTRICTED_DATA',
      'RISK_CREDENTIAL_ACCESS',
      'RISK_PUBLISH_SIDE_EFFECT',
    ],
  };
  writeRiskProfile(project, profile);

  const assignment = readAssignment(project);
  assignment.permissionCeiling = clone(profile.permissionCeiling);
  assignment.selectedRoles = [
    {
      ...assignment.selectedRoles[0],
      requestedCapabilities: clone(
        profile.tasks[0].requestedCapabilities,
      ),
    },
    {
      ...clone(assignment.selectedRoles[0]),
      responsibility: 'risk-reviewer',
      specialistRoleId: 'builtin/risk-reviewer',
      requestedCapabilities: [],
      reviewResponsibility: ['security', 'credentials', 'network'],
      cannotApprove: false,
      reasonCodes: ['ROLE_HIGH_RISK_REVIEW'],
    },
    {
      ...clone(assignment.selectedRoles[0]),
      responsibility: 'evidence-verifier',
      specialistRoleId: 'builtin/evidence-verifier',
      requestedCapabilities: [],
      reviewResponsibility: ['final-evidence', 'publish'],
      cannotApprove: false,
      reasonCodes: ['ROLE_PUBLISH_EVIDENCE_REVIEW'],
    },
  ].map((role) => ({
    ...role,
    grantedCapabilityCeiling: clone(profile.permissionCeiling),
  }));
  assignment.reasonCodes = [
    'ROLE_HIGH_RISK_REVIEW',
    'ROLE_RESTRICTED_DATA_REVIEW',
    'ROLE_CREDENTIAL_REVIEW',
    'ROLE_PUBLISH_EVIDENCE_REVIEW',
  ];
  assignment.separationOfDuties = {
    required: true,
    implementationOwner: 'builtin/implementation-owner',
    finalVerifier: 'builtin/evidence-verifier',
    rules: [
      {
        responsibility: 'implementation-owner',
        cannotApprove: ['final-evidence', 'publish', 'security'],
      },
    ],
  };
  assignment.selectedRoles[0].cannotApprove = true;
  writeAssignment(project, assignment);
  return { profile, assignment };
}

export function installPack(
  project,
  {
    effect,
    capability,
    controlId = 'POL-PACK-001',
    scope = 'all',
    mechanicalChecks = [],
    humanReviewChecks = [],
  },
) {
  const relative = '.agent-governance/packs/test-pack.json';
  const source = {
    sourceId: 'SRC-PACK',
    repository: 'https://example.com/governseed/test-pack.git',
    revision: PACK_COMMIT,
    license: 'MIT',
    importedMode: 'metadata',
    sha256: PACK_SHA256,
  };
  const pack = {
    schemaVersion: 1,
    packId: 'test-pack',
    version: '1.0.0',
    source,
    status: 'active',
    controls: [{ controlId, effect, capability, scope }],
    mechanicalChecks,
    humanReviewChecks,
    carryingCost: {
      level: 'low',
      description: 'Synthetic compiler fixture.',
    },
    retirementCondition: 'Retire when the fixture no longer covers a contract.',
  };
  writeJson(governancePath(project, relative), pack);
  writeJson(
    path.join(project, '.agent-governance/packs.lock.json'),
    {
      schemaVersion: 1,
      packs: [
        {
          packId: pack.packId,
          version: pack.version,
          status: pack.status,
          artifact: relative,
          source,
        },
      ],
    },
  );
  const lockFile = path.join(
    project,
    '.agent-governance/source-lock.json',
  );
  const lock = readJson(lockFile);
  lock.sources.push({
    sourceId: source.sourceId,
    repository: source.repository,
    commit: source.revision,
    license: source.license,
    importedFiles: [relative],
    importedMode: source.importedMode,
    sha256: source.sha256,
    attributionRequired: false,
    fetchedAt: FIXED_TIME,
  });
  writeJson(lockFile, lock);
  return { relative, pack };
}

export function makeRuntimeGuard(state) {
  const marker = path.join(state.sandbox, 'forbidden-runtime-attempted');
  const guard = path.join(state.sandbox, 'policy-local-only-guard.cjs');
  fs.writeFileSync(
    guard,
    `
const fs = require('node:fs');
const moduleApi = require('node:module');
const marker = process.env.GOVERNSEED_TEST_GUARD_MARKER;
const codexHome = require('node:path').join(process.env.HOME, '.codex');
const appendMarker = fs.appendFileSync.bind(fs);
function record(name) {
  appendMarker(marker, name + '\\n');
  throw new Error('forbidden operation: ' + name);
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
  for (const method of methods) target[method] = () => record(moduleName + '.' + method);
}
for (const method of [
  'appendFileSync',
  'linkSync',
  'lstatSync',
  'mkdirSync',
  'openSync',
  'readFileSync',
  'readdirSync',
  'realpathSync',
  'renameSync',
  'rmdirSync',
  'statSync',
  'unlinkSync',
  'writeFileSync'
]) {
  const original = fs[method].bind(fs);
  fs[method] = (...args) => {
    const blocked = args.some((candidate) => (
      typeof candidate === 'string'
      && (
        candidate === codexHome
        || candidate.startsWith(codexHome + require('node:path').sep)
      )
    ));
    if (blocked) {
      return record('user-global.' + method);
    }
    return original(...args);
  };
}
globalThis.fetch = () => record('fetch');
moduleApi.syncBuiltinESMExports();
`,
    'utf8',
  );
  return { guard, marker };
}

export function runCli(state, args, options = {}) {
  const env = {
    ...process.env,
    HOME: state.isolatedHome,
    USERPROFILE: state.isolatedHome,
    XDG_CONFIG_HOME: path.join(state.isolatedHome, '.config'),
    APPDATA: path.join(state.isolatedHome, 'AppData/Roaming'),
    GOVERNSEED_COMPILE_TIME: FIXED_TIME,
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

export function runDoctor(state, args = []) {
  return spawnSync(
    process.execPath,
    [DOCTOR, ...args, state.project],
    {
      cwd: ROOT,
      encoding: 'utf8',
      shell: false,
      env: {
        ...process.env,
        HOME: state.isolatedHome,
        USERPROFILE: state.isolatedHome,
      },
      maxBuffer: 4 * 1024 * 1024,
    },
  );
}

export function parseSingleJson(result, expectedExit) {
  assert.equal(
    result.status,
    expectedExit,
    `unexpected exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  const trimmed = result.stdout.trim();
  assert.notEqual(trimmed, '');
  const output = JSON.parse(trimmed);
  assert.equal(Array.isArray(output), false);
  assert.equal(typeof output, 'object');
  assert.equal(output.schemaVersion, 1);
  assert.equal(Array.isArray(output.findings), true);
  return output;
}

export function compileArgs(project, ...extra) {
  return [
    'compile',
    project,
    '--target',
    'codex',
    ...extra,
    '--json',
  ];
}
