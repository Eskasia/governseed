#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('.');
const isMain = Boolean(process.argv[1])
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

export const REQUIRED_GATE_IDS = Object.freeze([
  'GATE-INTENT-001',
  'GATE-ROUTE-001',
]);

const REQUIRED_GATE_HEADER = [
  'ID',
  'Owner path',
  'Status',
  'Evidence',
  'Event-only review trigger',
  'Fallback',
];

function hasRequiredGateHeader(content) {
  return String(content || '').split(/\r?\n/).some((line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|')) return false;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());
    return cells.length === REQUIRED_GATE_HEADER.length
      && cells.every((cell, index) => cell === REQUIRED_GATE_HEADER[index]);
  });
}

function gateRows(document) {
  const rows = [];
  for (const [index, line] of String(document.content || '').split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('|') || !trimmed.includes('GATE-')) continue;
    const cells = trimmed
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));
    if (!/^GATE-[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(cells[0] || '')) continue;
    rows.push({
      id: cells[0],
      ownerPath: cells[1] || '',
      status: cells[2] || '',
      evidence: cells[3] || '',
      reviewTrigger: cells[4] || '',
      fallback: cells[5] || '',
      documentPath: document.path,
      line: index + 1,
    });
  }
  return rows;
}

function referencedGateIds(content) {
  return new Set(String(content || '').match(/\bGATE-[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g) || []);
}

export function validateGateLifecycle({
  canonicalDocuments = [],
  adapterDocuments = [],
  requiredGateIds = REQUIRED_GATE_IDS,
} = {}) {
  const errors = [];
  for (const document of canonicalDocuments) {
    if (!hasRequiredGateHeader(document.content)) {
      errors.push(`Canonical gate ledger ${document.path} is missing the required lifecycle header`);
    }
  }
  const rows = canonicalDocuments.flatMap((document) => gateRows(document));
  const rowsById = new Map();

  for (const row of rows) {
    const byDocument = rows.filter((candidate) => (
      candidate.id === row.id && candidate.documentPath === row.documentPath
    ));
    if (byDocument.length > 1 && byDocument[0] === row) {
      errors.push(`Duplicate gate ID ${row.id} in canonical owner ${row.documentPath}`);
    }

    if (!rowsById.has(row.id)) rowsById.set(row.id, []);
    rowsById.get(row.id).push(row);

    if (!['active', 'suspended'].includes(row.status)) {
      errors.push(`Invalid status for ${row.id}: ${row.status || '(empty)'}`);
    }

    for (const [field, label] of [
      ['ownerPath', 'owner path'],
      ['evidence', 'evidence'],
      ['reviewTrigger', 'event-only review trigger'],
      ['fallback', 'fallback'],
    ]) {
      if (!row[field]) errors.push(`${row.id} in ${row.documentPath} is missing ${label}`);
    }
  }

  for (const [id, definitions] of rowsById) {
    const owners = [...new Set(definitions.map((definition) => definition.documentPath))];
    if (owners.length > 1) {
      errors.push(`Multiple canonical owners for ${id}: ${owners.join(', ')}`);
    }
  }

  for (const id of requiredGateIds) {
    if (!rowsById.has(id)) errors.push(`Missing canonical gate ${id}`);
  }

  for (const adapter of adapterDocuments) {
    for (const definition of gateRows(adapter)) {
      errors.push(`Adapter restates gate ${definition.id} in ${adapter.path}`);
    }
    for (const id of referencedGateIds(adapter.content)) {
      const definitions = rowsById.get(id);
      if (!definitions) {
        errors.push(`Adapter ${adapter.path} references undefined gate ${id}`);
        continue;
      }
      if (definitions.some((definition) => definition.status === 'suspended')) {
        errors.push(`Suspended gate ${id} is referenced by adapter ${adapter.path}`);
      }
    }
  }

  return errors;
}

export function validateAdapterGateReferences(
  adapterDocuments,
  requiredGateIds = REQUIRED_GATE_IDS,
) {
  const errors = [];
  for (const adapter of adapterDocuments) {
    const references = referencedGateIds(adapter.content);
    for (const id of requiredGateIds) {
      if (!references.has(id)) errors.push(`Adapter ${adapter.path} must cite ${id}`);
    }
    if (!String(adapter.content || '').includes('AGENTS.md')) {
      errors.push(`Adapter ${adapter.path} must point to canonical AGENTS.md`);
    }
  }
  return errors;
}

export function validateWorkflowIndexing(workflowPath, indexDocuments) {
  const errors = [];
  for (const document of indexDocuments) {
    if (!String(document.content || '').includes(workflowPath)) {
      errors.push(`${document.path} does not index ${workflowPath}`);
    }
  }
  return errors;
}

export function validateMandatoryWorkflowTracking(
  repoRoot,
  mandatoryFiles,
  spawnCommand = spawnSync,
) {
  if (!fs.existsSync(path.join(repoRoot, '.git'))) return [];

  const errors = [];
  for (const file of mandatoryFiles) {
    if (!fs.existsSync(path.join(repoRoot, file))) continue;
    const result = spawnCommand('git', ['ls-files', '--error-unmatch', '--', file], {
      cwd: repoRoot,
      encoding: 'utf8',
      shell: false,
    });
    if (result.status !== 0) errors.push(`Mandatory workflow is not tracked by git: ${file}`);
  }
  return errors;
}

function readFile(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readFile(relativePath));
}

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function markdownRefs(text) {
  const refs = new Set();
  const regex = /`([^`\n]+\.md|docs\/adr\/\*\.md|assets\/ASSET_MANIFEST\.md)`/g;
  let match;
  while ((match = regex.exec(text))) {
    refs.add(match[1]);
  }
  return [...refs];
}

function fail(errors, message) {
  errors.push(message);
}

function requireFile(errors, file) {
  if (!exists(file)) fail(errors, `Missing ${file}`);
}

function requireIncludes(errors, file, snippets) {
  if (!exists(file)) {
    fail(errors, `Missing ${file}`);
    return;
  }
  const content = readFile(file);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) fail(errors, `${file} missing required text: ${snippet}`);
  }
}

function lineCount(relativePath) {
  return readFile(relativePath).split(/\r?\n/).length;
}

function requireRealNewlines(errors, file) {
  if (!exists(file)) {
    fail(errors, `Missing ${file}`);
    return;
  }
  if (lineCount(file) < 2) {
    fail(errors, `${file} appears to be single-line; keep generated files with real newlines`);
  }
}

function collectFiles(relativeDir, predicate) {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      files.push(...collectFiles(relativePath, predicate));
    } else if (entry.isFile() && predicate(relativePath, absolutePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function templateMarkdownFiles() {
  return collectFiles('templates', (relativePath) => relativePath.endsWith('.md'));
}

function templateExists(doc) {
  return templateMarkdownFiles().some((file) => path.basename(file) === doc);
}

function uniqueByFile(items) {
  const byFile = new Map();
  for (const item of items) byFile.set(item.file, item);
  return [...byFile.values()];
}

function loadProfile(name, seen = new Set()) {
  const profilePath = `profiles/${name}.json`;
  if (!exists(profilePath)) {
    throw new Error(`Missing profile: ${profilePath}`);
  }
  if (seen.has(name)) {
    throw new Error(`Profile extends cycle: ${[...seen, name].join(' -> ')}`);
  }

  const profile = readJson(profilePath);
  if (!profile.extends) {
    return {
      ...profile,
      documents: profile.documents || [],
      conditionalHints: profile.conditionalHints || [],
    };
  }

  const parent = loadProfile(profile.extends, new Set([...seen, name]));
  return {
    ...parent,
    ...profile,
    documents: uniqueByFile([...(parent.documents || []), ...(profile.documents || [])]),
    conditionalHints: uniqueByFile([...(parent.conditionalHints || []), ...(profile.conditionalHints || [])]),
  };
}

function profileFiles() {
  return collectFiles('profiles', (relativePath) => relativePath.endsWith('.json'));
}

function validateProjectDoc(errors, profileFile, doc) {
  for (const key of ['file', 'template', 'category', 'required', 'trigger']) {
    if (!Object.hasOwn(doc, key)) fail(errors, `${profileFile} document missing ${key}`);
  }
  if (doc.template && !exists(`templates/${doc.template}`)) {
    fail(errors, `${profileFile} references missing template: templates/${doc.template}`);
  }
  if (doc.category && !['fixed', 'conditional', 'runtime'].includes(doc.category)) {
    fail(errors, `${profileFile} has invalid document category for ${doc.file}: ${doc.category}`);
  }
}

function validateProfile(errors, profileFile) {
  let profile;
  try {
    profile = readJson(profileFile);
  } catch (error) {
    fail(errors, `${profileFile} is not valid JSON: ${error.message}`);
    return;
  }

  for (const key of ['schemaVersion', 'name', 'description', 'documents']) {
    if (!Object.hasOwn(profile, key)) fail(errors, `${profileFile} missing required key: ${key}`);
  }

  for (const doc of profile.documents || []) validateProjectDoc(errors, profileFile, doc);
  for (const doc of profile.conditionalHints || []) validateProjectDoc(errors, profileFile, doc);

  if (profile.extends && !exists(`profiles/${profile.extends}.json`)) {
    fail(errors, `${profileFile} extends missing profile: profiles/${profile.extends}.json`);
  }
}

function packageScripts(errors) {
  if (!exists('package.json')) return {};
  try {
    return readJson('package.json').scripts || {};
  } catch (error) {
    fail(errors, `package.json is not valid JSON: ${error.message}`);
    return {};
  }
}

if (isMain) {
const errors = [];

for (const file of [
  'README.md',
  'package.json',
  'AGENTS.md',
  'CLAUDE.md',
  'ANTIGRAVITY.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  'ROADMAP.md',
  '.gitignore',
  'VALIDATION.md',
  'docs/index.md',
  'docs/tool-registry.md',
  'docs/runtime-proof.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/pull_request_template.md',
  '.github/release.yml',
  '.github/workflows/runtime-proof.yml',
  'tests/runtime/codex/expected-headings.txt',
  'tests/runtime/claude/first-response.schema.json',
  'tests/runtime/antigravity/skill-template/SKILL.md',
  'scripts/smoke-base.mjs',
  'scripts/smoke-fullstack.mjs',
  'scripts/fixtures-check.mjs',
  'scripts/validate-runtime-proof.mjs',
  'scripts/assert-claude-first-response.mjs',
  'scripts/runtime-smoke-codex.mjs',
  'scripts/runtime-smoke-claude.mjs',
  'scripts/runtime-smoke-antigravity.mjs',
  'profiles/base.json',
  'profiles/fullstack-ai.json',
  'profiles/macos.json',
  'schemas/project-doc.schema.json',
  'schemas/doctor-output.schema.json',
]) {
  requireFile(errors, file);
}

for (const dir of ['startup', 'workflows', 'templates', 'scripts', 'docs', 'prompts', 'profiles', 'schemas', 'examples/template-adoption', 'tests/runtime']) {
  if (!exists(dir)) fail(errors, `Missing directory: ${dir}`);
}

for (const file of ['startup/00-agent-start-here.md', 'startup/01-bootstrap-gates.md', 'startup/02-required-project-docs.md', 'workflows/product-shape-tech-route.md']) {
  requireFile(errors, file);
}

const gateAdapterPaths = [
  'templates/runtime/START_HERE.md',
  'templates/runtime/README.md',
  'startup/00-agent-start-here.md',
  'startup/01-bootstrap-gates.md',
  'startup/02-required-project-docs.md',
  'prompts/codex-new-project.md',
  'prompts/claude-new-project.md',
  'prompts/antigravity-new-project.md',
  'scripts/init.mjs',
];
const gateCanonicalDocuments = exists('templates/runtime/AGENTS.md')
  ? [{ path: 'templates/runtime/AGENTS.md', content: readFile('templates/runtime/AGENTS.md') }]
  : [];
const gateAdapterDocuments = gateAdapterPaths
  .filter((file) => exists(file))
  .map((file) => ({ path: file, content: readFile(file) }));
errors.push(...validateGateLifecycle({
  canonicalDocuments: gateCanonicalDocuments,
  adapterDocuments: gateAdapterDocuments,
  requiredGateIds: REQUIRED_GATE_IDS,
}));
errors.push(...validateAdapterGateReferences(gateAdapterDocuments, REQUIRED_GATE_IDS));

const workflowIndexes = ['docs/index.md', 'workflows/tool-routing.md']
  .filter((file) => exists(file))
  .map((file) => ({ path: file, content: readFile(file) }));
errors.push(...validateWorkflowIndexing('workflows/product-shape-tech-route.md', workflowIndexes));
errors.push(...validateMandatoryWorkflowTracking(root, ['workflows/product-shape-tech-route.md']));

for (const file of [
  'prompts/codex-new-project.md',
  'prompts/claude-new-project.md',
  'prompts/antigravity-new-project.md',
]) {
  requireIncludes(errors, file, [
    'START_HERE.md',
    'PROJECT_BRIEF.md',
    'SPEC.md',
    'CONTEXT.md',
    'TASK_CONTRACT.md',
    'OPEN_LOOPS.md',
    'TECH_STACK.md',
    'Q1-Q9',
  ]);
}

requireIncludes(errors, 'README.md', [
  'Agent-native project governance starter for Codex, Claude Code, and Antigravity',
  'actions/workflows/validate-starter.yml/badge.svg',
  'License-MIT',
  'node-%3E%3D20',
  'startup/01-bootstrap-gates.md',
  'startup/02-required-project-docs.md',
  'workflows/product-shape-tech-route.md',
  'Generated base project tree',
  '## Runtime Proof',
  '## Community',
  'CODE_OF_CONDUCT.md',
  'README.md',
  'node agent-governance-starter/scripts/doctor.mjs ./my-new-project',
  'product shape / technology route',
]);

requireIncludes(errors, 'startup/01-bootstrap-gates.md', [
  '產品形態 / 技術路線 Gate',
  'user-declared route',
  'ai-recommended route',
  'workflows/product-shape-tech-route.md',
]);

requireIncludes(errors, 'workflows/product-shape-tech-route.md', [
  'user-declared route',
  'ai-recommended route',
  'Q1-Q9',
  'PROJECT_BRIEF.md',
  'TECH_STACK.md',
  '新技術引入 Gate',
]);

requireIncludes(errors, 'AGENTS.md', [
  'canonical source of truth',
  'thin adapters',
  '## Rule Lifecycle',
]);

requireIncludes(errors, 'CLAUDE.md', [
  '@AGENTS.md',
  'thin Claude Code adapter',
]);

requireIncludes(errors, 'ANTIGRAVITY.md', [
  'not the official Antigravity runtime entrypoint',
  '.agents/AGENTS.md',
  '.agents/skills/*/SKILL.md',
]);

requireIncludes(errors, 'package.json', [
  '"check"',
  '"validate"',
  '"validate:runtime-proof"',
  '"smoke:base"',
  '"smoke:fullstack"',
  '"fixtures"',
  '"runtime:proof"',
  '"runtime:proof:codex"',
  '"runtime:proof:claude"',
  '"runtime:proof:antigravity"',
  '"ci"',
]);

const scripts = packageScripts(errors);
for (const [name, command] of Object.entries(scripts)) {
  if (/\brm\s+-rf\b/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only rm -rf`);
  if (/\bmkdir\s+-p\b/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only mkdir -p`);
  if (/\bgrep\b/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only grep`);
  if (/(^|[\s;&|])diff(\s|$)/.test(command)) fail(errors, `package.json script ${name} uses POSIX-only diff`);
}

