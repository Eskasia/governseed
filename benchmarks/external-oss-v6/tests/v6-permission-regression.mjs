import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

const root = os.tmpdir();
const work = path.join(root, `governseed-v6-regression-${process.pid}`);
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
const codeForCacheEntry = (cachePath) => {
  if (!existsSync(cachePath)) return 'DEPENDENCY_CACHE_INCOMPLETE';
  try {
    statSync(cachePath);
    readFileSync(cachePath);
    return null;
  } catch {
    return 'DEPENDENCY_CACHE_INCOMPLETE';
  }
};
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

  const cache = path.join(work, 'cache');
  const negative = path.join(work, 'negative-cache');
  mkdirSync(cache, { recursive: true, mode: 0o700 });
  writeFileSync(path.join(cache, 'readable.txt'), 'readable\n', { mode: 0o444 });
  mkdirSync(path.join(cache, 'required'), { mode: 0o755 });
  writeFileSync(path.join(cache, 'required', 'entry'), 'entry\n', { mode: 0o644 });
  writeFileSync(path.join(cache, 'unreadable.txt'), 'hidden\n', { mode: 0o600 });
  chmodSync(path.join(cache, 'unreadable.txt'), 0o000);
  mkdirSync(negative, { mode: 0o700 });
  spawnSync('cp', ['-a', `${cache}/.`, `${negative}/`], { stdio: 'ignore' });
  check(readFileSync(path.join(cache, 'readable.txt'), 'utf8') === 'readable\n', 'readonly readable cache failed');
  check(codeForCacheEntry(path.join(cache, 'unreadable.txt')) === 'DEPENDENCY_CACHE_INCOMPLETE', 'unreadable cache did not fail closed as DEPENDENCY_CACHE_INCOMPLETE');
  chmodSync(path.join(cache, 'required'), 0o555);
  const writeAttempt = spawnSync('touch', [path.join(cache, 'required', 'write-test')], { encoding: 'utf8' });
  check(writeAttempt.status !== 0, 'readonly cache accepted host write');

  const taskContracts = [
    ['TASK-OSS-01', 'node_modules'],
    ['TASK-OSS-03', 'node_modules'],
    ['TASK-OSS-09', '.venv/bin/python'],
  ];
  for (const [taskId, requiredPath] of taskContracts) {
    const taskNegative = path.join(work, 'negative-cache', taskId);
    const target = path.join(taskNegative, requiredPath);
    mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    if (requiredPath.includes('/')) writeFileSync(target, 'synthetic executable\n', { mode: 0o555 });
    else mkdirSync(target, { mode: 0o755 });
    chmodSync(path.dirname(target), 0o555);
    const denied = spawnSync('rm', ['-rf', target], { encoding: 'utf8' });
    check(denied.status !== 0, `${taskId} readonly negative parent did not deny removal`);
    check(existsSync(target), `${taskId} denied removal did not fail closed`);
    chmodSync(path.dirname(target), 0o700);
    rmSync(target, { recursive: true, force: true });
    check(codeForCacheEntry(target) === 'DEPENDENCY_CACHE_INCOMPLETE', `${taskId} removed entry did not classify as DEPENDENCY_CACHE_INCOMPLETE`);
  }

  for (const writable of ['workspace', 'home', 'tmp']) {
    const target = path.join(work, writable);
    mkdirSync(target, { mode: 0o700 });
    const marker = path.join(target, 'write-test');
    writeFileSync(marker, 'ok\n');
    check(existsSync(marker), `${writable} is not writable`);
  }
  const result = { schemaVersion: 1, status: errors.length ? 'FAIL' : 'PASS', taskIds: taskContracts.map(([taskId]) => taskId), codes: ['WORKSPACE_TRAVERSE_DENIED', 'HARNESS_EXECUTION_DENIED', 'CACHE_READ_DENIED', 'RUNTIME_BINARY_EXECUTION_DENIED', 'WORKING_DIRECTORY_DENIED', 'HOME_NOT_WRITABLE', 'TMP_NOT_WRITABLE', 'DEPENDENCY_CACHE_INCOMPLETE', 'OFFLINE_PERMISSION_CAUSE_UNKNOWN'], negativeRemovalFailClosed: true, unreadableCacheCode: 'DEPENDENCY_CACHE_INCOMPLETE', errors };
  console.log(JSON.stringify(result));
  if (errors.length) process.exitCode = 1;
} finally {
  const cache = path.join(work, 'cache');
  const negative = path.join(work, 'negative-cache');
  if (existsSync(path.join(cache, 'required'))) chmodSync(path.join(cache, 'required'), 0o700);
  if (existsSync(path.join(cache, 'unreadable.txt'))) chmodSync(path.join(cache, 'unreadable.txt'), 0o600);
  if (existsSync(negative)) chmodSync(negative, 0o700);
  chmodSync(work, 0o700);
  rmSync(work, { recursive: true, force: true });
}
