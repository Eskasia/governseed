import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

import {
  buildMinimalEnv,
  runChildSafely,
} from '../../scripts/lib/governance-impact-adapters.mjs';
import { scanPrivacyBuffer } from '../../scripts/governance-impact-eval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RUNTIMES = ['codex', 'claude', 'antigravity'];
const SCRIPT_PATHS = Object.freeze({
  codex: path.join(ROOT, 'scripts/runtime-smoke-codex.mjs'),
  claude: path.join(ROOT, 'scripts/runtime-smoke-claude.mjs'),
  antigravity: path.join(ROOT, 'scripts/runtime-smoke-antigravity.mjs'),
});
const ARTIFACT_NAMES = Object.freeze({
  codex: 'codex-first-response.txt',
  claude: 'claude-first-response.json',
  antigravity: 'antigravity-first-response.txt',
});

const CLAUDE_RESPONSE = Object.freeze({
  files_read: ['START_HERE.md', 'AGENTS.md', 'CLAUDE.md'],
  fixed_docs_present: [
    'README.md',
    'PROJECT_BRIEF.md',
    'SPEC.md',
    'CONTEXT.md',
    'TASK_CONTRACT.md',
    'OPEN_LOOPS.md',
    'AGENTS.md',
    'TECH_STACK.md',
  ],
  conditional_docs_likely_needed: ['UI_SPEC.md', 'DATA_MODEL.md'],
  blockers: ['Q1-Q9 intake is not complete.'],
});

const VALID_OUTPUTS = Object.freeze({
  codex: [
    'FILES_READ:',
    '- START_HERE.md',
    '- AGENTS.md',
    'FIXED_DOCS:',
    '- README.md',
    '- PROJECT_BRIEF.md',
    '- SPEC.md',
    '- CONTEXT.md',
    '- TASK_CONTRACT.md',
    '- OPEN_LOOPS.md',
    '- AGENTS.md',
    '- TECH_STACK.md',
    'CONDITIONAL_DOCS:',
    '- UI_SPEC.md',
    '- DATA_MODEL.md',
    'BLOCKERS:',
    '- Q1-Q9 intake is not complete.',
    '',
  ].join('\n'),
  claude: `${JSON.stringify(CLAUDE_RESPONSE, null, 2)}\n`,
  antigravity: [
    'SKILL_USED: intake-audit',
    'FILES_READ:',
    '- START_HERE.md',
    '- AGENTS.md',
    '- .agents/AGENTS.md',
    'BLOCKERS:',
    '- Q1-Q9 intake is not complete.',
    'NEXT_INTAKE_QUESTION:',
    'Q1. 這個東西要解決誰的什麼問題？',
    '',
  ].join('\n'),
});

let modulePromise;

function loadRuntimeModules() {
  modulePromise ??= Promise.all(
    RUNTIMES.map(async (runtime) => [
      runtime,
      await import(pathToFileURL(SCRIPT_PATHS[runtime]).href),
    ]),
  ).then((entries) => Object.fromEntries(entries));
  return modulePromise;
}

function temporaryDirectory(t, prefix = 'runtime-proof-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function copyStarter(t) {
  const sandbox = temporaryDirectory(t, 'runtime-proof-validator-');
  const starter = path.join(sandbox, 'starter');
  fs.cpSync(ROOT, starter, {
    recursive: true,
    filter(source) {
      const relative = path.relative(ROOT, source);
      return relative !== '.git' && !relative.startsWith(`.git${path.sep}`);
    },
  });
  return starter;
}

function runRuntimeProofValidator(starter) {
  return spawnSync(process.execPath, [
    path.join(starter, 'scripts/validate-runtime-proof.mjs'),
    starter,
  ], {
    cwd: starter,
    encoding: 'utf8',
    shell: false,
  });
}

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write(value) { stdout += String(value); } },
      stderr: { write(value) { stderr += String(value); } },
    },
    read() {
      return { stdout, stderr };
    },
  };
}

function childResult(stdout = '', stderr = '') {
  return {
    status: 'completed',
    errorCode: null,
    exitCode: 0,
    signal: null,
    stdout,
    stderr,
    wallTimeMs: 1,
  };
}

