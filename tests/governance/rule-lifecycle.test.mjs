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
  validateAuditStatus,
  validateGateLifecycle,
  validateGovernanceImpactWorkflows,
  validateMandatoryWorkflowTracking,
  validateRequiredArtifactCommit,
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

function lifecycleHistory(...rows) {
  return `# Changelog

| Gate ID | Change | Canonical owner | Status | Evidence | Event-only review trigger | Fallback | Superseded by |
|---|---|---|---|---|---|---|---|
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

test('delivery audit status is explicit and limited to PASS or BLOCKED', () => {
  assert.deepEqual(validateAuditStatus('Status: BLOCKED\n'), []);
  assert.deepEqual(validateAuditStatus('Status: PASS\n'), []);
  assert.deepEqual(validateAuditStatus('Status: PARTIAL\n'), [
    'Delivery audit has invalid status: PARTIAL',
  ]);
  assert.deepEqual(validateAuditStatus('# Audit\n'), [
    'Delivery audit is missing an explicit status',
  ]);
});

test('governance-impact execution is confined to credential-free preflight and approved real workflows', () => {
  const approved = `name: Governance impact real
on:
  workflow_dispatch:
jobs:
  real:
    permissions:
      contents: read
    environment: governance-impact-real
    runs-on: ubuntu-latest
    steps:
      - run: node scripts/governance-impact-eval.mjs
        env:
          GOVERNANCE_IMPACT_REAL: "1"
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
`;
  const preflight = `name: Governance impact preflight
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  preflight:
    runs-on: ubuntu-latest
    steps:
      - run: node experimental/governance-impact/eval.mjs preflight
        env:
          GOVERNANCE_IMPACT_REAL: "1"
`;
  const v8RuntimeIdentity = `name: External OSS V8 Runtime Identity
on:
  workflow_dispatch:
permissions:
  contents: read
jobs:
  runtime-identity:
    runs-on: ubuntu-24.04
    environment:
      name: governseed-v8-runtime
    steps:
      - name: Start host-side credential proxy
        env:
          OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}
        run: node benchmarks/external-oss-v8/control/G2/runtime-canary-prep/host-proxy.mjs
