import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJsonBytes,
  readJsonArtifact,
  readJsonArtifactWithBytes,
  sha256Bytes,
  sha256Canonical,
  validateArtifact,
  writeJsonArtifact,
} from './governance-artifacts.mjs';
import {
  safeReadGovernanceFile,
} from './governance-checks.mjs';
import {
  validateDecisionRecord,
  validateHumanConfirmation,
} from './decision-role-core.mjs';
import {
  buildCodexPolicyAdapter,
  codexSupportForControl,
} from './codex-policy-adapter.mjs';
import {
  buildPolicyManifest,
  normalizePortablePath,
  PolicyCompilerError,
} from './policy-compiler-core.mjs';

const RECEIPT_TYPE = 'compile-receipt';
const POLICY_TYPE = 'policy-manifest';
const ADAPTER_TYPE = 'codex-policy-adapter';
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const OWNED_TYPES = new Map([
  [POLICY_TYPE, 'policy-manifest.schema.json'],
  [ADAPTER_TYPE, 'codex-policy-adapter.schema.json'],
  [RECEIPT_TYPE, 'compile-receipt.schema.json'],
]);

function fail(code, subject = 'policy-compiler') {
  throw new PolicyCompilerError(code, subject);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertArtifactSize(value, subject) {
  if (canonicalJsonBytes(value).length > MAX_ARTIFACT_BYTES) {
    fail('PRIVATE_CONTENT_BLOCKED', subject);
  }
}

function sortedUnique(values) {
  return [...new Set(values)].sort(compareText);
}

function hashText(content) {
  return sha256Canonical({
    text: String(content).replaceAll(/\r\n?/gu, '\n'),
  });
}

function relativeState(projectDir, relativePath) {
  const normalized = normalizePortablePath(relativePath);
  let root;
  try {
    root = fs.realpathSync(projectDir);
  } catch {
    fail('COMPILE_PATH_BLOCKED', normalized);
  }
  const segments = normalized.split('/');
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    current = path.join(current, segment);
    let component;
    try {
      component = fs.lstatSync(current, { bigint: true });
    } catch (error) {
      if (error?.code === 'ENOENT') break;
      fail('COMPILE_PATH_BLOCKED', normalized);
    }
    if (component.isSymbolicLink() || !component.isDirectory()) {
      fail('SYMLINK_BLOCKED', normalized);
    }
    let realComponent;
    try {
      realComponent = fs.realpathSync(current);
    } catch {
      fail('COMPILE_PATH_BLOCKED', normalized);
    }
    if (
      realComponent !== root
      && !realComponent.startsWith(`${root}${path.sep}`)
    ) {
      fail('COMPILE_PATH_BLOCKED', normalized);
    }
  }
  const absolute = path.join(root, ...segments);
  try {
    const stat = fs.lstatSync(absolute, { bigint: true });
    if (
      stat.isSymbolicLink()
      || !stat.isFile()
      || (typeof stat.nlink === 'bigint' && stat.nlink > 1n)
    ) {
      fail('SYMLINK_BLOCKED', normalized);
    }
    return { exists: true, absolute, normalized };
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { exists: false, absolute, normalized };
    }
    if (error instanceof PolicyCompilerError) throw error;
    fail('COMPILE_PATH_BLOCKED', normalized);
  }
}

function readRequiredJson(projectDir, relativePath, subject) {
  const state = relativeState(projectDir, relativePath);
  if (!state.exists) fail('POLICY_INPUT_MISSING', subject);
  return readJsonArtifact(projectDir, state.normalized, { subject });
}

function validateOrFail(schema, value, context, fallback) {
  const validation = validateArtifact(schema, value, context);
  if (validation.valid) return;
  const code = validation.errors[0]?.code;
  if (code === 'SOURCE_PROVENANCE_MISMATCH') {
    fail('POLICY_SOURCE_HASH_MISMATCH');
  }
  if (code === 'ROLE_PRIVILEGE_EXPANSION') {
    fail('POLICY_PRIVILEGE_EXPANSION');
  }
  fail(
    [
      'DUPLICATE_ID',
      'SCHEMA_VALIDATION_FAILED',
      'SCHEMA_VERSION_UNSUPPORTED',
    ].includes(code)
      ? fallback
      : code ?? fallback,
  );
}

