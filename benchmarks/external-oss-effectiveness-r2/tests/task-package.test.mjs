import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

const ROOT = 'benchmarks/external-oss-effectiveness-r2';
const TASK_IDS = Array.from({ length: 8 }, (_, index) => `TASK-OSS-${index + 11}`);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const clone = (value) => structuredClone(value);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const fileSha256 = (path) => sha256(readFileSync(path));
const schema = readJson(`${ROOT}/task-package.schema.json`);
const contract = readJson(`${ROOT}/experiment-contract.json`);
const packages = TASK_IDS.map((taskId) => readJson(`${ROOT}/tasks/${taskId}/task-package.json`));

function resolveRef(root, reference) {
  assert.match(reference, /^#\//u);
  return reference.slice(2).split('/').reduce((value, key) => value[key], root);
}

function matchesType(type, value) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function validate(node, value, root = schema, at = '$', errors = []) {
  if (node.$ref) return validate(resolveRef(root, node.$ref), value, root, at, errors);
  if (node.oneOf) {
    const matches = node.oneOf.filter((candidate) => validate(candidate, value, root, at, []).length === 0);
    if (matches.length !== 1) errors.push(`${at}:oneOf`);
    return errors;
  }
  if (Object.hasOwn(node, 'const') && !Object.is(node.const, value)) errors.push(`${at}:const`);
  if (node.enum && !node.enum.includes(value)) errors.push(`${at}:enum`);
  if (node.type && !matchesType(node.type, value)) {
    errors.push(`${at}:type`);
    return errors;
  }
  if (typeof value === 'string') {
    if (node.minLength !== undefined && value.length < node.minLength) errors.push(`${at}:minLength`);
    if (node.pattern && !new RegExp(node.pattern, 'u').test(value)) errors.push(`${at}:pattern`);
  }
  if (typeof value === 'number') {
    if (node.minimum !== undefined && value < node.minimum) errors.push(`${at}:minimum`);
    if (node.maximum !== undefined && value > node.maximum) errors.push(`${at}:maximum`);
  }
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

function semanticErrors(values) {
  const errors = [];
  const contractTasks = new Map(contract.taskSets.confirmatory.tasks.map((item) => [item.taskId, item.repository]));
  const unique = (selector, label) => {
    const selected = values.map(selector);
    if (new Set(selected).size !== selected.length) errors.push(`duplicate:${label}`);
  };
  unique((item) => item.taskId, 'taskId');
  unique((item) => item.repository, 'repository');
  unique((item) => item.seed.sealedSeedCommit, 'seed');
  unique((item) => item.publicTest.sha256, 'publicTest');
  unique((item) => item.hiddenOracle.sha256, 'hiddenOracle');
  for (const item of values) {
    if (contractTasks.get(item.taskId) !== item.repository) errors.push(`${item.taskId}:contractIdentity`);
    if (item.seed.sealedSeedCommit !== item.upstream.baseCommit) errors.push(`${item.taskId}:seedCommit`);
    if (item.publicTest.parent.commit !== item.upstream.baseCommit) errors.push(`${item.taskId}:publicParent`);
    if (item.publicTest.fix.commit !== item.upstream.fixCommit) errors.push(`${item.taskId}:publicFix`);
    if (item.hiddenOracle.parent.commit !== item.upstream.baseCommit) errors.push(`${item.taskId}:oracleParent`);
    if (item.hiddenOracle.fix.commit !== item.upstream.fixCommit) errors.push(`${item.taskId}:oracleFix`);
    if (fileSha256(item.publicTask.path) !== item.publicTask.sha256) errors.push(`${item.taskId}:taskHash`);
    if (fileSha256(item.publicTest.path) !== item.publicTest.sha256) errors.push(`${item.taskId}:publicTestHash`);
    if (sha256(JSON.stringify(item.publicTest.command)) !== item.publicTest.commandIdentitySha256) errors.push(`${item.taskId}:publicCommandHash`);
    const policy = { allowOnly: item.pathPolicy.allowOnly, allowedPaths: item.pathPolicy.allowedPaths, forbiddenPaths: item.pathPolicy.forbiddenPaths };
    if (sha256(JSON.stringify(policy)) !== item.pathPolicy.sha256) errors.push(`${item.taskId}:pathPolicyHash`);
    if (item.publicTest.sha256 === item.hiddenOracle.sha256) errors.push(`${item.taskId}:oracleExposed`);
    if (item.reconstruction.runs.some((run) => run.sealedSeedCommit !== item.seed.sealedSeedCommit || run.sealedSeedGitTree !== item.seed.sealedSeedGitTree || run.sealedSeedTreeSha256 !== item.seed.sealedSeedTreeSha256)) errors.push(`${item.taskId}:reconstruction`);
    const names = readdirSync(`${ROOT}/tasks/${item.taskId}`).sort();
    if (names.length !== 3 || !names.includes('task-package.json')) errors.push(`${item.taskId}:surface`);
  }
  return errors;
}

test('task-package schema is recursively closed', () => {
  const visit = (node, at) => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'object') assert.equal(node.additionalProperties, false, at);
    for (const [key, value] of Object.entries(node)) visit(value, `${at}.${key}`);
  };
  visit(schema, '$');
});

