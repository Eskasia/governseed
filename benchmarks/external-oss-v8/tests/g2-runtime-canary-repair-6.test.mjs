import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const WORKFLOW = '.github/workflows/external-oss-v8-runtime-identity.yml';
const ATTEMPT_5_ROOT = 'benchmarks/external-oss-v8/credential-transport';
const ATTEMPT_5_APPROVAL = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-5.json`;
const ATTEMPT_5_SOURCE = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-5-source.json`;
const ATTEMPT_5_TEMPLATE = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-5.template.json`;
const ATTEMPT_5_ADDENDUM = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-5.addendum.json`;
const ATTEMPT_5_PACKET = `${ATTEMPT_5_ROOT}/repair-2/attempt-5/review-packet.json`;
const ATTEMPT_5_MANIFEST = `${ATTEMPT_5_ROOT}/repair-2/attempt-5/technical-manifest.json`;
const ATTEMPT_6_PACKET = `${ATTEMPT_5_ROOT}/repair-2/attempt-6/review-packet.json`;
const ATTEMPT_6_MANIFEST = `${ATTEMPT_5_ROOT}/repair-2/attempt-6/technical-manifest.json`;
const ATTEMPT_6_TEMPLATE = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-6.template.json`;
const ATTEMPT_6_ADDENDUM = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-6.addendum.json`;
const ATTEMPT_6_APPROVAL = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-6.json`;
const ATTEMPT_6_SOURCE = `${ATTEMPT_5_ROOT}/human-approval-repair-2-attempt-6-source.json`;
const IMAGE = 'node@sha256:3cb89926a7a025953446306a17c3e044768c35a1245a57ec38a61ef4c59373a5';
const MODEL = 'gpt-5.6-luna';
const FIXED_INPUT = 'Return exactly the JSON object {"runtime_canary":"PASS"}.';
const MAIN_COMMIT = '502c92e76e111a4cffbfaf4c3e4bde7f9bf8ce08';
const COMMENT_HASH = '41a47521099af120135d4ddb65aa10cf6f4180b3271ed904cf95d277ecc58840';
const TECHNICAL_HEAD = 'b7e7d34e68031671dee41fe7fe13800accae3e51';
const TECHNICAL_TREE = '2492683260127bc118f090a8f1808da367264dbc';
const REPAIR_6_TECHNICAL_HEAD = 'db85da98b2337aafd488ed64421b01e3a21422c6';
const REPAIR_6_TECHNICAL_TREE = 'f76b266b42a4c5a04d0e4e8e062525614eacf7f3';
const PROXY_SHA = 'f9dd7b6a0778e69f123d060a8df8cef1ab97e63756e7f819cf70d8d6ed85790c';
const OLD_RUNS = ['30814159615', '30824406710', '30850478318'];
const REPAIR_6_COMMENT_HASH = '63e52786c572b5827ba52646119cfc6b7d7df267474ba76601cc55dd2a6d7867';

const TECHNICAL_PATHS = [
  WORKFLOW,
  'benchmarks/external-oss-v8/control/G2/runtime-canary-prep/canary-client.mjs',
  'benchmarks/external-oss-v8/control/G2/runtime-canary-prep/host-proxy.mjs',
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

function readJson(relativePath, root = ROOT) {
  return JSON.parse(readFileSync(path.join(root, relativePath), 'utf8'));
}

function sha256(relativePath, root = ROOT) {
  return createHash('sha256').update(readFileSync(path.join(root, relativePath))).digest('hex');
}

function gitBytes(revision, relativePath) {
  return execFileSync('git', ['show', `${revision}:${relativePath}`]);
}

function extractNodeScript(workflow, marker) {
  const markerOffset = workflow.indexOf(marker);
  assert.notEqual(markerOffset, -1, marker);
  const nodeOffset = workflow.indexOf("node --input-type=module <<'NODE'", markerOffset);
  assert.notEqual(nodeOffset, -1, marker);
  const start = workflow.indexOf('\n', nodeOffset) + 1;
  const end = workflow.indexOf('\n          NODE', start);
  assert.notEqual(end, -1, marker);
  return workflow.slice(start, end).split('\n').map((line) => (
    line.startsWith('          ') ? line.slice(10) : line
  )).join('\n');
}

function runInlineScript(script, {
  root = ROOT,
  runRoot: suppliedRunRoot = null,
  runId = 'repair-6-synthetic-run',
  runAttempt = '1',
  authorizedMainCommit = MAIN_COMMIT,
  githubSha = MAIN_COMMIT,
  githubRef = 'refs/heads/main',
  runtimeImage = IMAGE,
} = {}) {
  const runRoot = suppliedRunRoot ?? mkdtempSync(path.join(os.tmpdir(), 'governseed-g2-repair-6-run-'));
  const githubEnv = path.join(runRoot, 'github-env');
  writeFileSync(githubEnv, '');
  const env = {
    PATH: process.env.PATH ?? '',
    BENCHMARK_ID: 'GS-OSS-2026-08-02-V8',
    GITHUB_ENV: githubEnv,
    GITHUB_RUN_ID: runId,
    RUN_ROOT: runRoot,
    RUNTIME_IMAGE: runtimeImage,
    AUTHORIZED_MAIN_COMMIT: authorizedMainCommit,
    AUTHORIZED_REF: githubRef,
    AUTHORIZED_SHA: githubSha,
    AUTHORIZED_RUN_ATTEMPT: runAttempt,
    AUTHORIZATION_RUN_ID: runId,
  };
  try {
    execFileSync(process.execPath, ['--input-type=module'], {
      cwd: root,
      env,
      input: script,
      stdio: ['pipe', 'pipe', 'pipe'],
      maxBuffer: 2 * 1024 * 1024,
    });
    return { status: 0, runRoot };
  } catch (error) {
    return {
      status: error.status ?? 1,
      runRoot,
      output: `${error.stdout ?? ''}${error.stderr ?? ''}`,
    };
  }
}

function runAuthorizationAndBinding(workflow, options = {}) {
  const runRoot = mkdtempSync(path.join(os.tmpdir(), 'governseed-g2-repair-6-run-'));
  const authorization = runInlineScript(
    extractNodeScript(workflow, '- name: Validate one-time main runtime authorization'),
    { ...options, runRoot },
  );
  assert.equal(authorization.status, 0, authorization.output);
  return runInlineScript(
    extractNodeScript(workflow, '- name: Validate attempt-5 approval and repair-6 technical bindings'),
    { ...options, runRoot },
  );
}

function copyBindingFixture(t) {
  const fixture = mkdtempSync(path.join(os.tmpdir(), 'governseed-g2-repair-6-fixture-'));
  for (const directory of ['.github', 'benchmarks/external-oss-v8', 'experimental/governance-impact']) {
    cpSync(path.join(ROOT, directory), path.join(fixture, directory), { recursive: true });
  }
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  return fixture;
}

function diagnostic(runRoot, filename) {
  return readJson(filename, runRoot);
}

test('repair-6 workflow is manual, main-bound, environment-gated, and single-attempt', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  assert.match(workflow, /^on:\n  workflow_dispatch:/mu);
  assert.match(workflow, /authorized_main_commit/gu);
  assert.match(workflow, /environment:\n\s+name: governseed-v8-runtime/u);
  assert.match(workflow, /AUTHORIZED_REF.*refs\/heads\/main/u);
  assert.match(workflow, /AUTHORIZED_RUN_ATTEMPT.*github\.run_attempt/u);
  assert.match(workflow, /RERUN_FORBIDDEN/u);
  assert.match(workflow, /AUTHORIZED_MAIN_COMMIT_MISMATCH/u);
  assert.match(workflow, /authorizationIdentity/u);
  assert.doesNotMatch(workflow, /HUMAN_REAPPROVAL_REQUIRED/u);
  assert.doesNotMatch(workflow, /existsSync\(path\.join\(root, approvedPath\)\)/u);
  assert.doesNotMatch(workflow, /\/v1\/models/u);
  assert.doesNotMatch(workflow, /\blatest\b/u);
  assert.doesNotMatch(workflow, /gpt-5\.6(?!-luna)/u);
  assert.doesNotMatch(workflow, /fallback[_ -]?model|modelFallback|\bretry\b|\bretries\b/iu);
});

test('valid attempt-5 approval/source passes the committed repair-6 binding validator', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  const result = runAuthorizationAndBinding(workflow);
  assert.equal(result.status, 0, result.output);
  assert.equal(diagnostic(result.runRoot, 'validation-diagnostic.json').failureCode, 'BINDING_VALIDATION_PASS');
  assert.equal(diagnostic(result.runRoot, 'validation-diagnostic.json').providerRequestAttempt, 'NO');
  assert.equal(diagnostic(result.runRoot, 'validation-diagnostic.json').workflowDispatch, 'NOT_RUN');
  assert.equal(diagnostic(result.runRoot, 'validation-diagnostic.json').runtimeCanary, 'NOT_RUN');
  assert.equal(diagnostic(result.runRoot, 'authorization-identity.json').workflowRunId, 'repair-6-synthetic-run');
  rmSync(result.runRoot, { recursive: true, force: true });
});

test('attempt-5 approval/source binding failures are fail-closed with stable codes', (t) => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  const script = extractNodeScript(workflow, '- name: Validate attempt-5 approval and repair-6 technical bindings');
  const missingApprovalRoot = copyBindingFixture(t);
  rmSync(path.join(missingApprovalRoot, ATTEMPT_5_APPROVAL));
  const missing = runInlineScript(script, { root: missingApprovalRoot });
  assert.equal(missing.status, 1);
  assert.equal(diagnostic(missing.runRoot, 'validation-diagnostic.json').failureCode, 'ATTEMPT5_APPROVAL_INVALID');
  const approvalTamperedRoot = copyBindingFixture(t);
  const approval = readJson(ATTEMPT_5_APPROVAL, approvalTamperedRoot);
  approval.approvedAt = '2026-08-04T08:09:00Z';
  writeFileSync(path.join(approvalTamperedRoot, ATTEMPT_5_APPROVAL), `${JSON.stringify(approval, null, 2)}\n`);
  const tamperedApproval = runInlineScript(script, { root: approvalTamperedRoot });
  assert.equal(tamperedApproval.status, 1);
  assert.equal(diagnostic(tamperedApproval.runRoot, 'validation-diagnostic.json').failureCode, 'ATTEMPT5_APPROVAL_INVALID');
  const sourceTamperedRoot = copyBindingFixture(t);
  const source = readJson(ATTEMPT_5_SOURCE, sourceTamperedRoot);
  source.commentBodySha256 = '0'.repeat(64);
  writeFileSync(path.join(sourceTamperedRoot, ATTEMPT_5_SOURCE), `${JSON.stringify(source, null, 2)}\n`);
  const tamperedSource = runInlineScript(script, { root: sourceTamperedRoot });
  assert.equal(tamperedSource.status, 1);
  assert.equal(diagnostic(tamperedSource.runRoot, 'validation-diagnostic.json').failureCode, 'ATTEMPT5_APPROVAL_SOURCE_INVALID');
  const sourceClaimTamperedRoot = copyBindingFixture(t);
  const sourceClaimTampered = readJson(ATTEMPT_5_SOURCE, sourceClaimTamperedRoot);
  sourceClaimTampered.bodyClaims.approvedModelId = 'gpt-5.6';
  writeFileSync(path.join(sourceClaimTamperedRoot, ATTEMPT_5_SOURCE), `${JSON.stringify(sourceClaimTampered, null, 2)}\n`);
  const tamperedSourceClaim = runInlineScript(script, { root: sourceClaimTamperedRoot });
  assert.equal(tamperedSourceClaim.status, 1);
  assert.equal(diagnostic(tamperedSourceClaim.runRoot, 'validation-diagnostic.json').failureCode, 'ATTEMPT5_APPROVAL_SOURCE_INVALID');
});

test('authorization identity rejects wrong main commit, reruns, wrong ref, and historical runs', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  const script = extractNodeScript(workflow, '- name: Validate one-time main runtime authorization');
  const mismatch = runInlineScript(script, { authorizedMainCommit: 'a'.repeat(40), githubSha: 'b'.repeat(40) });
  assert.equal(mismatch.status, 1);
  assert.equal(diagnostic(mismatch.runRoot, 'authorization-diagnostic.json').failureCode, 'AUTHORIZED_MAIN_COMMIT_MISMATCH');
  const rerun = runInlineScript(script, { runAttempt: '2' });
  assert.equal(rerun.status, 1);
  assert.equal(diagnostic(rerun.runRoot, 'authorization-diagnostic.json').failureCode, 'RERUN_FORBIDDEN');
  const wrongRef = runInlineScript(script, { githubRef: 'refs/heads/benchmark/v8-g2-runtime-canary-repair-6' });
  assert.equal(wrongRef.status, 1);
  assert.equal(diagnostic(wrongRef.runRoot, 'authorization-diagnostic.json').failureCode, 'MAIN_BRANCH_REQUIRED');
  const oldRun = runInlineScript(script, { runId: '30850478318' });
  assert.equal(oldRun.status, 1);
  assert.equal(diagnostic(oldRun.runRoot, 'authorization-diagnostic.json').failureCode, 'HISTORICAL_RERUN_FORBIDDEN');
});

test('repair-6 manifest is exact, current, and excludes evidence-only files', () => {
  const manifest = readJson(ATTEMPT_6_MANIFEST);
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.benchmarkId, 'GS-OSS-2026-08-02-V8');
  assert.equal(manifest.gate, 'G2');
  assert.equal(manifest.repair, 'repair-2');
  assert.equal(manifest.attempt, 6);
  assert.deepEqual(manifest.entries.map((entry) => entry.path), TECHNICAL_PATHS);
  assert.equal(manifest.entries.length, 13);
  for (const entry of manifest.entries) assert.equal(sha256(entry.path), entry.sha256, entry.path);
  for (const excluded of [ATTEMPT_6_PACKET, ATTEMPT_6_MANIFEST, ATTEMPT_6_TEMPLATE, ATTEMPT_6_ADDENDUM, ATTEMPT_5_APPROVAL, ATTEMPT_5_SOURCE]) {
    assert.equal(manifest.entries.some((entry) => entry.path === excluded), false, excluded);
  }
});

test('attempt-5 approved inputs remain byte-identical and repair-6 review stays pending', () => {
  for (const relativePath of [ATTEMPT_5_APPROVAL, ATTEMPT_5_SOURCE, ATTEMPT_5_TEMPLATE, ATTEMPT_5_ADDENDUM, ATTEMPT_5_PACKET, ATTEMPT_5_MANIFEST]) {
    assert.deepEqual(readFileSync(path.join(ROOT, relativePath)), gitBytes('origin/main', relativePath), relativePath);
  }
  const approval = readJson(ATTEMPT_5_APPROVAL);
  const source = readJson(ATTEMPT_5_SOURCE);
  const packet = readJson(ATTEMPT_6_PACKET);
  const template = readJson(ATTEMPT_6_TEMPLATE);
  const addendum = readJson(ATTEMPT_6_ADDENDUM);
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedModelId, MODEL);
  assert.equal(approval.approvedProxySha256, PROXY_SHA);
  assert.equal(source.commentBodySha256, COMMENT_HASH);
  assert.equal(source.reviewedTechnicalHead, TECHNICAL_HEAD);
  assert.equal(source.reviewedTechnicalTreeSha, TECHNICAL_TREE);
  assert.equal(source.failedRun.runId, '30850478318');
  assert.equal(source.failedRun.providerRequestAttempt, 'INDETERMINATE');
  assert.equal(source.failedRun.rerunPermitted, false);
  assert.equal(packet.status, 'PENDING_HUMAN_REPAIR_6_REVIEW');
  assert.equal(packet.humanTechnicalReview.status, 'PENDING_HUMAN_REVIEW');
  assert.equal(packet.evidence.localSyntheticTests, 'PASS');
  assert.equal(template.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(template.approvedBy, null);
  assert.equal(template.approvedAt, null);
  assert.equal(addendum.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(addendum.reviewedTechnicalHead, REPAIR_6_TECHNICAL_HEAD);
  assert.equal(addendum.reviewedTreeSha, REPAIR_6_TECHNICAL_TREE);
  assert.equal(addendum.providerRequests, 0);
  assert.equal(addendum.workflowDispatch, 'NOT_RUN');
  assert.equal(addendum.runtimeCanary, 'NOT_RUN');
  assert.equal(addendum.reviewPacketSha256, sha256(ATTEMPT_6_PACKET));
  assert.equal(addendum.technicalManifestSha256, sha256(ATTEMPT_6_MANIFEST));
});

test('repair-6 formal approval and sanitized source bind the owner comment without runtime authorization', () => {
  const schema = readJson(`${ATTEMPT_5_ROOT}/human-approval.schema.json`);
  const approval = readJson(ATTEMPT_6_APPROVAL);
  const source = readJson(ATTEMPT_6_SOURCE);
  assert.deepEqual(Object.keys(approval).sort(), Object.keys(schema.properties).sort());
  assert.deepEqual(
    Object.keys(approval.approvalEvidence).sort(),
    Object.keys(schema.properties.approvalEvidence.properties).sort(),
  );
  assert.equal(approval.approvalStatus, 'APPROVED');
  assert.equal(approval.approvedBy, 'Eskasia');
  assert.equal(approval.approvedAt, '2026-08-04T11:39:58Z');
  assert.equal(approval.approvalEvidence.commentId, 5178485510);
  assert.equal(approval.approvalEvidence.reference, 'https://github.com/Eskasia/governseed/pull/80#issuecomment-5178485510');
  assert.equal(source.verificationStatus, 'VERIFIED_GITHUB_ISSUE_COMMENT');
  assert.equal(source.sourcePullRequest, 80);
  assert.equal(source.reviewedPullRequest, 81);
  assert.equal(source.commentBodySha256, REPAIR_6_COMMENT_HASH);
  assert.equal(source.bodyClaims.finalEvidenceHead, '41383da9d292ed1e8220890cfa8bffca4f0cc2c0');
  assert.equal(source.bodyClaims.finalEvidenceTreeSha, 'f386cefe5d79c83675a3965fdaaa14bbddc46333');
  assert.equal(source.bodyClaims.workflowSha256, sha256(WORKFLOW));
  assert.equal(source.bodyClaims.reviewPacketSha256, sha256(ATTEMPT_6_PACKET));
  assert.equal(source.bodyClaims.technicalManifestSha256, sha256(ATTEMPT_6_MANIFEST));
  assert.deepEqual(source.forbiddenHistoricalRuns, OLD_RUNS);
  assert.equal(source.providerRequests, 0);
  assert.equal(source.workflowDispatch, 'NOT_RUN');
  assert.equal(source.runtimeCanary, 'NOT_RUN');
  assert.equal(source.runtimeReceiptPresent, false);
  assert.equal(source.newProviderRequestAuthorized, false);
  assert.equal(source.credentialPresent, false);
  assert.equal(source.rawApprovalBodyPersisted, false);
  assert.equal('body' in source, false);
});

test('exact model, runtime, fixed input, credential boundary, and no-provider state remain locked', () => {
  const workflow = readFileSync(path.join(ROOT, WORKFLOW), 'utf8');
  const packet = readJson(ATTEMPT_6_PACKET);
  assert.equal(packet.modelBinding.modelId, MODEL);
  assert.equal(packet.modelBinding.aliasAllowed, false);
  assert.equal(packet.modelBinding.fallbackAllowed, false);
  assert.equal(packet.transport.fixedInput, FIXED_INPUT);
  assert.equal(packet.transport.requestLimit, 1);
  assert.equal(packet.transport.timeoutMs, 30000);
  assert.equal(packet.transport.retryAllowed, false);
  assert.equal(packet.runtime.image, IMAGE);
  assert.equal(packet.runtime.nodeExecutable, '/usr/local/bin/node');
  assert.equal(packet.runtime.nodeVersion, 'v26.3.0');
  assert.equal(packet.runtime.requestLimit, 1);
  assert.equal(packet.runtime.timeoutMs, 30000);
  assert.equal(packet.runtime.fixedCanaryInput, FIXED_INPUT);
  assert.equal(packet.runtime.containerCredentialValues, false);
  assert.equal(packet.authorizationGate.workflowDispatchOnly, true);
  assert.equal(packet.authorizationGate.mainRef, 'refs/heads/main');
  assert.equal(packet.authorizationGate.runAttemptMustEqual, 1);
  assert.equal(packet.authorizationGate.runIdentityField, 'github.run_id');
  assert.equal(packet.authorizationGate.requiredReviewer, 'Eskasia');
  assert.equal(packet.authorizationGate.adminBypassAllowed, false);
  assert.equal(packet.authorizationGate.deploymentBranch, 'main');
  assert.equal(packet.evidence.providerRequests, 0);
  assert.equal(packet.evidence.workflowDispatch, 'NOT_RUN');
  assert.equal(packet.evidence.runtimeCanary, 'NOT_RUN');
  assert.equal(packet.evidence.runtimeReceiptPresent, false);
  assert.equal(existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json')), false);
  const containerSection = workflow.slice(workflow.indexOf('- name: Create isolated'), workflow.indexOf('- name: Stop host-side'));
  assert.doesNotMatch(containerSection, /(?:--env|-e)\s+OPENAI_API_KEY/u);
  assert.doesNotMatch(containerSection, /Authorization:/u);
  assert.deepEqual(packet.attemptHistory.forbiddenHistoricalRuns.map((entry) => entry.runId), OLD_RUNS);
  assert.ok(OLD_RUNS.every((runId) => packet.attemptHistory.forbiddenHistoricalRuns.find((entry) => entry.runId === runId)?.rerunPermitted === false));
});
