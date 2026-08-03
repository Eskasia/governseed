import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'external-oss-v8-runtime-identity.yml');
const CREDENTIAL_ROOT = path.join(ROOT, 'benchmarks', 'external-oss-v8', 'credential-transport');
const ATTEMPT_4_ROOT = path.join(CREDENTIAL_ROOT, 'repair-2', 'attempt-4');
const MANIFEST_PATH = path.join(ATTEMPT_4_ROOT, 'technical-manifest.json');
const PACKET_PATH = path.join(ATTEMPT_4_ROOT, 'review-packet.json');
const TEMPLATE_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2-attempt-4.template.json');
const ADDENDUM_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2-attempt-4.addendum.json');
const APPROVED_ATTEMPT_4_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2-attempt-4.json');
const APPROVED_ATTEMPT_4_SOURCE_PATH = path.join(
  CREDENTIAL_ROOT,
  'human-approval-repair-2-attempt-4-source.json',
);
const RUN_ROOT = path.join(
  ROOT,
  'benchmarks',
  'external-oss-v8',
  'control',
  'G2',
  'runtime-canary-repair-4',
  'run-30824406710',
);
const RUN_PATH = path.join(RUN_ROOT, 'run.json');
const FAILURE_ARTIFACT_PATH = path.join(RUN_ROOT, 'failure-artifact.json');
const FAILURE_REVIEW_PATH = path.join(RUN_ROOT, 'failure-review.md');
const PREP_PATH = path.join(
  ROOT,
  'benchmarks',
  'external-oss-v8',
  'control',
  'G2',
  'runtime-canary-prep',
  'prep.json',
);
const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const MODEL_ID = 'gpt-5.6-luna';
const FIXED_CANARY_INPUT = 'Return exactly the JSON object {"runtime_canary":"PASS"}.';
const EXACT_IMAGE =
  'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5';
const TECHNICAL_MANIFEST_SHA256 = 'c4610bb68f5ddec2b143cf174ce1defcebe57f36a57c78e5372b21f1b3b30a6e';
const TECHNICAL_HEAD = '19e0b086dc31e31a308fc3a2d39bc5cf4e78b8c0';
const TECHNICAL_TREE = '6b586424d3d6d9560c7d3fe915079203e7fa1175';
const SQUASHED_MAIN = '00cd4d80a550bbae150248c52b4ff5faf68ac351';
const FINAL_EVIDENCE_HEAD = '1ca27e4df9d1c31dc7266e44935100f091203c74';
const PREVIOUS_TECHNICAL_HEAD = 'e043ae4af346d0db63b3edf163bf5ac7c7ccb31a';
const ATTEMPT_3_APPROVAL_SHA256 = '5f407e693dbf073b68d3992b22d220999a4960b72dcf4104d4eef177ee37a59a';
const ATTEMPT_3_SOURCE_SHA256 = '0cdd1244f2ce4127223e2665505d4f94600238f65031a2f8023482967d532de0';
const APPROVAL_COMMENT_ID = 5170969440;
const APPROVAL_COMMENT_URL = 'https://github.com/Eskasia/governseed/pull/79#issuecomment-5170969440';
const APPROVAL_COMMENT_CREATED_AT = '2026-08-03T19:45:40Z';
const APPROVAL_AT_DECLARED = '2026-08-03T17:29:00Z';
const ATTEMPT_4_WORKFLOW_SHA256 = '33adf28248f6762bfd64decd1f7a2b6899d6dd3f206d07b70dcbd88d929ba6f1';
const ATTEMPT_4_REVIEW_PACKET_SHA256 = '7de8be5700ee46df77cdd68fa670b06c0f8990033acd58c0f69c6ca4dfd553d6';
const INHERITED_HASHES = {
  designSha256: '434da5f42ae9d5752b5db6641557cec6a3893a22988225947458d287d516d995',
  proxySourceSha256: '0d77d9f7d74daffae64d30169755b049aa00f0c9d536c3cb228b755878c57eea',
  requestSchemaSha256: '630ee0eb7b1ca458b1562a676f318430b675b92b005a98c958cb3226b65afb51',
  responseSchemaSha256: '5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e',
  providerResponseValidationSha256: '5b36f410ebc898a34eb2d4e67814441c78d5331e1d0764750aeb98c9bfb7f528',
  normalizedResponseSchemaSha256: '5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e',
};
const TECHNICAL_PATHS = [
  '.github/workflows/external-oss-v8-runtime-identity.yml',
  'benchmarks/external-oss-v8/control/G2/runtime-canary-prep/canary-client.mjs',
  'benchmarks/external-oss-v8/credential-transport/repair-2/design.json',
  'benchmarks/external-oss-v8/credential-transport/repair-2/normalized-proxy-response.schema.json',
  'benchmarks/external-oss-v8/credential-transport/repair-2/provider-response-validation.json',
  'benchmarks/external-oss-v8/credential-transport/repair-2/request.schema.json',
  'benchmarks/external-oss-v8/credential-transport/repair-2/response.schema.json',
  'experimental/governance-impact/lib/credential-proxy.mjs',
  'experimental/governance-impact/lib/oci-proxy-facade.mjs',
  'experimental/governance-impact/lib/oci-supervisor.mjs',
  'experimental/governance-impact/lib/provider-response-validation.mjs',
  'experimental/governance-impact/uds-relay.mjs',
];

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function readGitBlob(ref, relativePath) {
  return execFileSync('git', ['show', `${ref}:${relativePath}`]);
}