function sourceMatchesLock(source, sourceLock, artifactPath) {
  const normalized = normalizePortablePath(artifactPath);
  return Boolean(sourceLock?.sources?.some((entry) => (
    entry.sourceId === source.sourceId
    && entry.repository === source.repository
    && entry.commit === source.revision
    && entry.license === source.license
    && entry.importedMode === source.importedMode
    && entry.sha256 === source.sha256
    && canonicalImportedFiles(entry).includes(normalized)
  )));
}

function canonicalImportedFiles(source) {
  if (!Array.isArray(source?.importedFiles)) {
    fail('POLICY_MANIFEST_INVALID', source?.sourceId);
  }
  const normalized = source.importedFiles.map((entry) => {
    const candidate = normalizePortablePath(entry);
    if (candidate !== entry) {
      fail('POLICY_MANIFEST_INVALID', source.sourceId);
    }
    if (
      candidate === '.agent-governance/local'
      || candidate.startsWith('.agent-governance/local/')
    ) {
      fail('PRIVATE_CONTENT_BLOCKED', source.sourceId);
    }
    return candidate;
  });
  const folded = normalized.map((entry) => entry.toLowerCase());
  if (
    new Set(normalized).size !== normalized.length
    || new Set(folded).size !== folded.length
  ) {
    fail('POLICY_CONFLICT', source.sourceId);
  }
  return normalized;
}

function validPackSource(source) {
  return Boolean(
    source
    && typeof source === 'object'
    && /^SRC-[A-Z0-9-]+$/u.test(source.sourceId)
    && typeof source.repository === 'string'
    && source.repository.startsWith('https://')
    && /^[0-9a-f]{40}$/u.test(source.revision)
    && typeof source.license === 'string'
    && source.license.length > 0
    && ['metadata', 'adapted', 'copied'].includes(source.importedMode)
    && /^[0-9a-f]{64}$/u.test(source.sha256)
  );
}

function loadPacks(projectDir, inputHashes, sourceLock) {
  const lockPath = '.agent-governance/packs.lock.json';
  const lock = readRequiredJson(projectDir, lockPath, 'PACK-LOCK');
  if (
    lock.schemaVersion !== 1
    || !Array.isArray(lock.packs)
    || new Set(lock.packs.map((pack) => pack?.packId)).size
      !== lock.packs.length
    || lock.packs.some((pack) => (
      !pack
      || typeof pack.packId !== 'string'
      || typeof pack.version !== 'string'
      || typeof pack.artifact !== 'string'
      || !['active', 'suspended', 'retired'].includes(pack.status)
      || !validPackSource(pack.source)
    ))
  ) {
    fail('POLICY_MANIFEST_INVALID', 'PACK-LOCK');
  }
  const artifactPaths = lock.packs.map((pack) => {
    const normalized = normalizePortablePath(pack.artifact);
    if (normalized !== pack.artifact) {
      fail('POLICY_MANIFEST_INVALID', pack.packId);
    }
    if (
      normalized === '.agent-governance/local'
      || normalized.startsWith('.agent-governance/local/')
    ) {
      fail('PRIVATE_CONTENT_BLOCKED', pack.packId);
    }
    return normalized;
  });
  if (
    new Set(artifactPaths.map((entry) => entry.toLowerCase())).size
    !== artifactPaths.length
  ) {
    fail('POLICY_CONFLICT', 'PACK-LOCK');
  }
  inputHashes.push({ path: lockPath, sha256: sha256Canonical(lock) });
  const active = lock.packs.filter((pack) => pack.status === 'active');
  if (active.length === 0) return [];
  return active.map((summary) => {
    if (
      typeof summary.artifact !== 'string'
      || !summary.source
      || typeof summary.source !== 'object'
    ) {
      fail('POLICY_MANIFEST_INVALID', summary?.packId);
    }
    const packPath = normalizePortablePath(summary.artifact);
    const pack = readRequiredJson(projectDir, packPath, summary.packId);
    if (
      Array.isArray(pack?.controls)
      && pack.controls.some((control) => control?.effect === 'allow')
    ) {
      fail('POLICY_PRIVILEGE_EXPANSION', summary.packId);
    }
    validateOrFail(
      'governance-pack.schema.json',
      pack,
      { sourceLock, artifactPath: packPath },
      'POLICY_MANIFEST_INVALID',
    );
    if (
      pack.packId !== summary.packId
      || pack.version !== summary.version
      || pack.status !== summary.status
      || sha256Canonical(pack.source) !== sha256Canonical(summary.source)
      || !sourceMatchesLock(pack.source, sourceLock, packPath)
    ) {
      fail('POLICY_SOURCE_HASH_MISMATCH', summary.packId);
    }
    const sha256 = sha256Canonical(pack);
    inputHashes.push({ path: packPath, sha256 });
    return { path: packPath, sha256, value: pack };
  });
}

