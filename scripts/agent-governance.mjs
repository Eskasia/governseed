#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  canonicalJson,
  readJsonArtifact,
  sha256Canonical,
  validateArtifact,
  writeJsonArtifact,
} from './lib/governance-artifacts.mjs';
import {
  applyPackConstraints,
  applyRoleOverride,
  assessRiskProfile,
  buildDeliberationPlan,
  buildRoleAssignment,
  catalogPrivilegeExpansion,
  normalizeImportedResult,
  validateDecisionRecord,
  validateDeliberationImport,
  validateHumanConfirmation,
} from './lib/decision-role-core.mjs';

const EXIT = Object.freeze({
  OK: 0,
  NEEDS_INPUT: 1,
  USAGE: 2,
  INVALID: 3,
  BLOCKED: 4,
  IO: 5,
});

const SECURITY_CODES = new Set([
  'DECISION_REFERENCE_MISSING',
  'DELIBERATION_CONFIRMATION_HASH_MISMATCH',
  'DELIBERATION_CONFIRMATION_INVALID',
  'DELIBERATION_DECISION_HASH_MISMATCH',
  'DELIBERATION_HASH_MISMATCH',
  'DELIBERATION_IMPORT_APPROVAL_BLOCKED',
  'DELIBERATION_PLAN_IMMUTABLE',
  'DELIBERATION_PLAN_HASH_MISMATCH',
  'DELIBERATION_RESULT_HASH_MISMATCH',
  'DELIBERATION_RESULT_IMMUTABLE',
  'DELIBERATION_SOURCE_MISMATCH',
  'DELIBERATION_VERSION_MISMATCH',
  'GOVERNANCE_PACK_INVALID',
  'INVALID_STATUS_TRANSITION',
  'PATH_ESCAPE_BLOCKED',
  'PRIVATE_CONTENT_BLOCKED',
  'ROLE_ASSIGNMENT_IMMUTABLE',
  'ROLE_CATALOG_INVALID',
  'ROLE_PRIVILEGE_EXPANSION',
  'ROLE_SEPARATION_VIOLATION',
  'SECRET_VALUE_BLOCKED',
  'SOURCE_HASH_MISSING',
  'SOURCE_LICENSE_MISSING',
  'SOURCE_PROVENANCE_MISMATCH',
  'SOURCE_REVISION_UNPINNED',
  'SYMLINK_BLOCKED',
  'TASK_REFERENCE_MISSING',
]);

const COMMAND_OPTIONS = Object.freeze({
  assess: new Set(['--task']),
  'deliberate.plan': new Set(['--decision']),
  'deliberate.import': new Set(['--file']),
  'deliberate.confirm': new Set(['--decision', '--file']),
  'roles.assign': new Set(['--task', '--catalog', '--override']),
  'pack.list': new Set(),
});
const REQUIRED_OPTIONS = Object.freeze({
  assess: [],
  'deliberate.plan': ['--decision'],
  'deliberate.import': ['--file'],
  'deliberate.confirm': ['--decision', '--file'],
  'roles.assign': ['--task'],
  'pack.list': [],
});

function usage() {
  console.log('GovernSeed — Governance foundations for agent-native projects.');
  console.log('Command: agent-governance');
  console.log();
  console.log('Usage: agent-governance <command> <project> [options]');
  console.log();
  console.log('Commands:');
  console.log('  assess');
  console.log('  deliberate plan|import|confirm');
  console.log('  roles assign');
  console.log('  pack list');
  process.exit(0);
}

class CliFailure extends Error {
  constructor(exitCode, code, status = 'blocked', subject = 'governance-artifact') {
    super(code);
    this.exitCode = exitCode;
    this.code = code;
    this.status = status;
    this.subject = subject;
  }
}

function finding(code, subject = 'governance-artifact') {
  return {
    code,
    subject,
    severity: SECURITY_CODES.has(code) ? 'error' : 'warning',
    message: 'The governed operation did not satisfy its closed local contract.',
  };
}

function envelope({
  ok,
  command,
  code,
  status,
  artifact = null,
  result = {},
  findings = [],
}) {
  return {
    schemaVersion: 1,
    ok,
    command,
    code,
    status,
    artifact,
    result,
    findings,
  };
}

