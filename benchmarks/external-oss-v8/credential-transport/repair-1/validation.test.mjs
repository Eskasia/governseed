import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(process.cwd());
const repairRoot = path.join(
  ROOT,
  'benchmarks/external-oss-v8/credential-transport/repair-1',
);
const controlRoot = path.join(
  ROOT,
  'benchmarks/external-oss-v8/control/G2/repair-1',
);
const readJson = (relativePath) => JSON.parse(
  fs.readFileSync(path.join(ROOT, relativePath), 'utf8'),
);
const sha256 = (relativePath) => createHash('sha256')
  .update(fs.readFileSync(path.join(ROOT, relativePath)))
  .digest('hex');

test('repair-1 packet, schemas, immutable evidence, and source contract are consistent', () => {
  const packet = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/review-packet.json');
  const design = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/design.json');
  const requestSchema = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/request.schema.json');
  const responseSchema = readJson('benchmarks/external-oss-v8/credential-transport/repair-1/response.schema.json');
  const approvalSchema = readJson('benchmarks/external-oss-v8/credential-transport/human-approval.schema.json');
  const approvalTemplate = readJson('benchmarks/external-oss-v8/credential-transport/human-approval.template.json');
  const receiptSchema = readJson('benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.schema.json');
  const inherited = readJson('benchmarks/external-oss-v8/control/G2/repair-1/inherited-evidence.json');
  const findings = readJson('benchmarks/external-oss-v8/control/G2/repair-1/findings.json');
  const solEvidence = readJson('benchmarks/external-oss-v8/control/G2/repair-1/sol-review-evidence.json');
  const solVerdict = readJson('benchmarks/external-oss-v8/control/G2/repair-1/sol-verdict.json');

  assert.equal(packet.benchmarkId, 'GS-OSS-2026-08-02-V8');
  assert.equal(packet.gate, 'G2');
  assert.equal(packet.repair, 'repair-1');
  assert.equal(packet.status, 'PENDING_HUMAN_REVIEW');
  assert.equal(packet.technicalDisposition, 'TECHNICALLY_ACCEPTABLE_FOR_HUMAN_REVIEW');
  assert.equal(packet.overallGate, 'BLOCKED');
  assert.deepEqual(Object.keys(packet.humanApproval).sort(), [
    'approvalStatus',
    'approvedAt',
    'approvedBy',
  ]);
  assert.deepEqual(packet.humanApproval, {
    approvalStatus: 'PENDING_HUMAN_REVIEW',
    approvedBy: null,
    approvedAt: null,
  });
  assert.equal(packet.contract.provider, 'OpenAI');
  assert.equal(packet.contract.method, 'POST');
  assert.equal(packet.contract.endpoint, 'https://api.openai.com/v1/responses');
  assert.equal(packet.contract.limits.requestLimit, 1);
  assert.equal(packet.contract.limits.timeoutMs, 30_000);
  assert.equal(packet.contract.modelBinding.provider, 'OpenAI');
  assert.equal(packet.contract.modelBinding.modelId, 'gpt-5.6-luna');
  assert.equal(packet.contract.modelBinding.aliasAllowed, false);
  assert.equal(packet.contract.modelBinding.fallbackAllowed, false);
  assert.equal(packet.contract.modelBinding.exact, true);
  assert.equal(packet.contract.modelBinding.status, 'LOCKED_PENDING_HUMAN_APPROVAL');
  assert.deepEqual(packet.contract.request.allowedFields, [
    'model',
    'input',
    'max_output_tokens',
    'response_format',
    'metadata',
  ]);
  assert.deepEqual(packet.contract.request.metadataFields, [
    'benchmark_id',
    'run_id',
    'task_id',
  ]);
  assert.deepEqual(packet.contract.containerEnvironment.proxyVariables, [
    'GOVERNSEED_PROXY_SOCKET',
    'GOVERNSEED_BENCHMARK_ID',
    'GOVERNSEED_RUN_ID',
    'GOVERNSEED_TASK_ID',
  ]);
  assert.equal(requestSchema.additionalProperties, false);
  assert.equal(responseSchema.additionalProperties, false);
  assert.equal(requestSchema.properties.model.const, 'gpt-5.6-luna');
  assert.equal(responseSchema.properties.model.const, 'gpt-5.6-luna');
  assert.equal(approvalSchema.properties.approvedModelId.const, 'gpt-5.6-luna');
  assert.equal(receiptSchema.properties.modelId.const, 'gpt-5.6-luna');
  assert.equal(requestSchema.properties.max_output_tokens.const, 8192);
  assert.deepEqual(requestSchema.properties.metadata.required, [
    'benchmark_id',
    'run_id',
    'task_id',
  ]);
  assert.deepEqual(responseSchema.required, ['id', 'model', 'output', 'usage']);
  assert.equal(responseSchema.properties.usage.additionalProperties, false);

  assert.equal(findings.summary.total, 13);
  assert.equal(findings.summary.closed, 13);
  assert.equal(findings.summary.remainingTechnicalBlockers, 0);
  assert.equal(new Set(findings.checks.map((entry) => entry.id)).size, 13);
  assert.equal(solEvidence.reviewer.model, 'gpt-5.6-sol');
  assert.equal(solEvidence.recommendation, 'ACCEPT');
  assert.equal(solEvidence.technicalDisposition, 'TECHNICALLY_ACCEPTABLE_FOR_HUMAN_REVIEW');
  assert.equal(solEvidence.independentAssessment.closedInheritedBlockers, 13);
  assert.equal(solEvidence.independentAssessment.providerRequests, 0);
  assert.equal(solVerdict.verdict, 'ACCEPT');
  assert.equal(solVerdict.technicalToken, 'TECHNICALLY_ACCEPTABLE_FOR_HUMAN_REVIEW');
  assert.equal(solVerdict.providerRequestCount, 0);
  assert.equal(solVerdict.runtimeIdentity, 'NOT_RUN');
  assert.equal(solVerdict.exactModelCandidate, 'gpt-5.6-luna');
  assert.equal(approvalTemplate.approvalStatus, 'PENDING_HUMAN_REVIEW');
  assert.equal(approvalTemplate.approvedBy, null);
  assert.equal(approvalTemplate.approvedAt, null);
  assert.equal(approvalTemplate.approvedModelId, 'gpt-5.6-luna');
  assert.equal(approvalTemplate.limitationsAcknowledged, false);
  assert.equal(inherited.parent.pullRequest, 73);
  assert.equal(inherited.inheritedFindings.oldVerdict, 'REJECT');
  assert.equal(inherited.inheritedFindings.oldSummary.blocked, 13);
  for (const entry of inherited.immutableEvidence) {
    assert.equal(sha256(entry.path), entry.sha256, `immutable evidence changed: ${entry.path}`);
  }

  for (const [field, expectedPath] of [
    ['designSha256', packet.hashes.designPath],
    ['requestSchemaSha256', packet.hashes.requestSchemaPath],
    ['responseSchemaSha256', packet.hashes.responseSchemaPath],
    ['proxySourceSha256', packet.hashes.proxySourcePath],
    ['proxyFacadeSha256', packet.hashes.proxyFacadePath],
    ['supervisorSourceSha256', packet.hashes.supervisorSourcePath],
    ['relaySourceSha256', packet.hashes.relaySourcePath],
  ]) {
    assert.equal(sha256(expectedPath), packet.hashes[field], `hash drift: ${expectedPath}`);
  }

  const sourcePaths = [
    packet.hashes.proxySourcePath,
    packet.hashes.proxyFacadePath,
    packet.hashes.supervisorSourcePath,
    packet.hashes.relaySourcePath,
  ];
  const source = sourcePaths
    .map((relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8'))
    .join('\n');
  assert.doesNotMatch(source, /(?:MAX_REQUESTS|requestLimit\s*:\s*)32\b/u);
  assert.doesNotMatch(source, /(?:DEFAULT_DEADLINE_MS|timeoutMs\s*:\s*)300000\b/u);
  assert.doesNotMatch(source, /OPENAI_API_KEY|OPENAI_BASE_URL|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN/u);
  assert.doesNotMatch(source, /sk-[A-Za-z0-9]{20,}/u);
  assert.doesNotMatch(source, /Bearer\s+[A-Za-z0-9_-]{32,}/u);
  assert.equal(fs.existsSync(path.join(repairRoot, 'human-approval.json')), false);
  assert.equal(fs.existsSync(path.join(controlRoot, 'human-approval.json')), false);
  assert.equal(fs.existsSync(path.join(ROOT, 'benchmarks/external-oss-v8/runtime-identity/runtime-identity-receipt.json')), false);
});
