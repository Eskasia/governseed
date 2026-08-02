import { statSync } from 'node:fs';
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
console.log(JSON.stringify({ schemaVersion: 1, status: 'PASS', files }));