function emit(output, json) {
  let validation;
  try {
    validation = validateArtifact(
      'cli-output.schema.json',
      output,
      {},
    );
  } catch {
    validation = { valid: false };
  }
  if (!validation.valid) {
    const safe = envelope({
      ok: false,
      command: output.command || 'unknown',
      code: 'CLI_OUTPUT_INVALID',
      status: 'invalid',
      findings: [finding('CLI_OUTPUT_INVALID')],
    });
    process.stdout.write(`${JSON.stringify(safe, null, 2)}\n`);
    return false;
  }
  if (json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return true;
  }
  process.stdout.write(`${output.command}: ${output.status} (${output.code})\n`);
  return true;
}

function projectRelative(...parts) {
  return parts.join('/').replaceAll(/\/+/gu, '/');
}

function commandName(argv) {
  if (argv[0] === 'deliberate' && argv[1]) return `deliberate.${argv[1]}`;
  if (argv[0] === 'roles' && argv[1]) return `roles.${argv[1]}`;
  if (argv[0] === 'pack' && argv[1]) return `pack.${argv[1]}`;
  return argv[0] || 'unknown';
}

function parseCommand(argv) {
  const json = argv.includes('--json');
  const name = commandName(argv);
  const allowedOptions = COMMAND_OPTIONS[name];
  const commandWords = name.includes('.') ? 2 : 1;
  const values = new Map();
  let project = null;
  const usage = () => {
    throw Object.assign(
      new CliFailure(EXIT.USAGE, 'CLI_USAGE_ERROR', 'usage'),
      { command: name, json },
    );
  };
  if (!allowedOptions || argv.filter((arg) => arg === '--json').length > 1) {
    usage();
  }
  for (let index = commandWords; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--json') continue;
    if (argument.startsWith('--')) {
      if (!allowedOptions.has(argument) || values.has(argument)) usage();
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) usage();
      values.set(argument, value);
      index += 1;
      continue;
    }
    if (project !== null) usage();
    project = path.resolve(argument);
  }
  if (
    !project
    || REQUIRED_OPTIONS[name].some((option) => !values.has(option))
  ) {
    usage();
  }
  return {
    name,
    json,
    project,
    taskId: values.get('--task') ?? null,
    decisionId: values.get('--decision') ?? null,
    file: values.get('--file') ?? null,
    catalog: values.get('--catalog') ?? null,
    override: values.get('--override') ?? null,
  };
}

function ensureProject(project) {
  let realProject;
  try {
    realProject = fs.realpathSync(project);
  } catch {
    throw new CliFailure(EXIT.IO, 'PROJECT_IO_FAILED', 'io-error');
  }
  const stat = fs.lstatSync(realProject);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new CliFailure(EXIT.IO, 'PROJECT_IO_FAILED', 'io-error');
  }
  return realProject;
}

function validateOrThrow(schemaName, value, context = {}, fallback = 'ARTIFACT_INVALID') {
  const validation = validateArtifact(schemaName, value, context);
  if (validation.valid) return;
  const code = validation.errors[0]?.code ?? fallback;
  const exitCode = SECURITY_CODES.has(code) ? EXIT.BLOCKED : EXIT.INVALID;
  throw new CliFailure(
    exitCode,
    code,
    exitCode === EXIT.BLOCKED ? 'blocked' : 'invalid',
  );
}

function boundedAbsolutePath(project, relativePath) {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || /^~[\\/]/u.test(relativePath)
  ) {
    return null;
  }
  const segments = relativePath.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '..')) return null;
  return path.join(
    project,
    ...segments.filter((segment) => segment !== '' && segment !== '.'),
  );
}

function safeRead(project, relativePath) {
  const absolute = boundedAbsolutePath(project, relativePath);
  if (absolute) {
    try {
      fs.lstatSync(absolute);
    } catch (error) {
      if (error?.code === 'ENOENT') {
        throw new CliFailure(
          EXIT.IO,
          'ARTIFACT_NOT_FOUND',
          'io-error',
        );
      }
    }
  }
  try {
    return readJsonArtifact(project, relativePath);
  } catch (error) {
    if (error?.code) {
      const exitCode = SECURITY_CODES.has(error.code)
        ? EXIT.BLOCKED
        : error.code === 'ARTIFACT_NOT_FOUND'
          ? EXIT.IO
          : EXIT.INVALID;
      throw new CliFailure(
        exitCode,
        error.code,
        exitCode === EXIT.BLOCKED
          ? 'blocked'
          : exitCode === EXIT.IO
            ? 'io-error'
            : 'invalid',
      );
    }
    throw new CliFailure(EXIT.IO, 'PROJECT_IO_FAILED', 'io-error');
  }
}

