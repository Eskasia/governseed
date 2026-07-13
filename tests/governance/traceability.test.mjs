import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { evaluateTraceability } from '../../scripts/lib/governance-checks.mjs';

const FIXTURE_DIR = path.resolve('examples/template-adoption/base-minimal');
const TEST_FIXTURE_DIR = path.resolve('tests/governance/fixtures');
function fixture(name, directory = FIXTURE_DIR) {
  return fs.readFileSync(path.join(directory, name), 'utf8');
}

function withoutRow(content, prefix) {
  return content
    .split(/\r?\n/)
    .filter((line) => !line.startsWith(prefix))
    .join('\n');
}

function baseInputs(overrides = {}) {
  return [
    overrides.projectBrief ?? fixture('PROJECT_BRIEF.md'),
    overrides.spec ?? fixture('SPEC.md'),
    overrides.taskContract ?? fixture('TASK_CONTRACT.md'),
    overrides.openLoops ?? fixture('OPEN_LOOPS.md'),
  ];
}

test('accepts a complete SRC to EVD chain', () => {
  const findings = evaluateTraceability(...baseInputs());
  assert.deepEqual(findings, []);
});

test('rejects a requirement without a source', () => {
  const spec = fixture('SPEC.md').replace(
    '| SRC-001 | maintainer-role | n/a |',
    '| SRC-999 | maintainer-role | n/a |',
  );
  const findings = evaluateTraceability(...baseInputs({ spec }));
  assert.ok(findings.some((item) => item.code === 'TRACE_SOURCE_MISSING'));
});

test('rejects a requirement whose source is not confirmed', () => {
  const projectBrief = fixture('PROJECT_BRIEF.md').replace(
    '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | synthetic | attestation-only | n/a | no | pending | maintainer-role | 2026-07-13 |',
  );
  const findings = evaluateTraceability(...baseInputs({ projectBrief }));
  assert.ok(findings.some((item) => item.code === 'TRACE_CONFIRMATION_MISSING'));
});

test('keeps the old revision but activates only its replacement', () => {
  const findings = evaluateTraceability(
    fixture('PROJECT_BRIEF.md'),
    fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR),
    fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR),
    fixture('OPEN_LOOPS.md'),
  );
  assert.equal(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'), false);
  assert.equal(findings.some((item) => item.code === 'TRACE_TASK_COVERAGE_MISSING'), false);
  assert.deepEqual(findings, []);
});

test('rejects a forward supersedes reference', () => {
  const original = fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR);
  const first = '| REQ-001@1 | add | must | Strict doctor reports the filled base fixture as ready. | SRC-001 | maintainer-role | n/a |';
  const second = '| REQ-001@2 | replace | must | Strict doctor reports the filled base fixture as ready with complete lineage. | SRC-002 | maintainer-role | REQ-001@1 |';
  const spec = original.replace(`${first}\n${second}`, `${second}\n${first}`);
  const findings = evaluateTraceability(...baseInputs({
    spec,
    taskContract: fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR),
  }));
  assert.ok(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'));
});

test('rejects a cyclic supersedes graph', () => {
  const spec = fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR).replace(
    '| REQ-001@1 | add | must | Strict doctor reports the filled base fixture as ready. | SRC-001 | maintainer-role | n/a |',
    '| REQ-001@1 | replace | must | Strict doctor reports the filled base fixture as ready. | SRC-001 | maintainer-role | REQ-001@2 |',
  );
  const findings = evaluateTraceability(...baseInputs({
    spec,
    taskContract: fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR),
  }));
  assert.ok(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'));
});

test('rejects a supersedes reference to another requirement ID', () => {
  const spec = fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR).replace(
    '| SRC-002 | maintainer-role | REQ-001@1 |',
    '| SRC-002 | maintainer-role | REQ-999@1 |',
  );
  const findings = evaluateTraceability(...baseInputs({
    spec,
    taskContract: fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR),
  }));
  assert.ok(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'));
});

