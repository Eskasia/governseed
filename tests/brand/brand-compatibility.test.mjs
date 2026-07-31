import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LEGACY = ['agent', 'governance', 'starter'].join('-');
const PROHIBITED_SHORT_NAME = ['Gov', 'Seed'].join('');
const TEXT_EXTENSIONS = new Set(['.json', '.md', '.mjs', '.yaml', '.yml']);

function file(relativePath) {
  return path.join(ROOT, relativePath);
}

function read(relativePath) {
  assert.ok(fs.existsSync(file(relativePath)), `missing ${relativePath}`);
  return fs.readFileSync(file(relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(read(relativePath));
}

function runNode(relativeScript, args = []) {
  return spawnSync(process.execPath, [file(relativeScript), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: {
      ...process.env,
      NO_UPDATE_NOTIFIER: '1',
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
    shell: false,
  });
}

function walkTextFiles(directory = ROOT) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === '.git'
      || entry.name === '.tmp'
      || entry.name === 'node_modules'
    ) {
      continue;
    }
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkTextFiles(absolute));
    } else if (entry.isFile() && TEXT_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(absolute);
    }
  }
  return files;
}

test('public brand surfaces identify GovernSeed', () => {
  const readme = read('README.md');
  assert.ok(readme.startsWith([
    '# GovernSeed',
    '',
    '> Governance foundations for agent-native projects.',
    '',
    'GovernSeed is a local-first governance bootstrap generator for',
    'agent-native projects.',
  ].join('\n')));
  assert.match(readme, /Formal brand: `Eskasia GovernSeed`/u);
  assert.ok(
    readme.includes(
      `GovernSeed was previously developed as ${'`'}${LEGACY}${'`'}.`,
    ),
  );
  assert.match(readme, /github\.com\/Eskasia\/governseed/iu);
  assert.equal(
    readme.includes(`https://github.com/Eskasia/${LEGACY}`),
    false,
  );

  const brandedFiles = [
    'CHANGELOG.md',
    'CONTRIBUTING.md',
    'ROADMAP.md',
    'SECURITY.md',
    'VALIDATION.md',
    'docs/index.md',
    'docs/migrations/governseed-brand-transition.md',
    'examples/template-adoption/base-minimal/README.md',
    'examples/template-adoption/fullstack-ai-saas/README.md',
    'examples/template-adoption/macos-beta-handoff/README.md',
    'prompts/antigravity-new-project.md',
    'prompts/claude-new-project.md',
    'prompts/codex-new-project.md',
    'templates/runtime/README.md',
    'templates/runtime/START_HERE.md',
    '.github/ISSUE_TEMPLATE/bug_report.yml',
    '.github/ISSUE_TEMPLATE/feature_request.yml',
    '.github/pull_request_template.md',
    '.github/release.yml',
    '.github/workflows/governance-impact-preflight.yml',
    '.github/workflows/governance-impact-real.yml',
    '.github/workflows/runtime-proof.yml',
    '.github/workflows/validate-starter.yml',
  ];
  for (const relativePath of brandedFiles) {
    assert.match(read(relativePath), /GovernSeed/u, `${relativePath} lacks GovernSeed`);
  }

  const packageJson = readJson('package.json');
  assert.match(packageJson.description, /^GovernSeed — /u);
  assert.deepEqual(packageJson.keywords, [
    'governseed',
    'agent-governance',
    'agent-native',
    'governance',
  ]);

  for (const relativePath of [
    '.github/ISSUE_TEMPLATE/config.yml',
    'examples/template-adoption/base-minimal/PROJECT_BRIEF.md',
  ]) {
    const content = read(relativePath);
    assert.match(content, /github\.com\/Eskasia\/governseed/iu);
    assert.equal(
      content.includes(`https://github.com/Eskasia/${LEGACY}`),
      false,
      `${relativePath} retains the pre-rename repository URL`,
    );
  }
  assert.match(
    read('scripts/init.mjs'),
    /node governseed\/scripts\/doctor\.mjs/u,
  );
  assert.match(
    read('templates/runtime/README.md'),
    /node governseed\/scripts\/doctor\.mjs/u,
  );
});

