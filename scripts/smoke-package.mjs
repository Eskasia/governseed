#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

function fail(message) {
  console.error(`smoke:package failed: ${message}`);
  process.exit(1);
}

const npmExecPath = process.env.npm_execpath;
if (!npmExecPath || !fs.existsSync(npmExecPath)) {
  fail('npm_execpath must identify the npm CLI; run this through `npm run smoke:package`');
}

// Spawned through process.execPath rather than the npm shim so the same call
// works on Windows, where `npm` is a .cmd that shell: false cannot execute.
function npm(args, cwd) {
  return spawnSync(process.execPath, [npmExecPath, ...args], {
    cwd,
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

function node(args, cwd) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8', shell: false });
}

function shippedTests(base) {
  const collected = [];
  const walk = (relative) => {
    const absolute = path.join(base, relative);
    if (!fs.existsSync(absolute)) return;
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      const next = path.posix.join(relative, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (entry.isFile() && entry.name.endsWith('.test.mjs')) collected.push(next);
    }
  };
  walk('tests');
  return collected.sort();
}

/**
 * The package ships a contract test so consumers can re-run it against their own
 * install. `files` lists paths, so a shipped module that imports an unshipped one
 * packs cleanly and only breaks at the consumer's first import. Walking the graph
 * covers the modules no smoke path happens to execute as well.
 */
function relativeSpecifiers(source) {
  const found = new Set();
  for (const pattern of [
    /\bfrom\s*(['"])(\.[^'"]*)\1/gu,
    /\bimport\s*\(\s*(['"])(\.[^'"]*)\1\s*\)/gu,
    /\bimport\s+(['"])(\.[^'"]*)\1/gu,
  ]) {
    for (const match of source.matchAll(pattern)) found.add(match[2]);
  }
  return [...found];
}

function unshippedImports(base, entrypoints) {
  const missing = [];
  const seen = new Set();
  const queue = [...entrypoints];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const specifier of relativeSpecifiers(fs.readFileSync(file, 'utf8'))) {
      const resolved = path.resolve(path.dirname(file), specifier);
      const from = path.relative(base, file).split(path.sep).join('/');
      if (!fs.existsSync(resolved)) {
        missing.push(`${from} imports ${specifier}, which the package does not ship`);
        continue;
      }
      queue.push(resolved);
    }
  }
  return missing;
}

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'governseed-package-'));
try {
  const packed = npm(['pack', '--pack-destination', scratch, '--json'], root);
  if (packed.status !== 0) fail(`npm pack exited ${packed.status}\n${packed.stderr}`);
  const tarball = path.join(scratch, JSON.parse(packed.stdout)[0].filename);

  const consumer = path.join(scratch, 'consumer');
  fs.mkdirSync(consumer);
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    `${JSON.stringify({ name: 'governseed-package-smoke', version: '0.0.0', private: true }, null, 2)}\n`,
  );
  const installed = npm(['install', '--no-audit', '--no-fund', '--ignore-scripts', tarball], consumer);
  if (installed.status !== 0) fail(`installing the tarball exited ${installed.status}\n${installed.stderr}`);

  const base = path.join(consumer, 'node_modules', manifest.name);
  const bin = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8')).bin ?? {};
  const binPaths = Object.fromEntries(
    Object.entries(bin).map(([name, relative]) => [name, path.resolve(base, relative)]),
  );
  for (const [name, absolute] of Object.entries(binPaths)) {
    if (!fs.existsSync(absolute)) fail(`the package declares bin ${name} but does not ship ${bin[name]}`);
  }

  const tests = shippedTests(base);
  const missing = unshippedImports(base, [
    ...Object.values(binPaths),
    ...tests.map((relative) => path.join(base, relative)),
  ]);
  if (missing.length > 0) fail(`the installed package cannot resolve its own imports\n  ${missing.join('\n  ')}`);

  for (const relative of tests) {
    const result = node(['--test', relative], base);
    if (result.status !== 0) {
      fail(`${relative} does not pass from an installed package\n${result.stdout}${result.stderr}`);
    }
  }

  const help = node([binPaths['agent-governance'], '--help'], consumer);
  if (help.status !== 0) fail(`agent-governance --help exited ${help.status}\n${help.stderr}`);

  const project = path.join(scratch, 'demo');
  const init = node(
    [binPaths['agent-governance-init'], project, '--agent', 'all', '--profile', 'fullstack-ai'],
    consumer,
  );
  if (init.status !== 0) fail(`init from an installed package exited ${init.status}\n${init.stderr}`);
  const doctor = node([binPaths['agent-governance-doctor'], project], consumer);
  if (doctor.status !== 0) fail(`doctor from an installed package exited ${doctor.status}\n${doctor.stderr}`);

  console.log(`smoke:package passed: ${tests.length} shipped test(s) and ${Object.keys(bin).length} bin(s) run from an install.`);
} finally {
  fs.rmSync(scratch, { recursive: true, force: true });
}