function safeReadOptional(project, relativePath) {
  try {
    return {
      exists: true,
      value: safeRead(project, relativePath),
    };
  } catch (error) {
    if (
      error instanceof CliFailure
      && error.code === 'ARTIFACT_NOT_FOUND'
    ) {
      return { exists: false, value: null };
    }
    throw error;
  }
}

function safeWrite(project, relativePath, value, options = {}) {
  try {
    writeJsonArtifact(project, relativePath, value, options);
  } catch (error) {
    if (error?.code) {
      const exitCode = SECURITY_CODES.has(error.code)
        ? EXIT.BLOCKED
        : EXIT.IO;
      throw new CliFailure(
        exitCode,
        error.code,
        exitCode === EXIT.BLOCKED ? 'blocked' : 'io-error',
      );
    }
    throw new CliFailure(EXIT.IO, 'PROJECT_IO_FAILED', 'io-error');
  }
}

function persistImmutable(project, relativePath, value, conflictCode, subject) {
  const current = safeReadOptional(project, relativePath);
  if (current.exists) {
    if (canonicalJson(current.value) !== canonicalJson(value)) {
      throw new CliFailure(EXIT.BLOCKED, conflictCode, 'blocked', subject);
    }
    return current.value;
  }
  safeWrite(project, relativePath, value);
  return value;
}

function resultHashMatches(result, { required = false } = {}) {
  if (
    !result
    || typeof result !== 'object'
  ) {
    return false;
  }
  if (result.resultSha256 === undefined) return !required;
  if (typeof result.resultSha256 !== 'string') return false;
  const hashable = structuredClone(result);
  delete hashable.resultSha256;
  hashable.importStatus = 'imported';
  return result.resultSha256 === sha256Canonical(hashable);
}

function assess(command) {
  const relative = '.agent-governance/risk-profile.json';
  const profile = safeRead(command.project, relative);
  validateOrThrow('risk-profile.schema.json', profile, {}, 'RISK_PROFILE_INVALID');
  const assessed = assessRiskProfile(profile, command.taskId);
  if (!assessed.ok) {
    const exitCode = assessed.status === 'needs-input'
      ? EXIT.NEEDS_INPUT
      : EXIT.BLOCKED;
    return {
      exitCode,
      output: envelope({
        ok: false,
        command: command.name,
        code: assessed.code,
        status: assessed.status,
        result: assessed.result ?? {},
        findings: [finding(assessed.code, command.taskId ?? 'risk-profile')],
      }),
    };
  }
  validateOrThrow('risk-profile.schema.json', assessed.profile);
  safeWrite(command.project, relative, assessed.profile, {
    allowReplace: true,
  });
  return {
    exitCode: EXIT.OK,
    output: envelope({
      ok: true,
      command: command.name,
      code: 'OK',
      status: 'assessed',
      artifact: relative,
      result: assessed.profile,
    }),
  };
}

function readDecision(project, decisionId) {
  if (!/^DEC-\d{3,}$/u.test(decisionId ?? '')) {
    throw new CliFailure(
      EXIT.BLOCKED,
      'DECISION_REFERENCE_MISSING',
      'blocked',
      'decision-record',
    );
  }
  const relative = projectRelative(
    '.agent-governance',
    'decisions',
    decisionId,
    'decision.json',
  );
  const stored = safeReadOptional(project, relative);
  if (!stored.exists) {
    throw new CliFailure(
      EXIT.BLOCKED,
      'DECISION_REFERENCE_MISSING',
      'blocked',
      decisionId,
    );
  }
  const decision = stored.value;
  const errors = validateDecisionRecord(decision, decisionId);
  if (errors.length > 0) {
    throw new CliFailure(
      EXIT.INVALID,
      errors[0].code,
      'invalid',
      decisionId,
    );
  }
  return decision;
}