requireIncludes(errors, '.github/ISSUE_TEMPLATE/bug_report.yml', [
  'problem_type',
  'reproduction',
  'expected',
  'actual',
  'profile',
  'agent_runtime',
  'doctor_output',
  'validation_commands',
]);

requireIncludes(errors, '.github/ISSUE_TEMPLATE/feature_request.yml', [
  'problem_type',
  'reproduction',
  'expected',
  'actual',
  'profile',
  'agent_runtime',
  'doctor_output',
  'validation_commands',
]);

requireIncludes(errors, '.github/pull_request_template.md', [
  '## Summary',
  '## Changed Surface',
  '## Validation',
  '## Generated Fixture Impact',
  '## Runtime Adapter Impact',
  '## Rule Lifecycle Impact',
  '## Docs Updated',
]);

requireIncludes(errors, '.github/release.yml', [
  'Features',
  'Fixes',
  'Docs',
  'Maintenance',
  'Breaking Changes',
]);

requireIncludes(errors, 'CODE_OF_CONDUCT.md', [
  'Expected Behavior',
  'Unacceptable Behavior',
  'Enforcement',
]);

requireIncludes(errors, 'docs/index.md', [
  'runtime-proof.md',
  'prompts/codex-new-project.md',
]);

requireIncludes(errors, 'VALIDATION.md', [
  'npm run runtime:proof',
  'RUNTIME_PROOF_REAL=1 npm run runtime:proof',
  'Ubuntu, macOS, and Windows',
  'npm run fixtures',
]);

