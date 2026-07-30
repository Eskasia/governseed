import fs from 'node:fs';
import path from 'node:path';

import {
  canonicalJsonBytes,
  readJsonArtifact,
  readJsonArtifactWithBytes,
  sha256Bytes,
  sha256Canonical,
  validateArtifact,
} from './governance-artifacts.mjs';
import { preparePolicyCompile } from './policy-compiler-project.mjs';
import {
  REGISTERED_TARGETS,
  targetDefinition,
} from './target-registry.mjs';

const FATAL_CODES = new Set([
  'COMPILE_PATH_BLOCKED',
  'PATH_ESCAPE_BLOCKED',
  'PRIVATE_CONTENT_BLOCKED',
  'SECRET_VALUE_BLOCKED',
  'SYMLINK_BLOCKED',
]);
const STABLE_CODES = new Set([
  ...REGISTERED_TARGETS.flatMap((name) => [
    targetDefinition(name).adapterInvalidCode,
    targetDefinition(name).adapterOwnerConflictCode,
  ]),
  'COMPILE_PARTIAL_OUTPUT',
  'COMPILE_PATH_BLOCKED',
  'COMPILE_RECEIPT_INVALID',
  'POLICY_APPROVAL_MISSING',
  'POLICY_CONFLICT',
  'POLICY_INPUT_MISSING',
  'POLICY_MANIFEST_INVALID',
  'POLICY_OUTPUT_DRIFT',
  'POLICY_OUTPUT_STALE',
  'POLICY_PRIVILEGE_EXPANSION',
  'POLICY_SOURCE_HASH_MISMATCH',
  'POLICY_UNSUPPORTED_CONTROL',
]);

function finding(code, subject, message) {
  return { code, subject, message };
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function listJsonFiles(projectDir, relativeDirectory, findings) {
  const absolute = path.join(
    projectDir,
    ...relativeDirectory.split('/'),
  );
  let stat;
  try {
    stat = fs.lstatSync(absolute, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    findings.push(finding(
      'COMPILE_PATH_BLOCKED',
      'governance-file',
      'policy output directory could not be inspected safely',
    ));
    return [];
  }
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    findings.push(finding(
      'SYMLINK_BLOCKED',
      'governance-file',
      'policy output directory must be a contained regular directory',
    ));
    return [];
  }
  try {
    const root = fs.realpathSync(projectDir);
    const realDirectory = fs.realpathSync(absolute);
    if (
      realDirectory !== root
      && !realDirectory.startsWith(`${root}${path.sep}`)
    ) {
      findings.push(finding(
        'COMPILE_PATH_BLOCKED',
        'governance-file',
        'policy output directory escaped the project root',
      ));
      return [];
    }
  } catch {
    findings.push(finding(
      'COMPILE_PATH_BLOCKED',
      'governance-file',
      'policy output directory could not be resolved safely',
    ));
    return [];
  }
  const files = [];
  try {
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const relative = `${relativeDirectory}/${entry.name}`;
      if (entry.isSymbolicLink()) {
        findings.push(finding(
          'SYMLINK_BLOCKED',
          'governance-file',
          'policy output directory contains an unsafe link',
        ));
      } else if (entry.isFile() && entry.name.endsWith('.json')) {
        const fileStat = fs.lstatSync(
          path.join(absolute, entry.name),
          { bigint: true },
        );
        if (fileStat.nlink > 1n) {
          findings.push(finding(
            'SYMLINK_BLOCKED',
            'governance-file',
            'policy output must not be hard-linked',
          ));
        } else {
          files.push(relative);
        }
      }
    }
  } catch {
    findings.push(finding(
      'COMPILE_PATH_BLOCKED',
      'governance-file',
      'policy output directory could not be enumerated safely',
    ));
  }
  return files.sort(compareText);
}