`;
  assert.deepEqual(validateGovernanceImpactWorkflows([
    {
      path: '.github/workflows/validate-starter.yml',
      content: 'on: [push, pull_request]\nsteps:\n  - run: npm run ci\n',
    },
    {
      path: '.github/workflows/governance-impact-real.yml',
      content: approved,
    },
    {
      path: '.github/workflows/governance-impact-preflight.yml',
      content: preflight,
    },
    {
      path: '.github/workflows/external-oss-v8-runtime-identity.yml',
      content: v8RuntimeIdentity,
    },
  ]), []);

  assert.deepEqual(validateGovernanceImpactWorkflows([
    {
      path: '.github\\workflows\\governance-impact-real.yml',
      content: approved,
    },
    {
      path: '.github\\workflows\\governance-impact-preflight.yml',
      content: preflight,
    },
  ]), []);

  assert.match(validateGovernanceImpactWorkflows([{
    path: '.github/workflows/unsafe.yml',
    content: 'on: [push]\nenv:\n  GOVERNANCE_IMPACT_REAL: "1"\n',
  }]).join('\n'), /unsafe\.yml.*must not access governance-impact real mode/i);

  assert.match(validateGovernanceImpactWorkflows([{
    path: '.github/workflows/governance-impact-real.yml',
    content: approved.replace('workflow_dispatch:', 'push:'),
  }]).join('\n'), /must be workflow_dispatch-only/i);

  assert.match(validateGovernanceImpactWorkflows([{
    path: '.github/workflows/governance-impact-real.yml',
    content: approved.replace(
      '  workflow_dispatch:\n',
      '  workflow_dispatch:\n  repository_dispatch:\n',
    ),
  }]).join('\n'), /must be workflow_dispatch-only/i);

  assert.match(validateGovernanceImpactWorkflows([{
    path: '.github/workflows/governance-impact-real.yml',
    content: approved.replace('    environment: governance-impact-real\n', ''),
  }]).join('\n'), /approval-gated environment/i);

  assert.match(validateGovernanceImpactWorkflows([{
    path: '.github/workflows/governance-impact-preflight.yml',
    content: preflight.replace('workflow_dispatch:', 'push:'),
  }]).join('\n'), /must be workflow_dispatch-only/i);

  assert.match(validateGovernanceImpactWorkflows([{
    path: '.github/workflows/governance-impact-preflight.yml',
    content: `${preflight}OPENAI_API_KEY: \${{ secrets.OPENAI_API_KEY }}\n`,
  }]).join('\n'), /must remain credential-free/i);
});

function copyStarter(t) {
  const sandbox = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'gate-starter-'));
  const starter = path.join(sandbox, 'starter');
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  fs.cpSync(ROOT, starter, {
    recursive: true,
    filter(source) {
      const relative = path.relative(ROOT, source);
      return relative !== '.git' && !relative.startsWith(`.git${path.sep}`);
    },
  });
  return starter;
}

function runStarterValidator(starter) {
  return spawnSync(process.execPath, [
    path.join(starter, 'scripts/validate-starter.mjs'),
    starter,
  ], {
    cwd: starter,
    encoding: 'utf8',
    shell: false,
  });
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

test('requires a CHANGELOG retirement tombstone when a historical gate leaves the ledger', () => {
  const canonicalDocuments = [canonical('AGENTS.md', ledger(row('GATE-ROUTE-001')))];
  const added = '| GATE-INTENT-001 | add | AGENTS.md | active | evidence | review | fallback | n/a |';
  const missingTombstone = validateGateLifecycle({
    canonicalDocuments,
    adapterDocuments: [],
    requiredGateIds: ['GATE-ROUTE-001'],
    lifecycleHistoryDocument: canonical('CHANGELOG.md', lifecycleHistory(added)),
  });

  assert.deepEqual(missingTombstone, [
    'Historical gate GATE-INTENT-001 left the canonical ledger without a CHANGELOG retirement tombstone',
  ]);

  const retired = '| GATE-INTENT-001 | retire | AGENTS.md | retired | evidence | n/a | n/a | GATE-ROUTE-001 |';
  assert.deepEqual(validateGateLifecycle({
    canonicalDocuments,
    adapterDocuments: [],
    requiredGateIds: ['GATE-ROUTE-001'],
    lifecycleHistoryDocument: canonical(
      'CHANGELOG.md',
      lifecycleHistory(added, retired),
    ),
  }), []);
});

test('allows a suspended canonical gate after every consumer removes its reference', () => {
  const canonicalDocuments = [canonical('AGENTS.md', ledger(
    row('GATE-INTENT-001', 'suspended'),
    row('GATE-ROUTE-001'),
  ))];
  const runtimeAdapters = [
    adapter('START_HERE.md', 'Follow GATE-ROUTE-001 from AGENTS.md.'),
  ];
  const workflowConsumers = [
    adapter('workflows/tool-routing.md', 'Route with GATE-ROUTE-001 from AGENTS.md.'),
  ];

  assert.deepEqual(validateGateLifecycle({
    canonicalDocuments,
    adapterDocuments: [...runtimeAdapters, ...workflowConsumers],
    requiredGateIds: REQUIRED_GATE_IDS,
  }), []);
  assert.deepEqual(validateAdapterGateReferences(runtimeAdapters, canonicalDocuments), []);
});

test('rejects a stale consumer reference to a suspended gate when validators are composed', () => {
  const canonicalDocuments = [canonical('AGENTS.md', ledger(
      row('GATE-INTENT-001', 'suspended'),
      row('GATE-ROUTE-001'),
  ))];
  const runtimeAdapters = [
    adapter('START_HERE.md', 'Follow GATE-INTENT-001 and GATE-ROUTE-001 in AGENTS.md.'),
  ];
  const errors = [
    ...validateGateLifecycle({
      canonicalDocuments,
      adapterDocuments: runtimeAdapters,
      requiredGateIds: REQUIRED_GATE_IDS,
    }),
    ...validateAdapterGateReferences(runtimeAdapters, canonicalDocuments),
  ];

  assert.match(errors.join('\n'), /suspended gate GATE-INTENT-001.*START_HERE\.md/i);
});

test('requires every active gate ID in a runtime entry adapter', () => {
  const canonicalDocuments = [canonical('AGENTS.md', ledger(
    row('GATE-INTENT-001'),
    row('GATE-ROUTE-001'),
  ))];
  const errors = validateAdapterGateReferences([
    adapter('START_HERE.md', 'Follow GATE-INTENT-001 from AGENTS.md.'),
  ], canonicalDocuments);

  assert.deepEqual(errors, ['Adapter START_HERE.md must cite active gate GATE-ROUTE-001']);
});

test('does not require every active gate ID in a non-runtime workflow consumer', () => {
  const canonicalDocuments = [canonical('AGENTS.md', ledger(
    row('GATE-INTENT-001'),
    row('GATE-ROUTE-001'),
  ))];
  const errors = validateGateLifecycle({
    canonicalDocuments,
    adapterDocuments: [adapter(
      'workflows/product-shape-tech-route.md',
      'This method follows GATE-ROUTE-001 from AGENTS.md.',
    )],
    requiredGateIds: REQUIRED_GATE_IDS,
  });

  assert.deepEqual(errors, []);
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

  assert.match(errors.join('\n'), /gate consumer START_HERE\.md restates gate GATE-INTENT-001/i);
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

test('requires every present release artifact to match HEAD, not only exist in the index', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'release-artifact-tracking-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const evaluator = 'scripts/governance-impact-eval.mjs';
  const scenario = 'tests/governance-impact/scenarios/scope-guard/scenario.json';
  for (const file of [evaluator, scenario]) {
    fs.mkdirSync(path.dirname(path.join(repo, file)), { recursive: true });
    fs.writeFileSync(path.join(repo, file), 'synthetic\n');
  }
  runGit(repo, ['init', '--quiet']);
  runGit(repo, ['add', '--', evaluator]);
  runGit(repo, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'add evaluator',
  ]);

  assert.deepEqual(
    validateRequiredArtifactCommit(repo, [evaluator, scenario]),
    [`Required repository artifact is not committed in HEAD: ${scenario}`],
  );

  runGit(repo, ['add', '--', scenario]);
  assert.deepEqual(
    validateRequiredArtifactCommit(repo, [evaluator, scenario]),
    [`Required repository artifact is not committed in HEAD: ${scenario}`],
  );

  runGit(repo, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'add scenario',
  ]);
  assert.deepEqual(
    validateRequiredArtifactCommit(repo, [evaluator, scenario]),
    [],
  );

  fs.appendFileSync(path.join(repo, evaluator), 'working-tree drift\n');
  assert.deepEqual(
    validateRequiredArtifactCommit(repo, [evaluator, scenario]),
    [`Required repository artifact does not match committed HEAD: ${evaluator}`],
  );

  runGit(repo, ['add', '--', evaluator]);
  assert.deepEqual(
    validateRequiredArtifactCommit(repo, [evaluator, scenario]),
    [`Required repository artifact does not match committed HEAD: ${evaluator}`],
  );

  runGit(repo, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'update evaluator',
  ]);
  assert.deepEqual(
    validateRequiredArtifactCommit(repo, [evaluator, scenario]),
    [],
  );
});

// spawnSync signals an unrunnable executable through error or a null status,
// never through a non-zero exit. Reading either as a per-file verdict blames
// the repository for the environment.
test('a git that cannot run is reported once, never blamed on a file', (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'git-unavailable-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const files = ['workflows/one.md', 'workflows/two.md', 'workflows/three.md'];
  fs.mkdirSync(path.join(repo, 'workflows'), { recursive: true });
  for (const file of files) fs.writeFileSync(path.join(repo, file), 'synthetic\n');
  // A checkout is present; only the executable is missing.
  fs.mkdirSync(path.join(repo, '.git'));

  const notRun = {
    missing: () => ({
      error: Object.assign(new Error('spawnSync git ENOENT'), { code: 'ENOENT' }),
      status: null,
      stdout: '',
      stderr: '',
    }),
    killed: () => ({ status: null, signal: 'SIGKILL', stdout: '', stderr: '' }),
  };

  for (const [label, spawn] of Object.entries(notRun)) {
    for (const errors of [
      validateRequiredArtifactCommit(repo, files, spawn),
      validateMandatoryWorkflowTracking(repo, files, spawn),
    ]) {
      assert.equal(errors.length, 1, `${label}: one environment error, not one per file`);
      assert.match(errors[0], /git could not be executed/iu);
      for (const file of files) {
        assert.equal(
          errors[0].includes(file),
          false,
          `${label}: ${file} must not be named for an environment failure`,
        );
      }
    }
  }
});

test('starter validator keeps the public CI workflow in the committed release unit', (t) => {
  const starter = copyStarter(t);
  runGit(starter, ['init', '--quiet']);
  runGit(starter, ['add', '--all']);
  runGit(starter, [
    '-c',
    'user.name=Fixture',
    '-c',
    'user.email=fixture@example.invalid',
    'commit',
    '--quiet',
    '-m',
    'candidate release',
  ]);

  fs.appendFileSync(
    path.join(starter, '.github/workflows/validate-starter.yml'),
    '\n# uncommitted public CI drift\n',
  );
  const result = runStarterValidator(starter);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /Required repository artifact does not match committed HEAD: \.github\/workflows\/validate-starter\.yml/,
  );
});

test('starter validator requires deterministic LF checkouts', (t) => {
  const starter = copyStarter(t);
  fs.writeFileSync(path.join(starter, '.gitattributes'), '* text=auto\n');

  const result = runStarterValidator(starter);

  assert.notEqual(result.status, 0);
  assert.match(
    result.stderr,
    /\.gitattributes missing required text: \* text=auto eol=lf/,
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

test('starter validator checks an undefined gate ID in a workflow consumer', (t) => {
  const starter = copyStarter(t);
  const workflow = path.join(starter, 'workflows/tool-routing.md');
  fs.appendFileSync(workflow, '\nUndefined lifecycle reference: GATE-UNKNOWN-001\n');

  const result = runStarterValidator(starter);

  assert.match(
    result.stderr,
    /gate consumer workflows\/tool-routing\.md references undefined gate GATE-UNKNOWN-001/i,
  );
});

test('starter validator discovers a newly added workflow consumer by its gate reference', (t) => {
  const starter = copyStarter(t);
  fs.writeFileSync(
    path.join(starter, 'workflows/new-gate-consumer.md'),
    '# New Gate Consumer\n\nFollow GATE-UNKNOWN-002.\n',
  );

  const result = runStarterValidator(starter);

  assert.match(
    result.stderr,
    /gate consumer workflows\/new-gate-consumer\.md references undefined gate GATE-UNKNOWN-002/i,
  );
});

test('starter validator checks a suspended gate reference in a workflow consumer', (t) => {
  const starter = copyStarter(t);
  const canonicalFile = path.join(starter, 'templates/runtime/AGENTS.md');
  const content = fs.readFileSync(canonicalFile, 'utf8')
    .replace(
      '| GATE-ROUTE-001 | `PROJECT_BRIEF.md` + `TECH_STACK.md` | active |',
      '| GATE-ROUTE-001 | `PROJECT_BRIEF.md` + `TECH_STACK.md` | suspended |',
    );
  fs.writeFileSync(canonicalFile, content);

  const result = runStarterValidator(starter);

  assert.match(
    result.stderr,
    /suspended gate GATE-ROUTE-001.*workflows\/product-shape-tech-route\.md/i,
  );
});

test('starter validator checks a structured gate-row copy in a workflow consumer', (t) => {
  const starter = copyStarter(t);
  const workflow = path.join(starter, 'workflows/product-shape-tech-route.md');
  fs.appendFileSync(workflow, `\n${row('GATE-ROUTE-001')}\n`);

  const result = runStarterValidator(starter);

  assert.match(
    result.stderr,
    /gate consumer workflows\/product-shape-tech-route\.md restates gate GATE-ROUTE-001/i,
  );
});

test('starter validator fails closed when CHANGELOG.md is missing', (t) => {
  const starter = copyStarter(t);
  fs.rmSync(path.join(starter, 'CHANGELOG.md'));

  const result = runStarterValidator(starter);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing CHANGELOG\.md/);
});

test('starter validator does not require all active IDs in a startup workflow consumer', (t) => {
  const starter = copyStarter(t);
  const startupFile = path.join(starter, 'startup/01-bootstrap-gates.md');
  const content = fs.readFileSync(startupFile, 'utf8')
    .replaceAll('GATE-INTENT-001', 'intent gate');
  fs.writeFileSync(startupFile, content);

  const result = runStarterValidator(starter);

  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('product route workflow cites lifecycle fields without copying fallback or review events', () => {
  const content = fs.readFileSync(
    path.join(ROOT, 'workflows/product-shape-tech-route.md'),
    'utf8',
  );

  assert.match(content, /GATE-ROUTE-001.*generated `AGENTS\.md`/i);
  // The workflow may name a lifecycle field but must not restate its value:
  // `## Re-evaluation Triggers` as a section, or the gate's own fallback wording,
  // would make this file a second place to keep in sync with the generated ledger.
  assert.doesNotMatch(content, /^## Re-evaluation Triggers$/mi);
  assert.doesNotMatch(content, /recheck-required|do not implement/i);
});

test('bootstrap closeout routes only an actual durable-rule proposal', () => {
  const content = fs.readFileSync(
    path.join(ROOT, 'startup/01-bootstrap-gates.md'),
    'utf8',
  );

  // Document-structure routing is conditional on an actual proposal, so neither
  // the main flow nor the proceed conditions may list it as a wrap-up step.
  assert.doesNotMatch(content, /Wrap-up:[^\n]*document-structure routing/i);
  assert.doesNotMatch(content, /^-\s*(?:At wrap-up|Document-structure routing)\b/mi);
  assert.match(content, /durable rule[^\n]*destination[^\n]*owner[^\n]*evidence/i);
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
  assert.deepEqual(validateAdapterGateReferences(adapterDocuments, canonicalDocuments), []);

  const startHere = adapterDocuments[0].content;
  assert.match(startHere, /user-declared route/);
  assert.match(startHere, /ai-recommended route/);
  assert.doesNotMatch(startHere, /workflow for the decision method/i);
});
