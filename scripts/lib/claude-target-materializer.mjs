/**
 * The Claude Code target materializer.
 *
 * It differs from the Codex one in exactly one structural way, and everything
 * else follows from it: `.claude/settings.json` is documented as checked into
 * git and shared with the team, so the file already existing is the normal case
 * rather than the exception. Whole-file ownership, the Codex precedent, would
 * refuse to materialize on most real projects. Ownership is therefore
 * entry-level and is recorded in the receipt, never as a marker key in the file.
 *
 * Every mapping below is read off the frozen
 * docs/research/2026-07-31-claude-code-policy-capability-matrix.md. Where the
 * matrix says BLOCKED, this file emits nothing and reports the control.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  sha256Bytes,
  sha256Canonical,
  writeJsonArtifact,
} from './governance-artifacts.mjs';
import {
  PolicyCompilerError,
} from './policy-compiler-core.mjs';
import { ATTEST_CLAIM } from './target-registry.mjs';

export const TARGET_SETTINGS_PATH = '.claude/settings.json';
export const LOCAL_SETTINGS_PATH = '.claude/settings.local.json';
export const TARGET_ARTIFACT_TYPE = 'claude-project-settings';

const TARGET_DIRECTORY = '.claude';
const SETTINGS_FILE = 'settings.json';
const MAX_TARGET_BYTES = 256 * 1024;
const MAX_SUBJECT_VALUE = 64;
const PROTECTED_ERRNO = new Set(['EACCES', 'EPERM', 'EROFS']);
const MATRIX = 'docs/research/2026-07-31-claude-code-policy-capability-matrix.md';

/**
 * Bare tool names, not scoped rules. A bare name removes the tool from Claude's
 * context entirely, where a scoped rule leaves it available and blocks matching
 * calls; the matrix requires choosing one deliberately per control, and a
 * restriction-only materializer takes the one with no pattern to get wrong.
 */
const TOOLS = Object.freeze({
  'shell.execution': ['Bash', 'PowerShell'],
  'filesystem.project-read': ['Glob', 'Grep', 'Read'],
  'filesystem.project-write': ['Edit', 'NotebookEdit', 'Write'],
});

/**
 * Both locks are documented to work from any scope and both only restrict.
 * They are emitted together, and only when the policy restricts something,
 * because they protect the mechanism the emitted entries depend on rather than
 * expressing a control of their own: `auto` approves what the policy put in
 * `ask`, and `bypassPermissions` skips the prompts entirely.
 */
const MODE_LOCKS = Object.freeze([
  { key: 'permissions.disableAutoMode', value: 'disable' },
  { key: 'permissions.disableBypassPermissionsMode', value: 'disable' },
]);

// Orthogonal to the five capability-matrix classifications. It records whether a
// native project-layer surface was written, never what GovernSeed can enforce.
const MATERIALIZATION = Object.freeze({
  'filesystem.project-read': 'materializable',
  'filesystem.project-write': 'materializable',
  'filesystem.root-write': 'not-applicable',
  'shell.execution': 'materializable',
  network: 'deferred',
  credentials: 'not-applicable',
  delete: 'deferred',
  publish: 'deferred',
  'external-content': 'deferred',
  'generated-artifacts': 'not-applicable',
  'provider-retention': 'not-applicable',
  verification: 'not-applicable',
});

const UNMATERIALIZED_REASON = Object.freeze({
  network: {
    reasonCode: 'CLAUDE_NO_PROJECT_LAYER_SURFACE',
    source: `${MATRIX} BLOCKED item 1 — no verified project-layer egress key, and a Bash(curl *) deny is not equivalent`,
  },
  'filesystem.root-write': {
    reasonCode: 'CLAUDE_NO_PROJECT_LAYER_SURFACE',
    source: 'permissions.additionalDirectories only grants; no documented key narrows the working directory below its default',
  },
  delete: {
    reasonCode: 'CLAUDE_NO_DEDICATED_TOOL',
    source: 'no documented tool name isolates deletion, so a bare-name deny would remove unrelated capability',
  },
  publish: {
    reasonCode: 'CLAUDE_NO_DEDICATED_TOOL',
    source: 'no documented tool name isolates publishing, so a bare-name deny would remove unrelated capability',
  },
  'external-content': {
    reasonCode: 'CLAUDE_MAPPING_UNREVIEWED',
    source: 'denying WebFetch and WebSearch leaves shell-mediated retrieval, so the mapping is a partial expression rather than the control',
  },
  credentials: {
    reasonCode: 'CLAUDE_NO_PROJECT_LAYER_SURFACE',
    source: 'no documented project-layer settings key governs provider credentials',
  },
  'generated-artifacts': {
    reasonCode: 'CLAUDE_NO_PROJECT_LAYER_SURFACE',
    source: 'GovernSeed-owned namespace; no Claude Code surface',
  },
  'provider-retention': {
    reasonCode: 'CLAUDE_NO_PROJECT_LAYER_SURFACE',
    source: 'provider policy, not a settings key',
  },
  verification: {
    reasonCode: 'CLAUDE_NO_PROJECT_LAYER_SURFACE',
    source: 'no native project-layer verification surface',
  },
});

