import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = 'benchmarks/external-oss-effectiveness-r2';
const TASK_ROOT = `${ROOT}/tasks`;
const TASK_IDS = Array.from({ length: 8 }, (_, index) => `TASK-OSS-${index + 11}`);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileSha256 = (path) => sha256(readFileSync(path));
const clone = (value) => structuredClone(value);
const schema = readJson(`${ROOT}/execution-agent-surface.schema.json`);
const surface = readJson(`${ROOT}/execution-agent-surface.json`);
const packages = TASK_IDS.map((taskId) => readJson(`${TASK_ROOT}/${taskId}/task-package.json`));
const trackedTaskPaths = execFileSync('git', ['ls-files', '-z', '--', TASK_ROOT], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .sort();

function resolveRef(root, reference) {
  assert.match(reference, /^#\//u);
  return reference.slice(2).split('/').reduce((value, key) => value[key], root);
}

function matchesType(type, value) {
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function validate(node, value, root = schema, at = '$', errors = []) {
  if (node.$ref) return validate(resolveRef(root, node.$ref), value, root, at, errors);
  if (Object.hasOwn(node, 'const') && !Object.is(node.const, value)) errors.push(`${at}:const`);
  if (node.type && !matchesType(node.type, value)) {
    errors.push(`${at}:type`);
    return errors;
  }
  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${at}:minLength`);
    if (node.pattern && !new RegExp(node.pattern, 'u').test(value)) errors.push(`${at}:pattern`);
  }
  if (typeof value === 'number' && node.minimum !== undefined && value < node.minimum) errors.push(`${at}:minimum`);
  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) errors.push(`${at}:minItems`);
    if (node.maxItems !== undefined && value.length > node.maxItems) errors.push(`${at}:maxItems`);
    if (node.uniqueItems && new Set(value.map((entry) => JSON.stringify(entry))).size !== value.length) errors.push(`${at}:uniqueItems`);
    value.forEach((entry, index) => validate(node.items ?? {}, entry, root, `${at}[${index}]`, errors));
  }
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const required of node.required ?? []) {
      if (!Object.hasOwn(value, required)) errors.push(`${at}.${required}:required`);
    }
    for (const [key, entry] of Object.entries(value)) {
      if (node.properties?.[key]) validate(node.properties[key], entry, root, `${at}.${key}`, errors);
      else if (node.additionalProperties === false) errors.push(`${at}.${key}:additionalProperties`);
    }
  }
  return errors;
}

function separationErrors(candidateSurface, candidatePackages, candidateTrackedPaths) {
  const errors = [];
  const tracked = new Set(candidateTrackedPaths);
  const packageByTask = new Map(candidatePackages.map((item) => [item.taskId, item]));
  for (const taskId of candidateSurface.taskIds) {
    const item = packageByTask.get(taskId);
    if (!item) {
      errors.push(`${taskId}:packageMissing`);
      continue;
    }
    const taskPrefix = `${TASK_ROOT}/${taskId}/`;
    const taskPaths = candidateTrackedPaths.filter((path) => path.startsWith(taskPrefix));
    if (taskPaths.length !== candidateSurface.taskDirectoryContract.trackedFilesPerTask) errors.push(`${taskId}:trackedSurfaceCount`);
    if (!tracked.has(item.publicTask.path)) errors.push(`${taskId}:publicTaskUntracked`);
    if (!tracked.has(item.publicTest.path)) errors.push(`${taskId}:publicTestUntracked`);
    if (tracked.has(item.publicTask.path) && fileSha256(item.publicTask.path) !== item.publicTask.sha256) errors.push(`${taskId}:publicTaskHash`);
    if (tracked.has(item.publicTest.path) && fileSha256(item.publicTest.path) !== item.publicTest.sha256) errors.push(`${taskId}:publicTestHash`);
    if (item.publicTask.path !== `${taskPrefix}public-task.md`) errors.push(`${taskId}:publicTaskRebound`);
    if (!new RegExp(`^${taskPrefix}public-test\\.(?:py|cjs|ts)$`, 'u').test(item.publicTest.path)) errors.push(`${taskId}:publicTestRebound`);
    const hiddenKeys = Object.keys(item.hiddenOracle).sort();
    const allowedHiddenKeys = [
      'commandIdentitySha256', 'exposedToExecutionAgent', 'fix', 'identitySeparatedFromPublicTest',
      'parent', 'runnerOwned', 'sha256', 'sourceCommitted',
    ].sort();
    if (JSON.stringify(hiddenKeys) !== JSON.stringify(allowedHiddenKeys)) errors.push(`${taskId}:hiddenFields`);
    if (item.hiddenOracle.runnerOwned !== true) errors.push(`${taskId}:hiddenOwner`);
    if (item.hiddenOracle.sourceCommitted !== false) errors.push(`${taskId}:hiddenSourceCommitted`);
    if (item.hiddenOracle.exposedToExecutionAgent !== false) errors.push(`${taskId}:hiddenExposed`);
    if (item.hiddenOracle.identitySeparatedFromPublicTest !== true) errors.push(`${taskId}:hiddenIdentitySeparation`);
    if (item.hiddenOracle.sha256 === item.publicTest.sha256) errors.push(`${taskId}:hiddenPublicCollision`);
  }
  for (const pattern of candidateSurface.forbiddenTrackedPathPatterns) {
    if (candidateTrackedPaths.some((path) => new RegExp(pattern, 'u').test(path))) errors.push(`forbiddenTrackedPath:${pattern}`);
  }
  return errors;
}

test('execution-agent surface schema is recursively closed', () => {
  const visit = (node, at) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') assert.equal(node.additionalProperties, false, at);
    for (const [key, value] of Object.entries(node)) visit(value, `${at}.${key}`);
  };
  visit(schema, '$');
  assert.deepEqual(validate(schema, surface), []);
});

test('surface binds the canonical merged task set and accepted review', () => {
  assert.deepEqual(surface.taskIds, TASK_IDS);
  assert.equal(surface.sourceMainSha, '220c2d8d816194eb77da94e182258a0875202f3b');
  assert.equal(surface.sourceMainTreeSha, '31dc203b0bb1af2d1546a9f9df676fa945dde792');
  assert.equal(surface.taskPackageSchemaSha256, fileSha256(`${ROOT}/task-package.schema.json`));
  assert.equal(surface.experimentContractSha256, fileSha256(`${ROOT}/experiment-contract.json`));
  assert.equal(surface.reviewBinding.reviewedTreeSha, surface.reviewBinding.mergeTreeSha);
  assert.equal(surface.visibility.hiddenOracleMetadata.hashOnly, true);
});

test('all eight tracked task surfaces expose public artifacts and retain hidden metadata only', () => {
  assert.equal(trackedTaskPaths.length, 24);
  assert.deepEqual(separationErrors(surface, packages, trackedTaskPaths), []);
});

test('separation fails closed on public drift, rebinding, hidden injection, exposure, or extra tracked files', () => {
  const untracked = trackedTaskPaths.filter((path) => path !== packages[0].publicTask.path);
  assert.ok(separationErrors(surface, packages, untracked).includes('TASK-OSS-11:publicTaskUntracked'));

  const drifted = clone(packages);
  drifted[0].publicTest.sha256 = '0'.repeat(64);
  assert.ok(separationErrors(surface, drifted, trackedTaskPaths).includes('TASK-OSS-11:publicTestHash'));

  const rebound = clone(packages);
  rebound[0].publicTask = clone(rebound[1].publicTask);
  assert.ok(separationErrors(surface, rebound, trackedTaskPaths).includes('TASK-OSS-11:publicTaskRebound'));

  const injected = clone(packages);
  injected[0].hiddenOracle.source = 'forbidden';
  assert.ok(separationErrors(surface, injected, trackedTaskPaths).includes('TASK-OSS-11:hiddenFields'));

  const exposed = clone(packages);
  exposed[0].hiddenOracle.exposedToExecutionAgent = true;
  assert.ok(separationErrors(surface, exposed, trackedTaskPaths).includes('TASK-OSS-11:hiddenExposed'));

  const extra = [...trackedTaskPaths, `${TASK_ROOT}/TASK-OSS-11/hidden-oracle.py`];
  const extraErrors = separationErrors(surface, packages, extra);
  assert.ok(extraErrors.includes('TASK-OSS-11:trackedSurfaceCount'));
  assert.ok(extraErrors.some((error) => error.startsWith('forbiddenTrackedPath:')));
});

test('tracked task surface contains no local path, credential, or private key', () => {
  const combined = trackedTaskPaths.map((path) => readFileSync(path, 'utf8')).join('\n');
  assert.doesNotMatch(combined, /\/Users\//u);
  assert.doesNotMatch(combined, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u);
  assert.doesNotMatch(combined, /\bsk-[A-Za-z0-9_-]{20,}/u);
});