function caughtFinding(error, fallbackCode) {
  const rawCode = error?.code;
  if ([
    'FILE_TOO_LARGE',
    'INVALID_UTF8',
    'PRIVATE_CONTENT_BLOCKED',
    'SECRET_VALUE_BLOCKED',
  ].includes(rawCode)) {
    return finding(
      'PRIVATE_CONTENT_BLOCKED',
      'governance-file',
      'policy artifact violated the bounded privacy contract',
    );
  }
  const code = rawCode === 'PATH_ESCAPE_BLOCKED'
    ? 'COMPILE_PATH_BLOCKED'
    : STABLE_CODES.has(rawCode) || rawCode === 'SYMLINK_BLOCKED'
      ? rawCode
      : fallbackCode;
  return finding(
    code,
    'governance-file',
    'policy artifact is missing, invalid, or unsafe',
  );
}

function readArtifact(
  projectDir,
  relativePath,
  schema,
  invalidCode,
  findings,
  byteHashes,
) {
  let record;
  try {
    record = readJsonArtifactWithBytes(projectDir, relativePath, {
      subject: 'governance-artifact',
    });
  } catch (error) {
    findings.push(caughtFinding(error, invalidCode));
    return null;
  }
  const value = record.value;
  const validation = validateArtifact(schema, value, {});
  if (!validation.valid) {
    findings.push(finding(
      invalidCode,
      'governance-file',
      'policy artifact does not match its schema',
    ));
    return null;
  }
  const byteHash = sha256Bytes(record.bytes);
  if (
    schema === 'compile-receipt.schema.json'
    && byteHash !== sha256Bytes(canonicalJsonBytes(value))
  ) {
    findings.push(finding(
      invalidCode,
      'governance-file',
      'compile receipt is not canonical JSON bytes',
    ));
    return null;
  }
  byteHashes.set(relativePath, byteHash);
  return value;
}

function ownedBy(value, artifactType) {
  return value?.ownership?.generator === 'GovernSeed'
    && value.ownership.artifactType === artifactType;
}

function addCapabilityWarnings(manifests, adapters, findings) {
  if ([...manifests.values()].some(
    (manifest) => manifest.unsupportedControls.length > 0,
  )) {
    findings.push(finding(
      'POLICY_UNSUPPORTED_CONTROL',
      'governance-file',
      'the target cannot enforce every canonical policy control',
    ));
  }
  for (const adapter of adapters.values()) {
    if (!adapter.mappedControls.some(
      (control) => control.support !== 'enforceable',
    )) continue;
    const definition = targetDefinition(adapter.target);
    findings.push(finding(
      definition.unsupportedReasonCode,
      'governance-file',
      `one or more ${definition.name} mappings are guidance rather than enforcement`,
    ));
  }
}

function currentCompileExpectation(projectDir, findings) {
  try {
    return preparePolicyCompile(projectDir, {
      target: 'codex',
      dryRun: true,
      compiledAt: '1970-01-01T00:00:00.000Z',
    });
  } catch (error) {
    findings.push(caughtFinding(error, 'POLICY_MANIFEST_INVALID'));
    return null;
  }
}

function sameHashEntries(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const normalized = (entries) => [...entries]
    .sort((first, second) => compareText(first.path, second.path));
  return sha256Canonical(normalized(left))
    === sha256Canonical(normalized(right));
}

function addContextualArtifactFindings(
  manifests,
  adapters,
  receipts,
  findings,
) {
  const manifestsByPolicy = new Map(
    [...manifests.values()].map(
      (manifest) => [manifest.policyId, manifest],
    ),
  );
  const adaptersByPolicy = new Map(
    [...adapters.values()].map(
      (adapter) => [adapter.policyId, adapter],
    ),
  );
  for (const adapter of adapters.values()) {
    const manifest = manifestsByPolicy.get(adapter.policyId);
    if (
      manifest
      && !validateArtifact(
        targetDefinition(adapter.target).adapterSchema,
        adapter,
        { manifest },
      ).valid
    ) {
      findings.push(finding(
        targetDefinition(adapter.target).adapterInvalidCode,
        'governance-file',
        'Codex adapter does not match its canonical policy manifest',
      ));
    }
  }
  for (const receipt of receipts.values()) {
    const manifest = manifestsByPolicy.get(receipt.policyId);
    const adapter = adaptersByPolicy.get(receipt.policyId);
    if (
      manifest
      && adapter
      && !validateArtifact(
        'compile-receipt.schema.json',
        receipt,
        { manifest, adapter },
      ).valid
    ) {
      findings.push(finding(
        'COMPILE_RECEIPT_INVALID',
        'governance-file',
        'compile receipt does not match its policy and adapter outputs',
      ));
    }
  }
}