const RESTRICTIVE_MODES = new Set(['deny', 'require-approval']);

// The two rule lists a restriction-only materializer may touch. attest reads
// both whether or not this policy owns an entry in them, because an entry in
// either is an additional restriction worth reporting.
const RULE_KEYS = Object.freeze(['permissions.ask', 'permissions.deny']);

const PRECEDENCE_CAVEAT = Object.freeze([
  'Managed settings outrank every other scope and cannot be overridden. They live outside the project root, so GovernSeed cannot read them and their absence is never established here.',
  'Command line arguments sit above every settings file, so a single run can override any value written here.',
  '.claude/settings.local.json outranks .claude/settings.json and is gitignored, so a developer can outrank a governed scalar with a file that never appears in review.',
  'The user layer at ~/.claude/settings.json ranks below the project layer, so it cannot override what is written here.',
  'Permission rules are the exception to precedence: they merge across scopes rather than override, and deny is evaluated first with specificity ignored. A deny or ask entry written here therefore cannot be removed or weakened by a higher-precedence file, while defaultMode and the two mode locks can.',
  'The workspace trust dialog is interactive and leaves no documented project-local record, so trustStateObserved is unknown and this attestation is downgraded accordingly. Only the restricting keys are written, and those are documented as applying without the trust dialog.',
]);

const KNOWN_LIMITATIONS = Object.freeze([
  {
    controlId: 'POL-NETWORK',
    note: 'No verified project-layer key controls network egress. The control is deferred rather than approximated with a shell deny, which the matrix refuses as non-equivalent.',
    source: MATRIX,
  },
  {
    controlId: 'POL-FILESYSTEM-ROOT-WRITE',
    note: 'additionalDirectories only grants access. No documented project-layer key narrows the working directory below its default, so the control has no surface here.',
    source: MATRIX,
  },
  {
    controlId: 'POL-FILESYSTEM-PROJECT-WRITE',
    note: 'Removing the write tools does not close shell-mediated writes. The emitted key fully expresses the mode for the tools it names, and nothing more.',
    source: MATRIX,
  },
  {
    controlId: 'POL-FILESYSTEM-PROJECT-READ',
    note: 'Removing the read tools does not close shell-mediated reads. The emitted key fully expresses the mode for the tools it names, and nothing more.',
    source: MATRIX,
  },
  {
    controlId: 'POL-EXTERNAL-CONTENT',
    note: 'WebFetch and WebSearch are deniable, but denying them is a partial expression of untrusted-content handling, so the mapping is left unreviewed rather than written.',
    source: MATRIX,
  },
  {
    controlId: 'all-materializable-controls',
    note: 'A settings file that fails validation is rejected as a whole and reported, which would drop the entire project layer including entries the team wrote itself. An existing file that does not parse is refused rather than replaced.',
    source: MATRIX,
  },
  {
    controlId: 'all-materializable-controls',
    note: 'Ownership is entry-level and lives in the receipt. Entries GovernSeed does not own are reported and never removed, so this file is not a statement of the complete restriction set.',
    source: MATRIX,
  },
]);

