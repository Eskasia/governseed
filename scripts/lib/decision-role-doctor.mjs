import fs from 'node:fs';
import path from 'node:path';
import {
  readJsonArtifact,
  sha256Canonical,
  validateArtifact,
} from './governance-artifacts.mjs';
import {
  applyPackConstraints,
  assessTaskRisk,
  validateDecisionRecord,
  validateDeliberationImport,
  validateHumanConfirmation,
} from './decision-role-core.mjs';

const FATAL_CODES = new Set([
  'PATH_ESCAPE_BLOCKED',
  'PRIVATE_CONTENT_BLOCKED',
  'SECRET_VALUE_BLOCKED',
  'SYMLINK_BLOCKED',
]);
const SOURCE_VALIDATION_CODES = new Set([
  'SOURCE_LICENSE_MISSING',
  'SOURCE_REVISION_UNPINNED',
]);
const ROLE_VALIDATION_CODES = new Set([
  'ROLE_CATALOG_INVALID',
  'ROLE_PRIVILEGE_EXPANSION',
  'ROLE_SEPARATION_VIOLATION',
  'TASK_REFERENCE_MISSING',
]);

function finding(code, subject, message) {
  return { code, subject, message };
}

function caughtFinding(error, subject, fallbackCode) {
  const code = error?.code;
  if ([
    'PATH_ESCAPE_BLOCKED',
    'PRIVATE_CONTENT_BLOCKED',
    'SECRET_VALUE_BLOCKED',
    'SYMLINK_BLOCKED',
  ].includes(code)) {
    return finding(code, subject, 'governance artifact was blocked by the local safety policy');
  }
  if ([
    'DUPLICATE_JSON_KEY',
    'FILE_TOO_LARGE',
    'INVALID_UTF8',
    'JSON_LIMIT_EXCEEDED',
  ].includes(code)) {
    return finding(
      'PRIVATE_CONTENT_BLOCKED',
      subject,
      'governance artifact could not be decoded under the bounded privacy contract',
    );
  }
  return finding(
    fallbackCode,
    subject,
    'governance artifact is missing or invalid',
  );
}

function validationFinding(
  validation,
  fallbackCode,
  subject,
  message,
  preferredCodes = new Set(),
) {
  if (validation.valid) return null;
  const preferred = validation.errors.find((error) => (
    preferredCodes.has(error.code)
  ));
  const code = preferred?.code ?? fallbackCode;
  return finding(code, subject, message);
}

function listSafeChildren(projectDir, relativeDirectory, findings) {
  const absolute = path.join(projectDir, ...relativeDirectory.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    findings.push(finding(
      'PATH_ESCAPE_BLOCKED',
      'governance-file',
      'governance directory could not be inspected safely',
    ));
    return [];
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    findings.push(finding(
      'SYMLINK_BLOCKED',
      'governance-file',
      'governance directory must be a contained regular directory',
    ));
    return [];
  }
  let realRoot;
  let realDirectory;
  try {
    realRoot = fs.realpathSync(projectDir);
    realDirectory = fs.realpathSync(absolute);
  } catch {
    findings.push(finding(
      'PATH_ESCAPE_BLOCKED',
      'governance-file',
      'governance directory could not be resolved safely',
    ));
    return [];
  }
  if (
    realDirectory !== realRoot
    && !realDirectory.startsWith(`${realRoot}${path.sep}`)
  ) {
    findings.push(finding(
      'PATH_ESCAPE_BLOCKED',
      'governance-file',
      'governance directory escaped the project root',
    ));
    return [];
  }
  let entries;
  try {
    entries = fs.readdirSync(absolute, { withFileTypes: true });
  } catch {
    findings.push(finding(
      'PATH_ESCAPE_BLOCKED',
      'governance-file',
      'governance directory could not be enumerated safely',
    ));
    return [];
  }
  const safeEntries = [];
  for (const entry of entries) {
    if (entry.name === 'local') continue;
    if (entry.isSymbolicLink()) {
      findings.push(finding(
        'SYMLINK_BLOCKED',
        'governance-file',
        'governance directory contains an unsafe link',
      ));
      continue;
    }
    safeEntries.push(entry);
  }
  return safeEntries.sort((left, right) => left.name.localeCompare(right.name));
}

