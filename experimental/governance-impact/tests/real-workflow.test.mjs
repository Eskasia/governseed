import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const WORKFLOW_PATH = path.join(
  ROOT,
  '.github/workflows/governance-impact-real.yml',
);
const WORKFLOW_EXISTS = fs.existsSync(WORKFLOW_PATH);
const WORKFLOW = WORKFLOW_EXISTS
  ? fs.readFileSync(WORKFLOW_PATH, 'utf8')
  : '';
const PREFLIGHT_WORKFLOW_PATH = path.join(
  ROOT,
  '.github/workflows/governance-impact-preflight.yml',
);
const PREFLIGHT_WORKFLOW_EXISTS = fs.existsSync(PREFLIGHT_WORKFLOW_PATH);
const PREFLIGHT_WORKFLOW = PREFLIGHT_WORKFLOW_EXISTS
  ? fs.readFileSync(PREFLIGHT_WORKFLOW_PATH, 'utf8')
  : '';
const PACKAGE = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

function requireWorkflow(t) {
  if (WORKFLOW_EXISTS) return true;
  t.skip('workflow contract checks require governance-impact-real.yml');
  return false;
}

function requirePreflightWorkflow(t) {
  if (PREFLIGHT_WORKFLOW_EXISTS) return true;
  t.skip('workflow contract checks require governance-impact-preflight.yml');
  return false;
}

function indentation(line) {
  return line.match(/^ */u)[0].length;
}

function extractBlock(source, headerPattern) {
  const lines = source.split(/\r?\n/u);
  const start = lines.findIndex((line) => headerPattern.test(line));
  assert.notEqual(start, -1, `missing block matching ${headerPattern}`);
  const baseIndent = indentation(lines[start]);
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line.trim() && indentation(line) <= baseIndent) break;
    end += 1;
  }
  return lines.slice(start + 1, end).join('\n');
}

function directKeys(block) {
  const lines = block
    .split(/\r?\n/u)
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'));
  if (lines.length === 0) return [];
  const directIndent = Math.min(...lines.map(indentation));
  return lines
    .filter((line) => indentation(line) === directIndent)
    .map((line) => line.trim().match(/^([A-Za-z0-9_-]+):(?:\s.*)?$/u))
    .filter(Boolean)
    .map((match) => match[1]);
}

function stepBlocks(stepsBlock) {
  const lines = stepsBlock.split(/\r?\n/u);
  const starts = lines
    .map((line, index) => ({ index, match: line.match(/^(\s*)-\s+name:\s*(.+)$/u) }))
    .filter(({ match }) => match);
  assert.ok(starts.length > 0, 'workflow steps must have explicit names');
  const stepIndent = Math.min(...starts.map(({ match }) => match[1].length));
  const directStarts = starts.filter(({ match }) => match[1].length === stepIndent);
  return directStarts.map(({ index, match }, position) => {
    const end = directStarts[position + 1]?.index ?? lines.length;
    return {
      name: match[2].trim(),
      text: lines.slice(index, end).join('\n'),
    };
  });
}

function trimmedLines(source) {
  return source.split(/\r?\n/u).map((line) => line.trim());
}

test('approval-gated real evaluator workflow exists', () => {
  assert.equal(
    WORKFLOW_EXISTS,
    true,
    '.github/workflows/governance-impact-real.yml must exist',
  );
});

test('workflow is workflow_dispatch-only and declares all reviewed inputs', (t) => {
  if (!requireWorkflow(t)) return;
  const onBlock = extractBlock(WORKFLOW, /^on:\s*$/u);
  assert.deepEqual(directKeys(onBlock), ['workflow_dispatch']);
  assert.doesNotMatch(
    onBlock,
    /^\s*(?:push|pull_request|pull_request_target|schedule|workflow_call)\s*:/mu,
  );

  const dispatchBlock = extractBlock(
    onBlock,
    /^\s*workflow_dispatch:\s*$/u,
  );
  const inputsBlock = extractBlock(dispatchBlock, /^\s*inputs:\s*$/u);
  const requiredInputs = [
    'scenario',
    'manifest',
    'policy',
    'preflight_receipt',
    'attempt_id',
    'output',
    'runtime_image',
    'codex_version',
    'codex_binary_sha256',
    'timeout_ms',
  ];
  assert.deepEqual(directKeys(inputsBlock), requiredInputs);
  for (const input of requiredInputs) {
    const inputBlock = extractBlock(
      inputsBlock,
      new RegExp(`^\\s*${input}:\\s*$`, 'u'),
    );
    const lines = trimmedLines(inputBlock);
    assert.ok(lines.includes('required: true'), `${input} must be required`);
    assert.ok(lines.includes('type: string'), `${input} must be a string`);
  }
});