function fail(code, subject = 'claude-target-materializer') {
  throw new PolicyCompilerError(code, subject);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function permissionField(key) {
  return key.slice('permissions.'.length);
}

function shortValue(value) {
  const rendered = JSON.stringify(value) ?? 'undefined';
  return rendered.length > MAX_SUBJECT_VALUE
    ? `${rendered.slice(0, MAX_SUBJECT_VALUE)}…`
    : rendered;
}

function controlList(manifest) {
  return Object.values(manifest.controls)
    .flat()
    .sort((left, right) => compareText(left.controlId, right.controlId));
}

/**
 * Restriction-only, so a mode that asks for nothing emits nothing. `allow` and
 * `additionalDirectories` are never planned at all: they grant, and per the
 * matrix they also depend on a workspace trust dialog GovernSeed cannot observe.
 */
export function planTargetSettings(manifest) {
  const controls = controlList(manifest);
  const buckets = new Map(RULE_KEYS.map((key) => [key, new Set()]));
  const owners = new Map();

  for (const control of controls) {
    const tools = TOOLS[control.capability];
    if (!tools || !RESTRICTIVE_MODES.has(control.mode)) continue;
    const key = control.mode === 'deny' ? 'permissions.deny' : 'permissions.ask';
    for (const tool of tools) buckets.get(key).add(tool);
    owners.set(control.controlId, [key]);
  }

  const entries = [...buckets]
    .filter(([, tools]) => tools.size > 0)
    .map(([key, tools]) => ({
      key,
      entries: [...tools].sort(compareText),
    }))
    .sort((left, right) => compareText(left.key, right.key));

  // Every policy this compiler produces restricts at least one capability, so
  // the locks are present whenever there is anything to protect.
  const restricts = controls.some((control) => RESTRICTIVE_MODES.has(control.mode));
  const scalars = restricts ? MODE_LOCKS.map((lock) => ({ ...lock })) : [];

  return { entries, scalars, owners, controls };
}

export function materializeIdFor(manifest, policyHash, target, plan) {
  const plannedKeys = [
    ...plan.entries.map((entry) => ({
      key: entry.key,
      value: JSON.stringify(entry.entries),
    })),
    ...plan.scalars.map((scalar) => ({
      key: scalar.key,
      value: JSON.stringify(scalar.value),
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
 * Required-entry semantics for the arrays and no-overwrite semantics for the
 * scalars. An extra array entry can only restrict further, because rules merge
 * across scopes and deny is evaluated first with specificity ignored, so it is
 * kept. A conflicting scalar has no such argument and is refused: `plan` and
 * `dontAsk` have no established total order, so deciding which of two values is
 * stricter is a judgment GovernSeed declines to make on a human's behalf.
 */
export function mergeTargetSettings(existing, plan) {
  const next = existing === null ? {} : structuredClone(existing);
  if (!plainObject(next)) {
    fail('TARGET_SETTINGS_UNPARSEABLE', TARGET_SETTINGS_PATH);
  }
  if (next.permissions === undefined) next.permissions = {};
  if (!plainObject(next.permissions)) {
    fail('TARGET_SETTINGS_UNPARSEABLE', `${TARGET_SETTINGS_PATH} permissions`);
  }

  for (const owned of plan.entries) {
    const field = permissionField(owned.key);
    const current = next.permissions[field];
    if (
      current !== undefined
      && (!Array.isArray(current) || current.some((entry) => typeof entry !== 'string'))
    ) {
      fail('TARGET_SETTINGS_UNPARSEABLE', `${TARGET_SETTINGS_PATH} ${owned.key}`);
    }
    const kept = current ?? [];
    next.permissions[field] = [
      ...kept,
      ...owned.entries.filter((entry) => !kept.includes(entry)),
    ];
  }

  for (const scalar of plan.scalars) {
    const field = permissionField(scalar.key);
    const current = next.permissions[field];
    if (current !== undefined && current !== scalar.value) {
      fail(
        'TARGET_SETTINGS_SCALAR_CONFLICT',
        `${scalar.key}: found ${shortValue(current)}, policy requires ${shortValue(scalar.value)}`,
      );
    }
    next.permissions[field] = scalar.value;
  }
  return next;
}

export function renderTargetSettings(settings) {
  return `${JSON.stringify(settings, null, 2)}\n`;
}

function realProjectRoot(projectDir) {
  try {
    return fs.realpathSync(projectDir);
  } catch {
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
  }
}

function targetState(projectDir) {
  const root = realProjectRoot(projectDir);
  const directory = path.join(root, TARGET_DIRECTORY);
  const absolute = path.join(directory, SETTINGS_FILE);
  let directoryStat;
  try {
    directoryStat = fs.lstatSync(directory);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
    }
    return { absolute, directory, exists: false, bytes: null };
  }
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
  }
  let real;
  try {
    real = fs.realpathSync(directory);
  } catch {
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
  }
  if (real !== directory) {
    fail('MATERIALIZE_OUTSIDE_PROJECT', TARGET_SETTINGS_PATH);
  }
  let stat;
  try {
    stat = fs.lstatSync(absolute, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return { absolute, directory, exists: false, bytes: null };
    }
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
  }
  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || (typeof stat.nlink === 'bigint' && stat.nlink > 1n)
  ) {
    fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
  }
  if (stat.size > BigInt(MAX_TARGET_BYTES)) {
    fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
  }
  let bytes;
  try {
    bytes = fs.readFileSync(absolute);
  } catch (error) {
    if (PROTECTED_ERRNO.has(error?.code)) {
      fail('MATERIALIZE_TARGET_PATH_PROTECTED', TARGET_SETTINGS_PATH);
    }
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
  }
  return { absolute, directory, exists: true, bytes };
}

/**
 * A file that does not parse is refused rather than replaced. Claude Code
 * rejects an invalid project settings file as a whole and reports it, so
 * overwriting one would silently drop the entire project layer, including
 * entries the team wrote itself. That is the one outcome a governance tool must
 * not produce.
 */
function parseSettings(bytes, subject) {
  let value;
  try {
    value = JSON.parse(bytes.toString('utf8'));
  } catch {
    return fail('TARGET_SETTINGS_UNPARSEABLE', subject);
  }
  if (!plainObject(value)) fail('TARGET_SETTINGS_UNPARSEABLE', subject);
  return value;
}

function classifyControls(plan, manifest, target) {
  const materialized = [];
  const unmaterialized = [];
  for (const control of plan.controls) {
    const status = MATERIALIZATION[control.capability] ?? 'not-applicable';
    const nativeKeys = (plan.owners.get(control.controlId) ?? []).sort(compareText);
    if (status === 'materializable' && nativeKeys.length > 0) {
      const emitted = plan.entries
        .filter((entry) => nativeKeys.includes(entry.key))
        .map((entry) => `${entry.key} = ${JSON.stringify(entry.entries)}`)
        .join('; ');
      materialized.push({
        controlId: control.controlId,
        capability: control.capability,
        mode: control.mode,
        classification: control.targetSupport[target],
        materializationStatus: 'materializable',
        // A bare tool name removes the tool rather than prompting for it, and an
        // ask entry is an approval mode expressed as an approval gate. Neither
        // downgrades its mode the way a deny written as an approval does.
        modeCoverage: 'full',
        nativeKeys,
        emittedValue: emitted,
      });
      continue;
    }
    const reason = status === 'materializable'
      ? {
        reasonCode: 'CLAUDE_POLICY_MODE_NOT_RESTRICTIVE',
        source: 'the compiled mode asks for no restriction on this key',
      }
      : UNMATERIALIZED_REASON[control.capability] ?? {
        reasonCode: 'CLAUDE_NO_PROJECT_LAYER_SURFACE',
        source: MATRIX,
      };
    unmaterialized.push({
      controlId: control.controlId,
      capability: control.capability,
      materializationStatus: status === 'materializable' ? 'deferred' : status,
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
  };
}

function existingReceipt(projectDir, receiptPath) {
  const absolute = path.join(
    realProjectRoot(projectDir),
    ...receiptPath.split('/'),
  );
  let text;
  try {
    text = fs.readFileSync(absolute, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return fail('MATERIALIZE_RECEIPT_INVALID', receiptPath);
  }
}

/**
 * targetFiles is excluded, unlike the Codex comparison. The file is shared, so
 * an unrelated key a teammate adds changes its hash without changing anything
 * GovernSeed owns; comparing the hash would turn a legitimate edit into a
 * tampered receipt. What identifies this receipt is the owned set.
 */
function receiptEquivalent(left, right) {
  const comparable = (value) => {
    const clone = structuredClone(value);
    delete clone.materializedAt;
    delete clone.filesCreated;
    delete clone.filesUpdated;
    delete clone.filesUnchanged;
    delete clone.targetFiles;
    return clone;
  };
  return sha256Canonical(comparable(left)) === sha256Canonical(comparable(right));
}

export function prepareTargetMaterialize(projectDir, {
  manifest,
  policyHash,
  target,
  dryRun,
  materializedAt,
}) {
  const plan = planTargetSettings(manifest);
  const materializeId = materializeIdFor(manifest, policyHash, target, plan);
  const state = targetState(projectDir);
  const existing = state.exists
    ? parseSettings(state.bytes, TARGET_SETTINGS_PATH)
    : null;
  const merged = mergeTargetSettings(existing, plan);
  const bytes = Buffer.from(renderTargetSettings(merged), 'utf8');
  const sha256After = sha256Bytes(bytes);
  const sha256Before = state.exists ? sha256Bytes(state.bytes) : null;

  let fileState = 'created';
  if (state.exists) {
    fileState = sha256Before === sha256After ? 'unchanged' : 'updated';
  }

  const classified = classifyControls(plan, manifest, target);
  const receiptPath = `.agent-governance/receipts/${materializeId}.json`;
  const previousReceipt = existingReceipt(projectDir, receiptPath);
  const candidate = {
    schemaVersion: 1,
    materializeId,
    policyId: manifest.policyId,
    policyHash,
    target,
    ownedEntries: plan.entries.map((entry) => ({
      key: entry.key,
      entries: [...entry.entries],
    })),
    ownedScalars: plan.scalars.map((scalar) => ({ ...scalar })),
    dryRun: false,
    trustStateObserved: 'unknown',
    targetFiles: [
      { path: TARGET_SETTINGS_PATH, sha256Before, sha256After },
    ],
    materializedControls: classified.materialized,
    unmaterializedControls: classified.unmaterialized,
    filesCreated: [
      ...(fileState === 'created' ? [TARGET_SETTINGS_PATH] : []),
      ...(previousReceipt ? [] : [receiptPath]),
    ].sort(compareText),
    filesUpdated: fileState === 'updated' ? [TARGET_SETTINGS_PATH] : [],
    filesUnchanged: [
      ...(fileState === 'unchanged' ? [TARGET_SETTINGS_PATH] : []),
      ...(previousReceipt ? [receiptPath] : []),
    ].sort(compareText),
    materializedAt,
    ownership: {
      generator: 'GovernSeed',
      artifactType: TARGET_ARTIFACT_TYPE,
    },
    status: 'target-materialized',
  };
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
    bytes,
    receipt,
    report,
    receiptUnchanged: Boolean(previousReceipt),
    fileState,
    dryRun,
    paths: { target: TARGET_SETTINGS_PATH, receipt: receiptPath },
    state,
  };
}

function ensureTargetDirectory(directory) {
  try {
    fs.mkdirSync(directory, { mode: 0o700 });
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    if (PROTECTED_ERRNO.has(error?.code)) {
      fail('MATERIALIZE_TARGET_PATH_PROTECTED', TARGET_SETTINGS_PATH);
    }
    return fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
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
  const directory = path.join(root, TARGET_DIRECTORY);
  const absolute = path.join(directory, SETTINGS_FILE);
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
      const staged = path.join(directory, `.${SETTINGS_FILE}.${process.pid}.tmp`);
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
          fail('MATERIALIZE_TARGET_PATH_PROTECTED', TARGET_SETTINGS_PATH);
        }
        return fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
      }
    }
    const parentAfter = fs.lstatSync(directory, { bigint: true });
    if (
      parentBefore.dev !== parentAfter.dev
      || parentBefore.ino !== parentAfter.ino
    ) {
      fail('MATERIALIZE_PATH_BLOCKED', TARGET_SETTINGS_PATH);
    }
    const committed = fs.readFileSync(absolute);
    if (sha256Bytes(committed) !== sha256Bytes(prepared.bytes)) {
      fail('MATERIALIZE_PARTIAL_OUTPUT', TARGET_SETTINGS_PATH);
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

function readLocalScope(projectDir) {
  const absolute = path.join(realProjectRoot(projectDir), ...LOCAL_SETTINGS_PATH.split('/'));
  let stat;
  try {
    stat = fs.lstatSync(absolute);
  } catch {
    return { exists: false, settings: null, parsed: false };
  }
  if (!stat.isFile() || stat.size > MAX_TARGET_BYTES) {
    return { exists: true, settings: null, parsed: false };
  }
  try {
    const value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    return { exists: true, settings: plainObject(value) ? value : null, parsed: plainObject(value) };
  } catch {
    return { exists: true, settings: null, parsed: false };
  }
}

/**
 * Drift is the project-layer file no longer matching what the receipt requires.
 * A higher-precedence scope is not drift by itself; it is an observation, and it
 * becomes drift only for the scalar keys, which are the only ones precedence can
 * actually displace.
 */
function compareObserved(projectDir, { receipt }) {
  const drift = [];
  const observations = [];
  const state = targetState(projectDir);
  if (!state.exists) {
    drift.push({
      subject: TARGET_SETTINGS_PATH,
      reason: 'TARGET_SETTINGS_REMOVED',
      expectedHash: receipt.targetFiles[0].sha256After,
      observedHash: null,
    });
    return { drift, observations };
  }

  let settings;
  try {
    settings = parseSettings(state.bytes, TARGET_SETTINGS_PATH);
  } catch {
    drift.push({
      subject: TARGET_SETTINGS_PATH,
      reason: 'TARGET_SETTINGS_UNPARSEABLE',
      expectedHash: receipt.targetFiles[0].sha256After,
      observedHash: sha256Bytes(state.bytes),
    });
    return { drift, observations };
  }
  const permissions = plainObject(settings.permissions) ? settings.permissions : {};

  const requiredByKey = new Map(
    receipt.ownedEntries.map((owned) => [owned.key, owned.entries]),
  );
  for (const key of RULE_KEYS) {
    const required = requiredByKey.get(key) ?? [];
    const field = permissionField(key);
    const current = Array.isArray(permissions[field]) ? permissions[field] : [];
    const missing = required.filter((entry) => !current.includes(entry));
    if (missing.length > 0) {
      drift.push({
        subject: `${key}: ${missing.join(', ')}`,
        reason: 'TARGET_SETTINGS_ENTRY_MISSING',
      });
    }
    const extra = current.filter((entry) => !required.includes(entry));
    if (extra.length > 0) {
      observations.push({
        subject: `${key}: ${extra.join(', ')}`,
        reason: 'TARGET_SETTINGS_ADDITIONAL_RESTRICTION',
        detail: 'Rules merge across scopes and deny is evaluated first, so an entry GovernSeed does not own can only restrict further. It is reported and never removed.',
      });
    }
  }
  for (const scalar of receipt.ownedScalars) {
    const field = permissionField(scalar.key);
    if (permissions[field] !== scalar.value) {
      drift.push({
        subject: `${scalar.key}: found ${shortValue(permissions[field])}, receipt requires ${shortValue(scalar.value)}`,
        reason: 'TARGET_SETTINGS_SCALAR_CHANGED',
      });
    }
  }

  const local = readLocalScope(projectDir);
  if (local.exists) {
    const overridden = receipt.ownedScalars.filter((scalar) => {
      if (!local.parsed) return true;
      const permissionsLocal = plainObject(local.settings.permissions)
        ? local.settings.permissions
        : {};
      const field = permissionField(scalar.key);
      return field in permissionsLocal && permissionsLocal[field] !== scalar.value;
    });
    for (const scalar of overridden) {
      drift.push({
        subject: `${LOCAL_SETTINGS_PATH} ${scalar.key}`,
        reason: 'TARGET_SETTINGS_LOCAL_SCOPE_OVERRIDES_SCALAR',
      });
    }
    if (overridden.length === 0) {
      observations.push({
        subject: LOCAL_SETTINGS_PATH,
        reason: 'TARGET_SETTINGS_LOCAL_SCOPE_PRESENT',
        detail: 'This scope is gitignored and outranks the project layer for the scalar keys. It does not set any of them now, and it cannot remove a deny or ask entry, because permission rules merge across scopes.',
      });
    }
  }

  return { drift, observations };
}

export const ATTEST_PROFILE = Object.freeze({
  target: 'claude',
  artifactType: TARGET_ARTIFACT_TYPE,
  configPath: TARGET_SETTINGS_PATH,
  claim: ATTEST_CLAIM,
  reportsObservations: true,
  // Copied verbatim from the frozen capability matrix, which stays canonical for
  // the narrative. The compiled Adapter is canonical for the counts, so any gap
  // between them is carried rather than absorbed. `network` has no entry because
  // its matrix row is BLOCKED, which is not one of the five classifications;
  // there is nothing for the Adapter to diverge from.
  matrixClassification: Object.freeze({
    'filesystem.project-read': 'representable-only',
    'filesystem.project-write': 'representable-only',
    'filesystem.root-write': 'unsupported',
    'shell.execution': 'representable-only',
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
  preflight() {
    // The matrix documents exactly four settings scopes, none of them nested, so
    // there is no closest-file-wins shadowing to scan for before writing.
  },
  selectReceipt(receipts, { manifest, policyHash }) {
    const plan = planTargetSettings(manifest);
    const expected = materializeIdFor(manifest, policyHash, 'claude', plan);
    const matching = receipts.find(
      (entry) => entry.value.materializeId === expected,
    );
    return matching ?? receipts[receipts.length - 1];
  },
  compare: compareObserved,
});
