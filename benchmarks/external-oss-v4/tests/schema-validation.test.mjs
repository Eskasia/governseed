import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaNames = [
  'pilot-lock.schema.json',
  'confirmatory-lock.schema.json',
  'runner-preflight.schema.json',
  'run-record.schema.json',
  'inherited-evidence.schema.json',
];

for (const name of schemaNames) {
  JSON.parse(await readFile(path.join(root, 'schemas', name), 'utf8'));
}
const blockedReceipt = JSON.parse(await readFile(path.join(root, 'runner', 'preflight-receipt.json'), 'utf8'));
assert.equal(blockedReceipt.status, 'BLOCKED');
assert.equal(blockedReceipt.evidenceClass, 'external-observational');
assert.equal(blockedReceipt.claimDisposition, 'NOT_EVALUATED');

const hash = 'a'.repeat(64);
const sha = 'b'.repeat(40);
const repositoryNames = ['immich-app/immich', 'louislam/uptime-kuma', 'paperless-ngx/paperless-ngx'];

function repository(index, overrides = {}) {
  return {
    id: `OSS-${String(index + 1).padStart(2, '0')}`,
    repository: repositoryNames[index % repositoryNames.length],
    seedTreeSha256: hash,
    seedCommitSha: sha,
    taskId: `TASK-OSS-${String(index + 1).padStart(2, '0')}`,
    taskSha256: hash,
    publicTestCommandSha256: hash,
    hiddenOracleSha256: hash,
    dependencyCacheSha256: hash,
    allowedPaths: ['src/**'],
    forbiddenPaths: ['.git/**'],
    timeoutSeconds: 2700,
    tokenCeiling: 150000,
    ...overrides,
  };
}

function pilot(repositories = repositoryNames.map((_, index) => repository(index)), overrides = {}) {
  return {
    schemaVersion: 1,
    benchmarkType: 'exploratory-pilot',
    benchmarkId: 'GS-OSS-2026-08-01-V4',
    evidenceClass: 'external-observational',
    repositories,
    repetitionsPerArm: 3,
    arms: ['baseline', 'governed'],
    expectedRunCount: 18,
    ...overrides,
  };
}

function validatePilot(lock) {
  if (lock.schemaVersion !== 1 || lock.benchmarkType !== 'exploratory-pilot' || lock.benchmarkId !== 'GS-OSS-2026-08-01-V4') return false;
  if (lock.evidenceClass !== 'external-observational' || lock.repetitionsPerArm !== 3 || lock.expectedRunCount !== 18) return false;
  if (JSON.stringify(lock.arms) !== JSON.stringify(['baseline', 'governed'])) return false;
  if (lock.repositories.length !== 3) return false;
  if (new Set(lock.repositories.map(({ id }) => id)).size !== 3) return false;
  if (new Set(lock.repositories.map(({ taskId }) => taskId)).size !== 3) return false;
  if (new Set(lock.repositories.map(({ repository }) => repository)).size !== 3) return false;
  return lock.repositories.every((item) => /^[0-9a-f]{64}$/.test(item.hiddenOracleSha256));
}

function validateConfirmatory(lock) {
  return lock.benchmarkType === 'confirmatory' && lock.repositories.length >= 8 && lock.repositories.length <= 10;
}

const cases = [];
function expectPass(name, value) { assert.equal(value, true, name); cases.push({ name, status: 'PASS' }); }
function expectFail(name, value) { assert.equal(value, false, name); cases.push({ name, status: 'EXPECTED_FAIL' }); }

expectPass('three repositories pass Pilot lock', validatePilot(pilot()));
expectFail('two repositories fail Pilot lock', validatePilot(pilot(pilot().repositories.slice(0, 2))));
expectFail('four repositories fail Pilot lock', validatePilot(pilot([...pilot().repositories, repository(3)])));
expectFail('duplicate repository ID fails Pilot lock', validatePilot(pilot([repository(0), repository(0, { repository: repositoryNames[1] }), repository(2)])));
expectFail('duplicate task ID fails Pilot lock', validatePilot(pilot([repository(0), repository(1, { taskId: 'TASK-OSS-01' }), repository(2)])));
expectFail('missing oracle hash fails Pilot lock', validatePilot(pilot([repository(0, { hiddenOracleSha256: undefined }), repository(1), repository(2)])));
expectFail('expectedRunCount other than 18 fails Pilot lock', validatePilot(pilot(undefined, { expectedRunCount: 12 })));
expectFail('ten repositories fail Pilot lock', validatePilot(pilot(Array.from({ length: 10 }, (_, index) => repository(index)))));
expectPass('eight repositories pass Confirmatory shape', validateConfirmatory({ benchmarkType: 'confirmatory', repositories: Array.from({ length: 8 }, (_, index) => repository(index)) }));
expectFail('three repositories fail Confirmatory shape', validateConfirmatory({ benchmarkType: 'confirmatory', repositories: [repository(0), repository(1), repository(2)] }));

console.log(JSON.stringify({ status: 'PASS', schemaFilesParsed: schemaNames.length, cases }, null, 2));