async function loadFormalManifestValidator() {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const startMarker = '          const technicalManifestPaths = [';
  const endMarker = '          const expectedArtifactPaths = {';
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start);
  assert.notEqual(start, -1, 'formal workflow manifest validator must be extractable');
  assert.notEqual(end, -1, 'formal workflow manifest validator end must be extractable');
  const source = workflow
    .slice(start, end)
    .split('\n')
    .map((line) => (line.startsWith('          ') ? line.slice(10) : line))
    .join('\n');
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), 'governseed-g2-repair-4-'));
  const modulePath = path.join(tempRoot, 'manifest-validator.mjs');
  const moduleSource = `
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const root = ${JSON.stringify(ROOT)};
const sha256 = (relativePath) => createHash('sha256')
  .update(readFileSync(path.join(root, relativePath)))
  .digest('hex');
${source}
export { canonicalTechnicalManifest, technicalManifestSha256, validateTechnicalManifest, technicalManifestPaths };
`;
  await writeFile(modulePath, moduleSource);
  const module = await import(`${pathToFileURL(modulePath).href}?${Date.now()}`);
  return {
    ...module,
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  };
}

async function withManifestValidator(callback) {
  const loaded = await loadFormalManifestValidator();
  try {
    return await callback(loaded);
  } finally {
    await loaded.cleanup();
  }
}

test('formal attempt-4 manifest validates against the committed working tree', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = readJson(MANIFEST_PATH);
    const result = validateTechnicalManifest(manifest);
    assert.deepEqual(result, { ok: true, canonicalSha256: TECHNICAL_MANIFEST_SHA256 });
  });
});

test('manifest canonical hash is the exact approved binding', async () => {
  await withManifestValidator(({ canonicalTechnicalManifest, technicalManifestSha256 }) => {
    const manifest = readJson(MANIFEST_PATH);
    const expected = createHash('sha256').update(canonicalTechnicalManifest(manifest), 'utf8').digest('hex');
    assert.equal(expected, TECHNICAL_MANIFEST_SHA256);
    assert.equal(technicalManifestSha256(manifest), TECHNICAL_MANIFEST_SHA256);
  });
});

test('manifest contains the exact bytewise-sorted technical path set', () => {
  const manifest = readJson(MANIFEST_PATH);
  assert.deepEqual(manifest.entries.map((entry) => entry.path), TECHNICAL_PATHS);
  assert.deepEqual([...TECHNICAL_PATHS].sort(), TECHNICAL_PATHS);
});

test('manifest excludes itself and all evidence-only paths', () => {
  const manifestPaths = new Set(readJson(MANIFEST_PATH).entries.map((entry) => entry.path));
  for (const excluded of [
    'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-4/technical-manifest.json',
    'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-4/review-packet.json',
    'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-4.addendum.json',
    'benchmarks/external-oss-v8/control/G2/runtime-canary-repair-4/run-30824406710/run.json',
  ]) assert.equal(manifestPaths.has(excluded), false, excluded);
});