test('rejects an acceptance criterion bound to a superseded revision', () => {
  const spec = fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR).replace(
    '| AC-002 | REQ-001@2 |',
    '| AC-002 | REQ-001@1 |',
  );
  const findings = evaluateTraceability(...baseInputs({
    spec,
    taskContract: fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR),
  }));
  assert.ok(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'));
});

test('rejects an active requirement without an acceptance criterion', () => {
  const spec = withoutRow(fixture('SPEC.md'), '| AC-001 |');
  const findings = evaluateTraceability(...baseInputs({ spec }));
  assert.ok(findings.some((item) => item.code === 'TRACE_ACCEPTANCE_MISSING'));
});

test('rejects an acceptance criterion without explicit yes and no outcomes', () => {
  const spec = fixture('SPEC.md').replace(
    'Yes if strict doctor exits zero with no warnings; no otherwise.',
    'Strict doctor behavior is documented.',
  );
  const findings = evaluateTraceability(...baseInputs({ spec }));
  assert.ok(findings.some((item) => item.code === 'TRACE_ACCEPTANCE_MISSING'));
});

test('rejects an active requirement without task coverage', () => {
  const taskContract = withoutRow(fixture('TASK_CONTRACT.md'), '| TASK-001 |');
  const findings = evaluateTraceability(...baseInputs({ taskContract }));
  assert.ok(findings.some((item) => item.code === 'TRACE_TASK_COVERAGE_MISSING'));
});

test('rejects a completed task without passing evidence', () => {
  const taskContract = withoutRow(fixture('TASK_CONTRACT.md'), '| EVD-001 |');
  const findings = evaluateTraceability(...baseInputs({ taskContract }));
  assert.ok(findings.some((item) => item.code === 'TRACE_EVIDENCE_MISSING'));
});

test('accepts privacy-safe opaque private attestations', () => {
  const projectBrief = fixture('PROJECT_BRIEF.md').replace(
    '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | approved-private-external | opaque-pointer | external-record:alpha | no | confirmed | maintainer-role | 2026-07-13 |',
  );
  assert.deepEqual(evaluateTraceability(...baseInputs({ projectBrief })), []);
});

test('blocks unsafe private source locators without reflecting their values', () => {
  const unsafeLocators = [
    'https://private.invalid/CANARY_PRIVATE',
    'external-record:alpha?token=CANARY_PRIVATE',
    'sha256:CANARY_PRIVATE',
    '/Users/private/CANARY_PRIVATE',
    'masked-excerpt-CANARY_PRIVATE',
    'sk-CANARY_PRIVATE_CREDENTIAL',
  ];

  for (const sourceRef of unsafeLocators) {
    const projectBrief = fixture('PROJECT_BRIEF.md').replace(
      '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
      `| SRC-001 | approved-private-external | opaque-pointer | ${sourceRef} | no | confirmed | maintainer-role | 2026-07-13 |`,
    );
    const findings = evaluateTraceability(...baseInputs({ projectBrief }));
    assert.ok(findings.some((item) => item.code === 'PRIVACY_SOURCE_BLOCKED'));
    assert.equal(JSON.stringify(findings).includes('CANARY_PRIVATE'), false);
    assert.equal(JSON.stringify(findings).includes('/Users/'), false);
  }
});

test('uses only stable filenames and IDs in findings', () => {
  const canary = 'CANARY_CELL_VALUE_SHOULD_NOT_APPEAR';
  const spec = fixture('SPEC.md').replace(
    'Strict doctor exits non-zero or reports a warning.',
    canary,
  ).replace('REQ-001@1', 'REQ-not-valid');
  const findings = evaluateTraceability(...baseInputs({ spec }));
  assert.ok(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'));
  assert.equal(JSON.stringify(findings).includes(canary), false);
  assert.equal(JSON.stringify(findings).includes('REQ-not-valid'), false);
});
