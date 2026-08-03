import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW_PATH = path.join(ROOT, '.github', 'workflows', 'external-oss-v8-runtime-identity.yml');
const CREDENTIAL_ROOT = path.join(ROOT, 'benchmarks', 'external-oss-v8', 'credential-transport');
const REPAIR_2_ROOT = path.join(CREDENTIAL_ROOT, 'repair-2');
const CANONICAL_PACKET_PATH = path.join(REPAIR_2_ROOT, 'review-packet.json');
const ATTEMPT_3_ROOT = path.join(REPAIR_2_ROOT, 'attempt-3');
const ATTEMPT_3_PACKET_PATH = path.join(ATTEMPT_3_ROOT, 'review-packet.json');
const PENDING_TEMPLATE_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2-attempt-3.template.json');
const ADDENDUM_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2-attempt-3.addendum.json');
const APPROVED_ATTEMPT_3_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2-attempt-3.json');
const APPROVED_ATTEMPT_3_SOURCE_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2-attempt-3-source.json');
const OLD_APPROVAL_PATH = path.join(CREDENTIAL_ROOT, 'human-approval-repair-2.json');
const RUN_EVIDENCE_ROOT = path.join(
  ROOT,
  'benchmarks',
  'external-oss-v8',
  'control',
  'G2',
  'runtime-canary-repair-3',
  'run-30814159615',
);
const RUN_EVIDENCE_PATH = path.join(RUN_EVIDENCE_ROOT, 'run.json');
const FAILURE_ARTIFACT_PATH = path.join(RUN_EVIDENCE_ROOT, 'failure-artifact.json');
const FAILURE_REVIEW_PATH = path.join(RUN_EVIDENCE_ROOT, 'failure-review.md');

const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const MODEL_ID = 'gpt-5.6-luna';
const EXACT_IMAGE =
  'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5';
const FIXED_CANARY_INPUT = 'Return exactly the JSON object {"runtime_canary":"PASS"}.';
const DESIGN_SHA256 = '434da5f42ae9d5752b5db6641557cec6a3893a22988225947458d287d516d995';
const PROXY_SHA256 = '0d77d9f7d74daffae64d30169755b049aa00f0c9d536c3cb228b755878c57eea';
const REQUEST_SCHEMA_SHA256 = '630ee0eb7b1ca458b1562a676f318430b675b92b005a98c958cb3226b65afb51';
const RESPONSE_SCHEMA_SHA256 = '5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e';
const PROVIDER_RESPONSE_SHA256 = '5b36f410ebc898a34eb2d4e67814441c78d5331e1d0764750aeb98c9bfb7f528';
const NORMALIZED_RESPONSE_SHA256 = '5900d37c01493a0e7ca1712936a52fbf2514296c1edb0fcce7182c5662c2a08e';
const OLD_WORKFLOW_SHA256 = '83bef779f31c271e40543fe40e9763f2a3321e69930f9c1ac4cd5fe5a6c02f26';
const ATTEMPT_3_WORKFLOW_SHA256 = '91d71cf39ddab0e5501100d79fcb20769dfea4364d5f0a9c026b62c41132e8a0';
const OLD_PACKET_SHA256 = '25021a1855112475fa4508e3ae8862cea756cbcb9f42c12d3a37a790a896ec5d';
const OLD_APPROVAL_SHA256 = '0bd0869949786ba80e16c048b9275acf0d9328046b529a3ad793af9fa0852de0';
const FAILURE_ARTIFACT_SHA256 = 'b48107fd16de3e38af3596db568b61b5e51aee17ded255400014b738b26b32fe';
const FAILED_RUN_ID = '30814159615';
const FAILED_MAIN_COMMIT = '9511e3e038e3ae29bb446991127c70d423a1b456';

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'));
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

async function loadTransportValidator() {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const startMarker = '          const validateReviewPacketTransport =';
  const endMarker = '          const imageLock =';
  const start = workflow.indexOf(startMarker);
  const end = workflow.indexOf(endMarker, start);
  assert.notEqual(start, -1, 'workflow transport validator must be extractable');
  assert.notEqual(end, -1, 'workflow image binding must follow transport validator');
  const source = workflow
    .slice(start, end)
    .split('\n')
    .map((line) => line.startsWith('          ') ? line.slice(10) : line)
    .join('\n');
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'governseed-g2-repair-3-'));
  const modulePath = path.join(tempRoot, 'validator.mjs');
  await writeFile(modulePath, `${source}\nexport { validateReviewPacketTransport };\n`);
  const module = await import(`${pathToFileURL(modulePath).href}?${Date.now()}`);
  return {
    validator: module.validateReviewPacketTransport,
    cleanup: () => rm(tempRoot, { recursive: true, force: true }),
  };
}