function inspectRequiredApproval(projectDir, expected, findings) {
  if (!expected) return;
  try {
    const profile = readJsonArtifact(
      projectDir,
      '.agent-governance/risk-profile.json',
      { subject: 'risk-profile' },
    );
    const activeTasks = profile.tasks?.filter(
      (task) => task.status === 'active',
    ) ?? [];
    const pendingApproval = [
      {
        controlId: 'POL-PUBLISH-ACTIONS',
        active: activeTasks.some((task) => (
          task.sideEffects?.includes('publish')
          || task.requestedCapabilities?.includes('publish')
        )),
      },
      {
        controlId: 'POL-DESTRUCTIVE-ACTIONS',
        active: activeTasks.some((task) => (
          task.sideEffects?.some((effect) => (
            ['delete', 'destructive', 'destructive-action'].includes(effect)
          ))
          || task.requestedCapabilities?.some(
            (capability) => capability === 'delete',
          )
        )),
      },
    ].some(({ controlId, active }) => (
      active
      && expected.manifest.humanApprovalControls.includes(controlId)
    ));
    if (pendingApproval) {
      findings.push(finding(
        'POLICY_APPROVAL_MISSING',
        'governance-file',
        'active publish or destructive work requires separate human approval evidence',
      ));
    }
  } catch (error) {
    findings.push(caughtFinding(error, 'POLICY_INPUT_MISSING'));
  }
}