test('workflow has read-only contents permission and one approved Linux job', (t) => {
  if (!requireWorkflow(t)) return;
  const concurrencyBlock = extractBlock(WORKFLOW, /^concurrency:\s*$/u);
  assert.deepEqual(directKeys(concurrencyBlock), ['group', 'cancel-in-progress']);
  assert.ok(trimmedLines(concurrencyBlock).includes('group: governance-impact-real'));
  assert.ok(trimmedLines(concurrencyBlock).includes('cancel-in-progress: false'));

  const permissionsBlock = extractBlock(WORKFLOW, /^permissions:\s*$/u);
  assert.deepEqual(directKeys(permissionsBlock), ['contents']);
  assert.ok(trimmedLines(permissionsBlock).includes('contents: read'));
  assert.equal(
    WORKFLOW.match(/^permissions:\s*$/gmu)?.length,
    1,
    'permissions must be declared once at top level',
  );

  const jobsBlock = extractBlock(WORKFLOW, /^jobs:\s*$/u);
  const jobIds = directKeys(jobsBlock);
  assert.equal(jobIds.length, 1, 'exactly one real evaluator job is allowed');
  const jobBlock = extractBlock(
    jobsBlock,
    new RegExp(`^\\s*${jobIds[0]}:\\s*$`, 'u'),
  );
  const jobKeys = directKeys(jobBlock);
  assert.ok(jobKeys.includes('runs-on'));
  assert.ok(jobKeys.includes('environment'));
  assert.ok(jobKeys.includes('timeout-minutes'));
  assert.ok(jobKeys.includes('steps'));
  assert.ok(!jobKeys.includes('env'), 'job-level env is forbidden');
  assert.match(jobBlock, /^\s*runs-on:\s*ubuntu-latest\s*$/mu);
  assert.match(
    jobBlock,
    /^\s*environment:\s*governance-impact-real\s*$/mu,
  );
  assert.match(jobBlock, /^\s*timeout-minutes:\s*30\s*$/mu);
});

test('job checks out source, uses the declared Node runtime, and validates a digest image', (t) => {
  if (!requireWorkflow(t)) return;
  const jobsBlock = extractBlock(WORKFLOW, /^jobs:\s*$/u);
  const jobBlock = extractBlock(
    jobsBlock,
    new RegExp(`^\\s*${directKeys(jobsBlock)[0]}:\\s*$`, 'u'),
  );
  const steps = stepBlocks(extractBlock(jobBlock, /^\s*steps:\s*$/u));
  assert.ok(steps.some(({ text }) => text.includes('uses: actions/checkout@v4')));
  assert.ok(steps.some(({ text }) => text.includes('uses: actions/setup-node@v4')));
  assert.equal(
    steps.some(({ text }) => /^\s*run:\s*npm (?:ci|install)\s*$/mu.test(text)),
    false,
    'the dependency-free package must not invoke an install command without a lockfile',
  );
  const provenanceStep = steps.find(({ text }) => (
    text.includes('RUNTIME_IMAGE')
    && text.includes('@sha256:[0-9a-f]{64}')
  ));
  assert.ok(
    provenanceStep,
    'runtime_image must be checked as a lowercase sha256 digest reference',
  );
  assert.ok(
    provenanceStep.text.includes('^[^[:space:]@]+@sha256:[0-9a-f]{64}$'),
    'runtime_image validation must reject whitespace and extra @ separators',
  );
  assert.match(
    provenanceStep.text,
    /TIMEOUT_MS[\s\S]*\^\[1-9\]\[0-9\]\*\$[\s\S]*600000/u,
    'timeout must be a positive integer capped at the CLI maximum',
  );
  const validationIndex = steps.indexOf(provenanceStep);
  const pullIndex = steps.findIndex(({ text }) => (
    text.includes('docker pull "$RUNTIME_IMAGE"')
  ));
  const evaluatorIndex = steps.findIndex(({ text }) => (
    text.includes('experimental/governance-impact/eval.mjs run')
  ));
  assert.ok(
    validationIndex < pullIndex && pullIndex < evaluatorIndex,
    'the reviewed digest must be pulled after validation and before evaluation',
  );
  assert.doesNotMatch(
    steps[pullIndex].text,
    /OPENAI_API_KEY|GOVERNANCE_IMPACT_REAL|secrets\./u,
  );
});

