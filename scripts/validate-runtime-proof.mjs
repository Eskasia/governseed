#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('.');
const errors = [];
const FORCED_MOCK_SCRIPT = 'npm run validate:runtime-proof && node scripts/runtime-proof-mock.mjs';

function exists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function fail(message) {
  errors.push(message);
}

for (const file of [
  'docs/runtime-proof.md',
  'tests/runtime/codex/expected-headings.txt',
  'tests/runtime/claude/first-response.schema.json',
  'tests/runtime/antigravity/skill-template/SKILL.md',
  'scripts/validate-runtime-proof.mjs',
  'scripts/assert-claude-first-response.mjs',
  'scripts/runtime-smoke-codex.mjs',
  'scripts/runtime-smoke-claude.mjs',
  'scripts/runtime-smoke-antigravity.mjs',
  'scripts/runtime-proof-mock.mjs',
  '.github/workflows/runtime-proof.yml',
]) {
  if (!exists(file)) fail(`Missing runtime proof file: ${file}`);
}

if (exists('tests/runtime/claude/first-response.schema.json')) {
  try {
    JSON.parse(read('tests/runtime/claude/first-response.schema.json'));
  } catch (error) {
    fail(`tests/runtime/claude/first-response.schema.json is invalid JSON: ${error.message}`);
  }
}

if (exists('tests/runtime/antigravity/skill-template/SKILL.md')) {
  const skill = read('tests/runtime/antigravity/skill-template/SKILL.md');
  if (!/^---\n[\s\S]*?\n---/m.test(skill)) fail('Antigravity skill template missing frontmatter');
  if (!/^name:\s*intake-audit$/m.test(skill)) fail('Antigravity skill template frontmatter missing name');
  if (!/^description:\s*\S+/m.test(skill)) fail('Antigravity skill template frontmatter missing description');
}

if (exists('package.json')) {
  const pkg = JSON.parse(read('package.json'));
  for (const script of [
    'runtime:proof',
    'runtime:proof:codex',
    'runtime:proof:claude',
    'runtime:proof:antigravity',
    'runtime:proof:mock',
    'validate:runtime-proof',
  ]) {
    if (!pkg.scripts || !pkg.scripts[script]) fail(`package.json missing script: ${script}`);
  }
  if (
    pkg.scripts?.['runtime:proof:mock']
    && pkg.scripts['runtime:proof:mock'] !== FORCED_MOCK_SCRIPT
  ) {
    fail('package.json script runtime:proof:mock must equal the forced-mock wrapper');
  }
}

if (exists('.github/workflows/runtime-proof.yml')) {
  const workflow = read('.github/workflows/runtime-proof.yml');
  if (!workflow.includes('workflow_dispatch')) fail('runtime-proof.yml must use workflow_dispatch');
  if (!/^\s*-\s*run:\s*npm run runtime:proof:mock\s*$/m.test(workflow)) {
    fail('runtime-proof.yml must run npm run runtime:proof:mock');
  }
  const runtimeProofLines = workflow
    .split(/\r?\n/u)
    .filter((line) => line.includes('npm run runtime:proof'));
  if (
    runtimeProofLines.length !== 1
    || !/^\s*-\s*run:\s*npm run runtime:proof:mock\s*$/.test(runtimeProofLines[0])
  ) {
    fail('runtime-proof.yml must run only npm run runtime:proof:mock');
  }
  if (workflow.includes('RUNTIME_PROOF_REAL')) {
    fail('runtime-proof.yml must keep public runtime proof in mock mode');
  }
}

if (errors.length > 0) {
  console.error('Runtime proof validation failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log('Runtime proof validation passed.');