function deliberatePlan(command) {
  if (!command.decisionId) {
    throw new CliFailure(EXIT.USAGE, 'CLI_USAGE_ERROR', 'usage');
  }
  const decision = readDecision(command.project, command.decisionId);
  if (!decision.needsDeliberation) {
    return {
      exitCode: EXIT.OK,
      output: envelope({
        ok: true,
        command: command.name,
        code: 'DELIBERATION_NOT_REQUIRED',
        status: 'not-required',
        result: {
          decisionId: decision.decisionId,
          needsDeliberation: false,
          reasonCodes: ['DELIBERATION_NOT_REQUIRED'],
        },
      }),
    };
  }
  const plan = buildDeliberationPlan(decision, { sha256Canonical });
  validateOrThrow(
    'deliberation-plan.schema.json',
    plan,
    {
      knownDecisionIds: [decision.decisionId],
      decision,
      plan,
    },
  );
  const relative = projectRelative(
    '.agent-governance',
    'decisions',
    decision.decisionId,
    'deliberation-plan.json',
  );
  persistImmutable(
    command.project,
    relative,
    plan,
    'DELIBERATION_PLAN_IMMUTABLE',
    decision.decisionId,
  );
  return {
    exitCode: EXIT.OK,
    output: envelope({
      ok: true,
      command: command.name,
      code: 'OK',
      status: 'planned',
      artifact: relative,
      result: plan,
    }),
  };
}

function deliberateImport(command) {
  if (!command.file) {
    throw new CliFailure(EXIT.USAGE, 'CLI_USAGE_ERROR', 'usage');
  }
  const candidate = safeRead(command.project, command.file);
  if (
    candidate?.importStatus === 'human-confirmed'
    || Object.hasOwn(candidate ?? {}, 'humanConfirmation')
    || Object.hasOwn(candidate ?? {}, 'confirmation')
  ) {
    throw new CliFailure(
      EXIT.BLOCKED,
      'DELIBERATION_IMPORT_APPROVAL_BLOCKED',
      'blocked',
    );
  }
  const decision = readDecision(command.project, candidate?.decisionId);
  const planRelative = projectRelative(
    '.agent-governance',
    'decisions',
    decision.decisionId,
    'deliberation-plan.json',
  );
  const plan = safeRead(command.project, planRelative);
  validateOrThrow('deliberation-plan.schema.json', plan, {
    knownDecisionIds: [decision.decisionId],
    decision,
    plan,
  });
  const mismatch = validateDeliberationImport(candidate, decision, plan);
  if (mismatch) {
    throw new CliFailure(EXIT.BLOCKED, mismatch, 'blocked', decision.decisionId);
  }
  if (!resultHashMatches(candidate)) {
    throw new CliFailure(
      EXIT.BLOCKED,
      'DELIBERATION_RESULT_HASH_MISMATCH',
      'blocked',
      decision.decisionId,
    );
  }
  validateOrThrow('deliberation-result.schema.json', candidate, {
    knownDecisionIds: [decision.decisionId],
    decision,
    plan,
    operation: 'import',
  });
  const imported = normalizeImportedResult(candidate, { sha256Canonical });
  const relative = projectRelative(
    '.agent-governance',
    'decisions',
    decision.decisionId,
    'deliberation-result.json',
  );
  persistImmutable(
    command.project,
    relative,
    imported,
    'DELIBERATION_RESULT_IMMUTABLE',
    decision.decisionId,
  );
  return {
    exitCode: EXIT.OK,
    output: envelope({
      ok: true,
      command: command.name,
      code: 'OK',
      status: 'imported',
      artifact: relative,
      result: imported,
    }),
  };
}