function loadRoleCatalog(
  projectDir,
  assignment,
  sourceLock,
  inputHashes,
  cache,
) {
  const paths = sortedUnique(
    (assignment.selectedRoles ?? [])
      .filter((role) => ['external', 'external-catalog'].includes(role?.source))
      .map((role) => normalizePortablePath(role.sourceCatalog)),
  );
  if (paths.length === 0) return null;
  if (paths.length !== 1) {
    fail('POLICY_CONFLICT', assignment.assignmentId);
  }
  const [catalogPath] = paths;
  if (!cache.has(catalogPath)) {
    const catalog = readRequiredJson(
      projectDir,
      catalogPath,
      assignment.assignmentId,
    );
    validateOrFail(
      'role-catalog.schema.json',
      catalog,
      { sourceLock, artifactPath: catalogPath },
      'POLICY_MANIFEST_INVALID',
    );
    const sha256 = sha256Canonical(catalog);
    inputHashes.push({ path: catalogPath, sha256 });
    cache.set(catalogPath, { path: catalogPath, sha256, value: catalog });
  }
  return cache.get(catalogPath);
}

function loadAssignments(projectDir, riskProfile, sourceLock, inputHashes) {
  const entries = [];
  const catalogCache = new Map();
  for (const task of riskProfile.tasks.filter(
    (candidate) => candidate.status === 'active',
  )) {
    const relative =
      `.agent-governance/role-assignments/${task.taskId}.json`;
    const assignment = readRequiredJson(projectDir, relative, task.taskId);
    const catalog = loadRoleCatalog(
      projectDir,
      assignment,
      sourceLock,
      inputHashes,
      catalogCache,
    );
    validateOrFail(
      'role-assignment.schema.json',
      assignment,
      {
        knownTaskIds: riskProfile.tasks.map((candidate) => candidate.taskId),
        riskProfile,
        sourceLock,
        roleCatalog: catalog?.value ?? null,
        roleCatalogPath: catalog?.path ?? null,
      },
      'POLICY_MANIFEST_INVALID',
    );
    const sha256 = sha256Canonical(assignment);
    inputHashes.push({ path: relative, sha256 });
    entries.push({ path: relative, sha256, value: assignment });
  }
  return entries;
}

