import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  REQUIRED_GATE_IDS,
  validateAdapterGateReferences,
  validateGateLifecycle,
  validateMandatoryWorkflowTracking,
  validateWorkflowIndexing,
} from '../../scripts/validate-starter.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function row(id, status = 'active') {
  return `| ${id} | PROJECT_BRIEF.md + SPEC.md | ${status} | SRC/REQ/AC chain | requirement evidence changes | open a blocking loop; do not implement |`;
}

function ledger(...rows) {
  return `# AGENTS.md

## Governance Gates

| ID | Owner path | Status | Evidence | Event-only review trigger | Fallback |
|---|---|---|---|---|---|
${rows.join('\n')}
`;
}

function canonical(pathname, content) {
  return { path: pathname, content };
}

function adapter(pathname, content) {
  return { path: pathname, content };
}

function runGit(cwd, args) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('rejects a duplicate gate ID inside one canonical ledger', () => {
  const errors = validateGateLifecycle({
    canonicalDocuments: [canonical('AGENTS.md', ledger(
      row('GATE-INTENT-001'),
      row('GATE-INTENT-001'),
      row('GATE-ROUTE-001'),
    ))],
    adapterDocuments: [],
    requiredGateIds: REQUIRED_GATE_IDS,
  });

  assert.match(errors.join('\n'), /duplicate gate ID GATE-INTENT-001.*AGENTS\.md/i);
});

test('rejects a gate defined by two canonical owners', () => {
  const errors = validateGateLifecycle({
    canonicalDocuments: [
      canonical('AGENTS.md', ledger(row('GATE-INTENT-001'), row('GATE-ROUTE-001'))),
      canonical('docs/copied-gates.md', ledger(row('GATE-INTENT-001'), row('GATE-ROUTE-001'))),
    ],
    adapterDocuments: [],
    requiredGateIds: REQUIRED_GATE_IDS,
  });

  assert.match(errors.join('\n'), /multiple canonical owners.*GATE-INTENT-001.*AGENTS\.md.*docs\/copied-gates\.md/i);
});

test('rejects a gate status outside active or suspended', () => {
  const errors = validateGateLifecycle({
    canonicalDocuments: [canonical('AGENTS.md', ledger(
      row('GATE-INTENT-001', 'retired'),
      row('GATE-ROUTE-001'),
    ))],
    adapterDocuments: [],
    requiredGateIds: REQUIRED_GATE_IDS,
  });

  assert.match(errors.join('\n'), /invalid status.*GATE-INTENT-001.*retired/i);
});

test('rejects a canonical ledger without the complete lifecycle header', () => {
  const malformedLedger = ledger(
    row('GATE-INTENT-001'),
    row('GATE-ROUTE-001'),
  ).replace('Event-only review trigger', 'Review');
  const errors = validateGateLifecycle({
    canonicalDocuments: [canonical('AGENTS.md', malformedLedger)],
    adapterDocuments: [],
    requiredGateIds: REQUIRED_GATE_IDS,
  });

  assert.match(errors.join('\n'), /canonical gate ledger.*AGENTS\.md.*required lifecycle header/i);
});

test('rejects an adapter reference to a suspended gate', () => {
  const errors = validateGateLifecycle({
    canonicalDocuments: [canonical('AGENTS.md', ledger(
      row('GATE-INTENT-001', 'suspended'),
      row('GATE-ROUTE-001'),
    ))],
    adapterDocuments: [adapter('START_HERE.md', 'Follow GATE-INTENT-001 in AGENTS.md.')],
    requiredGateIds: REQUIRED_GATE_IDS,
  });

  assert.match(errors.join('\n'), /suspended gate GATE-INTENT-001.*START_HERE\.md/i);
});

test('rejects an adapter that restates a full gate row', () => {
  const errors = validateGateLifecycle({
    canonicalDocuments: [canonical('AGENTS.md', ledger(
      row('GATE-INTENT-001'),
      row('GATE-ROUTE-001'),
    ))],
    adapterDocuments: [adapter('START_HERE.md', ledger(row('GATE-INTENT-001')))],
    requiredGateIds: REQUIRED_GATE_IDS,
  });

  assert.match(errors.join('\n'), /adapter restates gate GATE-INTENT-001.*START_HERE\.md/i);
});

test('requires a present mandatory workflow to be tracked in a git repository', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-tracking-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  fs.mkdirSync(path.join(repo, 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'workflows/product-shape-tech-route.md'), '# Route\n');
  runGit(repo, ['init', '--quiet']);

  assert.deepEqual(
    validateMandatoryWorkflowTracking(repo, ['workflows/product-shape-tech-route.md']),
    ['Mandatory workflow is not tracked by git: workflows/product-shape-tech-route.md'],
  );

  runGit(repo, ['add', '--', 'workflows/product-shape-tech-route.md']);
  assert.deepEqual(
    validateMandatoryWorkflowTracking(repo, ['workflows/product-shape-tech-route.md']),
    [],
  );
});

test('does not require git tracking outside a git repository', (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-no-git-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  fs.mkdirSync(path.join(directory, 'workflows'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'workflows/product-shape-tech-route.md'), '# Route\n');

  assert.deepEqual(
    validateMandatoryWorkflowTracking(directory, ['workflows/product-shape-tech-route.md']),
    [],
  );
});

test('requires the mandatory workflow in every routing index', () => {
  const errors = validateWorkflowIndexing(
    'workflows/product-shape-tech-route.md',
    [
      adapter('docs/index.md', 'See `workflows/product-shape-tech-route.md`.'),
      adapter('workflows/tool-routing.md', '# Tool Routing\n'),
    ],
  );

  assert.deepEqual(errors, [
    'workflows/tool-routing.md does not index workflows/product-shape-tech-route.md',
  ]);
});

test('generated canonical ledger and runtime adapters satisfy the reference boundary', (t) => {
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'gate-runtime-'));
  t.after(() => fs.rmSync(project, { recursive: true, force: true }));

  const init = spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/init.mjs'),
    project,
    '--agent',
    'all',
    '--profile',
    'base',
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
  assert.equal(init.status, 0, init.stderr || init.stdout);

  const read = (relativePath) => ({
    path: relativePath,
    content: fs.readFileSync(path.join(project, relativePath), 'utf8'),
  });
  const canonicalDocuments = [read('AGENTS.md')];
  const adapterDocuments = [
    read('START_HERE.md'),
    read('README.md'),
    read('CLAUDE.md'),
    read('.agents/AGENTS.md'),
    read('.agents/skills/bootstrap-intake/SKILL.md'),
    read('.agents/skills/validation-gate/SKILL.md'),
  ];

  assert.deepEqual(validateGateLifecycle({
    canonicalDocuments,
    adapterDocuments,
    requiredGateIds: REQUIRED_GATE_IDS,
  }), []);
  assert.deepEqual(validateAdapterGateReferences(adapterDocuments, REQUIRED_GATE_IDS), []);
});
