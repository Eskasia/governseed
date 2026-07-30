import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  compileArgs,
  makeProject,
  runCli,
  sha256,
} from './helpers.mjs';

/**
 * Milestone 4 generalizes the compiler's single-target assumption. These values
 * were measured on main@158abb4, before any of that work, and exist so the
 * refactor cannot quietly change what the codex target emits.
 *
 * The receipt is pinned by identity rather than by bytes: identity is derived
 * from inputs and is stable, while the receipt records when it was written and
 * therefore differs on every run.
 */
const GOLDEN = Object.freeze({
  policyId: 'POL-7C0E73297E0E',
  compileId: 'COMPILE-D9DDD3C417B4',
  policyPath: '.agent-governance/policies/POL-7C0E73297E0E.json',
  policySha256:
    '18edf50ee16c40776fd2eff6f3ff25ddb8c4d2018200a118cec8a99a09c0f5de',
  adapterPath: '.agent-governance/adapters/codex/POL-7C0E73297E0E.json',
  adapterSha256:
    '23a66e9ff97fe0b8f48b37c8c40720e0bd553e1362aa6a6f80e1535ae188833c',
});

function compileBaseFixture(t) {
  const state = makeProject(t, 'codex-identity');
  const result = runCli(state, compileArgs(state.project));
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return state.project;
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