function deliberateConfirm(command) {
  if (!command.file || !command.decisionId) {
    throw new CliFailure(EXIT.USAGE, 'CLI_USAGE_ERROR', 'usage');
  }
  const decision = readDecision(command.project, command.decisionId);
  const base = projectRelative(
    '.agent-governance',
    'decisions',
    decision.decisionId,
  );
  const plan = safeRead(
    command.project,
    projectRelative(base, 'deliberation-plan.json'),
  );
  const result = safeRead(
    command.project,
    projectRelative(base, 'deliberation-result.json'),
  );
  const confirmation = safeRead(command.project, command.file);
  validateOrThrow('deliberation-plan.schema.json', plan, {
    knownDecisionIds: [decision.decisionId],
    decision,
    plan,
  });
  validateOrThrow('deliberation-result.schema.json', result, {
    knownDecisionIds: [decision.decisionId],
    decision,
    plan,
    operation: 'stored',
    humanConfirmation: confirmation,
  });
  if (!resultHashMatches(result, { required: true })) {
    throw new CliFailure(
      EXIT.BLOCKED,
      'DELIBERATION_RESULT_HASH_MISMATCH',
      'blocked',
      decision.decisionId,
    );
  }
  const code = validateHumanConfirmation(confirmation, {
    decision,
    plan,
    result,
  });
  if (code) {
    throw new CliFailure(EXIT.BLOCKED, code, 'blocked', decision.decisionId);
  }
  const relative = projectRelative(base, 'human-confirmation.json');
  persistImmutable(
    command.project,
    relative,
    confirmation,
    'DELIBERATION_CONFIRMATION_INVALID',
    decision.decisionId,
  );
  const confirmedResult = {
    ...result,
    importStatus: 'human-confirmed',
  };
  validateOrThrow('deliberation-result.schema.json', confirmedResult, {
    knownDecisionIds: [decision.decisionId],
    decision,
    plan,
    operation: 'stored',
    humanConfirmation: confirmation,
  });
  safeWrite(
    command.project,
    projectRelative(base, 'deliberation-result.json'),
    confirmedResult,
    { allowReplace: true },
  );
  return {
    exitCode: EXIT.OK,
    output: envelope({
      ok: true,
      command: command.name,
      code: 'OK',
      status: 'human-confirmed',
      artifact: relative,
      result: confirmation,
    }),
  };
}

function artifactSourceMatchesLock(source, sourceLock, artifactPath) {
  const normalizedArtifactPath = artifactPath.replaceAll('\\', '/');
  const row = sourceLock?.sources?.find(
    (candidate) => candidate.sourceId === source?.sourceId,
  );
  return Boolean(
    row
    && row.repository === source.repository
    && row.commit === source.revision
    && row.license === source.license
    && row.importedMode === source.importedMode
    && row.sha256 === source.sha256
    && row.importedFiles.includes(normalizedArtifactPath),
  );
}

function loadActivePacks(project) {
  const lockState = safeReadOptional(
    project,
    '.agent-governance/packs.lock.json',
  );
  if (!lockState.exists) {
    return { packs: [], sourceLock: null };
  }
  const lock = lockState.value;
  if (
    lock?.schemaVersion !== 1
    || !Array.isArray(lock.packs)
    || new Set(lock.packs.map((pack) => pack?.packId)).size
      !== lock.packs.length
  ) {
    throw new CliFailure(
      EXIT.BLOCKED,
      'GOVERNANCE_PACK_INVALID',
      'blocked',
    );
  }
  const active = lock.packs.filter((pack) => pack?.status === 'active');
  if (active.length === 0) {
    return { packs: [], sourceLock: null };
  }
  const sourceLock = safeRead(
    project,
    '.agent-governance/source-lock.json',
  );
  validateOrThrow('source-lock.schema.json', sourceLock);
  const packs = active.map((summary) => {
    if (
      typeof summary.artifact !== 'string'
      || typeof summary.source !== 'object'
    ) {
      throw new CliFailure(
        EXIT.BLOCKED,
        'GOVERNANCE_PACK_INVALID',
        'blocked',
        summary?.packId ?? 'governance-pack',
      );
    }
    const pack = safeRead(project, summary.artifact);
    validateOrThrow(
      'governance-pack.schema.json',
      pack,
      { sourceLock, artifactPath: summary.artifact },
      'GOVERNANCE_PACK_INVALID',
    );
    if (
      pack.packId !== summary.packId
      || pack.version !== summary.version
      || pack.status !== summary.status
      || canonicalJson(pack.source) !== canonicalJson(summary.source)
      || !artifactSourceMatchesLock(
        pack.source,
        sourceLock,
        summary.artifact,
      )
    ) {
      throw new CliFailure(
        EXIT.BLOCKED,
        'SOURCE_PROVENANCE_MISMATCH',
        'blocked',
        summary.packId,
      );
    }
    return pack;
  });
  return { packs, sourceLock };
}