test('generated projects and CLI help display GovernSeed without renaming commands', (t) => {
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), 'governseed-brand-'),
  );
  const project = path.join(sandbox, 'project');
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));

  const generated = runNode('scripts/init.mjs', [
    project,
    '--agent',
    'codex',
    '--profile',
    'base',
  ]);
  assert.equal(generated.status, 0, generated.stderr || generated.stdout);
  assert.match(fs.readFileSync(path.join(project, 'README.md'), 'utf8'), /^# GovernSeed Project$/mu);
  assert.match(fs.readFileSync(path.join(project, 'README.md'), 'utf8'), /GovernSeed/u);
  assert.match(fs.readFileSync(path.join(project, 'START_HERE.md'), 'utf8'), /GovernSeed/u);
  assert.equal(
    JSON.parse(
      fs.readFileSync(path.join(project, '.agent-governance.json'), 'utf8'),
    ).generator,
    LEGACY,
  );

  const helpSurfaces = [
    ['scripts/init.mjs', ['--help'], 'agent-governance-init'],
    ['scripts/doctor.mjs', ['--help'], 'agent-governance-doctor'],
    ['scripts/agent-governance.mjs', ['--help'], 'agent-governance'],
  ];
  for (const [script, args, commandName] of helpSurfaces) {
    const result = runNode(script, args);
    assert.equal(result.status, 0, `${script}: ${result.stderr || result.stdout}`);
    assert.match(result.stdout, /GovernSeed/u, `${script} help lacks GovernSeed`);
    assert.match(result.stdout, new RegExp(commandName, 'u'));
  }
});

test('legacy package, generator, schema, and fixture machine identifiers stay stable', () => {
  const packageJson = readJson('package.json');
  assert.equal(packageJson.name, LEGACY);
  assert.deepEqual(packageJson.bin, {
    'agent-governance': './scripts/agent-governance.mjs',
    'agent-governance-init': './scripts/init.mjs',
    'agent-governance-doctor': './scripts/doctor.mjs',
  });
  assert.equal(Object.hasOwn(packageJson.bin, 'governseed'), false);
  assert.deepEqual(packageJson.dependencies ?? {}, {});

  const expectedSchemaIds = [
    `https://example.com/${LEGACY}/doctor-output.schema.json`,
    `https://example.com/${LEGACY}/governance-impact-result.schema.json`,
    `https://example.com/${LEGACY}/governance-impact-run.schema.json`,
    `https://example.com/${LEGACY}/governance-impact-scenario.schema.json`,
    `https://example.com/${LEGACY}/project-doc.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/cli-output.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/deliberation-plan.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/deliberation-result.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/governance-pack.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/risk-profile.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/role-assignment.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/role-catalog.schema.json`,
    `https://github.com/Eskasia/${LEGACY}/schemas/source-lock.schema.json`,
  ].sort();
  const actualSchemaIds = fs.readdirSync(file('schemas'))
    .filter((name) => name.endsWith('.json'))
    .map((name) => readJson(path.join('schemas', name)).$id)
    .filter((id) => typeof id === 'string' && id.includes(LEGACY))
    .sort();
  assert.deepEqual(actualSchemaIds, expectedSchemaIds);

  for (const fixture of [
    'antigravity-base',
    'base-minimal',
    'fullstack-ai-saas',
    'macos-beta-handoff',
  ]) {
    assert.equal(
      readJson(
        path.join(
          'examples/template-adoption',
          fixture,
          '.agent-governance.json',
        ),
      ).generator,
      LEGACY,
    );
  }
});