function verifyLocalBoundary(projectDir, findings) {
  const governance = path.join(projectDir, '.agent-governance');
  const ignoreFile = path.join(governance, '.gitignore');
  let descriptor;
  try {
    const ignoreStat = fs.lstatSync(ignoreFile, { bigint: true });
    if (ignoreStat.isSymbolicLink() || !ignoreStat.isFile()) {
      findings.push(finding(
        'SYMLINK_BLOCKED',
        'governance-file',
        'the local ignore boundary must be a regular file',
      ));
      return;
    }
    if (ignoreStat.size > 64n * 1024n) {
      findings.push(finding(
        'PRIVATE_CONTENT_BLOCKED',
        'governance-file',
        'the local ignore boundary exceeds its byte limit',
      ));
      return;
    }
    const noFollow = Number.isInteger(fs.constants.O_NOFOLLOW)
      ? fs.constants.O_NOFOLLOW
      : 0;
    descriptor = fs.openSync(ignoreFile, fs.constants.O_RDONLY | noFollow);
    const openedStat = fs.fstatSync(descriptor, { bigint: true });
    if (
      !openedStat.isFile()
      || openedStat.size > 64n * 1024n
      || openedStat.dev !== ignoreStat.dev
      || openedStat.ino !== ignoreStat.ino
    ) {
      findings.push(finding(
        'SYMLINK_BLOCKED',
        'governance-file',
        'the local ignore boundary changed during inspection',
      ));
      return;
    }
    const buffer = Buffer.alloc(Number(openedStat.size));
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(
        descriptor,
        buffer,
        offset,
        buffer.length - offset,
        offset,
      );
      if (count === 0) break;
      offset += count;
    }
    const afterStat = fs.lstatSync(ignoreFile, { bigint: true });
    if (
      afterStat.isSymbolicLink()
      || !afterStat.isFile()
      || afterStat.dev !== openedStat.dev
      || afterStat.ino !== openedStat.ino
    ) {
      findings.push(finding(
        'SYMLINK_BLOCKED',
        'governance-file',
        'the local ignore boundary changed during inspection',
      ));
      return;
    }
    const ignore = new TextDecoder('utf-8', { fatal: true }).decode(
      buffer.subarray(0, offset),
    );
    const rules = ignore
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line !== '' && !line.startsWith('#'));
    const ignored = rules.includes('local/') || rules.includes('/local/');
    const unignored = rules.includes('!local/') || rules.includes('!/local/');
    if (!ignored || unignored) {
      findings.push(finding(
        'PRIVATE_CONTENT_BLOCKED',
        'governance-file',
        'the private local surface is not ignored',
      ));
    }
  } catch (error) {
    findings.push(finding(
      error?.code === 'ELOOP' ? 'SYMLINK_BLOCKED' : 'PRIVATE_CONTENT_BLOCKED',
      'governance-file',
      'the private local surface has no verified ignore boundary',
    ));
  } finally {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch {
        // The fail-closed finding above remains authoritative.
      }
    }
  }

  const local = path.join(governance, 'local');
  try {
    const stat = fs.lstatSync(local);
    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      findings.push(finding(
        'SYMLINK_BLOCKED',
        'governance-file',
        'the private local surface must not be a symlink',
      ));
    }
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    findings.push(finding(
      'SYMLINK_BLOCKED',
      'governance-file',
      'the private local surface could not be inspected safely',
    ));
  }
}

