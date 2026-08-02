import { readFileSync } from 'node:fs';

const schemaPath = 'benchmarks/external-oss-v8/schemas/cache-receipt.schema.json';
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const requiredSchemaKeys = [
  'workspaceExecObserved', 'workspaceMountExec', 'workspaceMountNoexec',
  'runtimeBinaryExecutionPass', 'measuredNetworkUsed', 'cacheReadOnlyObserved',
  'readonlyRootObserved', 'nonRootObserved', 'publicTestSmokePass',
  'negativeCacheMissBlocked'
];
if (!requiredSchemaKeys.every((key) => schema.required.includes(key))) {
  throw new Error('V8 receipt schema is missing required containment fields');
}

const file = process.argv[2];
if (!file) {
  console.log(JSON.stringify({ schemaVersion: 1, status: 'PASS', schema: schemaPath }));
  process.exit(0);
}

const receipt = JSON.parse(readFileSync(file, 'utf8'));
const required = ['schemaVersion', 'benchmarkId', 'evidenceClass', 'taskId', 'status', ...requiredSchemaKeys];
const missing = required.filter((key) => !(key in receipt));
if (missing.length) throw new Error(`receipt missing required fields: ${missing.join(',')}`);
if (receipt.schemaVersion !== 1 || receipt.benchmarkId !== 'GS-OSS-2026-08-02-V8' || receipt.evidenceClass !== 'external-observational') throw new Error('receipt identity mismatch');
if (receipt.status !== 'READY') throw new Error(`receipt status is not READY: ${receipt.status}`);
for (const key of requiredSchemaKeys) if (typeof receipt[key] !== 'boolean') throw new Error(`${key} must be boolean`);
if (receipt.measuredNetworkUsed !== false || receipt.workspaceMountExec !== true || receipt.workspaceMountNoexec !== false) throw new Error('mount/network contract failed');
if (receipt.negativeCode !== 'DEPENDENCY_CACHE_INCOMPLETE' || receipt.negativeExitCode !== 42) throw new Error('negative cache contract failed');
if (receipt.cacheBinaryCommitted !== false || receipt.credentialIncluded !== false || receipt.codexIncluded !== false || receipt.hiddenOracleIncluded !== false) throw new Error('artifact containment contract failed');
if (receipt.taskId === 'TASK-OSS-01' && (!receipt.vitestResolvedPath || receipt.vitestVersionProbePass !== true || receipt.vitestSmokePass !== true)) throw new Error('Immich executable contract failed');
if (receipt.taskId === 'TASK-OSS-09' && (receipt.libmagicLibraryObserved !== true || receipt.libmagicDatabaseObserved !== true || receipt.pythonMagicImportPass !== true || receipt.pythonMagicFunctionalSmokePass !== true)) throw new Error('Paperless libmagic contract failed');
console.log(JSON.stringify({ schemaVersion: 1, status: 'PASS', file }));