test('every retained legacy brand token has an explicit compatibility class', () => {
  const expectedCounts = {
    'CHANGELOG.md': 1,
    'README.md': 1,
    'THIRD_PARTY_NOTICES.md': 1,
    'docs/migrations/governseed-brand-transition.md': 3,
    'docs/superpowers/plans/2026-07-30-core-boundary-consolidation-plan.md': 1,
    'docs/superpowers/specs/2026-07-13-governance-evidence-overhaul-design.md': 1,
    'docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md': 1,
    'examples/template-adoption/antigravity-base/.agent-governance.json': 1,
    'examples/template-adoption/base-minimal/.agent-governance.json': 1,
    'examples/template-adoption/fullstack-ai-saas/.agent-governance.json': 1,
    'examples/template-adoption/macos-beta-handoff/.agent-governance.json': 1,
    'package.json': 1,
    'schemas/cli-output.schema.json': 1,
    'schemas/deliberation-plan.schema.json': 1,
    'schemas/deliberation-result.schema.json': 1,
    'schemas/doctor-output.schema.json': 1,
    'schemas/governance-impact-result.schema.json': 1,
    'schemas/governance-impact-run.schema.json': 1,
    'schemas/governance-impact-scenario.schema.json': 1,
    'schemas/governance-pack.schema.json': 1,
    'schemas/project-doc.schema.json': 1,
    'schemas/risk-profile.schema.json': 1,
    'schemas/role-assignment.schema.json': 1,
    'schemas/role-catalog.schema.json': 1,
    'schemas/source-lock.schema.json': 1,
    'scripts/init.mjs': 1,
    'scripts/validate-starter.mjs': 2,
    'templates/runtime/README.md': 1,
  };
  const actualCounts = {};
  for (const absolutePath of walkTextFiles()) {
    const content = fs.readFileSync(absolutePath, 'utf8');
    const matches = content.match(new RegExp(LEGACY, 'gu'));
    if (!matches) continue;
    const relativePath = path.relative(ROOT, absolutePath).split(path.sep).join('/');
    actualCounts[relativePath] = matches.length;
  }
  assert.deepEqual(actualCounts, expectedCounts);

  const transition = read('docs/migrations/governseed-brand-transition.md');
  for (const classification of [
    'legacy machine identifier',
    'compatibility text',
    'historical record',
    'completed repository transition',
  ]) {
    assert.match(transition, new RegExp(classification, 'u'));
  }

  for (const absolutePath of walkTextFiles()) {
    const relativePath = path.relative(ROOT, absolutePath).split(path.sep).join('/');
    if (
      relativePath === 'docs/research/2026-07-29-governseed-name-audit.md'
      || relativePath === 'docs/migrations/governseed-brand-transition.md'
    ) {
      continue;
    }
    assert.equal(
      fs.readFileSync(absolutePath, 'utf8').includes(PROHIBITED_SHORT_NAME),
      false,
      `${relativePath} uses the prohibited short brand`,
    );
  }
});

test('package dry run contains required governance surfaces and excludes local artifacts', () => {
  const npmExecPath = process.env.npm_execpath;
  assert.ok(
    npmExecPath && fs.existsSync(npmExecPath),
    'npm_execpath must identify the npm CLI used to run this test',
  );
  const packed = spawnSync(
    process.execPath,
    [npmExecPath, 'pack', '--dry-run', '--json'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_update_notifier: 'false',
      },
      shell: false,
    },
  );
  assert.equal(packed.status, 0, packed.stderr || packed.stdout);
  const result = JSON.parse(packed.stdout);
  assert.equal(Array.isArray(result), true);
  assert.equal(result.length, 1);
  const paths = result[0].files.map((entry) => entry.path);
  assert.ok(paths.includes('docs/migrations/governseed-brand-transition.md'));
  assert.ok(paths.includes('docs/research/2026-07-29-governseed-name-audit.md'));
  assert.ok(paths.includes('docs/research/evidence/2026-07-29-tmview-governseed-no-results.png'));
  for (const required of [
    'docs/policy-compiler.md',
    'docs/research/2026-07-29-codex-policy-capability-matrix.md',
    'schemas/policy-manifest.schema.json',
    'schemas/codex-policy-adapter.schema.json',
    'schemas/compile-receipt.schema.json',
    'scripts/lib/policy-compiler-core.mjs',
    'scripts/lib/policy-compiler-project.mjs',
    'scripts/lib/codex-policy-adapter.mjs',
    'scripts/lib/policy-compiler-doctor.mjs',
    'tests/policy-compiler/fixture-contracts.test.mjs',
    'tests/policy-compiler/fixtures/low-risk-codex/case.json',
    'tests/policy-compiler/fixtures/restricted-data-codex/case.json',
    'tests/policy-compiler/fixtures/publish-approval-codex/case.json',
    'tests/policy-compiler/fixtures/malicious-pack-expansion/case.json',
    'tests/policy-compiler/fixtures/owner-conflict/case.json',
    'tests/policy-compiler/fixtures/stale-policy/case.json',
    'tests/policy-compiler/fixtures/dry-run/case.json',
    'tests/policy-compiler/fixtures/cross-platform-paths/case.json',
  ]) {
    assert.ok(paths.includes(required), `package is missing ${required}`);
  }
  assert.equal(
    paths.some((entry) => (
      /(?:^|\/)(?:\.agent-governance\/local|\.tmp|tmp)(?:\/|$)/u.test(entry)
      || entry.endsWith('.DS_Store')
      || entry.includes('codex-clipboard')
    )),
    false,
  );
});
