import { readFileSync } from 'node:fs';
import path from 'node:path';

const file = process.argv[2];
if (!file) {
  console.error('usage: node dependency-cache-receipt-validation.mjs <receipt.json>');
  process.exit(2);
}
const receipt = JSON.parse(readFileSync(path.resolve(file), 'utf8'));
const errors = [];
const assert = (condition, message) => {
  if (!condition) errors.push(message);
};
const sha256 = (value) => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const taskIds = new Set(['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09']);
assert(receipt.schemaVersion === 1, 'schemaVersion=1');
assert(receipt.benchmarkId === 'GS-OSS-2026-08-01-V5', 'benchmark id');
assert(receipt.evidenceClass === 'external-observational', 'evidence class');
assert(taskIds.has(receipt.taskId), 'fixed task id');
for (const field of ['cacheSha256', 'manifestSha256', 'cacheFilesSha256']) assert(sha256(receipt[field]), `${field} sha256`);
assert(receipt.runtimeIdentity && typeof receipt.runtimeIdentity === 'object', 'runtime identity');
assert(receipt.preparationNetworkUsed === true, 'preparation network recorded');
assert(receipt.measuredNetworkUsed === false, 'offline network recorded');
assert(receipt.publicTestSmokePass === true, 'public smoke pass');
assert(receipt.negativeCacheMissBlocked === true, 'negative cache miss blocked');
assert(receipt.cacheReadOnlyObserved === true, 'cache read-only observed');
for (const field of ['networkNone', 'readonlyRoot', 'capDropAll', 'noNewPrivileges', 'nonRootUser', 'limitsObserved']) {
  assert(receipt.containmentObserved?.[field] === true, `containment ${field}`);
}
for (const field of ['lockfileModified', 'credentialIncluded', 'fallbackDownload']) assert(receipt[field] === false, `${field}=false`);
assert(receipt.status === 'READY', 'receipt READY');
assert(Array.isArray(receipt.limitations) && receipt.limitations.length > 0, 'limitations recorded');
const result = { status: errors.length === 0 ? 'PASS' : 'FAIL', errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