requireIncludes(errors, 'CONTRIBUTING.md', [
  'npm run runtime:proof',
]);

requireIncludes(errors, 'templates/runtime/START_HERE.md', [
  '{{AGENT}}',
  '{{PROFILE_NAME}}',
  '{{INTAKE_QUESTIONS}}',
  '{{REQUIRED_DOCUMENTS}}',
  '## Governance Gate References',
]);

requireIncludes(errors, 'templates/runtime/README.md', [
  '{{AGENT}}',
  '{{PROFILE_NAME}}',
  '{{REQUIRED_DOCUMENTS}}',
  'doctor.mjs',
]);

requireIncludes(errors, 'templates/runtime/AGENTS.md', [
  '## Governance Gates',
]);

requireIncludes(errors, 'templates/fixed/PROJECT_BRIEF.md', [
  '## 產品形態決策',
  '決策模式',
  '第一版產品形態',
  'Q1-Q9 依據',
]);

requireIncludes(errors, 'templates/fixed/TECH_STACK.md', [
  '## 技術路線決策',
  '決策模式',
  '唯一主路線',
  '新技術引入 gate',
  '| Frontend |',
  '| Backend |',
  '| Database |',
  '| Main framework / SDK |',
]);

requireIncludes(errors, 'docs/adr/000-template.md', [
  '## Reevaluation Triggers',
  '## Switching Cost',
  '## Adoption Gate',
]);

