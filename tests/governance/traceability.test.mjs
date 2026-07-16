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
    overrides.techStack ?? fixture('TECH_STACK.md'),
  ];
}

function withRouteEvidence(content, evidence) {
  return content.replace(/^(- Evidence[：:].*)$/m, `- Evidence：${evidence}`);
}

function withoutLedgerRows(content, prefixes) {
  return prefixes.reduce((result, prefix) => withoutRow(result, prefix), content);
}

function assertBlockedWithoutReflection(findings, code, canary) {
  assert.ok(findings.some((item) => item.code === code), JSON.stringify(findings));
  const rendered = JSON.stringify(findings);
  assert.equal(rendered.includes(canary), false);
  assert.equal(rendered.includes('/Users/'), false);
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
  const routeEvidence = 'SRC-001, SRC-002, REQ-001@2';
  const findings = evaluateTraceability(
    withRouteEvidence(fixture('PROJECT_BRIEF.md'), routeEvidence),
    fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR),
    fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR),
    fixture('OPEN_LOOPS.md'),
    withRouteEvidence(fixture('TECH_STACK.md'), routeEvidence),
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

test('allows an unfinished task pair to wait for evidence', () => {
  const taskContract = withoutRow(
    fixture('TASK_CONTRACT.md').replace(
      '| TASK-001 | completed | REQ-001@1 | AC-001 |',
      '| TASK-001 | planned | REQ-001@1 | AC-001 |',
    ),
    '| EVD-001 |',
  );
  assert.deepEqual(evaluateTraceability(...baseInputs({ taskContract })), []);
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

test('fails closed when any required lineage ledger is missing or empty', () => {
  const cases = [
    {
      name: 'source',
      code: 'TRACE_SOURCE_MISSING',
      overrides: {
        projectBrief: fixture('PROJECT_BRIEF.md').replace(
          '## Privacy-safe source attestations',
          '## Historical source example',
        ),
      },
    },
    {
      name: 'requirement',
      code: 'TRACE_REVISION_INVALID',
      overrides: {
        spec: fixture('SPEC.md').replace('## Requirement revision ledger', '## Historical requirements'),
      },
    },
    {
      name: 'acceptance',
      code: 'TRACE_ACCEPTANCE_MISSING',
      overrides: {
        spec: fixture('SPEC.md').replace('## Acceptance criteria ledger', '## Historical acceptance'),
      },
    },
    {
      name: 'task',
      code: 'TRACE_TASK_COVERAGE_MISSING',
      overrides: {
        taskContract: fixture('TASK_CONTRACT.md').replace('## 任務總覽', '## Historical tasks'),
      },
    },
    {
      name: 'evidence',
      code: 'TRACE_EVIDENCE_MISSING',
      overrides: {
        taskContract: fixture('TASK_CONTRACT.md').replace('## Acceptance evidence ledger', '## Historical evidence'),
      },
    },
    {
      name: 'open loop',
      code: 'TRACE_CONFIRMATION_MISSING',
      overrides: {
        openLoops: fixture('OPEN_LOOPS.md').replace(
          '| Status | Loop ID | Basis | Question / Risk | Impact | Owner | Next Step | Due | Resolution source |',
          '| Broken | Loop ID | Basis | Question / Risk | Impact | Owner | Next Step | Due | Resolution source |',
        ),
      },
    },
  ];

  for (const { name, code, overrides } of cases) {
    const findings = evaluateTraceability(...baseInputs(overrides));
    assert.ok(findings.some((item) => item.code === code), `${name}: ${JSON.stringify(findings)}`);
  }
});

test('fails closed on wrong-width rows in every lineage ledger', () => {
  const cases = [
    {
      name: 'source',
      code: 'TRACE_SOURCE_MISSING',
      overrides: {
        projectBrief: fixture('PROJECT_BRIEF.md').replace(
          '| SRC-002 | public | public-pointer | https://github.com/Eskasia/agent-governance-starter | no | confirmed | maintainer-role | 2026-07-13 |',
          '| SRC-002 | public | public-pointer | https://github.com/Eskasia/agent-governance-starter | no | confirmed | maintainer-role | 2026-07-13 |\n| SRC-999 | malformed |',
        ),
      },
    },
    {
      name: 'requirement',
      code: 'TRACE_REVISION_INVALID',
      overrides: {
        spec: fixture('SPEC.md').replace(
          '| REQ-002@1 | add | redline | Generated base output must not include application runtime or external credentials. | SRC-002 | maintainer-role | n/a |',
          '| REQ-002@1 | add | redline | Generated base output must not include application runtime or external credentials. | SRC-002 | maintainer-role | n/a |\n| REQ-999@1 | malformed |',
        ),
      },
    },
    {
      name: 'acceptance',
      code: 'TRACE_ACCEPTANCE_MISSING',
      overrides: {
        spec: fixture('SPEC.md').replace(
          '| AC-002 | REQ-002@1 | Yes if the fixture contains governance documents only and no credential; no otherwise. | Application runtime or credential material appears in the fixture. |',
          '| AC-002 | REQ-002@1 | Yes if the fixture contains governance documents only and no credential; no otherwise. | Application runtime or credential material appears in the fixture. |\n| AC-999 | malformed |',
        ),
      },
    },
    {
      name: 'task',
      code: 'TRACE_TASK_COVERAGE_MISSING',
      overrides: {
        taskContract: fixture('TASK_CONTRACT.md').replace(
          '| TASK-002 | completed | REQ-002@1 | AC-002 | Inspect generated scope and run fixture validation. |',
          '| TASK-002 | completed | REQ-002@1 | AC-002 | Inspect generated scope and run fixture validation. |\n| TASK-999 | malformed |',
        ),
      },
    },
    {
      name: 'evidence',
      code: 'TRACE_EVIDENCE_MISSING',
      overrides: {
        taskContract: fixture('TASK_CONTRACT.md').replace(
          '| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |',
          '| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |\n| EVD-999 | malformed |',
        ),
      },
    },
    {
      name: 'open loop',
      code: 'TRACE_CONFIRMATION_MISSING',
      overrides: {
        openLoops: fixture('OPEN_LOOPS.md').replace(
          '| closed | LOOP-002 | not-stated | Is application runtime work excluded? | high | maintainer-role | Preserve the public README boundary. | resolved | SRC-002 |',
          '| closed | LOOP-002 | not-stated | Is application runtime work excluded? | high | maintainer-role | Preserve the public README boundary. | resolved | SRC-002 |\n| closed | LOOP-999 | malformed |',
        ),
      },
    },
  ];

  for (const { name, code, overrides } of cases) {
    const findings = evaluateTraceability(...baseInputs(overrides));
    assert.ok(findings.some((item) => item.code === code), `${name}: ${JSON.stringify(findings)}`);
  }
});

test('ignores commented and fenced ledger samples and rejects duplicate active ledgers', () => {
  const sourceHeader = '| Source ID | Source class | Trace mode | Source ref | Content retained | Attestation | Confirmed by | Confirmed at |';
  const separator = '|---|---|---|---|---|---|---|---|';
  const sourceRows = [
    '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-002 | public | public-pointer | https://github.com/Eskasia/agent-governance-starter | no | confirmed | maintainer-role | 2026-07-13 |',
  ].join('\n');
  const activeTable = `${sourceHeader}\n${separator}\n${sourceRows}`;

  for (const wrappedTable of [
    `<!--\n${activeTable}\n-->`,
    `\`\`\`markdown\n${activeTable}\n\`\`\``,
  ]) {
    const projectBrief = fixture('PROJECT_BRIEF.md').replace(activeTable, wrappedTable);
    const findings = evaluateTraceability(...baseInputs({ projectBrief }));
    assert.ok(findings.some((item) => item.code === 'TRACE_SOURCE_MISSING'));
  }

  const duplicate = fixture('PROJECT_BRIEF.md').replace(activeTable, `${activeTable}\n\n${activeTable}`);
  const duplicateFindings = evaluateTraceability(...baseInputs({ projectBrief: duplicate }));
  assert.ok(duplicateFindings.some((item) => item.code === 'TRACE_SOURCE_MISSING'));

  const indented = fixture('PROJECT_BRIEF.md').replace(
    activeTable,
    activeTable.split('\n').map((line) => `    ${line}`).join('\n'),
  );
  const indentedFindings = evaluateTraceability(...baseInputs({ projectBrief: indented }));
  assert.ok(indentedFindings.some((item) => item.code === 'TRACE_SOURCE_MISSING'));
});

test('does not bind an exact ledger placed under the wrong section', () => {
  const projectBrief = fixture('PROJECT_BRIEF.md').replace(
    '## Privacy-safe source attestations',
    '## Example source attestations',
  );
  const findings = evaluateTraceability(...baseInputs({ projectBrief }));
  assert.ok(findings.some((item) => item.code === 'TRACE_SOURCE_MISSING'));
});

test('rejects an empty open-loop ledger even when all requirements are withdrawn', () => {
  const openLoops = withoutLedgerRows(fixture('OPEN_LOOPS.md'), ['| closed | LOOP-001 |', '| closed | LOOP-002 |']);
  const findings = evaluateTraceability(...baseInputs({ openLoops }));
  assert.ok(findings.some((item) => item.code === 'TRACE_CONFIRMATION_MISSING'));
});

test('applies one non-reflective privacy boundary to every lineage free-text surface', () => {
  const cases = [
    {
      name: 'normalized requirement home path',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_REQUIREMENT_HOME',
      overrides: {
        spec: fixture('SPEC.md').replace(
          'Strict doctor reports the filled base fixture as ready.',
          'Read /Users/CANARY_REQUIREMENT_HOME/private before reporting ready.',
        ),
      },
    },
    {
      name: 'source confirmer email',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_SOURCE_EMAIL',
      overrides: {
        projectBrief: fixture('PROJECT_BRIEF.md').replace(
          '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
          '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | CANARY_SOURCE_EMAIL@example.org | 2026-07-13 |',
        ),
      },
    },
    {
      name: 'requirement confirmer credential',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_REQUIREMENT_TOKEN',
      overrides: {
        spec: fixture('SPEC.md').replace(
          '| SRC-001 | maintainer-role | n/a |',
          '| SRC-001 | token=CANARY_REQUIREMENT_TOKEN | n/a |',
        ),
      },
    },
    {
      name: 'open-loop masked excerpt',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_MASKED_LOOP',
      overrides: {
        openLoops: fixture('OPEN_LOOPS.md').replace(
          'Is the fixture limited to governance documents?',
          'masked excerpt CANARY_MASKED_LOOP',
        ),
      },
    },
    {
      name: 'open-loop content hash',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_LOOP_HASH',
      overrides: {
        openLoops: fixture('OPEN_LOOPS.md').replace(
          'Preserve the public README boundary.',
          'sha256:CANARY_LOOP_HASH',
        ),
      },
    },
    {
      name: 'source URL userinfo',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_SOURCE_USERINFO',
      overrides: {
        projectBrief: fixture('PROJECT_BRIEF.md').replace(
          'https://github.com/Eskasia/agent-governance-starter',
          'https://alice:CANARY_SOURCE_USERINFO@example.org/source',
        ),
      },
    },
    {
      name: 'source URL secret query',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_SOURCE_QUERY',
      overrides: {
        projectBrief: fixture('PROJECT_BRIEF.md').replace(
          'https://github.com/Eskasia/agent-governance-starter',
          'https://example.org/source?token=CANARY_SOURCE_QUERY',
        ),
      },
    },
    {
      name: 'evidence URL userinfo',
      code: 'PRIVACY_PATH_BLOCKED',
      canary: 'CANARY_EVIDENCE_USERINFO',
      overrides: {
        taskContract: fixture('TASK_CONTRACT.md').replace(
          'command:node scripts/fixtures-check.mjs',
          'public-artifact:https://alice:CANARY_EVIDENCE_USERINFO@example.org/result',
        ),
      },
    },
    {
      name: 'evidence URL secret query',
      code: 'PRIVACY_PATH_BLOCKED',
      canary: 'CANARY_EVIDENCE_QUERY',
      overrides: {
        taskContract: fixture('TASK_CONTRACT.md').replace(
          'command:node scripts/fixtures-check.mjs',
          'public-artifact:https://example.org/result?api_key=CANARY_EVIDENCE_QUERY',
        ),
      },
    },
    {
      name: 'pending source confirmation date credential',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_SOURCE_DATE',
      overrides: {
        projectBrief: fixture('PROJECT_BRIEF.md').replace(
          '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
          '| SRC-001 | synthetic | attestation-only | n/a | no | pending | maintainer-role | token=CANARY_SOURCE_DATE |',
        ),
      },
    },
    {
      name: 'unresolved open-loop resolution credential',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_LOOP_RESOLUTION',
      overrides: {
        openLoops: fixture('OPEN_LOOPS.md').replace(
          '| closed | LOOP-001 | not-stated | Is the fixture limited to governance documents? | high | maintainer-role | Keep scope aligned with expected doctor JSON. | resolved | SRC-001 |',
          '| open | LOOP-001 | not-stated | Is the fixture limited to governance documents? | high | maintainer-role | Keep scope aligned with expected doctor JSON. | pending | token=CANARY_LOOP_RESOLUTION |',
        ),
      },
    },
    {
      name: 'route evidence credential',
      code: 'PRIVACY_SOURCE_BLOCKED',
      canary: 'CANARY_ROUTE_EVIDENCE',
      overrides: {
        projectBrief: withRouteEvidence(
          fixture('PROJECT_BRIEF.md'),
          'SRC-001, REQ-001@1, token=CANARY_ROUTE_EVIDENCE',
        ),
        techStack: withRouteEvidence(
          fixture('TECH_STACK.md'),
          'SRC-001, REQ-001@1, token=CANARY_ROUTE_EVIDENCE',
        ),
      },
    },
  ];

  for (const { name, code, canary, overrides } of cases) {
    const findings = evaluateTraceability(...baseInputs(overrides));
    assertBlockedWithoutReflection(findings, code, canary);
    assert.equal(JSON.stringify(findings).includes('alice:'), false, name);
  }
});

test('requires safe resolution and confirmation metadata before accepting lineage state', () => {
  const prematureResolution = fixture('OPEN_LOOPS.md').replace(
    '| closed | LOOP-001 | not-stated | Is the fixture limited to governance documents? | high | maintainer-role | Keep scope aligned with expected doctor JSON. | resolved | SRC-001 |',
    '| blocked | LOOP-001 | not-stated | Is the fixture limited to governance documents? | high | maintainer-role | Keep scope aligned with expected doctor JSON. | pending | SRC-001 |',
  );
  const resolutionFindings = evaluateTraceability(...baseInputs({ openLoops: prematureResolution }));
  assert.ok(resolutionFindings.some((item) => item.code === 'TRACE_CONFIRMATION_MISSING'));

  const invalidPendingDate = fixture('PROJECT_BRIEF.md').replace(
    '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | synthetic | attestation-only | n/a | no | pending | maintainer-role | someday |',
  );
  const dateFindings = evaluateTraceability(...baseInputs({ projectBrief: invalidPendingDate }));
  assert.ok(dateFindings.some((item) => item.code === 'TRACE_CONFIRMATION_MISSING'));
});

test('requires conservative role labels and exact SRC-to-REQ confirmer binding', () => {
  const mismatchSpec = fixture('SPEC.md').replace(
    '| SRC-001 | maintainer-role | n/a |',
    '| SRC-001 | unrelated-role | n/a |',
  );
  const mismatch = evaluateTraceability(...baseInputs({ spec: mismatchSpec }));
  assert.ok(mismatch.some((item) => item.code === 'TRACE_CONFIRMATION_MISSING'));

  const personalOwner = fixture('OPEN_LOOPS.md').replace(
    '| high | maintainer-role |',
    '| high | Alice Example |',
  );
  const ownerFindings = evaluateTraceability(...baseInputs({ openLoops: personalOwner }));
  assert.ok(ownerFindings.some((item) => item.code === 'PRIVACY_SOURCE_BLOCKED'));
  assert.equal(JSON.stringify(ownerFindings).includes('Alice Example'), false);

  const emptyConfirmer = fixture('SPEC.md').replace(
    '| SRC-001 | maintainer-role | n/a |',
    '| SRC-001 | n/a | n/a |',
  );
  assert.ok(evaluateTraceability(...baseInputs({ spec: emptyConfirmer })).some((item) => (
    item.code === 'TRACE_CONFIRMATION_MISSING'
  )));

  const rejectedSource = fixture('PROJECT_BRIEF.md').replace(
    '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | synthetic | attestation-only | n/a | no | rejected | maintainer-role | 2026-07-13 |',
  );
  assert.ok(evaluateTraceability(...baseInputs({ projectBrief: rejectedSource })).some((item) => (
    item.code === 'TRACE_CONFIRMATION_MISSING'
  )));
});

test('enforces the source class, trace mode, and source ref matrix', () => {
  const original = '| SRC-001 | synthetic | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |';
  const positives = [
    '| SRC-001 | public | public-pointer | https://example.org/source | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | approved-private-external | opaque-pointer | external-record:alpha | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | private-interactive | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    original,
  ];
  for (const replacement of positives) {
    const projectBrief = fixture('PROJECT_BRIEF.md').replace(original, replacement);
    assert.deepEqual(evaluateTraceability(...baseInputs({ projectBrief })), []);
  }

  const negatives = [
    '| SRC-001 | public | attestation-only | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | approved-private-external | opaque-pointer | n/a | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | private-interactive | opaque-pointer | external-record:alpha | no | confirmed | maintainer-role | 2026-07-13 |',
    '| SRC-001 | synthetic | opaque-pointer | external-record:alpha | no | confirmed | maintainer-role | 2026-07-13 |',
  ];
  for (const replacement of negatives) {
    const projectBrief = fixture('PROJECT_BRIEF.md').replace(original, replacement);
    const findings = evaluateTraceability(...baseInputs({ projectBrief }));
    assert.ok(findings.some((item) => item.code === 'PRIVACY_SOURCE_BLOCKED'), JSON.stringify(findings));
  }
});

test('accepts only allowlisted evidence locator forms', () => {
  const original = 'command:node scripts/fixtures-check.mjs';
  for (const locator of [
    'command:node scripts/fixtures-check.mjs',
    'check:synthetic-fixture-validation',
    'ci:governance-fixtures',
    'public-artifact:https://example.org/governance/result',
  ]) {
    const taskContract = fixture('TASK_CONTRACT.md').replace(original, locator);
    assert.deepEqual(evaluateTraceability(...baseInputs({ taskContract })), []);
  }

  for (const locator of [
    'https://private.invalid/result',
    'command:cat /Users/CANARY_EVIDENCE_HOME/result',
    'command:node scripts/test.mjs; echo CANARY_SHELL',
    'artifact:opaque-private-record',
  ]) {
    const taskContract = fixture('TASK_CONTRACT.md').replace(original, locator);
    const findings = evaluateTraceability(...baseInputs({ taskContract }));
    assert.ok(findings.some((item) => item.code === 'PRIVACY_PATH_BLOCKED'), JSON.stringify(findings));
    assert.equal(JSON.stringify(findings).includes('CANARY_'), false);
  }
});

test('requires matching route evidence in PROJECT_BRIEF and TECH_STACK', () => {
  const missingProjectEvidence = withRouteEvidence(fixture('PROJECT_BRIEF.md'), '');
  const missing = evaluateTraceability(...baseInputs({ projectBrief: missingProjectEvidence }));
  assert.ok(missing.some((item) => item.code === 'TRACE_SOURCE_MISSING'));
  assert.ok(missing.some((item) => item.code === 'TRACE_REVISION_INVALID'));

  const mismatchedTechStack = withRouteEvidence(
    fixture('TECH_STACK.md'),
    'SRC-001, REQ-001@1',
  );
  const mismatch = evaluateTraceability(...baseInputs({ techStack: mismatchedTechStack }));
  assert.ok(mismatch.some((item) => item.code === 'ROUTE_MODE_CONFLICT'));

  const wrongSection = fixture('PROJECT_BRIEF.md').replace('## 產品形態決策', '## Historical route');
  const wrongSectionFindings = evaluateTraceability(...baseInputs({ projectBrief: wrongSection }));
  assert.ok(wrongSectionFindings.some((item) => (
    item.code === 'TRACE_SOURCE_MISSING' && item.subject === 'PROJECT_BRIEF.md'
  )));
});

test('rejects route evidence with missing, pending, malformed, or inactive IDs', () => {
  const pendingSourceRow = '| SRC-003 | synthetic | attestation-only | n/a | no | pending | reviewer-role | 2026-07-13 |';
  const projectWithPending = fixture('PROJECT_BRIEF.md').replace(
    '| SRC-002 | public | public-pointer | https://github.com/Eskasia/agent-governance-starter | no | confirmed | maintainer-role | 2026-07-13 |',
    `| SRC-002 | public | public-pointer | https://github.com/Eskasia/agent-governance-starter | no | confirmed | maintainer-role | 2026-07-13 |\n${pendingSourceRow}`,
  );
  const cases = [
    {
      evidence: 'SRC-999, REQ-001@1',
      projectBrief: fixture('PROJECT_BRIEF.md'),
      code: 'TRACE_SOURCE_MISSING',
    },
    {
      evidence: 'SRC-003, REQ-001@1',
      projectBrief: projectWithPending,
      code: 'TRACE_CONFIRMATION_MISSING',
    },
    {
      evidence: 'SRC-not-valid, REQ-001@1',
      projectBrief: fixture('PROJECT_BRIEF.md'),
      code: 'TRACE_SOURCE_MISSING',
    },
    {
      evidence: 'SRC-001, REQ-999@1',
      projectBrief: fixture('PROJECT_BRIEF.md'),
      code: 'TRACE_REVISION_INVALID',
    },
  ];

  for (const { evidence, projectBrief, code } of cases) {
    const findings = evaluateTraceability(...baseInputs({
      projectBrief: withRouteEvidence(projectBrief, evidence),
      techStack: withRouteEvidence(fixture('TECH_STACK.md'), evidence),
    }));
    assert.ok(findings.some((item) => item.code === code), JSON.stringify(findings));
    assert.equal(JSON.stringify(findings).includes('SRC-not-valid'), false);
  }

  const replacementSpec = fixture('SPEC-with-replacement.md', TEST_FIXTURE_DIR);
  const replacementTask = fixture('TASK_CONTRACT-with-replacement.md', TEST_FIXTURE_DIR);
  const staleEvidence = 'SRC-001, SRC-002, REQ-001@1, REQ-002@1';
  const inactive = evaluateTraceability(
    withRouteEvidence(fixture('PROJECT_BRIEF.md'), staleEvidence),
    replacementSpec,
    replacementTask,
    fixture('OPEN_LOOPS.md'),
    withRouteEvidence(fixture('TECH_STACK.md'), staleEvidence),
  );
  assert.ok(inactive.some((item) => item.code === 'TRACE_REVISION_INVALID'));
});

test('requires every AC, TASK requirement, and EVD to share a canonical pair', () => {
  const extraAcceptance = '| AC-003 | REQ-001@1 | Yes if lineage output is stable; no otherwise. | Lineage output changes unexpectedly. |';
  const specWithExtraAcceptance = fixture('SPEC.md').replace(
    '| AC-002 | REQ-002@1 | Yes if the fixture contains governance documents only and no credential; no otherwise. | Application runtime or credential material appears in the fixture. |',
    `| AC-002 | REQ-002@1 | Yes if the fixture contains governance documents only and no credential; no otherwise. | Application runtime or credential material appears in the fixture. |\n${extraAcceptance}`,
  );

  const orphanAcceptance = evaluateTraceability(...baseInputs({ spec: specWithExtraAcceptance }));
  assert.ok(orphanAcceptance.some((item) => (
    item.code === 'TRACE_TASK_COVERAGE_MISSING' && item.subject === 'AC-003'
  )), JSON.stringify(orphanAcceptance));

  const orphanEvidenceContract = fixture('TASK_CONTRACT.md').replace(
    '| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |',
    '| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |\n| EVD-003 | AC-003 | REQ-001@1 | check:orphan-pair | passing | 2026-07-13 |',
  );
  const orphanEvidence = evaluateTraceability(...baseInputs({
    spec: specWithExtraAcceptance,
    taskContract: orphanEvidenceContract,
  }));
  assert.ok(orphanEvidence.some((item) => (
    item.code === 'TRACE_EVIDENCE_MISSING' && item.subject === 'EVD-003'
  )), JSON.stringify(orphanEvidence));

  const extraTaskRequirement = fixture('TASK_CONTRACT.md').replace(
    '| TASK-001 | completed | REQ-001@1 | AC-001 |',
    '| TASK-001 | completed | REQ-001@1, REQ-002@1 | AC-001 |',
  );
  const taskFindings = evaluateTraceability(...baseInputs({ taskContract: extraTaskRequirement }));
  assert.ok(taskFindings.some((item) => (
    item.code === 'TRACE_TASK_COVERAGE_MISSING' && item.subject === 'TASK-001'
  )), JSON.stringify(taskFindings));
});

test('accepts multiple AC pairs only when tasks and passing evidence cover each pair', () => {
  const spec = fixture('SPEC.md').replace(
    '| AC-002 | REQ-002@1 | Yes if the fixture contains governance documents only and no credential; no otherwise. | Application runtime or credential material appears in the fixture. |',
    '| AC-002 | REQ-002@1 | Yes if the fixture contains governance documents only and no credential; no otherwise. | Application runtime or credential material appears in the fixture. |\n| AC-003 | REQ-001@1 | Yes if lineage output is stable; no otherwise. | Lineage output changes unexpectedly. |',
  );
  const taskContract = fixture('TASK_CONTRACT.md')
    .replace(
      '| TASK-001 | completed | REQ-001@1 | AC-001 |',
      '| TASK-001 | completed | REQ-001@1 | AC-001, AC-003 |',
    )
    .replace(
      '| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |',
      '| EVD-002 | AC-002 | REQ-002@1 | command:node scripts/fixtures-check.mjs | passing | 2026-07-13 |\n| EVD-003 | AC-003 | REQ-001@1 | check:lineage-stability | passing | 2026-07-13 |',
    );
  assert.deepEqual(evaluateTraceability(...baseInputs({ spec, taskContract })), []);
});

function withdrawnInputs() {
  const spec = withoutLedgerRows(
    fixture('SPEC.md').replace(
      '| REQ-002@1 | add | redline | Generated base output must not include application runtime or external credentials. | SRC-002 | maintainer-role | n/a |',
      '| REQ-002@1 | add | redline | Generated base output must not include application runtime or external credentials. | SRC-002 | maintainer-role | n/a |\n| REQ-001@2 | withdraw | must | Strict doctor readiness requirement is withdrawn. | SRC-001 | maintainer-role | REQ-001@1 |',
    ),
    ['| AC-001 |'],
  );
  const taskContract = withoutLedgerRows(
    fixture('TASK_CONTRACT.md'),
    ['| TASK-001 |', '| EVD-001 |'],
  );
  const evidence = 'SRC-001, SRC-002, REQ-002@1';
  return {
    projectBrief: withRouteEvidence(fixture('PROJECT_BRIEF.md'), evidence),
    spec,
    taskContract,
    openLoops: fixture('OPEN_LOOPS.md'),
    techStack: withRouteEvidence(fixture('TECH_STACK.md'), evidence),
  };
}

test('valid withdraw deactivates a requirement without demanding downstream coverage', () => {
  const inputs = withdrawnInputs();
  assert.deepEqual(evaluateTraceability(
    inputs.projectBrief,
    inputs.spec,
    inputs.taskContract,
    inputs.openLoops,
    inputs.techStack,
  ), []);
});

test('rejects withdrawn revisions when route evidence still cites them', () => {
  const inputs = withdrawnInputs();
  const staleEvidence = 'SRC-001, SRC-002, REQ-001@1, REQ-002@1';
  const findings = evaluateTraceability(
    withRouteEvidence(inputs.projectBrief, staleEvidence),
    inputs.spec,
    inputs.taskContract,
    inputs.openLoops,
    withRouteEvidence(inputs.techStack, staleEvidence),
  );
  assert.ok(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'));
});

test('withdrawn-only graphs do not excuse missing downstream ledgers', () => {
  const spec = fixture('SPEC.md')
    .replace(
      '| REQ-002@1 | add | redline | Generated base output must not include application runtime or external credentials. | SRC-002 | maintainer-role | n/a |',
      '| REQ-002@1 | add | redline | Generated base output must not include application runtime or external credentials. | SRC-002 | maintainer-role | n/a |\n| REQ-001@2 | withdraw | must | Requirement withdrawn. | SRC-001 | maintainer-role | REQ-001@1 |\n| REQ-002@2 | withdraw | redline | Requirement withdrawn. | SRC-002 | maintainer-role | REQ-002@1 |',
    )
    .replace('## Acceptance criteria ledger', '## Historical acceptance');
  const taskContract = fixture('TASK_CONTRACT.md')
    .replace('## 任務總覽', '## Historical tasks')
    .replace('## Acceptance evidence ledger', '## Historical evidence');
  const openLoops = fixture('OPEN_LOOPS.md').replace('## 未決事項', '## Historical loops');
  const findings = evaluateTraceability(
    withRouteEvidence(fixture('PROJECT_BRIEF.md'), 'SRC-001'),
    spec,
    taskContract,
    openLoops,
    withRouteEvidence(fixture('TECH_STACK.md'), 'SRC-001'),
  );
  for (const code of [
    'TRACE_ACCEPTANCE_MISSING',
    'TRACE_TASK_COVERAGE_MISSING',
    'TRACE_EVIDENCE_MISSING',
    'TRACE_CONFIRMATION_MISSING',
  ]) {
    assert.ok(findings.some((item) => item.code === code), `${code}: ${JSON.stringify(findings)}`);
  }
});

test('rejects requirement resurrection after a valid withdraw', () => {
  const base = withdrawnInputs();
  for (const resurrection of [
    '| REQ-001@3 | replace | must | Strict doctor readiness returns. | SRC-001 | maintainer-role | REQ-001@2 |',
    '| REQ-001@3 | add | must | Strict doctor readiness returns. | SRC-001 | maintainer-role | n/a |',
  ]) {
    const spec = base.spec.replace(
      '| REQ-001@2 | withdraw | must | Strict doctor readiness requirement is withdrawn. | SRC-001 | maintainer-role | REQ-001@1 |',
      `| REQ-001@2 | withdraw | must | Strict doctor readiness requirement is withdrawn. | SRC-001 | maintainer-role | REQ-001@1 |\n${resurrection}`,
    );
    const findings = evaluateTraceability(
      base.projectBrief,
      spec,
      base.taskContract,
      base.openLoops,
      base.techStack,
    );
    assert.ok(findings.some((item) => item.code === 'TRACE_REVISION_INVALID'));
  }
});