async function withTransportValidator(callback) {
  const loaded = await loadTransportValidator();
  try {
    return await callback(loaded.validator);
  } finally {
    await loaded.cleanup();
  }
}

function expectedTransport(packet) {
  return {
    providerResponseValidationPath: packet.transport.providerResponseValidationPath,
    normalizedResponseSchemaPath: packet.transport.normalizedResponseSchemaPath,
  };
}

function assertBindingFailure(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.failureStage, 'binding-validation');
  assert.equal(result.failureCode, code);
  assert.equal(result.providerRequestCount, 0);
  assert.equal(result.proxy, 'NOT_STARTED');
}

test('canonical repair-2 packet binds through the workflow validator without responseContract', async () => {
  await withTransportValidator((validate) => {
    const packet = readJson(CANONICAL_PACKET_PATH);
    const result = validate(packet, expectedTransport(packet));
    assert.equal(result.ok, true);

    const packetWithoutLegacyShape = structuredClone(packet);
    delete packetWithoutLegacyShape.responseContract;
    assert.equal(validate(packetWithoutLegacyShape, expectedTransport(packet)).ok, true);
  });
});

test('missing transport shape fails closed without a TypeError', async () => {
  await withTransportValidator((validate) => {
    const packet = readJson(CANONICAL_PACKET_PATH);
    delete packet.transport;
    assertBindingFailure(validate(packet, expectedTransport(readJson(CANONICAL_PACKET_PATH))), 'REVIEW_PACKET_TRANSPORT_SHAPE_INVALID');
  });
});

test('provider validation path mismatch fails closed', async () => {
  await withTransportValidator((validate) => {
    const packet = readJson(CANONICAL_PACKET_PATH);
    packet.transport.providerResponseValidationPath = 'unexpected-provider-contract.json';
    assertBindingFailure(validate(packet, expectedTransport(readJson(CANONICAL_PACKET_PATH))), 'REVIEW_PACKET_PROVIDER_VALIDATION_PATH_MISMATCH');
  });
});

test('normalized response schema path mismatch fails closed', async () => {
  await withTransportValidator((validate) => {
    const packet = readJson(CANONICAL_PACKET_PATH);
    packet.transport.normalizedResponseSchemaPath = 'unexpected-normalized-schema.json';
    assertBindingFailure(validate(packet, expectedTransport(readJson(CANONICAL_PACKET_PATH))), 'REVIEW_PACKET_NORMALIZED_SCHEMA_PATH_MISMATCH');
  });
});

test('unexpected transport binding errors become redacted fail-closed diagnostics', async () => {
  await withTransportValidator((validate) => {
    const packet = readJson(CANONICAL_PACKET_PATH);
    const result = validate(packet, expectedTransport(packet), () => {
      throw new Error('synthetic accessor failure');
    });
    assertBindingFailure(result, 'UNEXPECTED_BINDING_VALIDATION_ERROR');
    assert.doesNotMatch(JSON.stringify(result), /synthetic accessor failure|stack|credential|api[_-]?key/i);
  });
});