for (const file of [
  'prompts/codex-new-project.md',
  'prompts/claude-new-project.md',
  'prompts/antigravity-new-project.md',
]) {
  requireIncludes(errors, file, [
    'user-declared route',
    'ai-recommended route',
  ]);
}

requireIncludes(errors, 'scripts/init.mjs', [
  'product shape / technology route mode',
  'user-declared route',
  'ai-recommended route',
]);

for (const file of ['README.md', 'CLAUDE.md', 'ANTIGRAVITY.md']) {
  if (exists(file)) {
    const content = readFile(file);
    if (content.includes('then 01-bootstrap-gates.md') || content.includes('then 02-required-project-docs.md')) {
      fail(errors, `${file} has ambiguous startup path in first-message text`);
    }
  }
}

requireIncludes(errors, 'scripts/init.mjs', [
  '--agent',
  '--profile',
  '--all',
  'runtime/AGENTS.md',
  'runtime/START_HERE.md',
  'runtime/README.md',
  'startup/01-bootstrap-gates.md',
  '.agents/AGENTS.md',
  '.agents/skills/bootstrap-intake/SKILL.md',
]);
requireIncludes(errors, 'scripts/doctor.mjs', ['--strict', '--json', 'warnings as failures']);
requireIncludes(errors, '.github/workflows/validate-starter.yml', [
  'npm run ci',
  'ubuntu-latest',
  'macos-latest',
  'windows-latest',
]);

