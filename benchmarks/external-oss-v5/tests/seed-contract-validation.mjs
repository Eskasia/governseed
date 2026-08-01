import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const v5Root = path.join(repoRoot, 'benchmarks/external-oss-v5');
const taskIds = ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09'];
const sha1 = /^[0-9a-f]{40}$/u;
const sha256 = /^[0-9a-f]{64}$/u;
const errors = [];
const checks = [];
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const hashFile = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const assert = (condition, message) => {
  checks.push(message);
  if (!condition) errors.push(message);
};

const schema = readJson(path.join(v5Root, 'schemas/task-seed-identity.schema.json'));
assert(schema.$id.includes('external-oss-v5'), 'schema id is V5');
assert(schema.properties.schemaVersion.const === 5, 'schema pins version 5');

const contracts = taskIds.map((taskId) => {
  const file = path.join(v5Root, 'tasks', taskId, 'task-seed-identity.json');
  assert(existsSync(file), taskId + ' contract exists');
  return readJson(file);
});

for (const contract of contracts) {
  const prefix = contract.taskId;
  for (const field of ['schemaVersion', 'benchmarkId', 'evidenceClass', 'taskId', 'repository', 'upstreamRepositoryUrl', 'upstreamBaseCommit', 'upstreamFixCommit', 'sealedSeedCommit', 'sealedSeedGitTree', 'sealedSeedTreeSha256', 'taskBriefSha256', 'hiddenOracleSha256', 'reconstruction']) {
    assert(Object.hasOwn(contract, field), prefix + ' has ' + field);
  }
  assert(contract.schemaVersion === 5, prefix + ' schemaVersion=5');
  assert(contract.benchmarkId === 'GS-OSS-2026-08-01-V5', prefix + ' benchmark id');
  assert(contract.evidenceClass === 'external-observational', prefix + ' evidence class');
  assert(sha1.test(contract.upstreamBaseCommit), prefix + ' upstream base SHA');
  assert(sha1.test(contract.upstreamFixCommit), prefix + ' upstream fix SHA');
  assert(contract.upstreamBaseReachable === true && contract.upstreamFixReachable === true, prefix + ' upstream reachability');
  assert(sha1.test(contract.sealedSeedCommit) && sha1.test(contract.sealedSeedGitTree), prefix + ' sealed identities');
  assert(sha256.test(contract.sealedSeedTreeSha256) && sha256.test(contract.taskBriefSha256) && sha256.test(contract.hiddenOracleSha256), prefix + ' SHA-256 fields');
  assert(contract.reconstruction.status === 'PASS', prefix + ' reconstruction PASS');
  assert(contract.reconstruction.sealedCommitStableAcrossTwoReconstructions === true, prefix + ' commit determinism');
  assert(contract.reconstruction.sealedGitTreeStableAcrossTwoReconstructions === true, prefix + ' Git tree determinism');
  assert(contract.reconstruction.sealedTreeSha256StableAcrossTwoReconstructions === true, prefix + ' file hash determinism');
  if (contract.seedOverlayPath === null) {
    assert(contract.seedOverlaySha256 === null, prefix + ' null overlay has null hash');
  } else {
    const overlay = path.join(repoRoot, contract.seedOverlayPath);
    assert(contract.seedOverlayPath.startsWith('benchmarks/external-oss-v5/tasks/' + prefix + '/'), prefix + ' overlay is task-local');
    assert(existsSync(overlay), prefix + ' overlay exists');
    assert(contract.seedOverlaySha256 === hashFile(overlay), prefix + ' overlay hash matches');
  }
}

assert(new Set(contracts.map((contract) => contract.taskId)).size === taskIds.length, 'task IDs are unique');
assert(contracts.every((contract) => contract.sealedSeedCommit !== contract.upstreamBaseCommit), 'sealed commits are not upstream fetch targets');

const negativeCases = [
  ['missing upstream base', (value) => ({ ...value, upstreamBaseCommit: null })],
  ['short upstream fix', (value) => ({ ...value, upstreamFixCommit: 'f'.repeat(39) })],
  ['false upstream reachability', (value) => ({ ...value, upstreamBaseReachable: false })],
  ['missing sealed tree', (value) => ({ ...value, sealedSeedGitTree: null })],
  ['invalid task hash', (value) => ({ ...value, taskBriefSha256: 'not-a-sha' })],
  ['overlay hash mismatch', (value) => ({ ...value, seedOverlaySha256: '0'.repeat(64) })],
  ['overlay escapes task', (value) => ({ ...value, seedOverlayPath: 'benchmarks/external-oss-v5/README.md' })],
  ['non-deterministic reconstruction', (value) => ({ ...value, reconstruction: { ...value.reconstruction, sealedGitTreeStableAcrossTwoReconstructions: false } })],
  ['unsealed status', (value) => ({ ...value, reconstruction: { ...value.reconstruction, status: 'BLOCKED' } })],
];
const basicValid = (value) => Boolean(
  value.schemaVersion === 5 &&
  value.benchmarkId === 'GS-OSS-2026-08-01-V5' &&
  value.evidenceClass === 'external-observational' &&
  sha1.test(value.upstreamBaseCommit) &&
  sha1.test(value.upstreamFixCommit) &&
  value.upstreamBaseReachable === true &&
  value.upstreamFixReachable === true &&
  sha1.test(value.sealedSeedCommit) &&
  sha1.test(value.sealedSeedGitTree) &&
  sha256.test(value.sealedSeedTreeSha256) &&
  sha256.test(value.taskBriefSha256) &&
  sha256.test(value.hiddenOracleSha256) &&
  value.reconstruction?.status === 'PASS' &&
  value.reconstruction?.sealedGitTreeStableAcrossTwoReconstructions === true &&
  (value.seedOverlayPath === null || (
    value.seedOverlayPath?.startsWith('benchmarks/external-oss-v5/tasks/' + value.taskId + '/') &&
    sha256.test(value.seedOverlaySha256) &&
    value.seedOverlaySha256 !== '0'.repeat(64)
  )),
);
for (const item of negativeCases) {
  assert(!basicValid(item[1](structuredClone(contracts[0]))), 'negative case rejected: ' + item[0]);
}

const result = { status: errors.length === 0 ? 'PASS' : 'FAIL', checks: checks.length, errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
