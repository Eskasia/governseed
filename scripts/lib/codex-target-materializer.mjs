import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJsonBytes,
  sha256Bytes,
  sha256Canonical,
  writeJsonArtifact,
} from './governance-artifacts.mjs';
import {
  PolicyCompilerError,
} from './policy-compiler-core.mjs';
import { ATTEST_CLAIM } from './target-registry.mjs';

export const TARGET_CONFIG_PATH = '.codex/config.toml';
export const TARGET_ARTIFACT_TYPE = 'codex-project-config';

const MAX_TARGET_BYTES = 64 * 1024;
const MAX_SCANNED_CONFIGS = 64;
const PROTECTED_ERRNO = new Set(['EACCES', 'EPERM', 'EROFS']);

// Orthogonal to the five capability-matrix classifications. It records whether a
// native project-layer surface was written, never what GovernSeed can enforce.
const MATERIALIZATION = Object.freeze({
  'filesystem.project-read': 'deferred',
  'filesystem.project-write': 'materializable',
  'filesystem.root-write': 'materializable',
  'shell.execution': 'deferred',
  network: 'materializable',
  credentials: 'not-applicable',
  delete: 'materializable',
  publish: 'materializable',
  'external-content': 'deferred',
  'generated-artifacts': 'not-applicable',
  'provider-retention': 'not-applicable',
  verification: 'not-applicable',
});

const UNMATERIALIZED_REASON = Object.freeze({
  'filesystem.project-read': {
    reasonCode: 'CODEX_SURFACE_OUT_OF_SCOPE',
    source: 'permissions (Beta), mutually exclusive with the sandbox surface',
  },
  'shell.execution': {
    reasonCode: 'CODEX_SURFACE_EXPERIMENTAL',
    source: 'rules — "Rules are experimental and may change"',
  },
  'external-content': {
    reasonCode: 'CODEX_MAPPING_UNREVIEWED',
    source: 'config-reference web_search; semantic mapping unreviewed',
  },
  credentials: {
    reasonCode: 'CODEX_NO_PROJECT_LAYER_SURFACE',
    source: 'config-advanced ignored-keys list',
  },
  'generated-artifacts': {
    reasonCode: 'CODEX_NO_PROJECT_LAYER_SURFACE',
    source: 'GovernSeed-owned namespace; no Codex surface',
  },
  'provider-retention': {
    reasonCode: 'CODEX_NO_PROJECT_LAYER_SURFACE',
    source: 'provider policy, not a project-config setting',
  },
  verification: {
    reasonCode: 'CODEX_NO_PROJECT_LAYER_SURFACE',
    source: 'no native project-layer verification surface',
  },
});

const APPROVAL_CAPABILITIES = new Set(['delete', 'publish', 'shell.execution']);
const RESTRICTIVE_MODES = new Set(['deny', 'require-approval']);

