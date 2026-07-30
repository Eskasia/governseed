import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import {
  compileArgs,
  makeProject,
  parseSingleJson,
  readJson,
  ROOT,
  runCli,
} from './helpers.mjs';
import {
  REGISTERED_TARGETS,
  targetDefinition,
} from '../../scripts/lib/target-registry.mjs';

/**
 * The claude target compiles before it materializes. Registration and
 * materializability are separate in the target registry precisely so a target
 * can land in this state, and these contracts pin that state: compile produces
 * a claude adapter, and materialize refuses rather than writing codex output
 * under a claude flag.
 *
 * The policy identity is not pinned here. A manifest records the support map of
 * the target it was compiled for, so two targets over the same governed inputs
 * are two different documents with two different content-addressed ids. Reading
 * the id back from the directory is the assertion that stays true.
 */
function claudeArgs(name, project, ...extra) {
  return [name, project, '--target', 'claude', ...extra, '--json'];
}

function compileForClaude(t) {
  const state = makeProject(t, 'claude-compile');
  const result = runCli(state, claudeArgs('compile', state.project));
  return { state, result };
}

function soleAdapter(project, target) {
  const directory = path.join(project, '.agent-governance/adapters', target);
  assert.ok(
    fs.existsSync(directory),
    `compile must create .agent-governance/adapters/${target}`,
  );
  const entries = fs.readdirSync(directory).sort();
  assert.equal(entries.length, 1, `expected one ${target} adapter`);
  return {
    policyId: entries[0].replace(/\.json$/u, ''),
    value: readJson(path.join(directory, entries[0])),
  };
}

test('compile accepts the claude target', (t) => {
  const { result } = compileForClaude(t);
  const output = parseSingleJson(result, 0);
  assert.equal(output.ok, true);
});

test('the claude adapter lands in its own target directory', (t) => {
  const { state } = compileForClaude(t);
  assert.equal(
    fs.existsSync(path.join(state.project, '.agent-governance/adapters/codex')),
    false,
    'a claude compile must not write into the codex adapter directory',
  );
  const { policyId, value: adapter } = soleAdapter(state.project, 'claude');
  assert.equal(adapter.target, 'claude');
  assert.equal(adapter.policyId, policyId);
  assert.equal(adapter.ownership.artifactType, 'claude-policy-adapter');
  assert.deepEqual(
    adapter.generatedFiles.sort(),
    [
      `.agent-governance/adapters/claude/${policyId}.json`,
      `.agent-governance/policies/${policyId}.json`,
    ],
  );
});

test('the claude adapter reports root-write and network as unsupported', (t) => {
  const { state } = compileForClaude(t);
  const { value: adapter } = soleAdapter(state.project, 'claude');
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
  const claude = soleAdapter(state.project, 'claude');
  const codex = soleAdapter(state.project, 'codex');
  assert.notEqual(
    claude.policyId,
    codex.policyId,
    'a manifest carries its target support map, so the two ids must differ',
  );
  assert.deepEqual(
    fs.readdirSync(path.join(state.project, '.agent-governance/policies')).sort(),
    [`${claude.policyId}.json`, `${codex.policyId}.json`].sort(),
  );
});

test('the shared schemas admit every registered target', () => {
  const shared = {
    'policy-manifest.schema.json': [
      (schema) => Object.keys(schema.$defs.targetSupport.properties),
      (schema) => schema.$defs.target.properties.target.enum,
      (schema) => schema.$defs.unsupportedControl.properties.target.enum,
    ],
    'compile-receipt.schema.json': [
      (schema) => schema.properties.target.enum,
      (schema) => schema.$defs.unsupportedControl.properties.target.enum,
    ],
  };
  for (const [name, readers] of Object.entries(shared)) {
    const schema = readJson(path.join(ROOT, 'schemas', name));
    for (const read of readers) {
      assert.deepEqual(
        [...read(schema)].sort(),
        [...REGISTERED_TARGETS].sort(),
        `${name} drifted from the target registry`,
      );
    }
  }
  for (const target of REGISTERED_TARGETS) {
    assert.ok(
      fs.existsSync(path.join(
        ROOT,
        'schemas',
        targetDefinition(target).adapterSchema,
      )),
      `${target} names an adapter schema that does not exist`,
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