function rolesAssign(command) {
  if (!command.taskId) {
    throw new CliFailure(EXIT.USAGE, 'CLI_USAGE_ERROR', 'usage');
  }
  const profile = safeRead(
    command.project,
    '.agent-governance/risk-profile.json',
  );
  validateOrThrow(
    'risk-profile.schema.json',
    profile,
    {},
    'RISK_PROFILE_INVALID',
  );
  const task = profile.tasks.find((candidate) => candidate.taskId === command.taskId);
  if (!task) {
    throw new CliFailure(
      EXIT.BLOCKED,
      'TASK_REFERENCE_MISSING',
      'blocked',
      command.taskId,
    );
  }

  const packState = loadActivePacks(command.project);
  const packConstraints = applyPackConstraints(
    profile.permissionCeiling,
    packState.packs,
    command.taskId,
  );
  const effectiveProfile = {
    ...profile,
    sourceRefs: [
      ...profile.sourceRefs,
      ...packConstraints.constraintRefs,
    ],
    permissionCeiling: packConstraints.permissionCeiling,
  };

  let catalog = null;
  let sourceLock = packState.sourceLock;
  if (command.catalog) {
    catalog = safeRead(command.project, command.catalog);
    sourceLock ??= safeRead(
      command.project,
      '.agent-governance/source-lock.json',
    );
    validateOrThrow('source-lock.schema.json', sourceLock);
    if (!catalog?.source?.revision) {
      throw new CliFailure(
        EXIT.BLOCKED,
        'SOURCE_REVISION_UNPINNED',
        'blocked',
        command.taskId,
      );
    }
    if (!catalog.source.license) {
      throw new CliFailure(
        EXIT.BLOCKED,
        'SOURCE_LICENSE_MISSING',
        'blocked',
        command.taskId,
      );
    }
    if (!catalog.source.sha256) {
      throw new CliFailure(
        EXIT.BLOCKED,
        'SOURCE_HASH_MISSING',
        'blocked',
        command.taskId,
      );
    }
    if (!artifactSourceMatchesLock(
      catalog.source,
      sourceLock,
      command.catalog,
    )) {
      throw new CliFailure(
        EXIT.BLOCKED,
        'ROLE_CATALOG_INVALID',
        'blocked',
        command.taskId,
      );
    }
    validateOrThrow('role-catalog.schema.json', catalog, { sourceLock });
    const expansion = catalogPrivilegeExpansion(
      catalog,
      effectiveProfile.permissionCeiling,
    );
    if (expansion) {
      throw new CliFailure(
        EXIT.BLOCKED,
        'ROLE_PRIVILEGE_EXPANSION',
        'blocked',
        command.taskId,
      );
    }
  }

  const relative = projectRelative(
    '.agent-governance',
    'role-assignments',
    `${command.taskId}.json`,
  );
  let assigned;
  if (command.override) {
    const current = safeRead(command.project, relative);
    validateOrThrow('role-assignment.schema.json', current, {
      knownTaskIds: profile.tasks.map((entry) => entry.taskId),
      riskProfile: effectiveProfile,
      sourceLock,
      roleCatalog: catalog,
      roleCatalogPath: command.catalog,
    });
    const override = safeRead(command.project, command.override);
    assigned = applyRoleOverride(
      current,
      override,
      effectiveProfile,
      task,
    );
  } else {
    assigned = buildRoleAssignment(effectiveProfile, command.taskId, {
      catalog,
      catalogPath: command.catalog,
      constraintReasonCodes: packConstraints.reasonCodes,
    });
    const current = safeReadOptional(command.project, relative);
    if (assigned.ok && current.exists) {
      if (
        current.value.revision === 1
        && current.value.humanOverride === null
        && canonicalJson(current.value) === canonicalJson(assigned.assignment)
      ) {
        assigned.assignment = current.value;
      } else if (
        current.value.revision > 1
        && current.value.humanOverride
      ) {
        const requiredResponsibilities = new Set(
          assigned.assignment.selectedRoles.map(
            (role) => role.responsibility,
          ),
        );
        const currentResponsibilities = new Set(
          (current.value.selectedRoles ?? []).map(
            (role) => role.responsibility,
          ),
        );
        if (
          [...requiredResponsibilities].every(
            (responsibility) => currentResponsibilities.has(responsibility),
          )
        ) {
          assigned.assignment = current.value;
        } else {
          throw new CliFailure(
            EXIT.BLOCKED,
            'ROLE_ASSIGNMENT_IMMUTABLE',
            'blocked',
            command.taskId,
          );
        }
      } else {
        throw new CliFailure(
          EXIT.BLOCKED,
          'ROLE_ASSIGNMENT_IMMUTABLE',
          'blocked',
          command.taskId,
        );
      }
    }
  }
  if (!assigned.ok) {
    const exitCode = assigned.status === 'needs-human-selection'
      || assigned.status === 'needs-input'
      ? EXIT.NEEDS_INPUT
      : EXIT.BLOCKED;
    return {
      exitCode,
      output: envelope({
        ok: false,
        command: command.name,
        code: assigned.code,
        status: assigned.status,
        result: assigned.result ?? {},
        findings: [finding(assigned.code, command.taskId)],
      }),
    };
  }
  validateOrThrow('role-assignment.schema.json', assigned.assignment, {
    knownTaskIds: profile.tasks.map((entry) => entry.taskId),
    riskProfile: effectiveProfile,
    sourceLock,
    roleCatalog: catalog,
    roleCatalogPath: command.catalog,
  });
  const current = safeReadOptional(command.project, relative);
  if (
    current.exists
    && canonicalJson(current.value) === canonicalJson(assigned.assignment)
  ) {
    assigned.assignment = current.value;
  } else {
    safeWrite(command.project, relative, assigned.assignment, {
      allowReplace: current.exists && Boolean(command.override),
    });
  }
  return {
    exitCode: EXIT.OK,
    output: envelope({
      ok: true,
      command: command.name,
      code: 'OK',
      status: 'assigned',
      artifact: relative,
      result: assigned.assignment,
    }),
  };
}