requireIncludes(errors, '.github/workflows/runtime-proof.yml', [
  'workflow_dispatch',
  'npm run runtime:proof',
  'RUNTIME_PROOF_REAL',
]);

if (exists('scripts/init.mjs')) {
  const initScript = readFile('scripts/init.mjs');
  if (initScript.includes('function agentsContent')) {
    fail(errors, 'scripts/init.mjs must generate AGENTS.md from templates/runtime/AGENTS.md, not agentsContent()');
  }
  if (initScript.includes('Q1. What user and problem')) {
    fail(errors, 'scripts/init.mjs must read Q1-Q9 from startup/01-bootstrap-gates.md, not hardcode intake questions');
  }
}

for (const file of [
  'scripts/init.mjs',
  'scripts/doctor.mjs',
  'scripts/validate-starter.mjs',
  'scripts/smoke-base.mjs',
  'scripts/smoke-fullstack.mjs',
  'scripts/fixtures-check.mjs',
  'scripts/validate-runtime-proof.mjs',
  'scripts/assert-claude-first-response.mjs',
  'scripts/runtime-smoke-codex.mjs',
  'scripts/runtime-smoke-claude.mjs',
  'scripts/runtime-smoke-antigravity.mjs',
  '.github/workflows/validate-starter.yml',
  '.github/workflows/runtime-proof.yml',
]) {
  requireRealNewlines(errors, file);
}

try {
  JSON.parse(readFile('tests/runtime/claude/first-response.schema.json'));
} catch (error) {
  fail(errors, `tests/runtime/claude/first-response.schema.json is not valid JSON: ${error.message}`);
}

if (exists('tests/runtime/antigravity/skill-template/SKILL.md')) {
  const skill = readFile('tests/runtime/antigravity/skill-template/SKILL.md');
  if (!/^name:\s*intake-audit$/m.test(skill) || !/^description:\s*\S+/m.test(skill)) {
    fail(errors, 'tests/runtime/antigravity/skill-template/SKILL.md frontmatter must include name and description');
  }
}

for (const file of templateMarkdownFiles()) {
  requireRealNewlines(errors, file);
}

for (const file of profileFiles()) {
  requireRealNewlines(errors, file);
  validateProfile(errors, file);
}