test('workflow rejects artifact path metacharacters before evaluation', (t) => {
  if (!requireWorkflow(t)) return;
  const jobsBlock = extractBlock(WORKFLOW, /^jobs:\s*$/u);
  const jobBlock = extractBlock(
    jobsBlock,
    new RegExp(`^\\s*${directKeys(jobsBlock)[0]}:\\s*$`, 'u'),
  );
  const steps = stepBlocks(extractBlock(jobBlock, /^\s*steps:\s*$/u));
  const evaluatorIndex = steps.findIndex(({ text }) => (
    text.includes('experimental/governance-impact/eval.mjs run')
  ));
  const validationIndex = steps.findIndex(({ text }) => (
    text.includes('OUTPUT_PATH: ${{ inputs.output }}')
    && text.includes('^artifacts/governance-impact/[A-Za-z0-9][A-Za-z0-9._-]*\\.json$')
  ));
  assert.ok(
    validationIndex >= 0 && validationIndex < evaluatorIndex,
    'output must be one JSON file in the dedicated evidence directory before upload',
  );
  assert.ok(
    steps[validationIndex].text.includes(
      '^artifacts/governance-impact/preflight-[A-Za-z0-9][A-Za-z0-9._-]*\\.json$',
    ),
    'the real run must take one committed preflight receipt path',
  );
});

test('credential and real-mode opt-in exist only in evaluator step env', (t) => {
  if (!requireWorkflow(t)) return;
  const jobsBlock = extractBlock(WORKFLOW, /^jobs:\s*$/u);
  const jobBlock = extractBlock(
    jobsBlock,
    new RegExp(`^\\s*${directKeys(jobsBlock)[0]}:\\s*$`, 'u'),
  );
  const steps = stepBlocks(extractBlock(jobBlock, /^\s*steps:\s*$/u));
  const evaluatorStep = steps.find(({ text }) => (
    text.includes('experimental/governance-impact/eval.mjs run')
  ));
  assert.ok(evaluatorStep, 'real evaluator step is required');
  const evaluatorEnv = extractBlock(evaluatorStep.text, /^\s*env:\s*$/u);
  const envLines = trimmedLines(evaluatorEnv);
  assert.ok(
    envLines.includes('OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}'),
  );
  assert.ok(envLines.includes("GOVERNANCE_IMPACT_REAL: '1'"));
  assert.equal(WORKFLOW.match(/^\s*OPENAI_API_KEY\s*:/gmu)?.length, 1);
  assert.equal(
    WORKFLOW.match(/\$\{\{\s*secrets\.OPENAI_API_KEY\s*\}\}/gu)?.length,
    1,
  );
  assert.equal(WORKFLOW.match(/GOVERNANCE_IMPACT_REAL/gu)?.length, 1);

  const outsideEvaluator = WORKFLOW.replace(evaluatorStep.text, '');
  assert.doesNotMatch(outsideEvaluator, /OPENAI_API_KEY|GOVERNANCE_IMPACT_REAL/u);
  const topLevelKeys = directKeys(WORKFLOW);
  assert.ok(!topLevelKeys.includes('env'), 'workflow-level env is forbidden');
});

