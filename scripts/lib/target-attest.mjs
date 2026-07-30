/**
 * The target-generic attestation builder.
 *
 * Everything that differs between targets — the file it owns, the precedence
 * order that outranks it, its known limitations, how it selects its receipt, and
 * how it compares the observed layer — lives in that target's materializer as an
 * `ATTEST_PROFILE`. This file owns only what is the same for every target: the
 * three-way structure, the counts, the downgrade rule, and the claim.
 */
import fs from 'node:fs';
import path from 'node:path';

import {
  validateArtifact,
} from './governance-artifacts.mjs';
import {
  PolicyCompilerError,
} from './policy-compiler-core.mjs';
import { ATTEST_PROFILE as CLAUDE } from './claude-target-materializer.mjs';
import { ATTEST_PROFILE as CODEX } from './codex-target-materializer.mjs';
import { ATTEST_CLAIM } from './target-registry.mjs';

const PROFILES = Object.freeze({ claude: CLAUDE, codex: CODEX });

const RECEIPT_NAME = /^MAT-[0-9A-F]{12}\.json$/u;
const MAX_RECEIPT_BYTES = 1024 * 1024;

function fail(code, subject = 'target-attest') {
  throw new PolicyCompilerError(code, subject);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readReceipts(projectDir, artifactType) {
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
    if (value?.ownership?.artifactType !== artifactType) continue;
    receipts.push({ name, value });
  }
  return receipts;
}

function materializationBreakdown(receipt) {
  const counts = {
    'not-applicable': 0,
    materializable: 0,
    deferred: 0,
  };
  for (const entry of receipt.materializedControls) {
    counts[entry.materializationStatus] += 1;
  }
  for (const entry of receipt.unmaterializedControls) {
    counts[entry.materializationStatus] += 1;
  }
  return counts;
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

function classificationDivergence(adapter, manifest, matrixClassification) {
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
    const matrixValue = matrixClassification[capability];
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
 * state currently at the target path. The comparison is byte, hash, and
 * entry based; attest never reports an effective configuration.
 */
export function buildAttestation(projectDir, {
  manifest,
  adapter,
  policyHash,
  target,
}) {
  const profile = PROFILES[target];
  if (!profile) fail('CLI_TARGET_UNSUPPORTED', target ?? 'target');

  const receipts = readReceipts(projectDir, profile.artifactType);
  if (receipts.length === 0) fail('MATERIALIZE_RECEIPT_MISSING', 'receipts');
  const selected = profile.selectReceipt(receipts, {
    projectDir,
    manifest,
    policyHash,
  });
  const validation = validateArtifact(
    'materialize-receipt.schema.json',
    selected.value,
  );
  if (!validation.valid) {
    fail('MATERIALIZE_RECEIPT_INVALID', selected.name);
  }
  const receipt = selected.value;

  profile.preflight(projectDir);
  const compared = profile.compare(projectDir, {
    receipt,
    manifest,
    policyHash,
  });
  const drift = [...compared.drift];
  if (receipt.policyId !== manifest.policyId || receipt.policyHash !== policyHash) {
    drift.push({
      subject: receipt.materializeId,
      reason: 'TARGET_SETTINGS_STALE_POLICY',
      expectedHash: policyHash,
      observedHash: receipt.policyHash,
    });
  }

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
    classificationSourceDivergence: classificationDivergence(
      adapter,
      manifest,
      profile.matrixClassification,
    ),
    materializationBreakdown: materializationBreakdown(receipt),
    drift,
    precedenceCaveat: [...profile.precedenceCaveat],
    knownLimitations: profile.knownLimitations.map((entry) => ({ ...entry })),
    claim: ATTEST_CLAIM,
  };
  // Only a target with entry-level ownership can be stricter than required or
  // outranked on part of its surface, so only that target reports the field.
  if (profile.reportsObservations) {
    output.observations = compared.observations;
  }
  const outputValidation = validateArtifact('attest-output.schema.json', output);
  if (!outputValidation.valid) {
    fail('ATTEST_OUTPUT_INVALID', manifest.policyId);
  }
  return output;
}
