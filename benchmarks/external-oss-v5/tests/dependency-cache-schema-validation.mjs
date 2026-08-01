import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const v5Root = path.join(repoRoot, 'benchmarks/external-oss-v5');
const taskIds = ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09'];
const errors = [];
const checks = [];
const assert = (condition, message) => {
  checks.push(message);
  if (!condition) errors.push(message);
};
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const hashFile = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const sha256 = /^[0-9a-f]{64}$/u;

const schema = readJson(path.join(v5Root, 'schemas/dependency-cache-receipt.schema.json'));
assert(schema.$schema === 'https://json-schema.org/draft/2020-12/schema', 'receipt schema uses draft 2020-12');
assert(schema.properties.status.enum.includes('READY'), 'receipt schema has READY status');
assert(schema.required.includes('negativeCacheMissBlocked'), 'receipt schema requires negative cache result');
assert(schema.required.includes('containmentObserved'), 'receipt schema requires containment evidence');

for (const taskId of taskIds) {
  const cachePath = path.join(v5Root, 'dependency-cache', taskId, 'cache-contract.json');
  const receiptPath = path.join(v5Root, 'dependency-cache', taskId, 'cache-receipt.template.json');
  const taskPath = path.join(v5Root, 'tasks', taskId, 'task-seed-identity.json');
  const cache = readJson(cachePath);
  const receipt = readJson(receiptPath);
  const task = readJson(taskPath);
  assert(cache.schemaVersion === 1, `${taskId} cache contract version`);
  assert(cache.benchmarkId === 'GS-OSS-2026-08-01-V5', `${taskId} cache benchmark id`);
  assert(cache.evidenceClass === 'external-observational', `${taskId} cache evidence class`);
  assert(cache.taskId === taskId, `${taskId} cache task id`);
  assert(cache.taskSeedContractSha256 === hashFile(taskPath), `${taskId} task contract hash`);
  assert(cache.upstreamBaseCommit === task.upstreamBaseCommit, `${taskId} upstream base binding`);
  assert(cache.sealedSeedCommit === task.sealedSeedCommit, `${taskId} sealed commit binding`);
  assert(cache.sealedSeedTreeSha256 === task.sealedSeedTreeSha256, `${taskId} sealed tree hash binding`);
  assert(cache.cacheFormat === 'tar.gz', `${taskId} cache format`);
  assert(cache.cacheMutation === false, `${taskId} cache mutation disabled`);
  assert(cache.networkPolicy.preparation === 'public-network-only', `${taskId} preparation network policy`);
  assert(cache.networkPolicy.measured === 'none', `${taskId} measured network policy`);
  assert(cache.networkPolicy.fallbackDownload === false, `${taskId} fallback download disabled`);
  assert(cache.status === 'NOT_RUN', `${taskId} cache contract remains NOT_RUN`);
  assert(cache.requiredCacheEntries.length > 0, `${taskId} required cache entries`);
  assert(receipt.status === 'NOT_RUN', `${taskId} receipt template remains NOT_RUN`);
  for (const field of ['cacheSha256', 'manifestSha256', 'cacheFilesSha256', 'preparationNetworkUsed', 'measuredNetworkUsed', 'publicTestSmokePass', 'negativeCacheMissBlocked', 'cacheReadOnlyObserved', 'containmentObserved', 'lockfileModified', 'credentialIncluded', 'fallbackDownload']) {
    assert(receipt[field] === null, `${taskId} receipt template has null ${field}`);
  }
  assert(receipt.runtimeIdentity && typeof receipt.runtimeIdentity === 'object', `${taskId} receipt template runtime identity placeholder`);
  assert(receipt.taskSeedContractSha256 === cache.taskSeedContractSha256, `${taskId} receipt template task contract hash`);
  assert(receipt.limitations.length > 0, `${taskId} receipt template limitations`);
  assert(!JSON.stringify(receipt).match(/READY|:true/iu), `${taskId} receipt template cannot imply qualification`);
  assert(sha256.test(cache.sealedSeedTreeSha256), `${taskId} cache sealed hash shape`);
}

const result = { status: errors.length === 0 ? 'PASS' : 'FAIL', checks: checks.length, errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
