import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  compileArgs,
  makeProject,
  parseSingleJson,
  readJson,
  runCli,
} from './helpers.mjs';

/**
 * The claude target compiles before it materializes. Registration and
 * materializability are separate in the target registry precisely so a target
 * can land in this state, and these contracts pin that state: compile produces
 * a claude adapter, and materialize refuses rather than writing codex output
 * under a claude flag.
 */
const POLICY_ID = 'POL-7C0E73297E0E';

function claudeArgs(name, project, ...extra) {
  return [name, project, '--target', 'claude', ...extra, '--json'];
}

function compileForClaude(t) {
  const state = makeProject(t, 'claude-compile');
  const result = runCli(state, claudeArgs('compile', state.project));
  return { state, result };
}

test('compile accepts the claude target', (t) => {
  const { result } = compileForClaude(t);
  const output = parseSingleJson(result, 0);
  assert.equal(output.ok, true);
});

test('the claude adapter lands in its own target directory', (t) => {
  const { state } = compileForClaude(t);
  const adapterPath = path.join(
    state.project,
    '.agent-governance/adapters/claude',
    `${POLICY_ID}.json`,
  );
  assert.ok(
    fs.existsSync(adapterPath),
    'a claude compile must not write into the codex adapter directory',
  );
  const adapter = readJson(adapterPath);
  assert.equal(adapter.target, 'claude');
  assert.equal(adapter.ownership.artifactType, 'claude-policy-adapter');
  assert.deepEqual(
    adapter.generatedFiles.sort(),
    [
      `.agent-governance/adapters/claude/${POLICY_ID}.json`,
      `.agent-governance/policies/${POLICY_ID}.json`,
    ],
  );
});

test('the claude adapter reports root-write and network as unsupported', (t) => {
  const { state } = compileForClaude(t);
  const adapter = readJson(path.join(
    state.project,
    '.agent-governance/adapters/claude',
    `${POLICY_ID}.json`,
  ));
  const unsupported = new Map(
    (adapter.unsupportedControls ?? []).map((entry) => [entry.capability, entry]),
  );
  for (const capability of ['filesystem.root-write', 'network']) {
    assert.ok(
      unsupported.has(capability),
      `${capability} has no verified project-layer key for claude and must be reported unsupported`,
    );
  }
  const mapped = (adapter.mappedControls ?? []).map((entry) => entry.capability);
  assert.equal(mapped.includes('network'), false);
});

test('compiling for claude does not disturb the codex adapter directory', (t) => {
  const state = makeProject(t, 'claude-compile');
  for (const args of [compileArgs(state.project), claudeArgs('compile', state.project)]) {
    assert.equal(runCli(state, args).status, 0);
  }
  const adapters = path.join(state.project, '.agent-governance/adapters');
  assert.deepEqual(fs.readdirSync(adapters).sort(), ['claude', 'codex']);
  for (const target of ['claude', 'codex']) {
    assert.deepEqual(
      fs.readdirSync(path.join(adapters, target)).sort(),
      [`${POLICY_ID}.json`],
    );
  }
});

test('materialize refuses the claude target while it has no materializer', (t) => {
  const { state } = compileForClaude(t);
  const output = parseSingleJson(
    runCli(state, claudeArgs('materialize', state.project)),
    2,
  );
  assert.equal(output.code, 'CLI_TARGET_UNSUPPORTED');
  assert.equal(
    fs.existsSync(path.join(state.project, '.claude/settings.json')),
    false,
    'a refused materialize must write nothing',
  );
});