function safeDecisionDirectories(projectDir) {
  const relative = '.agent-governance/decisions';
  const absolute = path.join(projectDir, ...relative.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(absolute, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    fail('COMPILE_PATH_BLOCKED', 'DECISIONS');
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    fail('SYMLINK_BLOCKED', 'DECISIONS');
  }
  const entries = fs.readdirSync(absolute, { withFileTypes: true });
  if (entries.some((entry) => (
    /^DEC-[0-9]{3,}$/u.test(entry.name)
    && entry.isSymbolicLink()
  ))) {
    fail('SYMLINK_BLOCKED', 'DECISIONS');
  }
  return entries
    .filter((entry) => (
      entry.isDirectory()
      && /^DEC-[0-9]{3,}$/u.test(entry.name)
    ))
    .map((entry) => entry.name)
    .sort(compareText);
}

function loadActiveDecisions(projectDir, inputHashes) {
  const refs = [];
  for (const decisionId of safeDecisionDirectories(projectDir)) {
    const base = `.agent-governance/decisions/${decisionId}`;
    const decisionPath = `${base}/decision.json`;
    const decision = readRequiredJson(projectDir, decisionPath, decisionId);
    const decisionErrors = validateDecisionRecord(decision, decisionId);
    if (decisionErrors.length > 0) {
      fail(
        decisionErrors[0]?.code ?? 'POLICY_MANIFEST_INVALID',
        decisionId,
      );
    }
    if (decision.status !== 'active') continue;
    const planPath = `${base}/deliberation-plan.json`;
    const resultPath = `${base}/deliberation-result.json`;
    const confirmationPath = `${base}/human-confirmation.json`;
    const plan = readRequiredJson(projectDir, planPath, decisionId);
    const result = readRequiredJson(projectDir, resultPath, decisionId);
    const confirmation = readRequiredJson(
      projectDir,
      confirmationPath,
      decisionId,
    );
    validateOrFail(
      'deliberation-plan.schema.json',
      plan,
      { knownDecisionIds: [decisionId], decision },
      'POLICY_MANIFEST_INVALID',
    );
    validateOrFail(
      'deliberation-result.schema.json',
      result,
      {
        knownDecisionIds: [decisionId],
        decision,
        plan,
        operation: 'stored',
        humanConfirmation: confirmation,
      },
      'POLICY_MANIFEST_INVALID',
    );
    const confirmationError = validateHumanConfirmation(
      confirmation,
      { decision, plan, result },
    );
    if (confirmationError || result.importStatus !== 'human-confirmed') {
      fail('POLICY_INPUT_MISSING', decisionId);
    }
    for (const [artifactPath, value] of [
      [decisionPath, decision],
      [planPath, plan],
      [resultPath, result],
      [confirmationPath, confirmation],
    ]) {
      inputHashes.push({
        path: artifactPath,
        sha256: sha256Canonical(value),
      });
    }
    refs.push({
      decisionId,
      revision: decision.revision,
      path: decisionPath,
      sha256: sha256Canonical(decision),
    });
  }
  return refs;
}

function readGovernanceRules(projectDir) {
  const state = relativeState(projectDir, 'AGENTS.md');
  if (!state.exists) fail('POLICY_INPUT_MISSING', 'AGENTS.md');
  const result = safeReadGovernanceFile(projectDir, 'AGENTS.md');
  if (!result.ok) {
    fail(
      result.finding?.code === 'PRIVACY_SOURCE_BLOCKED'
        ? 'INVALID_UTF8'
        : 'COMPILE_PATH_BLOCKED',
      'AGENTS.md',
    );
  }
  return {
    path: 'AGENTS.md',
    sha256: hashText(result.content),
  };
}

function ensureOwned(value, artifactType, conflictCode) {
  if (
    value?.ownership?.generator !== 'GovernSeed'
    || value.ownership.artifactType !== artifactType
  ) {
    fail(conflictCode);
  }
}

function existingArtifact(
  projectDir,
  relativePath,
  expected,
  artifactType,
) {
  const state = relativeState(projectDir, relativePath);
  if (!state.exists) return 'created';
  let current;
  try {
    current = readJsonArtifactWithBytes(projectDir, state.normalized, {
      subject: expected.policyId ?? expected.compileId,
    });
  } catch (error) {
    if (artifactType === ADAPTER_TYPE) {
      fail('CODEX_ADAPTER_OWNER_CONFLICT');
    }
    throw error;
  }
  ensureOwned(
    current.value,
    artifactType,
    artifactType === ADAPTER_TYPE
      ? 'CODEX_ADAPTER_OWNER_CONFLICT'
      : 'POLICY_OUTPUT_DRIFT',
  );
  const schema = OWNED_TYPES.get(artifactType);
  validateOrFail(
    schema,
    current.value,
    {},
    artifactType === ADAPTER_TYPE
      ? 'CODEX_ADAPTER_INVALID'
      : artifactType === RECEIPT_TYPE
        ? 'COMPILE_RECEIPT_INVALID'
        : 'POLICY_MANIFEST_INVALID',
  );
  if (
    sha256Bytes(current.bytes)
    !== sha256Bytes(canonicalJsonBytes(expected))
  ) {
    fail('POLICY_OUTPUT_DRIFT');
  }
  return 'unchanged';
}

function compileIdFor(policyId, outputHashes) {
  return `COMPILE-${sha256Canonical({
    policyId,
    target: 'codex',
    outputHashes,
  }).slice(0, 12).toUpperCase()}`;
}

function receiptPath(compileId) {
  return `.agent-governance/receipts/${compileId}.json`;
}

function findExistingReceipt(projectDir, compileId) {
  const relative = receiptPath(compileId);
  const state = relativeState(projectDir, relative);
  if (!state.exists) return null;
  const record = readJsonArtifactWithBytes(projectDir, relative, {
    subject: compileId,
  });
  const receipt = record.value;
  ensureOwned(receipt, RECEIPT_TYPE, 'COMPILE_RECEIPT_INVALID');
  validateOrFail(
    'compile-receipt.schema.json',
    receipt,
    {},
    'COMPILE_RECEIPT_INVALID',
  );
  if (
    sha256Bytes(record.bytes)
    !== sha256Bytes(canonicalJsonBytes(receipt))
  ) {
    fail('COMPILE_RECEIPT_INVALID', compileId);
  }
  return receipt;
}

function persistentReceipt({
  compileId,
  manifest,
  outputHashes,
  states,
  compiledAt,
}) {
  return {
    schemaVersion: 1,
    compileId,
    policyId: manifest.policyId,
    inputHashes: structuredClone(manifest.inputHashes),
    outputHashes,
    target: 'codex',
    dryRun: false,
    filesCreated: [...states]
      .filter(([, state]) => state === 'created')
      .map(([file]) => file)
      .sort(compareText),
    filesUpdated: [],
    filesUnchanged: [...states]
      .filter(([, state]) => state === 'unchanged')
      .map(([file]) => file)
      .sort(compareText),
    unsupportedControls: structuredClone(manifest.unsupportedControls),
    warnings: sortedUnique([
      ...(manifest.unsupportedControls.length > 0
        ? ['POLICY_UNSUPPORTED_CONTROL']
        : []),
      ...(Object.values(manifest.controls).flat().some(
        (control) => !['enforceable', 'unsupported'].includes(
          control.targetSupport.codex,
        ),
      )
        ? ['CODEX_CONTROL_NOT_ENFORCEABLE']
        : []),
    ]),
    compiledAt,
    ownership: {
      generator: 'GovernSeed',
      artifactType: RECEIPT_TYPE,
    },
  };
}

function receiptEquivalent(left, right) {
  const comparable = (value) => {
    const clone = structuredClone(value);
    delete clone.compiledAt;
    delete clone.filesCreated;
    delete clone.filesUpdated;
    delete clone.filesUnchanged;
    return clone;
  };
  return sha256Canonical(comparable(left)) === sha256Canonical(comparable(right));
}

export function preparePolicyCompile(
  projectDir,
  {
    target = 'codex',
    dryRun = false,
    compiledAt,
  } = {},
) {
  if (target !== 'codex') fail('CLI_TARGET_UNSUPPORTED');
  const effectiveCompiledAt = compiledAt
    ?? (dryRun
      ? '1970-01-01T00:00:00.000Z'
      : new Date().toISOString());
  const inputHashes = [];
  const riskPath = '.agent-governance/risk-profile.json';
  const riskProfile = readRequiredJson(projectDir, riskPath, 'risk-profile');
  validateOrFail(
    'risk-profile.schema.json',
    riskProfile,
    {},
    'RISK_PROFILE_INVALID',
  );
  inputHashes.push({
    path: riskPath,
    sha256: sha256Canonical(riskProfile),
  });
  const governanceRuleRef = readGovernanceRules(projectDir);
  inputHashes.push(governanceRuleRef);
  const sourceLockPath = '.agent-governance/source-lock.json';
  const sourceLock = readRequiredJson(
    projectDir,
    sourceLockPath,
    'source-lock',
  );
  validateOrFail(
    'source-lock.schema.json',
    sourceLock,
    {},
    'POLICY_MANIFEST_INVALID',
  );
  for (const source of sourceLock.sources) {
    canonicalImportedFiles(source);
  }
  inputHashes.push({
    path: sourceLockPath,
    sha256: sha256Canonical(sourceLock),
  });
  const roleAssignments = loadAssignments(
    projectDir,
    riskProfile,
    sourceLock,
    inputHashes,
  );
  const enabledPacks = loadPacks(projectDir, inputHashes, sourceLock);
  const activeDecisionRefs = loadActiveDecisions(projectDir, inputHashes);
  const manifest = buildPolicyManifest(
    {
      projectId: riskProfile.profileId,
      riskProfile,
      riskProfileRef: {
        profileId: riskProfile.profileId,
        path: riskPath,
        sha256: sha256Canonical(riskProfile),
      },
      governanceRuleRef,
      activeDecisionRefs,
      roleAssignments,
      enabledPacks,
      inputHashes,
    },
    {
      target,
      supportForControl: codexSupportForControl,
    },
  );
  validateOrFail(
    'policy-manifest.schema.json',
    manifest,
    {},
    'POLICY_MANIFEST_INVALID',
  );
  assertArtifactSize(manifest, manifest.policyId);
  const adapter = buildCodexPolicyAdapter(manifest);
  validateOrFail(
    'codex-policy-adapter.schema.json',
    adapter,
    { manifest },
    'CODEX_ADAPTER_INVALID',
  );
  assertArtifactSize(adapter, manifest.policyId);
  const policyPath =
    `.agent-governance/policies/${manifest.policyId}.json`;
  const adapterPath =
    `.agent-governance/adapters/codex/${manifest.policyId}.json`;
  const outputHashes = [
    {
      path: adapterPath,
      sha256: sha256Bytes(canonicalJsonBytes(adapter)),
    },
    {
      path: policyPath,
      sha256: sha256Bytes(canonicalJsonBytes(manifest)),
    },
  ].sort((left, right) => compareText(left.path, right.path));
  const compileId = compileIdFor(manifest.policyId, outputHashes);
  const finalReceiptPath = receiptPath(compileId);
  const states = new Map([
    [
      adapterPath,
      existingArtifact(
        projectDir,
        adapterPath,
        adapter,
        ADAPTER_TYPE,
      ),
    ],
    [
      policyPath,
      existingArtifact(
        projectDir,
        policyPath,
        manifest,
        POLICY_TYPE,
      ),
    ],
  ]);
  const previousReceipt = findExistingReceipt(projectDir, compileId);
  states.set(
    finalReceiptPath,
    previousReceipt ? 'unchanged' : 'created',
  );
  const candidateReceipt = persistentReceipt({
    compileId,
    manifest,
    outputHashes,
    states,
    compiledAt: effectiveCompiledAt,
  });
  if (previousReceipt && !receiptEquivalent(previousReceipt, candidateReceipt)) {
    fail('COMPILE_RECEIPT_INVALID', compileId);
  }
  const receipt = previousReceipt ?? candidateReceipt;
  validateOrFail(
    'compile-receipt.schema.json',
    receipt,
    { manifest, adapter },
    'COMPILE_RECEIPT_INVALID',
  );
  assertArtifactSize(receipt, compileId);
  const report = {
    ...structuredClone(receipt),
    dryRun,
    filesCreated: [...states]
      .filter(([, state]) => state === 'created')
      .map(([file]) => file)
      .sort(compareText),
    filesUpdated: [],
    filesUnchanged: [...states]
      .filter(([, state]) => state === 'unchanged')
      .map(([file]) => file)
      .sort(compareText),
  };
  return {
    target,
    dryRun,
    manifest,
    adapter,
    receipt,
    report,
    paths: {
      policy: policyPath,
      adapter: adapterPath,
      receipt: finalReceiptPath,
    },
    states,
  };
}

function parentDirectories(projectDir, paths) {
  let root;
  try {
    root = fs.realpathSync(projectDir);
  } catch {
    fail('COMPILE_PATH_BLOCKED');
  }
  const directories = sortedUnique(paths.map((relative) => (
    path.posix.dirname(normalizePortablePath(relative))
  )));
  const created = [];
  try {
    for (const relative of directories) {
      let current = root;
      for (const segment of relative.split('/')) {
        if (segment === '.') continue;
        current = path.join(current, segment);
        let made = false;
        let stat;
        try {
          stat = fs.lstatSync(current, { bigint: true });
        } catch (error) {
          if (error?.code !== 'ENOENT') {
            fail('COMPILE_PATH_BLOCKED', relative);
          }
          try {
            fs.mkdirSync(current, { mode: 0o700 });
            made = true;
          } catch (mkdirError) {
            if (mkdirError?.code !== 'EEXIST') {
              fail('COMPILE_PATH_BLOCKED', relative);
            }
          }
          try {
            stat = fs.lstatSync(current, { bigint: true });
          } catch {
            fail('COMPILE_PATH_BLOCKED', relative);
          }
        }
        if (stat.isSymbolicLink() || !stat.isDirectory()) {
          fail('SYMLINK_BLOCKED', relative);
        }
        let real;
        try {
          real = fs.realpathSync(current);
        } catch {
          fail('COMPILE_PATH_BLOCKED', relative);
        }
        if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
          fail('COMPILE_PATH_BLOCKED', relative);
        }
        if (made) created.push(current);
      }
    }
  } catch (error) {
    cleanupCreatedDirectories(
      created.sort((left, right) => right.length - left.length),
    );
    throw error;
  }
  return created.sort((left, right) => right.length - left.length);
}