test('every manifest entry hash equals the current file hash', () => {
  for (const entry of readJson(MANIFEST_PATH).entries) {
    assert.equal(sha256File(path.join(ROOT, entry.path)), entry.sha256, entry.path);
  }
});

test('current technical file drift fails with the named current-mismatch code', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = structuredClone(readJson(MANIFEST_PATH));
    manifest.entries[0].sha256 = '0'.repeat(64);
    const result = validateTechnicalManifest(manifest);
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'CURRENT_TECHNICAL_MANIFEST_MISMATCH');
    assert.deepEqual(result.failedChecks, ['technicalManifestMatches']);
  });
});

test('missing manifest entries fail closed as invalid approved manifests', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = structuredClone(readJson(MANIFEST_PATH));
    manifest.entries.pop();
    const result = validateTechnicalManifest(manifest);
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'APPROVED_TECHNICAL_MANIFEST_INVALID');
  });
});

test('extra manifest entries fail closed as invalid approved manifests', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = structuredClone(readJson(MANIFEST_PATH));
    manifest.entries.push({ path: 'z-extra.txt', sha256: '0'.repeat(64) });
    const result = validateTechnicalManifest(manifest);
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'APPROVED_TECHNICAL_MANIFEST_INVALID');
  });
});

test('manifest path reordering fails closed', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = structuredClone(readJson(MANIFEST_PATH));
    [manifest.entries[0], manifest.entries[1]] = [manifest.entries[1], manifest.entries[0]];
    const result = validateTechnicalManifest(manifest);
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'APPROVED_TECHNICAL_MANIFEST_INVALID');
  });
});

test('manifest entry key changes fail closed', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = structuredClone(readJson(MANIFEST_PATH));
    manifest.entries[0].unexpected = true;
    const result = validateTechnicalManifest(manifest);
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'APPROVED_TECHNICAL_MANIFEST_INVALID');
  });
});

test('manifest non-hex hashes fail closed', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = structuredClone(readJson(MANIFEST_PATH));
    manifest.entries[0].sha256 = 'G'.repeat(64);
    const result = validateTechnicalManifest(manifest);
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'APPROVED_TECHNICAL_MANIFEST_INVALID');
  });
});

test('manifest metadata changes fail closed', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = structuredClone(readJson(MANIFEST_PATH));
    manifest.attempt = 3;
    const result = validateTechnicalManifest(manifest);
    assert.equal(result.ok, false);
    assert.equal(result.failureCode, 'APPROVED_TECHNICAL_MANIFEST_INVALID');
  });
});

test('squash-merged main is not an ancestor of the old technical head', async () => {
  assert.doesNotThrow(() => execFileSync('git', ['cat-file', '-e', `${PREVIOUS_TECHNICAL_HEAD}^{commit}`], { stdio: 'ignore' }));
  assert.throws(
    () => execFileSync('git', ['merge-base', '--is-ancestor', PREVIOUS_TECHNICAL_HEAD, SQUASHED_MAIN], { stdio: 'ignore' }),
  );
  await withManifestValidator(({ validateTechnicalManifest }) => {
    assert.equal(validateTechnicalManifest(readJson(MANIFEST_PATH)).ok, true);
  });
});

test('current main parent ancestry remains checked independently of reviewed technical metadata', () => {
  const packet = readJson(PACKET_PATH);
  assert.equal(packet.parent.mergeCommit, SQUASHED_MAIN);
  assert.doesNotThrow(() => execFileSync('git', ['merge-base', '--is-ancestor', packet.parent.mergeCommit, 'HEAD'], { stdio: 'ignore' }));
});

test('workflow does not require reviewed-head ancestry or reviewed-tree equality', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.doesNotMatch(workflow, /reviewedHeadIsAncestor|reviewedTreeMatches/u);
  assert.doesNotMatch(workflow, /merge-base[\s\S]{0,180}addendum\.reviewedTechnicalHead/u);
  assert.match(workflow, /technicalManifestMatches/u);
});