function artifactPathState(projectDir, relativePath, findings, subject) {
  const normalized = String(relativePath).replaceAll('\\', '/');
  const segments = normalized.split('/');
  if (
    path.posix.isAbsolute(normalized)
    || path.win32.isAbsolute(normalized)
    || /^~\//u.test(normalized)
    || segments.some((segment) => segment === '..')
  ) {
    findings.push(finding(
      'PATH_ESCAPE_BLOCKED',
      subject,
      'governance artifact path escaped the project boundary',
    ));
    return 'blocked';
  }
  const absolute = path.join(projectDir, ...segments);
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch (error) {
    if (error?.code === 'ENOENT') return 'missing';
    findings.push(finding(
      'PATH_ESCAPE_BLOCKED',
      subject,
      'governance artifact path could not be inspected safely',
    ));
    return 'blocked';
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    findings.push(finding(
      'SYMLINK_BLOCKED',
      subject,
      'governance artifact must be a contained regular file',
    ));
    return 'blocked';
  }
  return 'present';
}

function readArtifact(
  projectDir,
  relativePath,
  findings,
  subject,
  {
    missingCode = null,
    missingMessage = 'governance artifact is missing',
    invalidCode = 'RISK_PROFILE_INVALID',
  } = {},
) {
  const state = artifactPathState(
    projectDir,
    relativePath,
    findings,
    subject,
  );
  if (state !== 'present') {
    if (state === 'missing' && missingCode) {
      findings.push(finding(missingCode, subject, missingMessage));
    }
    return null;
  }
  try {
    return readJsonArtifact(projectDir, relativePath, { subject });
  } catch (error) {
    findings.push(caughtFinding(error, subject, invalidCode));
    return null;
  }
}

function hasTaskReference(taskContract, taskId) {
  return typeof taskContract === 'string' && taskContract.includes(taskId);
}

function inspectActivePacks(projectDir, sourceLock, findings) {
  const relative = '.agent-governance/packs.lock.json';
  const state = artifactPathState(
    projectDir,
    relative,
    findings,
    'packs-lock',
  );
  if (state !== 'present') return [];
  const lock = readArtifact(
    projectDir,
    relative,
    findings,
    'packs-lock',
    { invalidCode: 'SOURCE_REVISION_UNPINNED' },
  );
  if (
    !lock
    || lock.schemaVersion !== 1
    || !Array.isArray(lock.packs)
    || new Set(lock.packs.map((pack) => pack?.packId)).size
      !== lock.packs.length
  ) {
    findings.push(finding(
      'SOURCE_REVISION_UNPINNED',
      'packs-lock',
      'Pack lock is missing a closed, unique source declaration',
    ));
    return [];
  }
  const active = lock.packs.filter((summary) => summary?.status === 'active');
  if (active.length > 0 && !sourceLock) {
    findings.push(finding(
      'SOURCE_REVISION_UNPINNED',
      'packs-lock',
      'active Pack metadata has no pinned source lock',
    ));
    return [];
  }

  const packs = [];
  for (const summary of active) {
    if (
      typeof summary.artifact !== 'string'
      || !summary.source
      || typeof summary.source !== 'object'
    ) {
      findings.push(finding(
        'SOURCE_REVISION_UNPINNED',
        summary?.packId ?? 'packs-lock',
        'active Pack metadata lacks an exact artifact or source',
      ));
      continue;
    }
    const pack = readArtifact(
      projectDir,
      summary.artifact,
      findings,
      summary.packId,
      {
        missingCode: 'SOURCE_REVISION_UNPINNED',
        missingMessage: 'active Pack artifact is missing',
        invalidCode: 'SOURCE_REVISION_UNPINNED',
      },
    );
    if (!pack) continue;
    const validation = validateArtifact(
      'governance-pack.schema.json',
      pack,
      {
        sourceLock,
        artifactPath: summary.artifact,
      },
    );
    if (
      !validation.valid
      || pack.packId !== summary.packId
      || pack.version !== summary.version
      || pack.status !== summary.status
      || sha256Canonical(pack.source) !== sha256Canonical(summary.source)
    ) {
      const code = validation.errors.find((error) => (
        SOURCE_VALIDATION_CODES.has(error.code)
      ))?.code ?? 'SOURCE_REVISION_UNPINNED';
      findings.push(finding(
        code,
        summary.packId,
        'active Pack does not exact-match its pinned artifact and source',
      ));
      continue;
    }
    packs.push(pack);
  }
  return packs;
}