function packList(command) {
  const lock = safeRead(command.project, '.agent-governance/packs.lock.json');
  if (
    lock?.schemaVersion !== 1
    || !Array.isArray(lock.packs)
  ) {
    throw new CliFailure(EXIT.INVALID, 'GOVERNANCE_PACK_INVALID', 'invalid');
  }
  return {
    exitCode: EXIT.OK,
    output: envelope({
      ok: true,
      command: command.name,
      code: 'OK',
      status: 'listed',
      result: lock,
    }),
  };
}

function execute(command) {
  switch (command.name) {
    case 'assess':
      return assess(command);
    case 'deliberate.plan':
      return deliberatePlan(command);
    case 'deliberate.import':
      return deliberateImport(command);
    case 'deliberate.confirm':
      return deliberateConfirm(command);
    case 'roles.assign':
      return rolesAssign(command);
    case 'pack.list':
      return packList(command);
    default:
      throw new CliFailure(EXIT.USAGE, 'CLI_USAGE_ERROR', 'usage');
  }
}

const argv = process.argv.slice(2);
if (argv.length === 1 && (argv[0] === '--help' || argv[0] === '-h')) usage();
const requestedJson = argv.includes('--json');
let command = null;
try {
  command = parseCommand(argv);
  command.project = ensureProject(command.project);
  const completed = execute(command);
  const emitted = emit(completed.output, command.json);
  process.exit(emitted ? completed.exitCode : EXIT.INVALID);
} catch (error) {
  const failure = error instanceof CliFailure
    ? error
    : error?.code
      ? new CliFailure(
          SECURITY_CODES.has(error.code) ? EXIT.BLOCKED : EXIT.IO,
          error.code,
          SECURITY_CODES.has(error.code) ? 'blocked' : 'io-error',
        )
      : new CliFailure(EXIT.IO, 'PROJECT_IO_FAILED', 'io-error');
  const output = envelope({
    ok: false,
    command: command?.name ?? error?.command ?? commandName(argv),
    code: failure.code,
    status: failure.status,
    findings: [finding(failure.code, failure.subject)],
  });
  const emitted = emit(
    output,
    command?.json ?? error?.json ?? requestedJson,
  );
  process.exit(emitted ? failure.exitCode : EXIT.INVALID);
}