export function evaluatePolicyCompilerGovernance(projectDir) {
  const findings = [];
  const policyFiles = listJsonFiles(
    projectDir,
    '.agent-governance/policies',
    findings,
  );
  // One scan per registered target: an adapter directory that exists for a
  // target this build does not know about is not silently skipped, because
  // listJsonFiles only reports directories it was asked to look at.
  const adapterFiles = REGISTERED_TARGETS.flatMap((name) => listJsonFiles(
    projectDir,
    `.agent-governance/adapters/${name}`,
    findings,
  ).map((relative) => ({ relative, definition: targetDefinition(name) })));
  const receiptFiles = listJsonFiles(
    projectDir,
    '.agent-governance/receipts',
    findings,
  );
  const hasSurface = policyFiles.length > 0
    || adapterFiles.length > 0
    || receiptFiles.length > 0
    || findings.length > 0;
  if (!hasSurface) return { findings: [], fatal: false };

  const expected = currentCompileExpectation(projectDir, findings);
  const manifests = new Map();
  const adapters = new Map();
  const receipts = new Map();
  const byteHashes = new Map();
  for (const relative of policyFiles) {
    const value = readArtifact(
      projectDir,
      relative,
      'policy-manifest.schema.json',
      'POLICY_MANIFEST_INVALID',
      findings,
      byteHashes,
    );
    if (!value) continue;
    if (!ownedBy(value, 'policy-manifest')) {
      findings.push(finding(
        'POLICY_OUTPUT_DRIFT',
        'governance-file',
        'policy manifest is not owned by the compiler',
      ));
      continue;
    }
    manifests.set(relative, value);
  }
  for (const { relative, definition } of adapterFiles) {
    const value = readArtifact(
      projectDir,
      relative,
      definition.adapterSchema,
      definition.adapterInvalidCode,
      findings,
      byteHashes,
    );
    if (!value) continue;
    if (!ownedBy(value, definition.adapterArtifactType)) {
      findings.push(finding(
        definition.adapterOwnerConflictCode,
        'governance-file',
        `${definition.name} adapter is not owned by GovernSeed`,
      ));
      continue;
    }
    adapters.set(relative, value);
  }
  for (const relative of receiptFiles) {
    const value = readArtifact(
      projectDir,
      relative,
      'compile-receipt.schema.json',
      'COMPILE_RECEIPT_INVALID',
      findings,
      byteHashes,
    );
    if (!value) continue;
    if (!ownedBy(value, 'compile-receipt')) {
      findings.push(finding(
        'COMPILE_RECEIPT_INVALID',
        'governance-file',
        'compile receipt is not owned by GovernSeed',
      ));
      continue;
    }
    receipts.set(relative, value);
  }
  addContextualArtifactFindings(
    manifests,
    adapters,
    receipts,
    findings,
  );

  if (
    (policyFiles.length > 0 || adapterFiles.length > 0)
    && receiptFiles.length === 0
  ) {
    findings.push(finding(
      'COMPILE_PARTIAL_OUTPUT',
      'governance-file',
      'generated policy output has no completing receipt',
    ));
  }

  const referenced = new Set();
  for (const receipt of receipts.values()) {
    for (const output of receipt.outputHashes) {
      referenced.add(output.path);
      const value = manifests.get(output.path) ?? adapters.get(output.path);
      if (!value) {
        findings.push(finding(
          'COMPILE_PARTIAL_OUTPUT',
          'governance-file',
          'compile receipt references a missing output',
        ));
      } else if (byteHashes.get(output.path) !== output.sha256) {
        findings.push(finding(
          'POLICY_OUTPUT_DRIFT',
          'governance-file',
          'compiled output no longer matches its receipt',
        ));
      }
    }
    const manifestEntry = [...manifests.entries()].find(
      ([, manifest]) => manifest.policyId === receipt.policyId,
    );
    const adapterEntry = [...adapters.entries()].find(
      ([, adapter]) => adapter.policyId === receipt.policyId,
    );
    if (!manifestEntry || !adapterEntry) {
      findings.push(finding(
        'COMPILE_PARTIAL_OUTPUT',
        'governance-file',
        'compile transaction is missing a policy or adapter output',
      ));
    } else if (
      adapterEntry[1].policyHash !== byteHashes.get(manifestEntry[0])
    ) {
      findings.push(finding(
        'POLICY_OUTPUT_DRIFT',
        'governance-file',
        'Codex adapter policy hash does not match the canonical manifest',
      ));
    }
  }
  for (const relative of [...manifests.keys(), ...adapters.keys()]) {
    if (!referenced.has(relative)) {
      findings.push(finding(
        'COMPILE_PARTIAL_OUTPUT',
        'governance-file',
        'generated policy output has no completing receipt',
      ));
    }
  }

  const expectedReceipt = expected
    ? [...receipts.values()].find(
      (receipt) => receipt.policyId === expected.manifest.policyId,
    )
    : null;
  if (expected && receipts.size > 0 && !expectedReceipt) {
    findings.push(finding(
      'POLICY_OUTPUT_STALE',
      'governance-file',
      'no completed compile receipt matches the current governance inputs',
    ));
  }
  if (expected) {
    for (const manifest of manifests.values()) {
      if (
        manifest.policyId !== expected.manifest.policyId
        && sameHashEntries(
          manifest.inputHashes,
          expected.manifest.inputHashes,
        )
      ) {
        findings.push(finding(
          'POLICY_CONFLICT',
          'governance-file',
          'multiple policy transactions claim the current governance inputs',
        ));
      }
    }
  }
  const inputReceipt = expectedReceipt
    ?? [...receipts.values()].sort((left, right) => (
      compareText(right.compiledAt, left.compiledAt)
    ))[0];
  if (inputReceipt) {
    if (
      expected
      && !sameHashEntries(
        inputReceipt.inputHashes,
        expected.manifest.inputHashes,
      )
    ) {
      findings.push(finding(
        'POLICY_SOURCE_HASH_MISMATCH',
        'governance-file',
        'current governance inputs do not match the compile receipt',
      ));
    }
  }

  addCapabilityWarnings(manifests, adapters, findings);
  inspectRequiredApproval(projectDir, expected, findings);
  const unique = new Map();
  for (const item of findings) {
    unique.set(`${item.code}\0${item.message}`, item);
  }
  const sorted = [...unique.values()].sort((left, right) => (
    compareText(left.code, right.code)
    || compareText(left.message, right.message)
  ));
  return {
    findings: sorted,
    fatal: sorted.some((item) => FATAL_CODES.has(item.code)),
  };
}
