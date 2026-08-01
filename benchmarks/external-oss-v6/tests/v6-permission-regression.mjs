import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = os.tmpdir();
const work = path.join(root, `governseed-v6-regression-${process.pid}`);
const errors = [];
let cache;
let negative;
const check = (condition, message) => { if (!condition) errors.push(message); };
const codeForMissingCache = (cachePath) => existsSync(cachePath) ? null : 'DEPENDENCY_CACHE_INCOMPLETE';
mkdirSync(work, { recursive: true, mode: 0o700 });
try {
  const parent = path.join(work, 'no-execute-parent');
  mkdirSync(path.join(parent, 'child'), { recursive: true, mode: 0o700 });
  chmodSync(parent, 0o600);
  check(!existsSync(path.join(parent, 'child', 'missing')), 'workspace parent execute denial did not deny access');
  chmodSync(parent, 0o700);

  const harness = path.join(work, 'harness.sh');
  writeFileSync(harness, '#!/bin/sh\nexit 0\n', { mode: 0o644 });
  const deniedHarness = spawnSync(harness, [], { encoding: 'utf8' });
  check(deniedHarness.error?.code === 'EACCES' || deniedHarness.status !== 0, 'harness no-execute did not fail');

  cache = path.join(work, 'cache');
  negative = path.join(work, 'negative-cache');
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(cache, 'readable.txt'), 'readable\n', { mode: 0o444 });
  mkdirSync(path.join(cache, 'required'), { mode: 0o755 });
  writeFileSync(path.join(cache, 'required', 'entry'), 'entry\n', { mode: 0o644 });
  mkdirSync(negative, { mode: 0o700 });
  spawnSync('cp', ['-a', `${cache}/.`, `${negative}/`], { stdio: 'ignore' });
  check(readFileSync(path.join(cache, 'readable.txt'), 'utf8') === 'readable\n', 'readonly readable cache failed');
  chmodSync(path.join(cache, 'required'), 0o555);
  const writeAttempt = spawnSync('touch', [path.join(cache, 'required', 'write-test')], { encoding: 'utf8' });
  check(writeAttempt.status !== 0, 'readonly cache accepted host write');
  rmSync(path.join(negative, 'required'), { recursive: true, force: true });
  chmodSync(negative, 0o555);
  check(codeForMissingCache(path.join(negative, 'required')) === 'DEPENDENCY_CACHE_INCOMPLETE', 'negative cache did not fail closed');

  for (const writable of ['workspace', 'home', 'tmp']) {
    const target = path.join(work, writable);
    mkdirSync(target, { mode: 0o700 });
    const marker = path.join(target, 'write-test');
    writeFileSync(marker, 'ok\n');
    check(existsSync(marker), `${writable} is not writable`);
  }
  const result = { schemaVersion: 1, status: errors.length ? 'FAIL' : 'PASS', codes: ['WORKSPACE_TRAVERSE_DENIED', 'HARNESS_EXECUTION_DENIED', 'DEPENDENCY_CACHE_INCOMPLETE', 'HOME_NOT_WRITABLE', 'TMP_NOT_WRITABLE'], errors };
  console.log(JSON.stringify(result));
  if (errors.length) process.exitCode = 1;
} finally {
  chmodSync(path.join(cache, 'required'), 0o700);
  chmodSync(negative, 0o700);
  chmodSync(work, 0o700);
  rmSync(work, { recursive: true, force: true });
}