test('repair-3 packet and pending addendum bind the new workflow with the approved manual record', () => {
  const packet = readJson(ATTEMPT_3_PACKET_PATH);
  const addendum = readJson(ADDENDUM_PATH);
  const pending = readJson(PENDING_TEMPLATE_PATH);
  const approved = readJson(APPROVED_ATTEMPT_3_PATH);
  const source = readJson(APPROVED_ATTEMPT_3_SOURCE_PATH);

  assert.equal(packet.benchmarkId, BENCHMARK_ID);
  assert.equal(packet.attempt, 3);
  assert.equal(packet.modelBinding.provider, 'OpenAI');
  assert.equal(packet.modelBinding.modelId, MODEL_ID);
  assert.equal(packet.modelBinding.aliasAllowed, false);
  assert.equal(packet.modelBinding.fallbackAllowed, false);
  assert.equal(packet.transport.fixedInput, FIXED_CANARY_INPUT);
  assert.equal(packet.transport.providerResponseValidationPath, 'benchmarks/external-oss-v8/credential-transport/repair-2/provider-response-validation.json');
  assert.equal(packet.transport.normalizedResponseSchemaPath, 'benchmarks/external-oss-v8/credential-transport/repair-2/normalized-proxy-response.schema.json');
  assert.equal(packet.transport.requestLimit, 1);
  assert.equal(packet.transport.timeoutMs, 30000);
  assert.equal(packet.hashes.designSha256, DESIGN_SHA256);
  assert.equal(packet.hashes.proxySourceSha256, PROXY_SHA256);
  assert.equal(packet.hashes.requestSchemaSha256, REQUEST_SCHEMA_SHA256);
  assert.equal(packet.hashes.responseSchemaSha256, RESPONSE_SCHEMA_SHA256);
  assert.equal(packet.hashes.providerResponseValidationSha256, PROVIDER_RESPONSE_SHA256);
  assert.equal(packet.hashes.normalizedResponseSchemaSha256, NORMALIZED_RESPONSE_SHA256);
  assert.equal(packet.hashes.workflowSha256, ATTEMPT_3_WORKFLOW_SHA256);
  assert.notEqual(sha256File(WORKFLOW_PATH), ATTEMPT_3_WORKFLOW_SHA256);
  assert.equal(packet.humanApproval.status, 'PENDING_HUMAN_REVIEW');
  assert.equal(packet.humanApproval.templatePath, 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-3.template.json');
  assert.equal(packet.humanApproval.addendumPath, 'benchmarks/external-oss-v8/credential-transport/human-approval-repair-2-attempt-3.addendum.json');
  assert.equal(pending.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(pending.approvedModelId, MODEL_ID);
  assert.equal(addendum.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(addendum.approvedModelId, MODEL_ID);
  assert.equal(addendum.aliasAllowed, false);
  assert.equal(addendum.fallbackAllowed, false);
  assert.equal(addendum.newBindingHashes.workflowSha256, ATTEMPT_3_WORKFLOW_SHA256);
  assert.equal(addendum.newBindingHashes.reviewPacketSha256, sha256File(ATTEMPT_3_PACKET_PATH));
  assert.equal(addendum.inheritedHashes.designSha256, DESIGN_SHA256);
  assert.equal(addendum.inheritedHashes.proxySourceSha256, PROXY_SHA256);
  assert.equal(addendum.inheritedHashes.requestSchemaSha256, REQUEST_SCHEMA_SHA256);
  assert.equal(addendum.inheritedHashes.responseSchemaSha256, RESPONSE_SCHEMA_SHA256);
  assert.equal(addendum.inheritedHashes.providerResponseValidationSha256, PROVIDER_RESPONSE_SHA256);
  assert.equal(addendum.inheritedHashes.normalizedResponseSchemaSha256, NORMALIZED_RESPONSE_SHA256);
  assert.match(addendum.reviewedTechnicalHead, /^[0-9a-f]{40}$/u);
  assert.match(addendum.reviewedTreeSha, /^[0-9a-f]{40}$/u);
  assert.equal(
    execFileSync('git', ['rev-parse', `${addendum.reviewedTechnicalHead}^{tree}`], { encoding: 'utf8' }).trim(),
    addendum.reviewedTreeSha,
  );
  assert.equal(existsSync(APPROVED_ATTEMPT_3_PATH), true);
  assert.deepEqual(approved, {
    schemaVersion: 1,
    benchmarkId: BENCHMARK_ID,
    approvalStatus: 'APPROVED',
    approvedBy: 'Eskasia',
    approvedAt: '2026-08-03T13:45:00Z',
    approvedDesignSha256: DESIGN_SHA256,
    approvedProxySha256: PROXY_SHA256,
    approvedModelId: MODEL_ID,
    scope: ['credential-transport', 'runtime-identity-canary', 'v8-pilot'],
    limitationsAcknowledged: true,
    approvalEvidence: {
      type: 'manual-record',
      reference: 'manual-record:GS-OSS-2026-08-02-V8:G2:runtime-canary-repair-3:2026-08-03T13:45:00Z',
      commentId: 20260803134500,
      commentAuthor: 'Eskasia',
      commentCreatedAt: '2026-08-03T13:45:00Z',
    },
  });
  assert.equal(source.verificationStatus, 'VERIFIED_MANUAL_RECORD');
  assert.equal(source.repository, 'Eskasia/governseed');
  assert.equal(source.pullRequest, 78);
  assert.equal(source.manualRecordId, 20260803134500);
  assert.equal(source.recordAuthor, 'Eskasia');
  assert.equal(source.recordCreatedAt, '2026-08-03T13:45:00Z');
  assert.equal(source.approvedAtDeclared, '2026-08-03T13:45:00Z');
  assert.deepEqual(source.bodyClaims, {
    reviewedTechnicalHead: 'e043ae4af346d0db63b3edf163bf5ac7c7ccb31a',
    reviewedTechnicalTreeSha: '36c6b05d9ce6e3b835b72b2db3489f201c7659fa',
    reviewedEvidenceCandidateHead: 'c978807f6258b1f1e47c8460e1b06da9a2632e99',
    reviewedEvidenceCandidateTreeSha: '016c435b45fac9af39da79b082002f105305674a',
    finalEvidenceHead: '91483fc4022997227347b6215cc251a7f701ef5b',
    approvedWorkflowSha256: '91d71cf39ddab0e5501100d79fcb20769dfea4364d5f0a9c026b62c41132e8a0',
    approvedReviewPacketSha256: 'c2d65e676901e73e44dd31188c231c2d956c053604b72dc4891af7f384210f86',
    approvedModelId: MODEL_ID,
    aliasAllowed: false,
    fallbackAllowed: false,
    designSha256: DESIGN_SHA256,
    proxySha256: PROXY_SHA256,
    requestSchemaSha256: REQUEST_SCHEMA_SHA256,
    responseSchemaSha256: RESPONSE_SCHEMA_SHA256,
    providerResponseContractSha256: PROVIDER_RESPONSE_SHA256,
    normalizedResponseSchemaSha256: NORMALIZED_RESPONSE_SHA256,
    runtimeImage: EXACT_IMAGE,
    nodeExecutable: '/usr/local/bin/node',
    nodeVersion: 'v26.3.0',
    requestLimit: 1,
    timeoutMs: 30000,
    fixedCanaryInput: FIXED_CANARY_INPUT,
    failedRun: '30814159615',
    failedRunProviderRequests: 0,
    failedRunHostProxy: 'NOT_STARTED',
    failedRunRuntimeCanary: 'NOT_RUN',
    scope: ['credential-transport', 'runtime-identity-canary', 'v8-pilot'],
    limitationsAcknowledged: true,
  });
  assert.equal(source.credentialPresent, false);
  assert.equal(source.rawApprovalBodyPersisted, false);
  assert.equal(sha256File(CANONICAL_PACKET_PATH), OLD_PACKET_SHA256);
  assert.equal(sha256File(OLD_APPROVAL_PATH), OLD_APPROVAL_SHA256);
});

test('workflow binding diagnostics are precise, controlled, and never remain NOT_STARTED', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

  assert.match(workflow, /FAILURE_STAGE=binding-validation/u);
  assert.match(workflow, /FAILURE_CODE=VALIDATION_IN_PROGRESS/u);
  assert.match(workflow, /const validateReviewPacketTransport/u);
  assert.match(workflow, /packet\.transport\.providerResponseValidationPath/u);
  assert.match(workflow, /packet\.transport\.normalizedResponseSchemaPath/u);
  assert.doesNotMatch(workflow, /packet\.responseContract\./u);
  for (const code of [
    'RUNTIME_IMAGE_IDENTITY_MISMATCH',
    'REVIEW_PACKET_TRANSPORT_SHAPE_INVALID',
    'REVIEW_PACKET_PROVIDER_VALIDATION_PATH_MISMATCH',
    'REVIEW_PACKET_NORMALIZED_SCHEMA_PATH_MISMATCH',
    'REPAIRED_BINDING_INVALID',
    'HUMAN_REAPPROVAL_REQUIRED',
    'UNEXPECTED_BINDING_VALIDATION_ERROR',
  ]) assert.match(workflow, new RegExp(code, 'u'));
  assert.match(workflow, /try\s*\{[\s\S]*UNEXPECTED_BINDING_VALIDATION_ERROR/u);
  assert.match(workflow, /diagnostic\.failureStage\s*\|\|\s*process\.env\.FAILURE_STAGE/u);
  assert.match(workflow, /diagnostic\.failureCode\s*\|\|\s*process\.env\.FAILURE_CODE/u);
  assert.doesNotMatch(workflow, /failureStage:\s*process\.env\.FAILURE_STAGE\s*\|\|/u);
  assert.doesNotMatch(workflow, /failureCode:\s*process\.env\.FAILURE_CODE\s*\|\|/u);
  assert.doesNotMatch(workflow, /Error\.stack|error\.stack|rawException/u);
});

test('preserved failed run evidence retains the old artifact and records the real boundary', () => {
  const run = readJson(RUN_EVIDENCE_PATH);
  const artifact = readJson(FAILURE_ARTIFACT_PATH);
  const review = readFileSync(FAILURE_REVIEW_PATH, 'utf8');

  assert.equal(run.runId, FAILED_RUN_ID);
  assert.equal(run.mainCommit, FAILED_MAIN_COMMIT);
  assert.equal(run.jobId, '91687707916');
  assert.equal(run.conclusion, 'failure');
  assert.equal(run.failureStep, 'Validate exact image, repaired binding, and pending approval gate');
  assert.equal(run.providerRequestCount, 0);
  assert.equal(run.proxy, 'NOT_STARTED');
  assert.equal(run.runtimeCanary, 'NOT_RUN');
  assert.equal(run.rawExceptionStackPersisted, false);
  assert.equal(run.failureArtifactSha256, FAILURE_ARTIFACT_SHA256);
  assert.equal(sha256File(FAILURE_ARTIFACT_PATH), FAILURE_ARTIFACT_SHA256);
  assert.equal(artifact.workflowRunId, FAILED_RUN_ID);
  assert.equal(artifact.mainCommitSha, FAILED_MAIN_COMMIT);
  assert.equal(artifact.failureStage, 'initialization');
  assert.equal(artifact.failureCode, 'NOT_STARTED');
  assert.equal(artifact.providerRequestCount, 0);
  assert.equal(artifact.runtimeImageDigestMatch, true);
  assert.equal(artifact.nodePathProbe.path, 'NOT_RUN');
  assert.equal(artifact.credentialNamesObserved.length, 0);
  assert.match(review, /REVIEW_PACKET_PATH_LOOKUP_TYPE_ERROR/u);
  assert.match(review, /NOT_STARTED/u);
  assert.doesNotMatch(review, /OPENAI_API_KEY|Authorization:\s*Bearer|at \[eval/u);
});

test('runtime and transport boundaries remain exact and all provider/runtime evidence remains pending', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const prep = readJson(path.join(ROOT, 'benchmarks', 'external-oss-v8', 'control', 'G2', 'runtime-canary-prep', 'prep.json'));
  const packet = readJson(ATTEMPT_3_PACKET_PATH);

  assert.equal(prep.modelBinding.modelId, MODEL_ID);
  assert.equal(prep.modelBinding.aliasAllowed, false);
  assert.equal(prep.modelBinding.fallbackAllowed, false);
  assert.equal(prep.requestLimit, 1);
  assert.equal(prep.timeoutMs, 30000);
  assert.equal(prep.canaryInput, FIXED_CANARY_INPUT);
  assert.equal(prep.providerRequests, 0);
  assert.equal(prep.runtimeCanary, 'NOT_RUN');
  assert.equal(packet.providerRequests, 0);
  assert.equal(packet.evidence.runtimeCanary, 'NOT_RUN');
  assert.match(workflow, new RegExp(EXACT_IMAGE.replace(/[.*+?^${}()|[\\]\\]/g, '\\\\$&'), 'u'));
  assert.doesNotMatch(workflow, /gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(workflow, /\blatest\b/u);
  assert.doesNotMatch(workflow, /fallback\s+model/u);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'design.json')), DESIGN_SHA256);
  assert.equal(sha256File(path.join(ROOT, 'experimental', 'governance-impact', 'lib', 'credential-proxy.mjs')), PROXY_SHA256);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'request.schema.json')), REQUEST_SCHEMA_SHA256);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'response.schema.json')), RESPONSE_SCHEMA_SHA256);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'provider-response-validation.json')), PROVIDER_RESPONSE_SHA256);
  assert.equal(sha256File(path.join(REPAIR_2_ROOT, 'normalized-proxy-response.schema.json')), NORMALIZED_RESPONSE_SHA256);
  assert.equal(sha256File(WORKFLOW_PATH) === OLD_WORKFLOW_SHA256, false);
  assert.equal(sha256File(CANONICAL_PACKET_PATH), OLD_PACKET_SHA256);
  assert.equal(existsSync(path.join(ROOT, 'benchmarks', 'external-oss-v8', 'runtime-identity', 'runtime-identity-receipt.json')), false);
});
