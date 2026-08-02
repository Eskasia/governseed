import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const outputRoot = path.join(repoRoot, 'benchmarks/external-oss-v7/control/G0/local-validation');
mkdirSync(outputRoot, { recursive: true, mode: 0o755 });
const commands = [
  ['v7-contract-validation', 'node benchmarks/external-oss-v7/tests/v7-contract-validation.mjs'],
  ['v7-runtime-image-static', 'node benchmarks/external-oss-v7/tests/v7-runtime-image-static.mjs'],
  ['v7-dockerfile-static', 'node benchmarks/external-oss-v7/tests/v7-dockerfile-static.mjs'],
  ['v7-shell-validation', 'node benchmarks/external-oss-v7/tests/v7-shell-validation.mjs'],
  ['yaml-parse', "ruby -e 'require \"yaml\"; ARGV.each { |f| YAML.load_file(f); puts \"YAML_PASS #{f}\" }' .github/workflows/external-oss-v7-runtime-image.yml .github/workflows/external-oss-v7-dependency-cache.yml"],
  ['npm-check', 'npm run check'],
  ['npm-validate', 'npm run validate'],
  ['npm-test-governance', 'npm run test:governance'],
  ['npm-test-privacy', 'npm run test:privacy'],
  ['npm-test-experimental', 'npm run test:experimental'],
  ['npm-ci', 'npm run ci'],
];
const results = [];
for (const [id, command] of commands) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const child = spawnSync('bash', ['-lc', command], { cwd: repoRoot, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  const durationMs = Date.now() - started;
  const stdout = child.stdout ?? '';
  const stderr = child.stderr ?? '';
  writeFileSync(path.join(outputRoot, `${id}.stdout.log`), stdout.replace(/\n+$/u, '\n'));
  writeFileSync(path.join(outputRoot, `${id}.stderr.log`), stderr.replace(/\n+$/u, '\n'));
  const output = `${stdout}\n${stderr}`;
  const testCount = [...output.matchAll(/(?:tests|test|pass|passed|PASS)\D+(\d+)/giu)].map((match) => Number(match[1])).filter(Number.isFinite).at(-1) ?? null;
  results.push({ id, command, startedAt, endedAt: new Date().toISOString(), exitCode: child.status ?? 1, signal: child.signal, status: child.status === 0 ? 'PASS' : 'FAIL', testCount, durationMs, peakRssBytes: null });
}
const docker = spawnSync('docker', ['info'], { cwd: repoRoot, encoding: 'utf8' });
const dockerAvailable = docker.status === 0;
const payload = {
  schemaVersion: 1,
  benchmarkId: 'GS-OSS-2026-08-02-V7',
  evidenceClass: 'external-observational',
  phase: 'G0',
  status: results.every((result) => result.status === 'PASS') && !dockerAvailable ? 'READY_FOR_REVIEW' : results.every((result) => result.status === 'PASS') ? 'READY_FOR_REVIEW' : 'BLOCKED',
  node: process.version,
  npm: execFileSync('npm', ['--version'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  gitCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
  packageLock: existsSync(path.join(repoRoot, 'package-lock.json')) ? 'present' : 'NOT_APPLICABLE_NO_LOCKFILE',
  docker: dockerAvailable ? 'AVAILABLE' : 'EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE',
  commands: results,
  claimBoundary: 'Local/static V7 validation only. Docker runtime image, dependency cache, offline smoke, negative cache, Sol acceptance, merge, and G1 acceptance are not claimed by this file.'
};
writeFileSync(path.join(repoRoot, 'benchmarks/external-oss-v7/control/G0/local-validation.json'), JSON.stringify(payload, null, 2) + '\n');
console.log(JSON.stringify(payload));
if (results.some((result) => result.status !== 'PASS')) process.exitCode = 1;
