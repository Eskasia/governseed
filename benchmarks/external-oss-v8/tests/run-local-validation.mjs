import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { execFileSync } from 'node:child_process';

const root = 'benchmarks/external-oss-v8/control/G0/local-validation';
mkdirSync(root, { recursive: true });
const records = [];

function run(id, command, args, options = {}) {
  const startedAt = new Date().toISOString();
  const started = Date.now();
  const result = spawnSync(command, args, { encoding: 'utf8', env: { ...process.env, ...options.env } });
  const endedAt = new Date().toISOString();
  const stdout = result.stdout ?? '';
  const stderr = result.stderr ?? '';
  writeFileSync(`${root}/${id}.stdout.log`, stdout);
  writeFileSync(`${root}/${id}.stderr.log`, stderr);
  records.push({
    id,
    command: [command, ...args],
    startedAt,
    endedAt,
    durationMs: Date.now() - started,
    exitCode: result.status,
    status: result.status === 0 ? 'PASS' : 'FAIL'
  });
  return result.status;
}

if (existsSync('package-lock.json') || existsSync('npm-shrinkwrap.json')) {
  run('npm-ci', 'npm', ['ci']);
} else {
  writeFileSync(`${root}/npm-ci.stdout.log`, 'NOT_APPLICABLE_NO_LOCKFILE\n');
  writeFileSync(`${root}/npm-ci.stderr.log`, 'NOT_APPLICABLE_NO_LOCKFILE\n');
  records.push({ id: 'npm-ci', command: ['npm', 'ci'], status: 'NOT_APPLICABLE_NO_LOCKFILE' });
}

const commands = [
  ['npm-check', 'npm', ['run', 'check']],
  ['npm-validate', 'npm', ['run', 'validate']],
  ['npm-test-governance', 'npm', ['run', 'test:governance']],
  ['npm-test-privacy', 'npm', ['run', 'test:privacy']],
  ['npm-test-experimental', 'npm', ['run', 'test:experimental']],
  ['npm-ci-script', 'npm', ['run', 'ci']],
  ['v8-contract-validation', 'node', ['benchmarks/external-oss-v8/tests/v8-contract-validation.mjs']],
  ['v8-schema-validation', 'node', ['benchmarks/external-oss-v8/tests/v8-schema-validation.mjs']],
  ['v8-runtime-shell-validation', 'node', ['benchmarks/external-oss-v8/tests/v8-runtime-shell-validation.mjs']],
  ['yaml-parse', 'ruby', ['-e', 'require "yaml"; YAML.load_file(".github/workflows/external-oss-v8-dependency-cache.yml"); puts "YAML_PASS"']]
];
for (const [id, command, args] of commands) run(id, command, args);

const docker = spawnSync('docker', ['info'], { encoding: 'utf8' });
writeFileSync(`${root}/docker-info.stdout.log`, docker.stdout ?? '');
writeFileSync(`${root}/docker-info.stderr.log`, docker.stderr ?? '');
records.push({
  id: 'docker-info',
  command: ['docker', 'info'],
  exitCode: docker.status,
  status: docker.status === 0 ? 'PASS' : 'EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE'
});

const gitCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const npmVersion = execFileSync('npm', ['--version'], { encoding: 'utf8' }).trim();
const nodeVersion = process.version;
const summary = {
  schemaVersion: 1,
  benchmarkId: 'GS-OSS-2026-08-02-V8',
  evidenceClass: 'external-observational',
  status: records.some((x) => x.status === 'FAIL') ? 'FAIL' : 'READY_FOR_REVIEW',
  gitCommit,
  nodeVersion,
  npmVersion,
  packageLock: existsSync('package-lock.json') || existsSync('npm-shrinkwrap.json') ? 'PRESENT' : 'NOT_APPLICABLE_NO_LOCKFILE',
  commands: records,
  runtimeIntegration: docker.status === 0 ? 'NOT_RUN_BY_THIS_LOCAL_VALIDATION' : 'EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE',
  claimBoundary: 'Local/static V8 validation only; Docker runtime, cross-run artifact download, offline smoke, negative cache, Sol acceptance, merge, dispatch, G1, G2, Pilot, scoring, and benchmark outcome are not claimed.'
};
writeFileSync(`${root}/local-validation.json`, JSON.stringify(summary, null, 2) + '\n');
console.log(JSON.stringify(summary, null, 2));
if (summary.status === 'FAIL') process.exit(1);