test('unresolvable reviewed technical commits do not block manifest validation', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = readJson(MANIFEST_PATH);
    assert.equal(validateTechnicalManifest(manifest).ok, true);
    const addendum = readJson(ADDENDUM_PATH);
    addendum.reviewedTechnicalHead = '0'.repeat(40);
    addendum.reviewedTreeSha = '0'.repeat(40);
    assert.equal(validateTechnicalManifest(manifest).ok, true);
  });
});

test('extra evidence files remain outside the exact technical manifest', async () => {
  await withManifestValidator(({ validateTechnicalManifest }) => {
    const manifest = readJson(MANIFEST_PATH);
    assert.equal(validateTechnicalManifest(manifest).ok, true);
    assert.equal(existsSync(PACKET_PATH), true);
    assert.equal(existsSync(ADDENDUM_PATH), true);
    assert.equal(existsSync(FAILURE_ARTIFACT_PATH), true);
  });
});

test('attempt-4 packet and addendum share the manifest path and canonical hash', () => {
  const packet = readJson(PACKET_PATH);
  const addendum = readJson(ADDENDUM_PATH);
  assert.equal(packet.technicalManifestPath, addendum.technicalManifestPath);
  assert.equal(packet.technicalManifestSha256, TECHNICAL_MANIFEST_SHA256);
  assert.equal(addendum.technicalManifestSha256, TECHNICAL_MANIFEST_SHA256);
  assert.equal(addendum.newBindingHashes.technicalManifestSha256, TECHNICAL_MANIFEST_SHA256);
});

test('exact model binding, alias policy, and fallback policy are shared by prep, packet, template, and addendum', () => {
  const prep = readJson(PREP_PATH);
  const packet = readJson(PACKET_PATH);
  const template = readJson(TEMPLATE_PATH);
  const addendum = readJson(ADDENDUM_PATH);
  for (const binding of [prep.modelBinding, packet.modelBinding, template, addendum]) {
    assert.equal(binding.modelId ?? binding.approvedModelId, MODEL_ID);
    assert.equal(binding.aliasAllowed ?? false, false);
    assert.equal(binding.fallbackAllowed ?? false, false);
  }
});

test('transport binding remains fixed to the exact input, one request, and 30000 ms timeout', () => {
  const prep = readJson(PREP_PATH);
  const packet = readJson(PACKET_PATH);
  assert.equal(prep.canaryInput, FIXED_CANARY_INPUT);
  assert.equal(packet.transport.fixedInput, FIXED_CANARY_INPUT);
  assert.equal(prep.requestLimit, 1);
  assert.equal(packet.transport.requestLimit, 1);
  assert.equal(prep.timeoutMs, 30000);
  assert.equal(packet.transport.timeoutMs, 30000);
});

test('runtime image and executable bindings remain exact', () => {
  const prep = readJson(PREP_PATH);
  const packet = readJson(PACKET_PATH);
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.equal(prep.runtimeImage.lockedReference, EXACT_IMAGE);
  assert.equal(packet.runtimeImage.lockedReference, EXACT_IMAGE);
  assert.equal(prep.runtimeImage.executablePath, '/usr/local/bin/node');
  assert.equal(packet.runtimeImage.executablePath, '/usr/local/bin/node');
  assert.match(workflow, /--entrypoint \/usr\/local\/bin\/node/u);
  assert.match(workflow, /v26\.3\.0/u);
});