function cleanupCreatedDirectories(directories) {
  for (const directory of directories) {
    try {
      fs.rmdirSync(directory);
    } catch {
      // Non-empty or concurrently claimed directories remain fail-closed.
    }
  }
}

function cleanupCreatedArtifact(projectDir, artifact) {
  const absolute = path.join(
    projectDir,
    ...artifact.path.split('/'),
  );
  try {
    const before = fs.lstatSync(absolute, { bigint: true });
    if (
      before.isSymbolicLink()
      || !before.isFile()
      || before.nlink > 1n
    ) {
      return;
    }
    const current = readJsonArtifactWithBytes(projectDir, artifact.path, {
      subject: artifact.value.policyId ?? artifact.value.compileId,
    });
    const after = fs.lstatSync(absolute, { bigint: true });
    if (
      after.isSymbolicLink()
      || !after.isFile()
      || after.nlink > 1n
      || before.dev !== after.dev
      || before.ino !== after.ino
      || sha256Bytes(current.bytes)
        !== sha256Bytes(canonicalJsonBytes(artifact.value))
      || current.value?.ownership?.generator !== 'GovernSeed'
      || current.value.ownership.artifactType
        !== artifact.value.ownership.artifactType
    ) {
      return;
    }
    fs.unlinkSync(absolute);
  } catch {
    // Unknown or changed content is preserved rather than removed.
  }
}

