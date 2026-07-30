import fs from 'node:fs';
import path from 'node:path';

import {
  sha256Bytes,
  validateArtifact,
} from './governance-artifacts.mjs';
import {
  PolicyCompilerError,
} from './policy-compiler-core.mjs';
import {
  ATTEST_CLAIM,
  TARGET_ARTIFACT_TYPE,
  TARGET_CONFIG_PATH,
  findPermissionProfileConflict,
  findShadowingConfig,
  materializationBreakdown,
  scanProjectConfigs,
  targetConfigBytes,
} from './codex-target-materializer.mjs';

const RECEIPT_NAME = /^MAT-[0-9A-F]{12}\.json$/u;
const MAX_RECEIPT_BYTES = 1024 * 1024;

// Copied verbatim from the frozen capability matrix, which stays canonical for
// the narrative. The compiled Adapter is canonical for the counts, so any gap
// between them is carried rather than absorbed.
const MATRIX_CLASSIFICATION = Object.freeze({
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
});

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

function fail(code, subject = 'target-attest') {
  throw new PolicyCompilerError(code, subject);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readReceipts(projectDir) {
  const directory = path.join(projectDir, '.agent-governance', 'receipts');
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return [];
  }
  const receipts = [];
  for (const name of entries.sort(compareText)) {
    if (!RECEIPT_NAME.test(name)) continue;
    const absolute = path.join(directory, name);
    let stat;
    try {
      stat = fs.lstatSync(absolute);
    } catch {
      continue;
    }
    if (!stat.isFile() || stat.size > MAX_RECEIPT_BYTES) continue;
    let value;
    try {
      value = JSON.parse(fs.readFileSync(absolute, 'utf8'));
    } catch {
      fail('MATERIALIZE_RECEIPT_INVALID', name);
    }
    if (value?.ownership?.artifactType !== TARGET_ARTIFACT_TYPE) continue;
    receipts.push({ name, value });
  }
  return receipts;
}

function selectReceipt(receipts, currentSha256) {
  if (receipts.length === 0) fail('MATERIALIZE_RECEIPT_MISSING', 'receipts');
  const matching = receipts.find((entry) => (
    (entry.value.targetFiles ?? []).some(
      (file) => file?.sha256After === currentSha256,
    )
  ));
  return matching ?? receipts[receipts.length - 1];
}

function classificationBreakdown(adapter) {
  const counts = {
    enforceable: 0,
    'representable-only': 0,
    unsupported: 0,
    'requires-human-approval': 0,
    'runtime-evidence-required': 0,
  };
  for (const control of adapter.mappedControls ?? []) {
    if (control.support in counts) counts[control.support] += 1;
  }
  for (const control of adapter.unsupportedControls ?? []) {
    if (control.support in counts) counts[control.support] += 1;
  }
  return counts;
}

function classificationDivergence(adapter, manifest) {
  const capabilityById = new Map(
    Object.values(manifest.controls).flat().map((control) => [
      control.controlId,
      control.capability,
    ]),
  );
  const rows = [];
  const seen = new Set();
  const consider = (controlId, adapterValue) => {
    if (seen.has(controlId)) return;
    seen.add(controlId);
    const capability = capabilityById.get(controlId);
    const matrixValue = MATRIX_CLASSIFICATION[capability];
    if (!matrixValue || matrixValue === adapterValue) return;
    rows.push({
      controlId,
      adapterValue,
      matrixValue,
      note: 'The compiled Adapter is canonical for counts; the frozen capability matrix is canonical for the narrative. Neither source is edited.',
    });
  };
  for (const control of adapter.mappedControls ?? []) {
    consider(control.controlId, control.support);
  }
  for (const control of adapter.unsupportedControls ?? []) {
    consider(control.controlId, control.support);
  }
  return rows.sort((left, right) => compareText(left.controlId, right.controlId));
}

/**
 * Three-way: the compiled policy and Adapter, the materialize receipt, and the
 * bytes currently at the target path. The comparison is byte and hash based;
 * attest never parses TOML and never reports an effective configuration.
 */
export function buildAttestation(projectDir, {
  manifest,
  adapter,
  policyHash,
  target,
}) {
  const state = targetConfigBytes(projectDir);
  const currentSha256 = state.exists ? sha256Bytes(state.bytes) : null;
  const receipts = readReceipts(projectDir);
  const selected = selectReceipt(receipts, currentSha256);
  const validation = validateArtifact(
    'materialize-receipt.schema.json',
    selected.value,
  );
  if (!validation.valid) {
    fail('MATERIALIZE_RECEIPT_INVALID', selected.name);
  }
  const receipt = selected.value;

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
  if (receipt.policyId !== manifest.policyId || receipt.policyHash !== policyHash) {
    drift.push({
      subject: receipt.materializeId,
      reason: 'TARGET_SETTINGS_STALE_POLICY',
      expectedHash: policyHash,
      observedHash: receipt.policyHash,
    });
  }

  const breakdown = materializationBreakdown(receipt);
  const declared = receipt.materializedControls.length
    + receipt.unmaterializedControls.length;
  const materialized = receipt.materializedControls.length;
  const output = {
    schemaVersion: 1,
    // trustStateObserved is unknown, so the downgrade rule applies. It is
    // applied after every comparison and no input can override it.
    level: 'materialized-unverified',
    trustStateObserved: 'unknown',
    target,
    policyId: manifest.policyId,
    policyHash,
    materializeId: receipt.materializeId,
    declared,
    materialized,
    projectLayerObserved: drift.length === 0 ? materialized : 0,
    classificationBreakdown: classificationBreakdown(adapter),
    classificationSourceDivergence: classificationDivergence(adapter, manifest),
    materializationBreakdown: breakdown,
    drift,
    precedenceCaveat: [...PRECEDENCE_CAVEAT],
    knownLimitations: KNOWN_LIMITATIONS.map((entry) => ({ ...entry })),
    claim: ATTEST_CLAIM,
  };
  const outputValidation = validateArtifact('attest-output.schema.json', output);
  if (!outputValidation.valid) {
    fail('ATTEST_OUTPUT_INVALID', manifest.policyId);
  }
  return output;
}