test('all eight R2 confirmatory packages validate and bind immutable identities', () => {
  assert.deepEqual(packages.map((item) => item.taskId), TASK_IDS);
  for (const item of packages) assert.deepEqual(validate(schema, item), [], item.taskId);
  assert.deepEqual(semanticErrors(packages), []);
});

test('public and hidden tests are independently parent-red and fix-green', () => {
  for (const item of packages) {
    assert.deepEqual([item.publicTest.parent.status, item.publicTest.parent.exitCode], ['FAIL_EXPECTED', 1]);
    assert.deepEqual([item.publicTest.fix.status, item.publicTest.fix.exitCode], ['PASS', 0]);
    assert.deepEqual([item.hiddenOracle.parent.status, item.hiddenOracle.parent.exitCode], ['FAIL_EXPECTED', 1]);
    assert.deepEqual([item.hiddenOracle.fix.status, item.hiddenOracle.fix.exitCode], ['PASS', 0]);
    assert.equal(item.hiddenOracle.runnerOwned, true);
    assert.equal(item.hiddenOracle.sourceCommitted, false);
    assert.equal(item.hiddenOracle.exposedToExecutionAgent, false);
  }
});

test('schema rejects missing and unexpected task, seed, test, oracle, and path fields', () => {
  for (const path of [
    ['taskId'], ['seed', 'sealedSeedCommit'], ['publicTest', 'sha256'],
    ['hiddenOracle', 'sha256'], ['pathPolicy', 'sha256'],
  ]) {
    const value = clone(packages[0]);
    const parent = path.slice(0, -1).reduce((entry, key) => entry[key], value);
    delete parent[path.at(-1)];
    assert.notEqual(validate(schema, value).length, 0, path.join('.'));
  }
  const unexpected = clone(packages[0]);
  unexpected.hiddenOracle.rawSource = 'forbidden';
  assert.notEqual(validate(schema, unexpected).length, 0);
});

test('semantic validation rejects duplicates, mismatches, exposure, and path-policy drift', () => {
  const duplicate = clone(packages);
  duplicate[1].taskId = duplicate[0].taskId;
  assert.ok(semanticErrors(duplicate).includes('duplicate:taskId'));

  const mismatched = clone(packages);
  mismatched[0].seed.sealedSeedCommit = mismatched[1].seed.sealedSeedCommit;
  assert.ok(semanticErrors(mismatched).includes('TASK-OSS-11:seedCommit'));

  const exposed = clone(packages);
  exposed[0].hiddenOracle.sha256 = exposed[0].publicTest.sha256;
  assert.ok(semanticErrors(exposed).includes('TASK-OSS-11:oracleExposed'));

  const drifted = clone(packages);
  drifted[0].pathPolicy.allowedPaths.push('tests/**');
  assert.ok(semanticErrors(drifted).includes('TASK-OSS-11:pathPolicyHash'));
});

test('R1 evidence cannot enter the R2 package surface', () => {
  const combined = [schema, ...packages].map((value) => JSON.stringify(value)).join('\n');
  assert.doesNotMatch(combined, /GS-OSS-2026-08-05-EFFECT-R1/u);
  assert.equal(contract.supersession.poolEvidenceAcrossRevisions, false);
  assert.equal(contract.supersession.r1Executed, false);
});

test('committed package surface contains no private oracle source, local path, or credential', () => {
  const combined = TASK_IDS.flatMap((taskId) => readdirSync(`${ROOT}/tasks/${taskId}`).map((name) => readFileSync(`${ROOT}/tasks/${taskId}/${name}`, 'utf8'))).join('\n');
  assert.doesNotMatch(combined, /\/Users\//u);
  assert.doesNotMatch(combined, /BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u);
  assert.doesNotMatch(combined, /\bsk-[A-Za-z0-9_-]{20,}/u);
  for (const item of packages) assert.equal(combined.includes(item.hiddenOracle.sha256), true);
});