function assertCommittedArtifact(projectDir, artifact) {
  const artifactType = artifact.kind === 'policy'
    ? POLICY_TYPE
    : artifact.kind === 'adapter'
      ? ADAPTER_TYPE
      : RECEIPT_TYPE;
  if (
    existingArtifact(
      projectDir,
      artifact.path,
      artifact.value,
      artifactType,
    ) !== 'unchanged'
  ) {
    fail(
      artifactType === RECEIPT_TYPE
        ? 'COMPILE_RECEIPT_INVALID'
        : artifactType === ADAPTER_TYPE
          ? 'CODEX_ADAPTER_INVALID'
          : 'POLICY_OUTPUT_DRIFT',
      artifact.path,
    );
  }
}

export function commitPolicyCompile(
  projectDir,
  prepared,
  options = {},
) {
  if (prepared.dryRun) return prepared.report;
  if (
    prepared.manifest.controls.generatedArtifacts?.some(
      (control) => control.mode === 'deny',
    )
  ) {
    fail('POLICY_CONFLICT', prepared.manifest.policyId);
  }
  const createdFiles = [];
  const createdDirectories = parentDirectories(
    projectDir,
    Object.values(prepared.paths),
  );
  const artifacts = [
    {
      kind: 'policy',
      path: prepared.paths.policy,
      value: prepared.manifest,
    },
    {
      kind: 'adapter',
      path: prepared.paths.adapter,
      value: prepared.adapter,
    },
    {
      kind: 'receipt',
      path: prepared.paths.receipt,
      value: prepared.receipt,
    },
  ];
  try {
    for (const [index, artifact] of artifacts.entries()) {
      if (artifact.kind === 'receipt') {
        options.hooks?.beforeReceipt?.({
          path: artifact.path,
          prepared,
        });
        for (const output of artifacts.slice(0, index)) {
          assertCommittedArtifact(projectDir, output);
        }
      }
      const parent = path.dirname(
        path.join(projectDir, ...artifact.path.split('/')),
      );
      const parentBefore = fs.lstatSync(parent, { bigint: true });
      options.hooks?.beforeCommit?.({
        kind: artifact.kind,
        parent,
        path: artifact.path,
      });
      const parentAfter = fs.lstatSync(parent, { bigint: true });
      if (
        parentBefore.isSymbolicLink()
        || !parentBefore.isDirectory()
        || parentAfter.isSymbolicLink()
        || !parentAfter.isDirectory()
        || parentBefore.dev !== parentAfter.dev
        || parentBefore.ino !== parentAfter.ino
      ) {
        fail('COMPILE_PATH_BLOCKED', artifact.path);
      }
      if (prepared.states.get(artifact.path) === 'unchanged') {
        assertCommittedArtifact(projectDir, artifact);
        continue;
      }
      let writeState = null;
      writeJsonArtifact(projectDir, artifact.path, artifact.value, {
        subject: artifact.value.policyId ?? artifact.value.compileId,
        onWriteResult(state) {
          writeState = state;
        },
      });
      if (writeState === 'created') createdFiles.push(artifact);
      prepared.states.set(artifact.path, writeState ?? 'unchanged');
      assertCommittedArtifact(projectDir, artifact);
    }
    for (const artifact of artifacts) {
      assertCommittedArtifact(projectDir, artifact);
    }
    return {
      ...prepared.report,
      filesCreated: [...prepared.states]
        .filter(([, state]) => state === 'created')
        .map(([file]) => file)
        .sort(compareText),
      filesUpdated: [],
      filesUnchanged: [...prepared.states]
        .filter(([, state]) => state === 'unchanged')
        .map(([file]) => file)
        .sort(compareText),
    };
  } catch (error) {
    for (const artifact of createdFiles.reverse()) {
      cleanupCreatedArtifact(projectDir, artifact);
    }
    cleanupCreatedDirectories(createdDirectories);
    throw error;
  }
}
