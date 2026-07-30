import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  compileArgs,
  makeProject,
  objectSha256,
  parseSingleJson,
  readJson,
  runCli,
  sha256,
} from './helpers.mjs';

/**
 * Milestone 4 generalizes the compiler's single-target assumption. These values
 * were measured before that work — the compile values on main@158abb4 and the
 * materialize and attest values on main@d5e31be — and exist so the refactor
 * cannot quietly change what the codex target emits.
 *
 * Two artifacts are pinned by identity or by hash-minus-timestamp rather than by
 * bytes. Identity is derived from inputs and is stable; the receipt also records
 * when it was written and therefore differs on every run.
 */
const GOLDEN = Object.freeze({
  policyId: 'POL-7C0E73297E0E',
  compileId: 'COMPILE-D9DDD3C417B4',
  materializeId: 'MAT-8A61A5A3E08D',
  policyPath: '.agent-governance/policies/POL-7C0E73297E0E.json',
  policySha256:
    '18edf50ee16c40776fd2eff6f3ff25ddb8c4d2018200a118cec8a99a09c0f5de',
  adapterPath: '.agent-governance/adapters/codex/POL-7C0E73297E0E.json',
  adapterSha256:
    '23a66e9ff97fe0b8f48b37c8c40720e0bd553e1362aa6a6f80e1535ae188833c',
  targetConfigPath: '.codex/config.toml',
  targetConfigSha256:
    '82f84ec2a413906f38fe15c94322f89f28639aa2d7793c394e3a61e92e44d42a',
  receiptPath: '.agent-governance/receipts/MAT-8A61A5A3E08D.json',
  receiptSha256WithoutTimestamp:
    '81b78b92279829a83be16ec53910606694c0cdc1fd1f3dce536f38ea63696a50',
  attestSha256:
    '7eead5b182119b454ba66a2eacdaa42f42004b52e7d898be2796409bfb45519f',
});

function targetArgs(name, project) {
  return [name, project, '--target', 'codex', '--json'];
}

function compileBaseFixture(t) {
  const state = makeProject(t, 'codex-identity');
  const result = runCli(state, compileArgs(state.project));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return state.project;
}

function materializeBaseFixture(t) {
  const state = makeProject(t, 'codex-identity');
  for (const args of [compileArgs(state.project), targetArgs('materialize', state.project)]) {
    const result = runCli(state, args);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  return state;
}

function readArtifact(project, relative) {
  const file = path.join(project, ...relative.split('/'));
  assert.ok(fs.existsSync(file), `${relative} must exist after compile`);
  return fs.readFileSync(file, 'utf8');
}

test('the codex policy artifact is byte-identical to the pinned baseline', (t) => {
  const project = compileBaseFixture(t);
  assert.equal(
    sha256(readArtifact(project, GOLDEN.policyPath)),
    GOLDEN.policySha256,
    'the compiled policy changed; a target generalization must not alter it',
  );
});

test('the codex adapter artifact is byte-identical to the pinned baseline', (t) => {
  const project = compileBaseFixture(t);
  assert.equal(
    sha256(readArtifact(project, GOLDEN.adapterPath)),
    GOLDEN.adapterSha256,
    'the codex adapter changed; a target generalization must not alter it',
  );
});

test('content-addressed identities still resolve to the same artifacts', (t) => {
  const project = compileBaseFixture(t);
  const governance = path.join(project, '.agent-governance');
  assert.deepEqual(
    fs.readdirSync(path.join(governance, 'policies')).sort(),
    [`${GOLDEN.policyId}.json`],
  );
  assert.deepEqual(
    fs.readdirSync(path.join(governance, 'adapters/codex')).sort(),
    [`${GOLDEN.policyId}.json`],
  );
  assert.deepEqual(
    fs.readdirSync(path.join(governance, 'receipts')).sort(),
    [`${GOLDEN.compileId}.json`],
    'the compile receipt identity is derived from inputs and must not drift',
  );
});

test('the materialized codex config is byte-identical to the pinned baseline', (t) => {
  const { project } = materializeBaseFixture(t);
  assert.equal(
    sha256(readArtifact(project, GOLDEN.targetConfigPath)),
    GOLDEN.targetConfigSha256,
    'the emitted codex config changed; a target generalization must not alter it',
  );
});

test('the codex materialize receipt keeps its identity and its content', (t) => {
  const { project } = materializeBaseFixture(t);
  const receipt = readJson(path.join(project, ...GOLDEN.receiptPath.split('/')));
  assert.equal(receipt.materializeId, GOLDEN.materializeId);
  // materializedAt is a wall-clock stamp, so it is the one field excluded.
  // Everything else, including every control classification, stays pinned.
  const { materializedAt, ...pinned } = receipt;
  assert.equal(typeof materializedAt, 'string');
  assert.equal(
    objectSha256(pinned),
    GOLDEN.receiptSha256WithoutTimestamp,
    'the codex materialize receipt changed outside its timestamp',
  );
});

test('the codex attestation output is unchanged', (t) => {
  const state = materializeBaseFixture(t);
  const output = parseSingleJson(
    runCli(state, targetArgs('attest', state.project)),
    0,
  );
  assert.equal(
    objectSha256(output.result),
    GOLDEN.attestSha256,
    'the codex attestation changed; caveats and limitations are part of the claim',
  );
});