function artifactPath(outputRoot, runtime) {
  return path.join(outputRoot, `runtime-${runtime}`, ARTIFACT_NAMES[runtime]);
}

function snapshotArtifact(file) {
  const stat = fs.lstatSync(file);
  return {
    bytes: fs.readFileSync(file),
    ino: stat.ino,
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

function assertArtifactUnchanged(file, before) {
  const after = snapshotArtifact(file);
  assert.deepEqual(after.bytes, before.bytes);
  assert.equal(after.ino, before.ino);
  assert.equal(after.size, before.size);
  assert.equal(after.mtimeMs, before.mtimeMs);
}

function snapshotDefaultArtifacts() {
  const snapshot = {};
  for (const runtime of RUNTIMES) {
    const directory = path.join(ROOT, `.tmp/runtime-${runtime}`);
    if (!fs.existsSync(directory)) {
      snapshot[runtime] = null;
      continue;
    }
    const entries = [];
    const visit = (current, relative = '') => {
      const stat = fs.lstatSync(current);
      entries.push([
        relative || '.',
        stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'dir' : 'file',
        String(stat.ino),
        stat.size,
        stat.mtimeMs,
      ]);
      if (!stat.isDirectory()) return;
      for (const name of fs.readdirSync(current).sort()) {
        visit(path.join(current, name), path.join(relative, name));
      }
    };
    visit(directory);
    snapshot[runtime] = entries;
  }
  return snapshot;
}

async function runWithSyntheticReal(t, runtime, rawOutput, options = {}) {
  const modules = await loadRuntimeModules();
  assert.equal(typeof modules[runtime].main, 'function');
  const root = temporaryDirectory(t, `runtime-proof-${runtime}-`);
  const outputRoot = path.join(root, 'artifacts');
  const workParent = path.join(root, 'work');
  fs.mkdirSync(workParent);
  const capture = captureIo();
  const calls = [];
  const resolved = [];
  const executable = path.join(root, `synthetic-${runtime}-runtime`);
  const runChildSafely = options.runChildSafely ?? (async (command, args, childOptions) => {
    calls.push({ command, args, options: childOptions });
    return calls.length === 1
      ? childResult(options.initStdout ?? '', options.initStderr ?? '')
      : childResult(rawOutput, options.runtimeStderr ?? '');
  });
  const dependencies = {
    io: capture.io,
    runChildSafely,
    resolveRuntimeExecutable(selectedRuntime, env) {
      resolved.push({ runtime: selectedRuntime, env });
      return executable;
    },
    runtimeCapabilities() {
      return {
        available: true,
        noSessionPersistence: true,
        workspaceOnly: true,
        processTree: true,
      };
    },
    proveDetachedDescendantContainment() {
      return true;
    },
    makeTempDir(prefix) {
      return fs.mkdtempSync(path.join(workParent, prefix));
    },
    ...options.dependencies,
  };
  const exitCode = await modules[runtime].main({
    real: true,
    outputRoot,
    env: {
      PATH: process.env.PATH ?? '',
      RUNTIME_PROOF_REAL: '1',
      CANARY_ENV_SECRET: 'CANARY_ENV_MUST_NOT_REACH_CHILD',
    },
  }, dependencies);
  return {
    exitCode,
    outputRoot,
    workParent,
    artifact: artifactPath(outputRoot, runtime),
    calls,
    resolved,
    output: capture.read(),
  };
}

function assertNoCanaryInTree(root, canary) {
  if (!fs.existsSync(root)) return;
  const visit = (current) => {
    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) return;
    if (stat.isDirectory()) {
      for (const name of fs.readdirSync(current)) visit(path.join(current, name));
      return;
    }
    assert.equal(fs.readFileSync(current).includes(Buffer.from(canary)), false);
  };
  visit(root);
}

test('importing runtime smoke modules has no console or filesystem side effect', async (t) => {
  const before = snapshotDefaultArtifacts();
  const imports = RUNTIMES
    .map((runtime) => `import(${JSON.stringify(pathToFileURL(SCRIPT_PATHS[runtime]).href)})`)
    .join(',');
  const environmentRoot = temporaryDirectory(t, 'runtime-proof-import-');
  const home = path.join(environmentRoot, 'home');
  const tmp = path.join(environmentRoot, 'tmp');
  fs.mkdirSync(home);
  fs.mkdirSync(tmp);
  const result = await runChildSafely(process.execPath, [
    '--input-type=module',
    '--eval',
    `await Promise.all([${imports}]);`,
  ], {
    cwd: ROOT,
    env: buildMinimalEnv('synthetic', { home, tmp }),
    privacyScanner: scanPrivacyBuffer,
    realExecution: false,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.deepEqual(snapshotDefaultArtifacts(), before);
});

test('all runtime smoke modules export main and exclude shell child runners', async () => {
  const modules = await loadRuntimeModules();
  for (const runtime of RUNTIMES) {
    assert.equal(typeof modules[runtime].main, 'function');
    const source = fs.readFileSync(SCRIPT_PATHS[runtime], 'utf8');
    assert.match(source, /\brunChildSafely\b/u);
    assert.doesNotMatch(source, /\b(?:spawnSync|execSync|commandExists)\b/u);
    assert.doesNotMatch(source, /(?:^|['"`\s])command(?:['"`\s]|$)[\s\S]{0,40}-v/u);
    assert.doesNotMatch(source, /\bwhere\b/u);
  }
});

test('all three real-path seams use the shared runner, direct resolver, and minimal environment', async (t) => {
  for (const runtime of RUNTIMES) {
    const result = await runWithSyntheticReal(t, runtime, VALID_OUTPUTS[runtime]);

    assert.equal(result.exitCode, 0);
    assert.equal(result.calls.length, 2);
    assert.equal(result.calls[1].command.endsWith(`synthetic-${runtime}-runtime`), true);
    assert.ok(Array.isArray(result.calls[1].args));
    assert.equal(result.calls[1].options.env.CANARY_ENV_SECRET, undefined);
    assert.equal(result.resolved.length, 1);
    assert.equal(result.resolved[0].runtime, runtime);
    assert.equal(fs.readFileSync(result.artifact, 'utf8'), VALID_OUTPUTS[runtime]);
    assert.equal(result.output.stderr, '');
    assert.equal(result.output.stdout, `${runtime} runtime smoke: PASS\n`);
  }
});

test('mock mode is deterministic and never resolves or invokes a real runtime', async (t) => {
  const modules = await loadRuntimeModules();
  for (const runtime of RUNTIMES) {
    const root = temporaryDirectory(t, `runtime-proof-mock-${runtime}-`);
    const workParent = path.join(root, 'work');
    fs.mkdirSync(workParent);
    const calls = [];
    const dependencies = {
      io: captureIo().io,
      async runChildSafely(command, args, options) {
        calls.push({ command, args, options });
        return childResult();
      },
      resolveRuntimeExecutable() {
        assert.fail('mock mode must not resolve a runtime executable');
      },
      makeTempDir(prefix) {
        return fs.mkdtempSync(path.join(workParent, prefix));
      },
    };
    const outputRoot = path.join(root, 'artifacts');

    assert.equal(await modules[runtime].main({ real: false, outputRoot }, dependencies), 0);
    assert.equal(
      fs.readFileSync(artifactPath(outputRoot, runtime), 'utf8'),
      VALID_OUTPUTS[runtime],
    );
    const beforeRerun = snapshotArtifact(artifactPath(outputRoot, runtime));
    assert.equal(await modules[runtime].main({ real: false, outputRoot }, dependencies), 0);
    assert.equal(calls.length, 2);
    assertArtifactUnchanged(artifactPath(outputRoot, runtime), beforeRerun);
  }
});

test('a concurrent publisher loser never removes the winner artifact', async (t) => {
  const modules = await loadRuntimeModules();
  const root = temporaryDirectory(t, 'runtime-proof-concurrent-');
  const outputRoot = path.join(root, 'artifacts');
  const firstWorkRoot = path.join(root, 'first-work');
  const secondWorkRoot = path.join(root, 'second-work');
  fs.mkdirSync(firstWorkRoot);
  fs.mkdirSync(secondWorkRoot);
  const firstCapture = captureIo();
  const secondCapture = captureIo();
  let firstRunnerEntered;
  const firstEntered = new Promise((resolve) => {
    firstRunnerEntered = resolve;
  });
  let releaseFirst;
  const firstBarrier = new Promise((resolve) => {
    releaseFirst = resolve;
  });
  let firstRunnerCalls = 0;
  let secondRunnerCalls = 0;

  const firstRun = modules.codex.main({ real: false, outputRoot }, {
    io: firstCapture.io,
    async runChildSafely() {
      firstRunnerCalls += 1;
      firstRunnerEntered();
      await firstBarrier;
      return childResult();
    },
    makeTempDir(prefix) {
      return fs.mkdtempSync(path.join(firstWorkRoot, prefix));
    },
  });
  await firstEntered;

  const secondExitCode = await modules.codex.main({ real: false, outputRoot }, {
    io: secondCapture.io,
    async runChildSafely() {
      secondRunnerCalls += 1;
      return childResult();
    },
    makeTempDir(prefix) {
      return fs.mkdtempSync(path.join(secondWorkRoot, prefix));
    },
  });
  releaseFirst();
  const firstExitCode = await firstRun;

  assert.equal(firstExitCode, 0);
  assert.equal(secondExitCode, 3);
  assert.equal(firstRunnerCalls, 1);
  assert.equal(secondRunnerCalls, 0);
  assert.equal(
    secondCapture.read().stderr,
    'codex runtime smoke: FAIL [RUNTIME_BUSY]\n',
  );
  assert.equal(fs.readFileSync(artifactPath(outputRoot, 'codex'), 'utf8'), VALID_OUTPUTS.codex);
});

test('closed parsers reject extra JSON fields and text sections without an artifact', async (t) => {
  const cases = {
    codex: `${VALID_OUTPUTS.codex}EXTRA_SECTION:\n- unexpected\n`,
    claude: `${JSON.stringify({ ...CLAUDE_RESPONSE, extra_field: ['unexpected'] })}\n`,
    antigravity: `${VALID_OUTPUTS.antigravity}EXTRA_SECTION:\n- unexpected\n`,
  };

  for (const runtime of RUNTIMES) {
    const result = await runWithSyntheticReal(t, runtime, cases[runtime]);
    assert.equal(result.exitCode, 3);
    assert.equal(fs.existsSync(result.artifact), false);
    assert.equal(result.output.stdout, '');
    assert.equal(
      result.output.stderr,
      `${runtime} runtime smoke: FAIL [OUTPUT_SCHEMA_INVALID]\n`,
    );
  }

  const escapedDuplicate = [
    '{"files_read":["unexpected"],',
    `"files_\\u0072ead":${JSON.stringify(CLAUDE_RESPONSE.files_read)},`,
    `"fixed_docs_present":${JSON.stringify(CLAUDE_RESPONSE.fixed_docs_present)},`,
    `"conditional_docs_likely_needed":${JSON.stringify(
      CLAUDE_RESPONSE.conditional_docs_likely_needed,
    )},`,
    `"blockers":${JSON.stringify(CLAUDE_RESPONSE.blockers)}}`,
  ].join('');
  const duplicateResult = await runWithSyntheticReal(t, 'claude', escapedDuplicate);
  assert.equal(duplicateResult.exitCode, 3);
  assert.equal(fs.existsSync(duplicateResult.artifact), false);
  assert.equal(
    duplicateResult.output.stderr,
    'claude runtime smoke: FAIL [OUTPUT_SCHEMA_INVALID]\n',
  );
});

test('raw stdout and stderr privacy canaries are blocked without reflection or temp persistence', async (t) => {
  const canary = 'privacy-canary@example.invalid';
  for (const [surface, runtimeStderr] of [
    ['stdout', ''],
    ['stderr', canary],
  ]) {
    const raw = surface === 'stdout'
      ? VALID_OUTPUTS.codex.replace(
          'Q1-Q9 intake is not complete.',
          canary,
        )
      : VALID_OUTPUTS.codex;
    const result = await runWithSyntheticReal(t, 'codex', raw, { runtimeStderr });

    assert.equal(result.exitCode, 3);
    assert.equal(fs.existsSync(result.artifact), false);
    assert.equal(`${result.output.stdout}${result.output.stderr}`.includes(canary), false);
    assert.equal(
      result.output.stderr,
      'codex runtime smoke: FAIL [PRIVACY_OUTPUT_BLOCKED]\n',
    );
    assertNoCanaryInTree(result.outputRoot, canary);
    assertNoCanaryInTree(result.workParent, canary);
  }
});

test('invalid UTF-8 and combined output overflow fail closed through the shared runner', async (t) => {
  if (process.platform === 'win32') return t.skip('executable fixture permissions are POSIX-specific');
  const modules = await loadRuntimeModules();
  const cases = [
    {
      code: 'OUTPUT_SCHEMA_INVALID',
      body: 'process.stdout.write(Buffer.from([0xc3, 0x28]));\n',
    },
    {
      code: 'OUTPUT_LIMIT_EXCEEDED',
      body: 'process.stdout.write("A".repeat(65_537));\n',
    },
  ];

  for (const entry of cases) {
    const root = temporaryDirectory(t, 'runtime-proof-bytes-');
    const outputRoot = path.join(root, 'artifacts');
    const workParent = path.join(root, 'work');
    fs.mkdirSync(workParent);
    const executable = path.join(root, 'fake-runtime.mjs');
    fs.writeFileSync(executable, `#!${process.execPath}\n${entry.body}`);
    fs.chmodSync(executable, 0o700);
    const capture = captureIo();

    const exitCode = await modules.codex.main({
      real: true,
      outputRoot,
      env: { PATH: process.env.PATH ?? '', RUNTIME_PROOF_REAL: '1' },
    }, {
      io: capture.io,
      resolveRuntimeExecutable() {
        return executable;
      },
      runtimeCapabilities() {
        return {
          available: true,
          noSessionPersistence: true,
          workspaceOnly: true,
          processTree: true,
        };
      },
      proveDetachedDescendantContainment() {
        return true;
      },
      makeTempDir(prefix) {
        return fs.mkdtempSync(path.join(workParent, prefix));
      },
    });

    assert.equal(exitCode, 3);
    assert.equal(fs.existsSync(artifactPath(outputRoot, 'codex')), false);
    assert.equal(
      capture.read().stderr,
      `codex runtime smoke: FAIL [${entry.code}]\n`,
    );
  }
});

test('linked output roots and linked raw workspaces are rejected without reading environment data', async (t) => {
  if (process.platform === 'win32') return t.skip('symlink creation is privilege-dependent');
  const modules = await loadRuntimeModules();
  const root = temporaryDirectory(t, 'runtime-proof-linked-');
  const environmentRoot = path.join(root, 'environment');
  fs.mkdirSync(environmentRoot);
  const canary = 'API_KEY=CANARY_LINKED_RUNTIME_ENV';
  const environmentFile = path.join(environmentRoot, '.env');
  fs.writeFileSync(environmentFile, `${canary}\n`);
  const linkedOutputRoot = path.join(root, 'linked-output');
  fs.symlinkSync(environmentRoot, linkedOutputRoot);

  for (const surface of ['output', 'workspace']) {
    const capture = captureIo();
    const normalOutputRoot = path.join(root, `normal-${surface}`);
    const linkedWorkspace = path.join(root, `linked-workspace-${surface}`);
    if (!fs.existsSync(linkedWorkspace)) fs.symlinkSync(environmentRoot, linkedWorkspace);
    let runnerCalls = 0;
    const exitCode = await modules.codex.main({
      real: false,
      outputRoot: surface === 'output' ? linkedOutputRoot : normalOutputRoot,
    }, {
      io: capture.io,
      async runChildSafely() {
        runnerCalls += 1;
        return childResult();
      },
      makeTempDir() {
        return linkedWorkspace;
      },
    });

    assert.equal(exitCode, 3);
    assert.equal(runnerCalls, 0);
    assert.equal(`${capture.read().stdout}${capture.read().stderr}`.includes(canary), false);
    assert.equal(
      capture.read().stderr,
      'codex runtime smoke: FAIL [PATH_POLICY_BLOCKED]\n',
    );
    assert.equal(fs.readFileSync(environmentFile, 'utf8'), `${canary}\n`);
    assert.equal(fs.existsSync(artifactPath(normalOutputRoot, 'codex')), false);
  }
});

test('cleanup uncertainty prevents a new artifact', async (t) => {
  const modules = await loadRuntimeModules();
  const root = temporaryDirectory(t, 'runtime-proof-cleanup-');
  const outputRoot = path.join(root, 'artifacts');
  const workParent = path.join(root, 'work');
  fs.mkdirSync(workParent);
  let workDirectory;
  const capture = captureIo();

  const exitCode = await modules.codex.main({ real: false, outputRoot }, {
    io: capture.io,
    async runChildSafely() {
      return childResult();
    },
    makeTempDir(prefix) {
      workDirectory = fs.mkdtempSync(path.join(workParent, prefix));
      return workDirectory;
    },
    removeTree(target) {
      if (target === workDirectory) throw new Error('CANARY_CLEANUP_FAILURE');
      fs.rmSync(target, { recursive: true, force: true });
    },
  });

  assert.equal(exitCode, 3);
  assert.equal(fs.existsSync(artifactPath(outputRoot, 'codex')), false);
  assert.equal(capture.read().stdout, '');
  assert.equal(
    capture.read().stderr,
    'codex runtime smoke: FAIL [CLEANUP_FAILED]\n',
  );
  assert.equal(capture.read().stderr.includes('CANARY_CLEANUP_FAILURE'), false);
});

test('missing runtime preserves prior canonical evidence and skips capabilities and children', async (t) => {
  const modules = await loadRuntimeModules();
  const root = temporaryDirectory(t, 'runtime-proof-missing-prior-');
  const outputRoot = path.join(root, 'artifacts');
  const artifact = artifactPath(outputRoot, 'codex');
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, VALID_OUTPUTS.codex);
  const before = snapshotArtifact(artifact);
  const capture = captureIo();
  let resolverCalls = 0;
  let capabilityCalls = 0;
  let childCalls = 0;

  const exitCode = await modules.codex.main({
    real: true,
    outputRoot,
    env: { PATH: '', RUNTIME_PROOF_REAL: '1' },
  }, {
    io: capture.io,
    resolveRuntimeExecutable() {
      resolverCalls += 1;
      return null;
    },
    runtimeCapabilities() {
      capabilityCalls += 1;
      assert.fail('capabilities must not be queried without an executable');
    },
    async runChildSafely() {
      childCalls += 1;
      return childResult();
    },
  });

  assert.equal(exitCode, 4);
  assert.equal(resolverCalls, 1);
  assert.equal(capabilityCalls, 0);
  assert.equal(childCalls, 0);
  assertArtifactUnchanged(artifact, before);
  assert.equal(
    capture.read().stderr,
    'codex runtime smoke: FAIL [RUNTIME_MISSING]\n',
  );
});

test('workspace cleanup failure preserves prior canonical evidence after the expected child', async (t) => {
  const modules = await loadRuntimeModules();
  const root = temporaryDirectory(t, 'runtime-proof-cleanup-prior-');
  const outputRoot = path.join(root, 'artifacts');
  const workParent = path.join(root, 'work');
  fs.mkdirSync(workParent);
  const artifact = artifactPath(outputRoot, 'codex');
  fs.mkdirSync(path.dirname(artifact), { recursive: true });
  fs.writeFileSync(artifact, VALID_OUTPUTS.codex);
  const before = snapshotArtifact(artifact);
  const capture = captureIo();
  let workDirectory;
  let childCalls = 0;

  const exitCode = await modules.codex.main({ real: false, outputRoot }, {
    io: capture.io,
    async runChildSafely() {
      childCalls += 1;
      return childResult();
    },
    makeTempDir(prefix) {
      workDirectory = fs.mkdtempSync(path.join(workParent, prefix));
      return workDirectory;
    },
    removeTree(target) {
      if (target === workDirectory) throw new Error('CANARY_CLEANUP_FAILURE');
      fs.rmSync(target, { recursive: true, force: true });
    },
  });

  assert.equal(exitCode, 3);
  assert.equal(childCalls, 1);
  assertArtifactUnchanged(artifact, before);
  assert.equal(capture.read().stdout, '');
  assert.equal(
    capture.read().stderr,
    'codex runtime smoke: FAIL [CLEANUP_FAILED]\n',
  );
  assert.equal(capture.read().stderr.includes('CANARY_CLEANUP_FAILURE'), false);
});

test('differing, private, and oversized prior artifacts fail closed without mutation', async (t) => {
  const modules = await loadRuntimeModules();
  const cases = [
    {
      name: 'different',
      contents: Buffer.from('different normalized evidence\n'),
      code: 'ARTIFACT_EXISTS',
    },
    {
      name: 'private',
      contents: Buffer.from('privacy-canary@example.invalid\n'),
      code: 'PRIVACY_OUTPUT_BLOCKED',
    },
    {
      name: 'oversized',
      contents: Buffer.alloc(65_537, 'A'),
      code: 'OUTPUT_LIMIT_EXCEEDED',
    },
  ];

  for (const entry of cases) {
    const root = temporaryDirectory(t, `runtime-proof-prior-${entry.name}-`);
    const outputRoot = path.join(root, 'artifacts');
    const artifact = artifactPath(outputRoot, 'codex');
    fs.mkdirSync(path.dirname(artifact), { recursive: true });
    fs.writeFileSync(artifact, entry.contents);
    const before = snapshotArtifact(artifact);
    const capture = captureIo();
    let childCalls = 0;

    const exitCode = await modules.codex.main({ real: false, outputRoot }, {
      io: capture.io,
      async runChildSafely() {
        childCalls += 1;
        return childResult();
      },
    });

    assert.equal(exitCode, 3);
    assert.equal(childCalls, 1);
    assertArtifactUnchanged(artifact, before);
    assert.equal(capture.read().stdout, '');
    assert.equal(
      capture.read().stderr,
      `codex runtime smoke: FAIL [${entry.code}]\n`,
    );
    assert.equal(
      `${capture.read().stdout}${capture.read().stderr}`.includes(
        'privacy-canary@example.invalid',
      ),
      false,
    );
  }
});

test('lock cleanup removes only canonical output created by the current attempt', async (t) => {
  const modules = await loadRuntimeModules();

  for (const priorExists of [true, false]) {
    const root = temporaryDirectory(
      t,
      `runtime-proof-lock-ownership-${priorExists ? 'prior' : 'new'}-`,
    );
    const outputRoot = path.join(root, 'artifacts');
    const artifact = artifactPath(outputRoot, 'codex');
    let before = null;
    if (priorExists) {
      fs.mkdirSync(path.dirname(artifact), { recursive: true });
      fs.writeFileSync(artifact, VALID_OUTPUTS.codex);
      before = snapshotArtifact(artifact);
    }
    const capture = captureIo();
    let childCalls = 0;

    const exitCode = await modules.codex.main({ real: false, outputRoot }, {
      io: capture.io,
      async runChildSafely() {
        childCalls += 1;
        fs.writeFileSync(
          path.join(outputRoot, '.runtime-proof-codex.lock', 'cleanup-blocker'),
          'synthetic lock cleanup blocker\n',
        );
        return childResult();
      },
    });

    assert.equal(exitCode, 3);
    assert.equal(childCalls, 1);
    if (priorExists) {
      assertArtifactUnchanged(artifact, before);
    } else {
      assert.equal(fs.existsSync(artifact), false);
    }
    assert.equal(capture.read().stdout, '');
    assert.equal(
      capture.read().stderr,
      'codex runtime smoke: FAIL [CLEANUP_FAILED]\n',
    );
  }
});

test('production real mode never falls back and refuses every unresolved containment residual', async (t) => {
  const modules = await loadRuntimeModules();
  const root = temporaryDirectory(t, 'runtime-proof-containment-');
  let childCalls = 0;

  for (const runtime of RUNTIMES) {
    const outputRoot = path.join(root, runtime);
    const capture = captureIo();
    const exitCode = await modules[runtime].main({
      real: true,
      outputRoot,
      env: { PATH: process.env.PATH ?? '', RUNTIME_PROOF_REAL: '1' },
    }, {
      io: capture.io,
      resolveRuntimeExecutable() {
        return path.join(root, `synthetic-${runtime}`);
      },
      async runChildSafely() {
        childCalls += 1;
        return childResult();
      },
    });

    assert.equal(exitCode, 2);
    assert.equal(fs.existsSync(artifactPath(outputRoot, runtime)), false);
    assert.equal(
      capture.read().stderr,
      `${runtime} runtime smoke: FAIL [SESSION_SAFETY_UNAVAILABLE]\n`,
    );
  }
  assert.equal(childCalls, 0);

  const missingRoot = path.join(root, 'missing-runtime');
  const missingCapture = captureIo();
  const missingExitCode = await modules.codex.main({
    real: true,
    outputRoot: missingRoot,
    env: { PATH: '', RUNTIME_PROOF_REAL: '1' },
  }, {
    io: missingCapture.io,
    resolveRuntimeExecutable() {
      return null;
    },
    async runChildSafely() {
      childCalls += 1;
      return childResult();
    },
  });

  assert.equal(missingExitCode, 4);
  assert.equal(childCalls, 0);
  assert.equal(fs.existsSync(artifactPath(missingRoot, 'codex')), false);
  assert.equal(
    missingCapture.read().stderr,
    'codex runtime smoke: FAIL [RUNTIME_MISSING]\n',
  );
});

test('standalone runtime-proof validator requires the exact forced-mock public entrypoint', (t) => {
  const starter = copyStarter(t);
  const workflowPath = path.join(starter, '.github/workflows/runtime-proof.yml');
  const packagePath = path.join(starter, 'package.json');
  const skillPath = path.join(
    starter,
    'tests/runtime/antigravity/skill-template/SKILL.md',
  );

  const valid = runRuntimeProofValidator(starter);
  assert.equal(valid.status, 0, valid.stderr || valid.stdout);

  fs.writeFileSync(
    skillPath,
    fs.readFileSync(skillPath, 'utf8').replace(/\r?\n/gu, '\r\n'),
  );
  const validCrLf = runRuntimeProofValidator(starter);
  assert.equal(validCrLf.status, 0, validCrLf.stderr || validCrLf.stdout);

  fs.writeFileSync(
    workflowPath,
    fs.readFileSync(workflowPath, 'utf8').replace(
      'npm run runtime:proof:mock',
      'npm run runtime:proof',
    ),
  );
  const environmentSensitive = runRuntimeProofValidator(starter);
  assert.notEqual(environmentSensitive.status, 0);
  assert.match(
    environmentSensitive.stderr,
    /runtime-proof\.yml must run npm run runtime:proof:mock/,
  );

  fs.writeFileSync(
    workflowPath,
    fs.readFileSync(workflowPath, 'utf8').replace(
      'npm run runtime:proof',
      'npm run runtime:proof:mock',
    ),
  );
  fs.appendFileSync(workflowPath, '      - run: npm run runtime:proof\n');
  const additionalEnvironmentSensitiveStep = runRuntimeProofValidator(starter);
  assert.notEqual(additionalEnvironmentSensitiveStep.status, 0);
  assert.match(
    additionalEnvironmentSensitiveStep.stderr,
    /runtime-proof\.yml must run only npm run runtime:proof:mock/,
  );

  fs.writeFileSync(
    workflowPath,
    fs.readFileSync(workflowPath, 'utf8').replace(
      '      - run: npm run runtime:proof\n',
      '',
    ),
  );
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  pkg.scripts['runtime:proof:mock'] += ' && npm run runtime:proof';
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  const chainedEnvironmentSensitiveScript = runRuntimeProofValidator(starter);
  assert.notEqual(chainedEnvironmentSensitiveScript.status, 0);
  assert.match(
    chainedEnvironmentSensitiveScript.stderr,
    /package\.json script runtime:proof:mock must equal the forced-mock wrapper/,
  );

  delete pkg.scripts['runtime:proof:mock'];
  fs.writeFileSync(packagePath, `${JSON.stringify(pkg, null, 2)}\n`);
  const missingForcedMockScript = runRuntimeProofValidator(starter);
  assert.notEqual(missingForcedMockScript.status, 0);
  assert.match(
    missingForcedMockScript.stderr,
    /package\.json missing script: runtime:proof:mock/,
  );
});