test('evaluator passes fixed flags from non-secret step env without credential argv', (t) => {
  if (!requireWorkflow(t)) return;
  const jobsBlock = extractBlock(WORKFLOW, /^jobs:\s*$/u);
  const jobBlock = extractBlock(
    jobsBlock,
    new RegExp(`^\\s*${directKeys(jobsBlock)[0]}:\\s*$`, 'u'),
  );
  const evaluatorStep = stepBlocks(
    extractBlock(jobBlock, /^\s*steps:\s*$/u),
  ).find(({ text }) => text.includes('experimental/governance-impact/eval.mjs run'));
  assert.ok(evaluatorStep);

  const evaluatorEnv = trimmedLines(
    extractBlock(evaluatorStep.text, /^\s*env:\s*$/u),
  );
  const expectedEnv = [
    'SCENARIO: ${{ inputs.scenario }}',
    'MANIFEST: ${{ inputs.manifest }}',
    'POLICY: ${{ inputs.policy }}',
    'PREFLIGHT_RECEIPT: ${{ inputs.preflight_receipt }}',
    'ATTEMPT_ID: ${{ inputs.attempt_id }}',
    'OUTPUT_PATH: ${{ inputs.output }}',
    'RUNTIME_IMAGE: ${{ inputs.runtime_image }}',
    'CODEX_VERSION: ${{ inputs.codex_version }}',
    'CODEX_BINARY_SHA256: ${{ inputs.codex_binary_sha256 }}',
    'TIMEOUT_MS: ${{ inputs.timeout_ms }}',
  ];
  for (const entry of expectedEnv) {
    assert.ok(evaluatorEnv.includes(entry), `missing evaluator env: ${entry}`);
  }

  const runBlock = extractBlock(evaluatorStep.text, /^\s*run:\s*\|\s*$/u);
  const expectedFlags = [
    '--scenario "$SCENARIO"',
    '--manifest "$MANIFEST"',
    '--policy "$POLICY"',
    '--preflight-receipt "$PREFLIGHT_RECEIPT"',
    '--attempt-id "$ATTEMPT_ID"',
    '--output "$OUTPUT_PATH"',
    '--runtime-image "$RUNTIME_IMAGE"',
    '--codex-version "$CODEX_VERSION"',
    '--codex-binary-sha256 "$CODEX_BINARY_SHA256"',
    '--timeout-ms "$TIMEOUT_MS"',
  ];
  for (const flag of expectedFlags) {
    assert.ok(runBlock.includes(flag), `missing fixed evaluator flag: ${flag}`);
  }
  assert.doesNotMatch(runBlock, /\$\{\{\s*(?:inputs|secrets)\./u);
  assert.doesNotMatch(
    runBlock,
    /OPENAI_API_KEY|--api-key|--credential|secrets\./u,
  );
});

test('artifact upload is success-only, exact-output-only, and followed by cleanup', (t) => {
  if (!requireWorkflow(t)) return;
  const jobsBlock = extractBlock(WORKFLOW, /^jobs:\s*$/u);
  const jobBlock = extractBlock(
    jobsBlock,
    new RegExp(`^\\s*${directKeys(jobsBlock)[0]}:\\s*$`, 'u'),
  );
  const steps = stepBlocks(extractBlock(jobBlock, /^\s*steps:\s*$/u));
  const uploadIndex = steps.findIndex(({ text }) => (
    text.includes('uses: actions/upload-artifact@v4')
  ));
  assert.notEqual(uploadIndex, -1, 'upload-artifact step is required');
  const uploadStep = steps[uploadIndex];
  assert.ok(trimmedLines(uploadStep.text).includes('if: ${{ success() }}'));
  const uploadWith = extractBlock(uploadStep.text, /^\s*with:\s*$/u);
  assert.ok(
    trimmedLines(uploadWith).includes('path: ${{ inputs.output }}'),
    'artifact path must be exactly the requested output',
  );
  assert.equal(
    uploadWith.match(/^\s*path:\s*/gmu)?.length,
    1,
    'artifact upload must declare one path only',
  );
  assert.doesNotMatch(
    uploadStep.text,
    /OPENAI_API_KEY|GOVERNANCE_IMPACT_REAL|secrets\./u,
  );

  const cleanupIndex = steps.findIndex(({ text }) => (
    trimmedLines(text).includes('if: ${{ always() }}')
  ));
  assert.ok(cleanupIndex > uploadIndex, 'always cleanup must follow upload');
  const cleanupStep = steps[cleanupIndex];
  const cleanupEnv = trimmedLines(
    extractBlock(cleanupStep.text, /^\s*env:\s*$/u),
  );
  assert.ok(cleanupEnv.includes('OUTPUT_PATH: ${{ inputs.output }}'));
  const cleanupRun = extractBlock(cleanupStep.text, /^\s*run:\s*\|\s*$/u);
  assert.match(cleanupRun, /\b(?:rm|node)\b/u);
  assert.match(cleanupRun, /\bOUTPUT_PATH\b/u);
  assert.match(cleanupRun, /\.tmp\/governance-impact/u);
  assert.match(cleanupRun, /\bRUNNER_TEMP\b/u);
  assert.match(cleanupRun, /governance-impact-/u);
  assert.match(
    cleanupRun,
    /org\.openai\.governance-impact\.managed/u,
    'finalizer must remove only evaluator-owned Docker resources',
  );
  assert.match(cleanupRun, /spawnSync/u);
  assert.doesNotMatch(cleanupRun, /OPENAI_API_KEY|secrets\./u);
});

test('package wires every OCI safety module into static checks without adding live integration to public CI', () => {
  const check = PACKAGE.scripts?.['check:experimental'] ?? '';
  for (const file of [
    'experimental/governance-impact/oci-integration.mjs',
    'experimental/governance-impact/uds-relay.mjs',
    'experimental/governance-impact/lib/credential-proxy.mjs',
    'experimental/governance-impact/lib/oci-proxy-facade.mjs',
    'experimental/governance-impact/lib/oci-supervisor.mjs',
  ]) {
    assert.ok(check.includes(`node --check ${file}`), `missing static check: ${file}`);
  }

  const unit = PACKAGE.scripts?.['test:experimental'] ?? '';
  for (const file of [
    'experimental/governance-impact/tests/credential-proxy.test.mjs',
    'experimental/governance-impact/tests/oci-integration.test.mjs',
    'experimental/governance-impact/tests/oci-proxy-facade.test.mjs',
    'experimental/governance-impact/tests/oci-supervisor.test.mjs',
    'experimental/governance-impact/tests/real-workflow.test.mjs',
    'experimental/governance-impact/tests/uds-relay.test.mjs',
  ]) {
    assert.ok(unit.includes(file), `missing offline unit test: ${file}`);
  }
  assert.equal(
    PACKAGE.scripts?.['test:governance-impact:oci:integration'],
    'node experimental/governance-impact/oci-integration.mjs',
  );
  assert.ok(
    (PACKAGE.scripts?.['test:experimental'] ?? '').includes(
      'experimental/governance-impact/tests/proxy-negative.test.mjs',
    ),
  );
  assert.doesNotMatch(
    PACKAGE.scripts?.ci ?? '',
    /test:governance-impact:oci:integration/u,
    'public CI must remain deterministic and offline',
  );
});

test('credential-free preflight workflow is a separate manual Linux surface', (t) => {
  assert.equal(
    PREFLIGHT_WORKFLOW_EXISTS,
    true,
    '.github/workflows/governance-impact-preflight.yml must exist',
  );
  if (!requirePreflightWorkflow(t)) return;
  const onBlock = extractBlock(PREFLIGHT_WORKFLOW, /^on:\s*$/u);
  assert.deepEqual(directKeys(onBlock), ['workflow_dispatch']);
  assert.doesNotMatch(
    PREFLIGHT_WORKFLOW,
    /OPENAI_API_KEY|secrets\.|^\s*environment\s*:/mu,
  );
  const permissions = extractBlock(PREFLIGHT_WORKFLOW, /^permissions:\s*$/u);
  assert.deepEqual(directKeys(permissions), ['contents']);
  assert.ok(trimmedLines(permissions).includes('contents: read'));
  const jobs = extractBlock(PREFLIGHT_WORKFLOW, /^jobs:\s*$/u);
  const job = extractBlock(
    jobs,
    new RegExp(`^\\s*${directKeys(jobs)[0]}:\\s*$`, 'u'),
  );
  assert.match(job, /^\s*runs-on:\s*ubuntu-latest\s*$/mu);
});

test('preflight workflow declares the exact receipt inputs and bounded timeout', (t) => {
  if (!requirePreflightWorkflow(t)) return;
  const onBlock = extractBlock(PREFLIGHT_WORKFLOW, /^on:\s*$/u);
  const dispatch = extractBlock(onBlock, /^\s*workflow_dispatch:\s*$/u);
  const inputs = extractBlock(dispatch, /^\s*inputs:\s*$/u);
  const requiredInputs = [
    'model',
    'output',
    'runtime_image',
    'codex_version',
    'codex_binary_sha256',
    'timeout_ms',
  ];
  assert.deepEqual(directKeys(inputs), requiredInputs);
  for (const input of requiredInputs) {
    const block = extractBlock(
      inputs,
      new RegExp(`^\\s*${input}:\\s*$`, 'u'),
    );
    assert.ok(trimmedLines(block).includes('required: true'));
    assert.ok(trimmedLines(block).includes('type: string'));
  }
  assert.match(PREFLIGHT_WORKFLOW, /\^\[1-9\]\[0-9\]\*\$/u);
  assert.match(PREFLIGHT_WORKFLOW, /600000/u);
  assert.ok(
    PREFLIGHT_WORKFLOW.includes(
      '^artifacts/governance-impact/preflight-[A-Za-z0-9][A-Za-z0-9._-]*\\.json$',
    ),
  );
});

test('preflight workflow validates, pulls, proves, and uploads only the exact receipt', (t) => {
  if (!requirePreflightWorkflow(t)) return;
  const jobs = extractBlock(PREFLIGHT_WORKFLOW, /^jobs:\s*$/u);
  const job = extractBlock(
    jobs,
    new RegExp(`^\\s*${directKeys(jobs)[0]}:\\s*$`, 'u'),
  );
  const steps = stepBlocks(extractBlock(job, /^\s*steps:\s*$/u));
  const validationIndex = steps.findIndex(({ name }) => (
    name === 'Validate reviewed preflight inputs'
  ));
  const pullIndex = steps.findIndex(({ text }) => (
    text.includes('docker pull "$RUNTIME_IMAGE"')
  ));
  const preflightIndex = steps.findIndex(({ text }) => (
    text.includes('experimental/governance-impact/eval.mjs preflight')
  ));
  const uploadIndex = steps.findIndex(({ text }) => (
    text.includes('uses: actions/upload-artifact@v4')
  ));
  assert.ok(
    validationIndex >= 0
      && validationIndex < pullIndex
      && pullIndex < preflightIndex
      && preflightIndex < uploadIndex,
  );
  const preflight = steps[preflightIndex];
  assert.ok(trimmedLines(
    extractBlock(preflight.text, /^\s*env:\s*$/u),
  ).includes("GOVERNANCE_IMPACT_REAL: '1'"));
  const run = extractBlock(preflight.text, /^\s*run:\s*\|\s*$/u);
  for (const flag of [
    '--model "$MODEL"',
    '--output "$OUTPUT_PATH"',
    '--runtime-image "$RUNTIME_IMAGE"',
    '--codex-version "$CODEX_VERSION"',
    '--codex-binary-sha256 "$CODEX_BINARY_SHA256"',
    '--timeout-ms "$TIMEOUT_MS"',
  ]) {
    assert.ok(run.includes(flag), `missing preflight flag: ${flag}`);
  }
  assert.equal(
    PREFLIGHT_WORKFLOW.match(/GOVERNANCE_IMPACT_REAL/gu)?.length,
    1,
  );
  const upload = steps[uploadIndex];
  assert.ok(trimmedLines(upload.text).includes('if: ${{ success() }}'));
  assert.ok(trimmedLines(
    extractBlock(upload.text, /^\s*with:\s*$/u),
  ).includes('path: ${{ inputs.output }}'));
  assert.ok(
    steps.slice(uploadIndex + 1).some(({ text }) => (
      trimmedLines(text).includes('if: ${{ always() }}')
    )),
  );
});