for (const file of collectFiles('schemas', (relativePath) => relativePath.endsWith('.json'))) {
  requireRealNewlines(errors, file);
  try {
    readJson(file);
  } catch (error) {
    fail(errors, `${file} is not valid JSON: ${error.message}`);
  }
}

if (!exists('templates/README.md')) {
  fail(errors, 'Missing templates/README.md');
} else {
  const templateReadme = readFile('templates/README.md');
  const templateRefs = markdownRefs(templateReadme).filter((ref) => /^[A-Z0-9_]+\.md$/.test(ref));
  for (const doc of templateRefs) {
    if (!templateExists(doc)) fail(errors, `templates/README.md lists missing template: ${doc}`);
  }
}

const examplesRoot = path.join(root, 'examples/template-adoption');
if (fs.existsSync(examplesRoot)) {
  let requiredExampleDocs = [];
  try {
    requiredExampleDocs = loadProfile('base').documents
      .filter((doc) => doc.required)
      .map((doc) => doc.file);
  } catch (error) {
    fail(errors, error.message);
  }

  const exampleDirs = fs.readdirSync(examplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
  if (exampleDirs.length < 2) {
    fail(errors, `Expected at least 2 template-adoption examples, found ${exampleDirs.length}`);
  }
  for (const dir of exampleDirs) {
    for (const doc of requiredExampleDocs) {
      const examplePath = `examples/template-adoption/${dir}/${doc}`;
      if (!exists(examplePath)) fail(errors, `Example ${dir} missing required doc: ${doc}`);
    }
  }
}

let projectOutputDocs = new Set(['assets/ASSET_MANIFEST.md', 'docs/adr/*.md']);
try {
  const docs = profileFiles().flatMap((profileFile) => {
    const profileName = path.basename(profileFile, '.json');
    const profile = loadProfile(profileName);
    return [...(profile.documents || []), ...(profile.conditionalHints || [])].map((doc) => doc.file);
  });
  projectOutputDocs = new Set([...projectOutputDocs, ...docs]);
} catch (error) {
  fail(errors, error.message);
}

if (exists('workflows/stage-routing.md')) {
  const routing = readFile('workflows/stage-routing.md');
  for (const ref of markdownRefs(routing)) {
    if (ref.startsWith('templates/')) {
      if (!exists(ref)) fail(errors, `stage-routing.md references missing template path: ${ref}`);
      continue;
    }
    if (ref.startsWith('workflows/') || ref.startsWith('startup/') || ref.startsWith('docs/')) {
      if (!exists(ref)) fail(errors, `stage-routing.md references missing file: ${ref}`);
      continue;
    }
    if (/^[A-Z0-9_]+\.md$/.test(ref) && !templateExists(ref) && !projectOutputDocs.has(ref)) {
      fail(errors, `stage-routing.md output lacks template or project-output allowlist: ${ref}`);
    }
  }
} else {
  fail(errors, 'Missing workflows/stage-routing.md');
}

for (const file of collectFiles('workflows', (relativePath) => relativePath.endsWith('.md'))) {
  const content = readFile(file);
  if (/^#\s+\d{2}\b/m.test(content)) {
    fail(errors, `${file} has a historical numbered H1; startup/00-02 is the only linear read order`);
  }
}

if (exists('docs/experiments/context-mode.md')) {
  const content = readFile('docs/experiments/context-mode.md');
  if (/^#\s+\d{2}\b/m.test(content)) {
    fail(errors, 'docs/experiments/context-mode.md has a historical numbered H1');
  }
}

const allMarkdown = [];
function collectMarkdown(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const relativeDir = path.relative(root, fullPath);
      if (relativeDir === path.join('docs', 'research')) continue;
      collectMarkdown(fullPath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      allMarkdown.push(fullPath);
    }
  }
}
collectMarkdown(root);

for (const filePath of allMarkdown) {
  const relative = path.relative(root, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  for (const ref of markdownRefs(content)) {
    if (ref.includes('*')) continue;
    if (ref.startsWith('workflows/') || ref.startsWith('startup/') || ref.startsWith('docs/')) {
      if (!exists(ref)) fail(errors, `${relative} references missing file: ${ref}`);
    }
  }
}

const rootFiles = fs.readdirSync(root).filter((file) => /^\d{2}-.+\.md$/.test(file));
if (rootFiles.length > 0) {
  fail(errors, `Old numbered workflow files still in root: ${rootFiles.join(', ')}`);
}

if (errors.length > 0) {
  console.error('Starter validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Starter validation passed.');
}