function inspectAssignments(
  projectDir,
  profile,
  sourceLock,
  packs,
  taskContract,
  findings,
) {
  const directory = '.agent-governance/role-assignments';
  const entries = listSafeChildren(projectDir, directory, findings);
  const assignments = new Map();
  const catalogCache = new Map();

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const relative = `${directory}/${entry.name}`;
    const assignment = readArtifact(
      projectDir,
      relative,
      findings,
      entry.name.replace(/\.json$/u, ''),
      {
        missingCode: 'ROLE_ASSIGNMENT_MISSING',
        missingMessage: 'role assignment disappeared during inspection',
        invalidCode: 'ROLE_CATALOG_INVALID',
      },
    );
    if (!assignment) continue;
    assignments.set(assignment.taskId, assignment);

    let roleCatalog = null;
    let roleCatalogPath = null;
    const selectedRoles = Array.isArray(assignment.selectedRoles)
      ? assignment.selectedRoles
      : [];
    for (const role of selectedRoles) {
      if (!role || typeof role !== 'object') continue;
      if (
        role.source === 'builtin'
        || role.sourceCatalog === 'builtin-governance-responsibilities'
      ) continue;
      if (typeof role.sourceCatalog !== 'string') continue;
      const catalogLooksLikePath = (
        role.sourceCatalog.includes('/')
        || role.sourceCatalog.endsWith('.json')
      );
      if (!catalogLooksLikePath) {
        findings.push(finding(
          'ROLE_CATALOG_INVALID',
          assignment.taskId,
          'selected specialist catalog lacks an exact project-local path',
        ));
        continue;
      }
      const normalizedCatalog = role.sourceCatalog.replaceAll('\\', '/');
      if (
        path.posix.isAbsolute(normalizedCatalog)
        || path.win32.isAbsolute(normalizedCatalog)
        || /^~\//u.test(normalizedCatalog)
        || normalizedCatalog.split('/').includes('..')
      ) {
        findings.push(finding(
          'PATH_ESCAPE_BLOCKED',
          assignment.taskId,
          'selected specialist catalog path escaped the project boundary',
        ));
        continue;
      }
      const catalogRelative = normalizedCatalog;
      roleCatalogPath = catalogRelative;
      if (!catalogCache.has(catalogRelative)) {
        catalogCache.set(
          catalogRelative,
          readArtifact(
            projectDir,
            catalogRelative,
            findings,
            assignment.taskId,
            {
              missingCode: 'ROLE_CATALOG_INVALID',
              missingMessage: 'selected specialist catalog is missing',
              invalidCode: 'ROLE_CATALOG_INVALID',
            },
          ),
        );
      }
      roleCatalog = catalogCache.get(catalogRelative);
      if (!roleCatalog) {
        findings.push(finding(
          'ROLE_CATALOG_INVALID',
          assignment.taskId,
          'selected specialist catalog is missing or invalid',
        ));
        continue;
      }
      const catalogValidation = validateArtifact(
        'role-catalog.schema.json',
        roleCatalog,
        { sourceLock },
      );
      if (!catalogValidation.valid) {
        findings.push(finding(
          'ROLE_CATALOG_INVALID',
          assignment.taskId,
          'selected specialist catalog is missing or invalid',
        ));
      }
    }

    const packConstraints = applyPackConstraints(
      profile.permissionCeiling,
      packs,
      assignment.taskId,
    );
    const validation = validateArtifact(
      'role-assignment.schema.json',
      assignment,
      {
        knownTaskIds: profile.tasks.map((task) => task.taskId),
        riskProfile: {
          ...profile,
          permissionCeiling: packConstraints.permissionCeiling,
        },
        sourceLock,
        roleCatalog,
        roleCatalogPath,
      },
    );
    const assignmentErrors = validation.errors;
    if (assignmentErrors.length > 0) {
      const preferred = assignmentErrors.find((error) => (
        ROLE_VALIDATION_CODES.has(error.code)
      ));
      const code = preferred?.code ?? 'ROLE_CATALOG_INVALID';
      findings.push(finding(
        code,
        assignment.taskId ?? 'governance-file',
        'role assignment did not satisfy its closed contract',
      ));
    }

    const implementation = assignment.selectedRoles?.find(
      (role) => role.responsibility === 'implementation-owner',
    );
    const task = profile.tasks.find(
      (candidate) => candidate.taskId === assignment.taskId,
    );
    const highRisk = task?.riskLevel === 'high'
      || assessTaskRisk(task ?? {}).riskLevel === 'high';
    const finalVerifier = assignment.separationOfDuties?.finalVerifier;
    const separationRequired = highRisk
      || (
        typeof finalVerifier === 'string'
        && finalVerifier !== 'none'
      )
      || assignment.selectedRoles?.some((role) => (
        role.responsibility === 'risk-reviewer'
        || role.responsibility === 'evidence-verifier'
      ));
    if (
      separationRequired
      && (
        implementation?.cannotApprove !== true
        || assignment.separationOfDuties?.implementationOwner
          === finalVerifier
      )
    ) {
      findings.push(finding(
        'ROLE_SEPARATION_VIOLATION',
        assignment.taskId,
        'high-risk implementation and final approval are not separated',
      ));
    }
  }

  for (const task of profile.tasks) {
    if (!hasTaskReference(taskContract, task.taskId)) {
      findings.push(finding(
        'TASK_REFERENCE_MISSING',
        task.taskId,
        'risk task does not resolve to the canonical task contract',
      ));
    }
    const assessed = task.riskLevel
      ? { riskLevel: task.riskLevel, status: profile.status }
      : assessTaskRisk(task);
    if (
      task.status === 'active'
      && (profile.status === 'needs-input' || assessed.riskLevel === 'unknown')
    ) {
      findings.push(finding(
        'RISK_INPUT_MISSING',
        task.taskId,
        'active task has incomplete structured risk input',
      ));
    }
    if (
      task.status === 'active'
      && assessed.riskLevel === 'high'
      && !assignments.has(task.taskId)
    ) {
      findings.push(finding(
        'ROLE_ASSIGNMENT_MISSING',
        task.taskId,
        'active high-risk task has no role assignment',
      ));
    }
  }
}