function fail(code, subject = 'codex-target-materializer') {
  throw new PolicyCompilerError(code, subject);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function controlList(manifest) {
  return Object.values(manifest.controls)
    .flat()
    .sort((left, right) => compareText(left.controlId, right.controlId));
}

function modeAllows(mode) {
  return mode === 'allow' || mode === 'constrained-allow';
}

/**
 * Every emitted value is the strictest value its key admits, so the invariant
 * needs no baseline default. A policy that would require anything looser is
 * refused rather than written.
 */
export function planTargetKeys(manifest) {
  const controls = controlList(manifest);
  const byCapability = new Map(
    controls.map((control) => [control.capability, control]),
  );
  const projectWrite = byCapability.get('filesystem.project-write');
  const rootWrite = byCapability.get('filesystem.root-write');
  const network = byCapability.get('network');

  if (rootWrite && modeAllows(rootWrite.mode)) {
    fail('MATERIALIZE_WOULD_WIDEN', rootWrite.controlId);
  }

  const keys = [];
  const owners = new Map();
  const claim = (key, controlIds) => {
    for (const controlId of controlIds) {
      owners.set(controlId, [...(owners.get(controlId) ?? []), key]);
    }
  };

  const approvalControls = controls.filter((control) => (
    APPROVAL_CAPABILITIES.has(control.capability)
    && RESTRICTIVE_MODES.has(control.mode)
  ));
  if (approvalControls.length > 0) {
    keys.push({ key: 'approval_policy', value: 'untrusted', kind: 'string' });
    claim(
      'approval_policy',
      approvalControls
        .filter((control) => (
          MATERIALIZATION[control.capability] === 'materializable'
        ))
        .map((control) => control.controlId),
    );
  }

  let sandboxMode = null;
  if (projectWrite && !modeAllows(projectWrite.mode)) {
    sandboxMode = 'read-only';
  } else if (projectWrite) {
    sandboxMode = 'workspace-write';
  }
  if (sandboxMode) {
    keys.push({ key: 'sandbox_mode', value: sandboxMode, kind: 'string' });
    claim('sandbox_mode', [projectWrite.controlId]);
    if (rootWrite) claim('sandbox_mode', [rootWrite.controlId]);
  }

  const table = [];
  if (sandboxMode === 'workspace-write') {
    if (network && !modeAllows(network.mode)) {
      table.push({
        key: 'network_access',
        value: false,
        kind: 'boolean',
      });
      claim('network_access', [network.controlId]);
    }
    if (rootWrite) {
      table.push({ key: 'writable_roots', value: [], kind: 'array' });
      claim('writable_roots', [rootWrite.controlId]);
    }
  }

  keys.sort((left, right) => compareText(left.key, right.key));
  table.sort((left, right) => compareText(left.key, right.key));
  return { keys, table, owners, controls, sandboxMode };
}

function renderValue(entry) {
  if (entry.kind === 'string') return `"${entry.value}"`;
  if (entry.kind === 'boolean') return entry.value ? 'true' : 'false';
  return '[]';
}

export function materializeIdFor(manifest, policyHash, target, plan) {
  const plannedKeys = [
    ...plan.keys.map((entry) => ({
      key: entry.key,
      value: renderValue(entry),
    })),
    ...plan.table.map((entry) => ({
      key: `sandbox_workspace_write.${entry.key}`,
      value: renderValue(entry),
    })),
  ].sort((left, right) => compareText(left.key, right.key));
  const digest = sha256Canonical({
    policyId: manifest.policyId,
    policyHash,
    target,
    plannedKeys,
  });
  return `MAT-${digest.slice(0, 12).toUpperCase()}`;
}

/**
 * A closed emitter for a closed key set, not a general TOML serializer. The
 * [sandbox_workspace_write] table is emitted only when the sandbox mode uses it.
 */
export function renderTargetConfig({ manifest, policyHash, materializeId, plan }) {
  const lines = [
    '# GovernSeed target-materialized configuration. Do not edit by hand.',
    '# generator = "GovernSeed"',
    `# artifactType = "${TARGET_ARTIFACT_TYPE}"`,
    `# policyId = "${manifest.policyId}"`,
    `# policyHash = "${policyHash}"`,
    `# materializeId = "${materializeId}"`,
    `# claim = "${ATTEST_CLAIM}"`,
    '',
  ];
  for (const entry of plan.keys) {
    lines.push(`${entry.key} = ${renderValue(entry)}`);
  }
  if (plan.table.length > 0) {
    lines.push('', '[sandbox_workspace_write]');
    for (const entry of plan.table) {
      lines.push(`${entry.key} = ${renderValue(entry)}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function realProjectRoot(projectDir) {
  try {
    return fs.realpathSync(projectDir);
  } catch {
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
}

/**
 * Enumerates the project-tree .codex/config.toml files Codex itself would load,
 * from the project root down. One traversal answers both preflight questions.
 */
export function scanProjectConfigs(projectDir) {
  const root = realProjectRoot(projectDir);
  const found = [];
  const visit = (directory, relative, depth) => {
    if (found.length >= MAX_SCANNED_CONFIGS || depth > 12) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue;
      const absolute = path.join(directory, entry.name);
      const next = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.git') continue;
        if (entry.name === '.codex') {
          const config = path.join(absolute, 'config.toml');
          let stat;
          try {
            stat = fs.lstatSync(config);
          } catch {
            continue;
          }
          if (!stat.isFile()) continue;
          found.push({ path: `${next}/config.toml`, absolute: config });
          continue;
        }
        if (entry.name.startsWith('.')) continue;
        visit(absolute, next, depth + 1);
      }
    }
  };
  visit(root, '', 0);
  return found.sort((left, right) => compareText(left.path, right.path));
}

function readTextIfSmall(absolute) {
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    return null;
  }
  if (!stat.isFile() || stat.size > MAX_TARGET_BYTES) return null;
  try {
    return fs.readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Line-level match, not a TOML parse. It errs toward blocking: a commented-out
 * or string-embedded occurrence blocks too, because a silently non-composing
 * security configuration is not recoverable and a false block is.
 */
export function findPermissionProfileConflict(configs) {
  for (const config of configs) {
    const text = readTextIfSmall(config.absolute);
    if (text === null) continue;
    for (const [index, line] of text.split('\n').entries()) {
      if (/default_permissions\s*=/u.test(line) || /\[permissions/u.test(line)) {
        return { path: config.path, line: index + 1 };
      }
    }
  }
  return null;
}

export function findShadowingConfig(configs) {
  return configs.find((config) => config.path !== TARGET_CONFIG_PATH) ?? null;
}

export function preflightTarget(projectDir) {
  const configs = scanProjectConfigs(projectDir);
  const conflict = findPermissionProfileConflict(configs);
  if (conflict) {
    fail(
      'TARGET_SETTINGS_PROFILE_MODEL_CONFLICT',
      `${conflict.path}:${conflict.line}`,
    );
  }
  const shadow = findShadowingConfig(configs);
  if (shadow) fail('TARGET_SETTINGS_SHADOWED', shadow.path);
  return configs;
}

function targetState(projectDir) {
  const root = realProjectRoot(projectDir);
  const directory = path.join(root, '.codex');
  const absolute = path.join(directory, 'config.toml');
  let directoryStat;
  try {
    directoryStat = fs.lstatSync(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
    }
    return { absolute, directory, exists: false, bytes: null };
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
  let real;
  try {
    real = fs.realpathSync(directory);
  } catch {
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
  if (real !== path.join(root, '.codex')) {
    fail('MATERIALIZE_OUTSIDE_PROJECT', TARGET_CONFIG_PATH);
  }
  let stat;
  try {
    stat = fs.lstatSync(absolute, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { absolute, directory, exists: false, bytes: null };
    }
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || (typeof stat.nlink === 'bigint' && stat.nlink > 1n)
  ) {
    fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
  if (stat.size > BigInt(MAX_TARGET_BYTES)) {
    fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
  let bytes;
  try {
    bytes = fs.readFileSync(absolute);
  } catch (error) {
    if (PROTECTED_ERRNO.has(error?.code)) {
      fail('MATERIALIZE_TARGET_PATH_PROTECTED', TARGET_CONFIG_PATH);
    }
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
  return { absolute, directory, exists: true, bytes };
}

/**
 * Ownership recognition trusts .agent-governance/receipts/, which holds
 * content-addressed but unsigned files. An actor able to write there can cause
 * an overwrite; that is the stated trust boundary, not a defended one.
 */
function ownedByEarlierReceipt(projectDir, sha256) {
  const directory = path.join(
    realProjectRoot(projectDir),
    '.agent-governance',
    'receipts',
  );
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return false;
  }
  for (const name of entries.sort()) {
    if (!/^MAT-[0-9A-F]{12}\.json$/u.test(name)) continue;
    const text = readTextIfSmall(path.join(directory, name));
    if (text === null) continue;
    let receipt;
    try {
      receipt = JSON.parse(text);
    } catch {
      continue;
    }
    if (receipt?.ownership?.artifactType !== TARGET_ARTIFACT_TYPE) continue;
    if ((receipt.targetFiles ?? []).some((file) => file?.sha256After === sha256)) {
      return true;
    }
  }
  return false;
}

/**
 * A capability with a project-layer key can still emit nothing: either the
 * compiled mode asks for no restriction, or the key lives in a table this
 * sandbox mode does not use. The two are not the same finding.
 */
function unclaimedKeyReason(control, plan) {
  if (modeAllows(control.mode)) {
    return {
      reasonCode: 'CODEX_POLICY_MODE_NOT_RESTRICTIVE',
      source: 'the compiled mode asks for no restriction on this key',
    };
  }
  return {
    reasonCode: 'CODEX_KEY_UNUSED_UNDER_SANDBOX_MODE',
    source: `the key lives in [sandbox_workspace_write], which sandbox_mode = "${plan.sandboxMode}" does not use`,
  };
}

function existingReceipt(projectDir, receiptPath) {
  const absolute = path.join(
    realProjectRoot(projectDir),
    ...receiptPath.split('/'),
  );
  const text = readTextIfSmall(absolute);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return fail('MATERIALIZE_RECEIPT_INVALID', receiptPath);
  }
}

function receiptEquivalent(left, right) {
  const comparable = (value) => {
    const clone = structuredClone(value);
    delete clone.materializedAt;
    delete clone.filesCreated;
    delete clone.filesUpdated;
    delete clone.filesUnchanged;
    // sha256Before records the state a run replaced, so it differs between the
    // run that wrote the file and every run after it. sha256After is identity
    // and stays compared.
    clone.targetFiles = (clone.targetFiles ?? []).map((entry) => ({
      path: entry?.path,
      sha256After: entry?.sha256After,
    }));
    return clone;
  };
  return sha256Canonical(comparable(left)) === sha256Canonical(comparable(right));
}

function classifyControls(plan, manifest, target) {
  const materialized = [];
  const unmaterialized = [];
  for (const control of plan.controls) {
    const status = MATERIALIZATION[control.capability] ?? 'not-applicable';
    const nativeKeys = (plan.owners.get(control.controlId) ?? []).sort(compareText);
    if (status === 'materializable' && nativeKeys.length > 0) {
      const gateOnly = control.mode === 'deny'
        && nativeKeys.length === 1
        && nativeKeys[0] === 'approval_policy';
      const emitted = [...plan.keys, ...plan.table]
        .filter((entry) => nativeKeys.includes(entry.key))
        .map((entry) => `${entry.key} = ${renderValue(entry)}`)
        .join('; ');
      materialized.push({
        controlId: control.controlId,
        capability: control.capability,
        mode: control.mode,
        classification: control.targetSupport[target],
        materializationStatus: 'materializable',
        modeCoverage: gateOnly ? 'approval-gate-only' : 'full',
        nativeKeys,
        emittedValue: emitted,
      });
      continue;
    }
    const reason = status === 'materializable'
      ? unclaimedKeyReason(control, plan)
      : UNMATERIALIZED_REASON[control.capability] ?? {
        reasonCode: 'CODEX_NO_PROJECT_LAYER_SURFACE',
        source: 'docs/enforcement-boundary.md',
      };
    unmaterialized.push({
      controlId: control.controlId,
      capability: control.capability,
      materializationStatus: status === 'materializable'
        ? 'deferred'
        : status,
      reasonCode: reason.reasonCode,
      source: reason.source,
    });
  }
  return {
    materialized: materialized.sort((left, right) => (
      compareText(left.controlId, right.controlId)
    )),
    unmaterialized: unmaterialized.sort((left, right) => (
      compareText(left.controlId, right.controlId)
    )),
    declared: plan.controls.length,
    policyId: manifest.policyId,
  };
}

export function prepareTargetMaterialize(projectDir, {
  manifest,
  policyHash,
  target,
  dryRun,
  materializedAt,
}) {
  preflightTarget(projectDir);
  const plan = planTargetKeys(manifest);
  const materializeId = materializeIdFor(manifest, policyHash, target, plan);
  const content = renderTargetConfig({
    manifest,
    policyHash,
    materializeId,
    plan,
  });
  const bytes = Buffer.from(content, 'utf8');
  const sha256After = sha256Bytes(bytes);
  const state = targetState(projectDir);
  const sha256Before = state.exists ? sha256Bytes(state.bytes) : null;

  let fileState = 'created';
  if (state.exists) {
    if (sha256Before === sha256After) {
      fileState = 'unchanged';
    } else if (ownedByEarlierReceipt(projectDir, sha256Before)) {
      fileState = 'updated';
    } else {
      fail('TARGET_SETTINGS_OWNER_CONFLICT', TARGET_CONFIG_PATH);
    }
  }

  const classified = classifyControls(plan, manifest, target);
  const receiptPath =
    `.agent-governance/receipts/${materializeId}.json`;
  const previousReceipt = existingReceipt(projectDir, receiptPath);
  const candidate = {
    schemaVersion: 1,
    materializeId,
    policyId: manifest.policyId,
    policyHash,
    target,
    dryRun: false,
    trustStateObserved: 'unknown',
    targetFiles: [
      { path: TARGET_CONFIG_PATH, sha256Before, sha256After },
    ],
    materializedControls: classified.materialized,
    unmaterializedControls: classified.unmaterialized,
    filesCreated: [
      ...(fileState === 'created' ? [TARGET_CONFIG_PATH] : []),
      ...(previousReceipt ? [] : [receiptPath]),
    ].sort(compareText),
    filesUpdated: fileState === 'updated' ? [TARGET_CONFIG_PATH] : [],
    filesUnchanged: [
      ...(fileState === 'unchanged' ? [TARGET_CONFIG_PATH] : []),
      ...(previousReceipt ? [receiptPath] : []),
    ].sort(compareText),
    materializedAt,
    ownership: {
      generator: 'GovernSeed',
      artifactType: TARGET_ARTIFACT_TYPE,
    },
    status: 'target-materialized',
  };
  // A receipt is content-addressed by its own inputs, so an existing one at the
  // same identity that is not equivalent has been altered.
  if (previousReceipt && !receiptEquivalent(previousReceipt, candidate)) {
    fail('MATERIALIZE_RECEIPT_INVALID', materializeId);
  }
  const receipt = previousReceipt ?? candidate;
  const report = {
    ...structuredClone(receipt),
    targetFiles: structuredClone(candidate.targetFiles),
    dryRun,
    filesCreated: dryRun ? [] : candidate.filesCreated,
    filesUpdated: dryRun ? [] : candidate.filesUpdated,
    filesUnchanged: dryRun ? [] : candidate.filesUnchanged,
    status: dryRun ? 'dry-run' : 'target-materialized',
  };
  return {
    materializeId,
    plan,
    content,
    bytes,
    receipt,
    report,
    receiptUnchanged: Boolean(previousReceipt),
    fileState,
    dryRun,
    paths: { target: TARGET_CONFIG_PATH, receipt: receiptPath },
    state,
  };
}

function ensureTargetDirectory(directory) {
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    if (PROTECTED_ERRNO.has(error?.code)) {
      fail('MATERIALIZE_TARGET_PATH_PROTECTED', TARGET_CONFIG_PATH);
    }
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
  }
  return true;
}

/**
 * Same-directory staging, parent-identity recheck after the rename, receipt
 * last. A target file without its receipt is partial output, not success.
 */
export function commitTargetMaterialize(projectDir, prepared) {
  if (prepared.dryRun) return prepared.report;
  const root = realProjectRoot(projectDir);
  const directory = path.join(root, '.codex');
  const absolute = path.join(directory, 'config.toml');
  const createdDirectory = ensureTargetDirectory(directory);
  const cleanup = () => {
    if (!createdDirectory) return;
    try {
      fs.rmdirSync(directory);
    } catch {
      // A directory that gained other entries stays fail-closed.
    }
  };

  try {
    const parentBefore = fs.lstatSync(directory, { bigint: true });
    if (prepared.fileState !== 'unchanged') {
      const staged = path.join(directory, `.config.toml.${process.pid}.tmp`);
      try {
        fs.writeFileSync(staged, prepared.bytes, { mode: 0o600, flag: 'wx' });
        fs.renameSync(staged, absolute);
      } catch (error) {
        try {
          fs.unlinkSync(staged);
        } catch {
          // Nothing staged.
        }
        if (PROTECTED_ERRNO.has(error?.code)) {
          fail('MATERIALIZE_TARGET_PATH_PROTECTED', TARGET_CONFIG_PATH);
        }
        return fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
      }
    }
    const parentAfter = fs.lstatSync(directory, { bigint: true });
    if (
      parentBefore.dev !== parentAfter.dev
      || parentBefore.ino !== parentAfter.ino
    ) {
      fail('MATERIALIZE_PATH_BLOCKED', TARGET_CONFIG_PATH);
    }
    const committed = fs.readFileSync(absolute);
    if (sha256Bytes(committed) !== sha256Bytes(prepared.bytes)) {
      fail('MATERIALIZE_PARTIAL_OUTPUT', TARGET_CONFIG_PATH);
    }
    if (!prepared.receiptUnchanged) {
      writeJsonArtifact(root, prepared.paths.receipt, prepared.receipt, {
        subject: prepared.materializeId,
      });
    }
    return prepared.report;
  } catch (error) {
    if (prepared.fileState === 'created') {
      try {
        const current = fs.readFileSync(absolute);
        if (sha256Bytes(current) === sha256Bytes(prepared.bytes)) {
          fs.unlinkSync(absolute);
        }
      } catch {
        // Unknown or changed content is preserved rather than removed.
      }
    }
    cleanup();
    throw error;
  }
}

export function targetConfigBytes(projectDir) {
  return targetState(projectDir);
}

const PRECEDENCE_CAVEAT = Object.freeze([
  'The command line and --config overrides sit above the project layer, so a run can override every value in this file.',
  'A .codex/config.toml nearer the working directory overrides this file under the closest-file-wins rule.',
  'The project layer loads only for a trusted project. trustStateObserved is unknown, and trust is set through projects.<path>.trust_level in a layer GovernSeed must not read.',
  'Managed requirement layers may add restrictions from /etc/codex/requirements.toml, %ProgramData%\\OpenAI\\Codex\\requirements.toml, a cloud config bundle, legacy managed_config.toml, or macOS MDM preferences. All lie outside the project root, so their composed effect is unobservable here.',
  'allowed_sandbox_modes in a managed layer may reject the sandbox_mode value written here, including a restrictive one.',
  'The user layer or a managed allowed_permission_profiles setting may switch the client to permission profiles, which do not compose with the sandbox settings written here. GovernSeed cannot read either location.',
  'Because sandbox_mode in any loaded config file makes Codex use the sandbox settings instead of default_permissions, the sandbox_mode written here can displace a stricter permission profile set in the user layer or a managed layer. This file may therefore widen the effective configuration even though every value it contains is the strictest value that key admits.',
]);

const KNOWN_LIMITATIONS = Object.freeze([
  {
    controlId: 'POL-SHELL-EXECUTION',
    note: 'Command rules are experimental and govern commands outside the sandbox; no rules file is written.',
    source: 'docs/enforcement-boundary.md',
  },
  {
    controlId: 'POL-FILESYSTEM-PROJECT-READ',
    note: 'A read-scope surface exists as [permissions.<name>.filesystem], but it is Beta and mutually exclusive with the sandbox settings written here, so it is out of scope this milestone rather than unavailable.',
    source: 'docs/enforcement-boundary.md',
  },
  {
    controlId: 'POL-CREDENTIALS',
    note: 'Project config cannot override provider, auth, or telemetry keys.',
    source: 'docs/enforcement-boundary.md',
  },
  {
    controlId: 'POL-EXTERNAL-CONTENT',
    note: 'Web-search keys exist but the mapping from untrusted-content handling to them is unreviewed.',
    source: 'docs/enforcement-boundary.md',
  },
  {
    controlId: 'all-materializable-controls',
    note: 'For Codex 0.138.0 and later the documentation prefers permission profiles and recommends the sandbox-mode surface only for legacy deployments; this milestone writes the legacy surface by frozen scope, not by platform preference.',
    source: 'docs/enforcement-boundary.md',
  },
  {
    controlId: 'all-materializable-controls',
    note: 'A written project-layer value is reported as ignored on some Codex surfaces, so a target-materialized value is not an effective value.',
    source: 'docs/enforcement-boundary.md',
  },
  {
    controlId: 'all-materializable-controls',
    note: 'The project .codex directory is recursively read-only under the default workspace-write sandbox, so materialize is a user-run operation and cannot be assumed to work from inside a standard Codex session.',
    source: 'docs/enforcement-boundary.md',
  },
  {
    controlId: 'all-materializable-controls',
    note: 'Writing sandbox_mode makes Codex use the sandbox settings instead of default_permissions, so this file can displace a stricter permission profile in a layer GovernSeed must not read. A deny mapped to approval_policy prompts rather than denies.',
    source: 'docs/enforcement-boundary.md',
  },
]);

/**
 * Whole-file ownership makes the comparison a single hash: this target owns
 * every byte of the file, so any difference is an edit made outside GovernSeed.
 */
function compareObserved(projectDir, { receipt }) {
  const state = targetState(projectDir);
  const currentSha256 = state.exists ? sha256Bytes(state.bytes) : null;
  const expected = receipt.targetFiles[0];
  const drift = [];
  if (!state.exists) {
    drift.push({
      subject: TARGET_CONFIG_PATH,
      reason: 'TARGET_SETTINGS_REMOVED',
      expectedHash: expected.sha256After,
      observedHash: null,
    });
  } else if (currentSha256 !== expected.sha256After) {
    drift.push({
      subject: TARGET_CONFIG_PATH,
      reason: 'TARGET_SETTINGS_EDITED_OUTSIDE_GOVERNSEED',
      expectedHash: expected.sha256After,
      observedHash: currentSha256,
    });
  }
  return { drift, observations: [] };
}

export const ATTEST_PROFILE = Object.freeze({
  target: 'codex',
  artifactType: TARGET_ARTIFACT_TYPE,
  configPath: TARGET_CONFIG_PATH,
  claim: ATTEST_CLAIM,
  // Copied verbatim from the frozen capability matrix, which stays canonical for
  // the narrative. The compiled Adapter is canonical for the counts, so any gap
  // between them is carried rather than absorbed.
  matrixClassification: Object.freeze({
    'filesystem.project-read': 'representable-only',
    'filesystem.project-write': 'representable-only',
    'filesystem.root-write': 'representable-only',
    'shell.execution': 'representable-only',
    network: 'representable-only',
    credentials: 'unsupported',
    delete: 'requires-human-approval',
    publish: 'requires-human-approval',
    'external-content': 'representable-only',
    'generated-artifacts': 'enforceable',
    'provider-retention': 'unsupported',
    verification: 'representable-only',
  }),
  precedenceCaveat: PRECEDENCE_CAVEAT,
  knownLimitations: KNOWN_LIMITATIONS,
  preflight: preflightTarget,
  selectReceipt(receipts, { projectDir }) {
    const state = targetState(projectDir);
    const currentSha256 = state.exists ? sha256Bytes(state.bytes) : null;
    const matching = receipts.find((entry) => (
      (entry.value.targetFiles ?? []).some(
        (file) => file?.sha256After === currentSha256,
      )
    ));
    return matching ?? receipts[receipts.length - 1];
  },
  compare: compareObserved,
});

export function canonicalReceiptBytes(receipt) {
  return canonicalJsonBytes(receipt);
}