test('provider, dispatch, canary, and approval states remain blocked or not run', () => {
  const packet = readJson(PACKET_PATH);
  const addendum = readJson(ADDENDUM_PATH);
  const template = readJson(TEMPLATE_PATH);
  const approved = readJson(APPROVED_ATTEMPT_4_PATH);
  assert.equal(packet.providerRequests, 0);
  assert.equal(packet.evidence.providerRequests, 0);
  assert.equal(packet.evidence.runtimeCanary, 'NOT_RUN');
  assert.equal(packet.evidence.dispatch, 'NOT_RUN');
  assert.equal(addendum.providerRequests, 0);
  assert.equal(addendum.workflowDispatch, 'NOT_RUN');
  assert.equal(addendum.runtimeCanary, 'NOT_RUN');
  assert.equal(template.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(approved.approvalStatus, 'APPROVED');
});

test('attempt-4 GitHub reapproval is recorded with sanitized source evidence', () => {
  const approval = readJson(APPROVED_ATTEMPT_4_PATH);
  const source = readJson(APPROVED_ATTEMPT_4_SOURCE_PATH);

  assert.equal(existsSync(APPROVED_ATTEMPT_4_PATH), true);
  assert.equal(existsSync(APPROVED_ATTEMPT_4_SOURCE_PATH), true);
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedBy, 'Eskasia');
  assert.equal(approval.approvedAt, source.commentCreatedAt);
  assert.equal(approval.approvedAt, source.approvalEffectiveAt);
  assert.equal(approval.approvedAt, APPROVAL_COMMENT_CREATED_AT);
  assert.equal(approval.approvedAtDeclared, APPROVAL_AT_DECLARED);
  assert.equal(source.approvedAtDeclared, APPROVAL_AT_DECLARED);
  assert.notEqual(approval.approvedAt, approval.approvedAtDeclared);

  assert.equal(source.verificationStatus, 'VERIFIED_GITHUB_ISSUE_COMMENT');
  assert.equal(source.repository, 'Eskasia/governseed');
  assert.equal(source.pullRequest, 79);
  assert.equal(source.commentId, APPROVAL_COMMENT_ID);
  assert.equal(source.commentUrl, APPROVAL_COMMENT_URL);
  assert.equal(source.commentAuthor, 'Eskasia');
  assert.equal(source.commentCreatedAt, APPROVAL_COMMENT_CREATED_AT);
  assert.equal(source.commentUpdatedAt, APPROVAL_COMMENT_CREATED_AT);
  assert.equal(source.commentBodySha256, 'fda0801d7246926685d25f7d3e5a316b68254d97227a29ebd0f6fdd6387ac3f3');
  assert.equal(source.credentialPresent, false);
  assert.equal(source.rawApprovalBodyPersisted, false);
  assert.equal(Object.hasOwn(source, 'body'), false);
  assert.equal(Object.hasOwn(source, 'rawBody'), false);
  assert.equal(Object.hasOwn(source, 'authorization'), false);
  assert.doesNotMatch(JSON.stringify(source), /sk-[A-Za-z0-9_-]{16,}|Authorization:\s*Bearer/iu);

  assert.equal(approval.approvalEvidence.type, 'github-issue-comment');
  assert.equal(approval.approvalEvidence.repository, 'Eskasia/governseed');
  assert.equal(approval.approvalEvidence.pullRequest, 79);
  assert.equal(approval.approvalEvidence.commentId, APPROVAL_COMMENT_ID);
  assert.equal(approval.approvalEvidence.commentUrl, APPROVAL_COMMENT_URL);
  assert.equal(approval.approvalEvidence.commentAuthor, 'Eskasia');
  assert.equal(approval.approvalEvidence.commentCreatedAt, source.commentCreatedAt);
  assert.equal(approval.approvalEvidence.approvedAtDeclared, APPROVAL_AT_DECLARED);

  assert.equal(approval.approvedDesignSha256, INHERITED_HASHES.designSha256);
  assert.equal(approval.approvedProxySha256, INHERITED_HASHES.proxySourceSha256);
  assert.equal(approval.approvedWorkflowSha256, ATTEMPT_4_WORKFLOW_SHA256);
  assert.equal(approval.approvedReviewPacketSha256, ATTEMPT_4_REVIEW_PACKET_SHA256);
  assert.equal(approval.approvedTechnicalManifestSha256, TECHNICAL_MANIFEST_SHA256);
  assert.equal(approval.approvedTechnicalManifestEntries, 12);
  assert.equal(approval.approvedModelId, MODEL_ID);
  assert.equal(approval.aliasAllowed, false);
  assert.equal(approval.fallbackAllowed, false);
  assert.equal(approval.limitationsAcknowledged, true);

  assert.deepEqual(source.bodyClaims, {
    reviewedTechnicalHead: TECHNICAL_HEAD,
    reviewedTechnicalTreeSha: TECHNICAL_TREE,
    reviewedEvidenceCandidateHead: 'e88bcc4b3e3cd3f0ac4fe5406c31f0cb4e884931',
    reviewedEvidenceCandidateTreeSha: '55207c80f9a0e2c5e05fd6aea7b25caf8dd1176b',
    finalEvidenceHead: FINAL_EVIDENCE_HEAD,
    workflowSha256: ATTEMPT_4_WORKFLOW_SHA256,
    reviewPacketSha256: ATTEMPT_4_REVIEW_PACKET_SHA256,
    technicalManifestSha256: TECHNICAL_MANIFEST_SHA256,
    technicalManifestEntries: 12,
    approvedModelId: MODEL_ID,
    aliasAllowed: false,
    fallbackAllowed: false,
    runtimeAncestryRequired: false,
    limitationsAcknowledged: true,
  });
});