function inspectDecisions(projectDir, findings) {
  const root = '.agent-governance/decisions';
  const entries = listSafeChildren(projectDir, root, findings);
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const decisionId = entry.name;
    const base = `${root}/${decisionId}`;
    const decisionPath = `${base}/decision.json`;
    const planPath = `${base}/deliberation-plan.json`;
    const resultPath = `${base}/deliberation-result.json`;
    const confirmationPath = `${base}/human-confirmation.json`;

    const decision = readArtifact(
      projectDir,
      decisionPath,
      findings,
      decisionId,
      {
        missingCode: 'DECISION_REFERENCE_MISSING',
        missingMessage: 'decision artifacts do not resolve to a decision record',
        invalidCode: 'DELIBERATION_RESULT_INVALID',
      },
    );
    if (!decision) {
      continue;
    }
    const decisionErrors = validateDecisionRecord(decision, decisionId);
    if (decisionErrors.length > 0) {
      findings.push(finding(
        decisionErrors[0].code === 'DECISION_REFERENCE_MISSING'
          ? 'DECISION_REFERENCE_MISSING'
          : 'DELIBERATION_RESULT_INVALID',
        decisionId,
        'decision record did not satisfy its closed contract',
      ));
      continue;
    }
    if (!decision.needsDeliberation) continue;

    const plan = readArtifact(
      projectDir,
      planPath,
      findings,
      decisionId,
      {
        missingCode: 'DELIBERATION_REQUIRED',
        missingMessage: 'triggered decision has no deliberation plan',
        invalidCode: 'DELIBERATION_RESULT_INVALID',
      },
    );
    if (!plan) {
      continue;
    }
    const planValidation = validateArtifact(
      'deliberation-plan.schema.json',
      plan,
      {
        knownDecisionIds: [decisionId],
        decision,
        plan,
      },
    );
    if (!planValidation.valid) {
      const code = planValidation.errors.some(
        (error) => error.code === 'DELIBERATION_VERSION_MISMATCH'
          || error.code === 'DELIBERATION_HASH_MISMATCH',
      )
        ? 'DELIBERATION_VERSION_MISMATCH'
        : 'DELIBERATION_RESULT_INVALID';
      findings.push(finding(
        code,
        decisionId,
        'deliberation plan did not satisfy its closed contract',
      ));
      continue;
    }

    const result = readArtifact(
      projectDir,
      resultPath,
      findings,
      decisionId,
      {
        missingCode: 'DELIBERATION_REQUIRED',
        missingMessage: 'triggered decision has no imported deliberation result',
        invalidCode: 'DELIBERATION_RESULT_INVALID',
      },
    );
    if (!result) {
      continue;
    }
    const confirmation = decision.status === 'active'
      ? readArtifact(
          projectDir,
          confirmationPath,
          findings,
          decisionId,
          { invalidCode: 'DELIBERATION_NOT_HUMAN_CONFIRMED' },
        )
      : null;
    const resultValidation = validateArtifact(
      'deliberation-result.schema.json',
      result,
      {
        knownDecisionIds: [decisionId],
        decision,
        plan,
        operation: 'stored',
        humanConfirmation: confirmation,
      },
    );
    if (!resultValidation.valid) {
      const structurallyInvalid = resultValidation.errors.some(
        (error) => error.code === 'SCHEMA_VALIDATION_FAILED'
          || error.code === 'SCHEMA_VERSION_UNSUPPORTED',
      );
      const code = resultValidation.errors.some(
        (error) => error.code === 'DELIBERATION_NOT_HUMAN_CONFIRMED',
      )
        ? 'DELIBERATION_NOT_HUMAN_CONFIRMED'
        : !structurallyInvalid && resultValidation.errors.some(
            (error) => error.code === 'DELIBERATION_VERSION_MISMATCH'
              || error.code === 'DELIBERATION_HASH_MISMATCH',
          )
          ? 'DELIBERATION_VERSION_MISMATCH'
          : 'DELIBERATION_RESULT_INVALID';
      findings.push(finding(
        code,
        decisionId,
        'deliberation result did not satisfy its closed contract',
      ));
      continue;
    }
    const mismatch = validateDeliberationImport(
      { ...result, importStatus: 'imported' },
      decision,
      plan,
    );
    if (mismatch) {
      findings.push(finding(
        mismatch === 'DELIBERATION_VERSION_MISMATCH'
          ? 'DELIBERATION_VERSION_MISMATCH'
          : 'DELIBERATION_RESULT_INVALID',
        decisionId,
        'deliberation result does not match the stored plan',
      ));
      continue;
    }
    const resultWithoutHash = structuredClone(result);
    delete resultWithoutHash.resultSha256;
    resultWithoutHash.importStatus = 'imported';
    if (
      typeof result.resultSha256 !== 'string'
      || result.resultSha256 !== sha256Canonical(resultWithoutHash)
    ) {
      findings.push(finding(
        'DELIBERATION_RESULT_INVALID',
        decisionId,
        'deliberation result hash does not match its normalized content',
      ));
      continue;
    }

    if (decision.status !== 'active') continue;
    if (result.importStatus !== 'human-confirmed') {
      findings.push(finding(
        'DELIBERATION_NOT_HUMAN_CONFIRMED',
        decisionId,
        'active decision result has not completed the confirmation transition',
      ));
      continue;
    }
    if (
      !confirmation
      || typeof confirmation.confirmationId !== 'string'
      || typeof confirmation.confirmedBy !== 'string'
      || confirmation.confirmedBy.length === 0
      || typeof confirmation.confirmedAt !== 'string'
      || typeof confirmation.statement !== 'string'
      || confirmation.statement.length === 0
      || validateHumanConfirmation(confirmation, {
        decision,
        plan,
        result,
      })
    ) {
      findings.push(finding(
        'DELIBERATION_NOT_HUMAN_CONFIRMED',
        decisionId,
        'active decision lacks an exact declared human confirmation',
      ));
    }
  }
}

