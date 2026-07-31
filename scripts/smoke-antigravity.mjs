#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, '.tmp/antigravity');
const fixture = path.join(root, 'examples/template-adoption/antigravity-base');
const RUNTIME_ROOT = '.agents';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

function fail(message) {
  console.error(`smoke:antigravity failed: ${message}`);
  process.exit(1);
}

function runtimeFiles(base) {
  const collected = [];
  const walk = (relative) => {
    const absolute = path.join(base, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true }).sort(
      (left, right) => (left.name < right.name ? -1 : left.name > right.name ? 1 : 0),
    )) {
      const next = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile()) collected.push(next);
    }
  };
  walk(RUNTIME_ROOT);
  return collected;
}

fs.rmSync(target, { recursive: true, force: true });
run(process.execPath, ['scripts/init.mjs', target, '--agent', 'antigravity']);

const generated = runtimeFiles(target);
if (generated.length === 0) {
  fail(`init --agent antigravity generated no ${RUNTIME_ROOT} files`);
}

// The fixture is only evidence if it is what the generator actually produces.
const shipped = runtimeFiles(fixture);
if (generated.join('\n') !== shipped.join('\n')) {
  fail(`${RUNTIME_ROOT} file list differs from the checked-in fixture\n  generated: ${generated.join(', ')}\n  fixture:   ${shipped.join(', ')}`);
}
for (const relative of generated) {
  const left = fs.readFileSync(path.join(target, relative), 'utf8');
  const right = fs.readFileSync(path.join(fixture, relative), 'utf8');
  if (left !== right) fail(`${relative} differs from the checked-in fixture`);
}

// A Codex project must not gain the Antigravity surface by accident.
const codexTarget = path.join(root, '.tmp/antigravity-codex');
fs.rmSync(codexTarget, { recursive: true, force: true });
run(process.execPath, ['scripts/init.mjs', codexTarget, '--agent', 'codex']);
if (fs.existsSync(path.join(codexTarget, RUNTIME_ROOT))) {
  fail(`--agent codex generated ${RUNTIME_ROOT}`);
}

run(process.execPath, ['scripts/doctor.mjs', target]);

console.log(`smoke:antigravity passed: ${generated.length} runtime files match the fixture.`);