test('attempt-4 approval does not alter approved technical or Sol evidence bytes', () => {
  const technicalPaths = [
    '.github/workflows/external-oss-v8-runtime-identity.yml',
    'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-4/technical-manifest.json',
    'benchmarks/external-oss-v8/credential-transport/repair-2/attempt-4/review-packet.json',
    'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-4.addendum.json',
    'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-4.template.json',
  ];
  for (const relativePath of technicalPaths) {
    assert.deepEqual(readFileSync(path.join(ROOT, relativePath)), readGitBlob(FINAL_EVIDENCE_HEAD, relativePath), relativePath);
  }
  for (const relativePath of [
    'benchmarks/external-oss-v8/control/G2/runtime-canary-repair-4/sol-review-evidence.json',
    'benchmarks/external-oss-v8/control/G2/runtime-canary-repair-4/sol-verdict.json',
  ]) {
    assert.deepEqual(readFileSync(path.join(ROOT, relativePath)), readGitBlob(FINAL_EVIDENCE_HEAD, relativePath), relativePath);
  }
  assert.equal(sha256File(WORKFLOW_PATH), ATTEMPT_4_WORKFLOW_SHA256);
  assert.equal(sha256File(PACKET_PATH), ATTEMPT_4_REVIEW_PACKET_SHA256);
  assert.equal(readJson(MANIFEST_PATH).entries.length, 12);
});

test('workflow uses named structural checks and never the old anonymous array form', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(workflow, /const structuralChecks = \{/u);
  assert.match(workflow, /Object\.values\(structuralChecks\)\.includes\(false\)/u);
  assert.match(workflow, /Object\.entries\(structuralChecks\)/u);
  assert.doesNotMatch(workflow, /structuralChecks\.includes\(false\)/u);
  for (const name of [
    'modelBindingMatches',
    'requestTransportMatches',
    'responseContractMatches',
    'technicalManifestMatches',
    'workflowHashMatches',
    'reviewPacketHashMatches',
    'humanApprovalMatches',
    'providerFreeStateMatches',
    'receiptAbsent',
  ]) assert.match(workflow, new RegExp(name, 'u'));
});

test('failure diagnostics allow only fixed named failed checks', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const artifact = readJson(FAILURE_ARTIFACT_PATH);
  const allowed = new Set([
    'githubShaMatches',
    'parentMainIsAncestor',
    'modelBindingMatches',
    'requestTransportMatches',
    'responseContractMatches',
    'technicalManifestMatches',
    'workflowHashMatches',
    'reviewPacketHashMatches',
    'humanApprovalMatches',
    'runtimeImageMatches',
    'providerFreeStateMatches',
    'receiptAbsent',
    'packetArtifactPathsMatch',
    'packetArtifactHashesMatch',
    'inheritedApprovalHashesMatch',
  ]);
  assert.match(workflow, /const allowedFailedChecks = new Set\(\[/u);
  assert.ok(Array.isArray(artifact.failedChecks));
  assert.ok(artifact.failedChecks.every((name) => allowed.has(name)));
  assert.deepEqual(artifact.failedChecks, ['technicalManifestMatches']);
});

test('failure codes distinguish invalid manifest from current file drift', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.match(workflow, /APPROVED_TECHNICAL_MANIFEST_INVALID/u);
  assert.match(workflow, /CURRENT_TECHNICAL_MANIFEST_MISMATCH/u);
  assert.match(workflow, /REPAIRED_BINDING_INVALID/u);
});