export function evaluateDecisionRoleGovernance(projectDir, {
  taskContract = '',
} = {}) {
  const findings = [];
  const governancePath = path.join(projectDir, '.agent-governance');
  let governanceStat;
  try {
    governanceStat = fs.lstatSync(governancePath);
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { findings, fatal: false };
    }
    return {
      findings: [finding(
        'PATH_ESCAPE_BLOCKED',
        'governance-file',
        'governance directory could not be inspected',
      )],
      fatal: true,
    };
  }
  if (governanceStat.isSymbolicLink() || !governanceStat.isDirectory()) {
    return {
      findings: [finding(
        'SYMLINK_BLOCKED',
        'governance-file',
        'governance directory must not be a symlink',
      )],
      fatal: true,
    };
  }

  verifyLocalBoundary(projectDir, findings);
  const profile = readArtifact(
    projectDir,
    '.agent-governance/risk-profile.json',
    findings,
    'risk-profile',
    {
      missingCode: 'RISK_INPUT_MISSING',
      missingMessage: 'project-local risk input is missing',
      invalidCode: 'RISK_PROFILE_INVALID',
    },
  );
  if (!profile) {
    return {
      findings,
      fatal: findings.some((item) => FATAL_CODES.has(item.code)),
    };
  }
  const riskValidation = validateArtifact(
    'risk-profile.schema.json',
    profile,
    {},
  );
  const riskFinding = validationFinding(
    riskValidation,
    'RISK_PROFILE_INVALID',
    'risk-profile',
    'risk profile did not satisfy its closed contract',
  );
  if (riskFinding) {
    findings.push(finding(
      'RISK_PROFILE_INVALID',
      'risk-profile',
      profile.schemaVersion === 1
        ? 'risk profile did not satisfy its closed contract'
        : 'risk profile uses an unsupported schema version',
    ));
    return {
      findings,
      fatal: findings.some((item) => FATAL_CODES.has(item.code)),
    };
  }

  let sourceLock = null;
  const sourceState = artifactPathState(
    projectDir,
    '.agent-governance/source-lock.json',
    findings,
    'source-lock',
  );
  if (sourceState === 'present') {
    sourceLock = readArtifact(
      projectDir,
      '.agent-governance/source-lock.json',
      findings,
      'source-lock',
      { invalidCode: 'SOURCE_REVISION_UNPINNED' },
    );
    if (sourceLock) {
      const sourceValidation = validateArtifact(
        'source-lock.schema.json',
        sourceLock,
        {},
      );
      if (!sourceValidation.valid) {
        const sourceCode = sourceValidation.errors.find((error) => (
          SOURCE_VALIDATION_CODES.has(error.code)
        ))?.code ?? (
          sourceLock.sources?.some((source) => !source.license)
            ? 'SOURCE_LICENSE_MISSING'
            : 'SOURCE_REVISION_UNPINNED'
        );
        findings.push(finding(
          sourceCode,
          'source-lock',
          'external source lock is invalid',
        ));
      }
    }
  }

  const packs = inspectActivePacks(
    projectDir,
    sourceLock,
    findings,
  );
  inspectAssignments(
    projectDir,
    profile,
    sourceLock,
    packs,
    taskContract,
    findings,
  );
  inspectDecisions(projectDir, findings);

  const uniqueFindings = [];
  const seen = new Set();
  for (const item of findings) {
    const key = `${item.code}:${item.subject}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueFindings.push(item);
  }
  return {
    findings: uniqueFindings,
    fatal: uniqueFindings.some((item) => FATAL_CODES.has(item.code)),
  };
}
