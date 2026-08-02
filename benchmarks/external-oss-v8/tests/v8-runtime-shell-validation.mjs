import { readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const files = [
  'benchmarks/external-oss-v8/minimal-noexec-reproducer.sh',
  'benchmarks/external-oss-v8/tests/v8-runtime-contract.sh',
  'benchmarks/external-oss-v8/tests/v8-offline-smoke.sh'
];
for (const file of files) {
  const result = spawnSync('bash', ['-n', file], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${file}: ${result.stderr}`);
  if ((statSync(file).mode & 0o111) === 0) throw new Error(`${file} is not executable`);
}
const runtimeContract = readFileSync('benchmarks/external-oss-v8/tests/v8-runtime-contract.sh', 'utf8');
for (const [target, receipt] of [
  ['/workspace', '/workspace/workspace-mount.txt'],
  ['/cache', '/workspace/cache-mount.txt'],
  ['/home/benchmark', '/workspace/home-mount.txt'],
  ['/tmp', '/workspace/tmp-mount.txt']
]) {
  if (!runtimeContract.includes(`mount_options ${target} ${receipt}`)) {
    throw new Error(`${target} mount observation must be written below /workspace`);
  }
}
for (const [target, receipt] of [
  ['/workspace', '/workspace-mount.txt'],
  ['/cache', '/cache-mount.txt'],
  ['/home/benchmark', '/home-mount.txt'],
  ['/tmp', '/tmp-mount.txt']
]) {
  if (runtimeContract.includes(`mount_options ${target} ${receipt}`)) {
    throw new Error(`mount observation must not target the read-only root: ${receipt}`);
  }
}
console.log(JSON.stringify({ schemaVersion: 1, status: 'PASS', files }));