test('attempt-4 evidence preserves the real failed run boundary without secrets', () => {
  const run = readJson(RUN_PATH);
  const artifact = readJson(FAILURE_ARTIFACT_PATH);
  const review = readFileSync(FAILURE_REVIEW_PATH, 'utf8');
  assert.equal(run.runId, '30824406710');
  assert.equal(run.jobId, '91722204763');
  assert.equal(run.mainCommit, SQUASHED_MAIN);
  assert.equal(run.failureStage, 'binding-validation');
  assert.equal(run.failureCode, 'REPAIRED_BINDING_INVALID');
  assert.equal(run.providerRequestCount, 0);
  assert.equal(run.hostProxy, 'NOT_STARTED');
  assert.equal(run.runtimeCanary, 'NOT_RUN');
  assert.equal(artifact.providerRequestCount, 0);
  assert.deepEqual(artifact.failedChecks, ['technicalManifestMatches']);
  assert.match(review, /SQUASH_MERGE_ANCESTRY_VALIDATION_DEFECT/u);
  assert.doesNotMatch(`${JSON.stringify(run)}${JSON.stringify(artifact)}${review}`, /sk-[A-Za-z0-9_-]{16,}|Authorization:\s*Bearer/iu);
});

test('attempt-3 approval and source records remain byte-for-byte immutable', () => {
  const approvalPath = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-3.json';
  const sourcePath = 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-3-source.json';
  assert.equal(sha256File(path.join(ROOT, approvalPath)), ATTEMPT_3_APPROVAL_SHA256);
  assert.equal(sha256File(path.join(ROOT, sourcePath)), ATTEMPT_3_SOURCE_SHA256);
  assert.deepEqual(readFileSync(path.join(ROOT, approvalPath)), readGitBlob('origin/main', approvalPath));
  assert.deepEqual(readFileSync(path.join(ROOT, sourcePath)), readGitBlob('origin/main', sourcePath));
});

test('attempt-4 technical head and tree are explicitly bound in pending addendum', () => {
  const addendum = readJson(ADDENDUM_PATH);
  assert.equal(addendum.reviewedTechnicalHead, TECHNICAL_HEAD);
  assert.equal(addendum.reviewedTreeSha, TECHNICAL_TREE);
  assert.equal(execFileSync('git', ['rev-parse', `${TECHNICAL_HEAD}^{tree}`], { encoding: 'utf8' }).trim(), TECHNICAL_TREE);
});

test('packet and inherited transport hashes match the approved exact values', () => {
  const packet = readJson(PACKET_PATH);
  for (const [key, expected] of Object.entries(INHERITED_HASHES)) assert.equal(packet.hashes[key], expected, key);
  assert.equal(packet.modelBinding.modelId, MODEL_ID);
  assert.equal(packet.modelBinding.aliasAllowed, false);
  assert.equal(packet.modelBinding.fallbackAllowed, false);
  assert.equal(packet.providerRequests, 0);
});

test('workflow does not inspect Models API or allow aliases, fallbacks, or retries', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  assert.doesNotMatch(workflow, /\/v1\/models/u);
  assert.doesNotMatch(workflow, /\blatest\b/u);
  assert.doesNotMatch(workflow, /gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(workflow, /fallback[_-]?model|modelFallback/iu);
  assert.doesNotMatch(workflow, /\b(?:retry|retries)\b/iu);
});

test('attempt-4 review packet remains pending and carries the technical provenance boundary', () => {
  const packet = readJson(PACKET_PATH);
  assert.equal(packet.status, 'PENDING_HUMAN_REAPPROVAL');
  assert.equal(packet.overallGate, 'BLOCKED');
  assert.equal(packet.technicalDisposition, 'TECHNICALLY_REPAIRED_PENDING_HUMAN_REAPPROVAL');
  assert.match(packet.claimBoundary, /no provider request or runtime canary was made/u);
  assert.match(packet.claimBoundary, /new human reapproval is required/u);
});

test('formal manifest validator is sourced from the runtime workflow rather than a fixture-only helper', async () => {
  await withManifestValidator(({ technicalManifestPaths }) => {
    assert.deepEqual(technicalManifestPaths, TECHNICAL_PATHS);
    assert.match(readFileSync(WORKFLOW_PATH, 'utf8'), /const validateTechnicalManifest =/u);
  });
});
