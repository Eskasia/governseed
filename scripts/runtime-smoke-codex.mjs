#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  MAX_COMBINED_OUTPUT_BYTES,
  buildMinimalEnv,
  resolveRuntimeExecutable,
  runChildSafely,
  runtimeCapabilities,
} from './lib/governance-impact-adapters.mjs';
import {
  parseExactJson,
  scanPrivacyBuffer,
} from './governance-impact-eval.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const EXIT_CODES = Object.freeze({
  RUNTIME_MISSING: 4,
  SESSION_SAFETY_UNAVAILABLE: 2,
  PROCESS_TREE_UNAVAILABLE: 3,
  CHILD_SPAWN_FAILED: 3,
  CHILD_EXIT_NONZERO: 3,
  CHILD_TIMEOUT: 3,
  OUTPUT_LIMIT_EXCEEDED: 3,
  OUTPUT_SCHEMA_INVALID: 3,
  PRIVACY_OUTPUT_BLOCKED: 3,
  MINIMAL_ENV_VIOLATION: 3,
  PATH_POLICY_BLOCKED: 3,
  ARTIFACT_EXISTS: 3,
  RUNTIME_BUSY: 3,
  CLEANUP_FAILED: 3,
  ARTIFACT_WRITE_FAILED: 3,
  RUNTIME_PROOF_FAILED: 3,
});

class RuntimeProofError extends Error {
  constructor(code) {
    super(code);
    this.name = 'RuntimeProofError';
    this.code = code;
    this.exitCode = EXIT_CODES[code] ?? EXIT_CODES.RUNTIME_PROOF_FAILED;
  }
}

function fail(code) {
  throw new RuntimeProofError(code);
}

function normalizeError(error, fallback = 'RUNTIME_PROOF_FAILED') {
  if (error?.code === 'PRIVACY_SOURCE_BLOCKED') {
    return new RuntimeProofError('PRIVACY_OUTPUT_BLOCKED');
  }
  if (error?.code === 'PRIVACY_SCANNER_UNAVAILABLE') {
    return new RuntimeProofError('OUTPUT_SCHEMA_INVALID');
  }
  if (typeof error?.code === 'string' && Object.hasOwn(EXIT_CODES, error.code)) {
    return new RuntimeProofError(error.code);
  }
  return new RuntimeProofError(fallback);
}

function sameArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export function normalizeExactText(raw, canonical) {
  if (typeof raw !== 'string') fail('OUTPUT_SCHEMA_INVALID');
  const normalized = raw.replace(/\r\n/gu, '\n');
  if (normalized !== canonical) fail('OUTPUT_SCHEMA_INVALID');
  return canonical;
}

export function normalizeExactObject(raw, expected, requiredKeys) {
  if (typeof raw !== 'string') fail('OUTPUT_SCHEMA_INVALID');
  let parsed;
  try {
    parsed = parseExactJson(Buffer.from(raw));
  } catch {
    fail('OUTPUT_SCHEMA_INVALID');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('OUTPUT_SCHEMA_INVALID');
  }
  const actualKeys = Object.keys(parsed);
  if (
    actualKeys.length !== requiredKeys.length
    || requiredKeys.some((key) => !Object.hasOwn(parsed, key))
  ) {
    fail('OUTPUT_SCHEMA_INVALID');
  }
  for (const key of requiredKeys) {
    if (!sameArray(parsed[key], expected[key])) {
      fail('OUTPUT_SCHEMA_INVALID');
    }
  }
  return `${JSON.stringify(expected, null, 2)}\n`;
}

function requireSafeDirectory(directory, { create = false } = {}) {
  try {
    if (!fs.existsSync(directory)) {
      if (!create) fail('PATH_POLICY_BLOCKED');
      fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    }
    const stat = fs.lstatSync(directory);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('PATH_POLICY_BLOCKED');
  } catch (error) {
    if (error?.code === 'PATH_POLICY_BLOCKED') throw error;
    fail('PATH_POLICY_BLOCKED');
  }
}

function removeAndVerify(directory, removeTree) {
  let cleanupFailed = false;
  try {
    removeTree(directory);
  } catch {
    cleanupFailed = true;
  }
  if (fs.existsSync(directory)) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      cleanupFailed = true;
    }
  }
  if (fs.existsSync(directory) || cleanupFailed) fail('CLEANUP_FAILED');
}

function acquireRuntimeLock(outputRoot, runtime) {
  requireSafeDirectory(outputRoot, { create: true });
  const lockDirectory = path.join(outputRoot, `.runtime-proof-${runtime}.lock`);
  try {
    fs.mkdirSync(lockDirectory, { mode: 0o700 });
  } catch {
    try {
      const stat = fs.lstatSync(lockDirectory);
      if (stat.isSymbolicLink()) fail('PATH_POLICY_BLOCKED');
    } catch (error) {
      if (error?.code === 'PATH_POLICY_BLOCKED') throw error;
    }
    fail('RUNTIME_BUSY');
  }
  return lockDirectory;
}

function releaseRuntimeLock(lockDirectory) {
  try {
    fs.rmdirSync(lockDirectory);
  } catch {
    if (fs.existsSync(lockDirectory)) fail('CLEANUP_FAILED');
  }
  if (fs.existsSync(lockDirectory)) fail('CLEANUP_FAILED');
}

function prepareArtifactDirectory(finalDirectory) {
  requireSafeDirectory(finalDirectory, { create: true });
}

function scanBuffer(scanner, value) {
  try {
    scanner(value);
  } catch (error) {
    throw normalizeError(error, 'PRIVACY_OUTPUT_BLOCKED');
  }
}

function scanOutput(scanner, value) {
  if (typeof value !== 'string') fail('OUTPUT_SCHEMA_INVALID');
  scanBuffer(scanner, Buffer.from(value));
}

function sameFileIdentity(stat, identity) {
  return stat.dev === identity.dev && stat.ino === identity.ino;
}

function requireOwnedFile(file, identity) {
  let stat;
  try {
    stat = fs.lstatSync(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    fail('CLEANUP_FAILED');
  }
  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || !sameFileIdentity(stat, identity)
  ) {
    fail('CLEANUP_FAILED');
  }
  return true;
}

function removeOwnedFile(file, identity, removeTree) {
  if (!identity || !requireOwnedFile(file, identity)) return;
  removeAndVerify(file, removeTree);
}

function readExistingArtifact(outputFile, scanner) {
  let descriptor = null;
  try {
    const pathStat = fs.lstatSync(outputFile);
    if (
      pathStat.isSymbolicLink()
      || !pathStat.isFile()
      || pathStat.nlink !== 1
    ) {
      fail('PATH_POLICY_BLOCKED');
    }
    const noFollow = fs.constants.O_NOFOLLOW ?? 0;
    descriptor = fs.openSync(outputFile, fs.constants.O_RDONLY | noFollow);
    const before = fs.fstatSync(descriptor);
    if (
      !before.isFile()
      || before.nlink !== 1
      || !sameFileIdentity(before, pathStat)
    ) {
      fail('PATH_POLICY_BLOCKED');
    }
    if (before.size > MAX_COMBINED_OUTPUT_BYTES) {
      fail('OUTPUT_LIMIT_EXCEEDED');
    }

    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = fs.readSync(
        descriptor,
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (count === 0) fail('PATH_POLICY_BLOCKED');
      offset += count;
    }
    const overflowProbe = Buffer.alloc(1);
    if (fs.readSync(descriptor, overflowProbe, 0, 1, offset) !== 0) {
      fail('PATH_POLICY_BLOCKED');
    }

    const after = fs.fstatSync(descriptor);
    if (
      !after.isFile()
      || after.nlink !== 1
      || !sameFileIdentity(after, before)
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs
    ) {
      fail('PATH_POLICY_BLOCKED');
    }
    scanBuffer(scanner, bytes);
    return {
      bytes,
      identity: { dev: after.dev, ino: after.ino },
    };
  } catch (error) {
    throw normalizeError(error, 'PATH_POLICY_BLOCKED');
  } finally {
    if (descriptor !== null) {
      try {
        fs.closeSync(descriptor);
      } catch {
        fail('PATH_POLICY_BLOCKED');
      }
    }
  }
}

function validateChildResult(result, scanner) {
  if (!result || typeof result !== 'object') fail('CHILD_SPAWN_FAILED');
  if (typeof result.stdout !== 'string' || typeof result.stderr !== 'string') {
    fail('OUTPUT_SCHEMA_INVALID');
  }
  if (
    Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)
    > MAX_COMBINED_OUTPUT_BYTES
  ) {
    fail('OUTPUT_LIMIT_EXCEEDED');
  }
  scanOutput(scanner, result.stdout);
  scanOutput(scanner, result.stderr);
  if (result.status !== 'completed') {
    fail(
      result.errorCode === 'CHILD_TIMEOUT'
        ? 'CHILD_TIMEOUT'
        : result.errorCode === 'OUTPUT_LIMIT_EXCEEDED'
          ? 'OUTPUT_LIMIT_EXCEEDED'
          : 'CHILD_EXIT_NONZERO',
    );
  }
  if (result.stderr.length > 0) fail('OUTPUT_SCHEMA_INVALID');
}

function makeRuntimePaths(workDirectory) {
  const home = path.join(workDirectory, '.runtime-home');
  const tmp = path.join(workDirectory, '.runtime-tmp');
  const codexHome = path.join(workDirectory, '.codex-home');
  for (const directory of [home, tmp, codexHome]) {
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return { home, tmp, codexHome };
}

function persistNormalizedArtifact(
  outputRoot,
  finalDirectory,
  outputFile,
  normalized,
  scanner,
  removeTree,
) {
  const stagingFile = path.join(
    outputRoot,
    `.runtime-proof-publish-${randomUUID()}.tmp`,
  );
  const normalizedBytes = Buffer.from(normalized);
  let stagingIdentity = null;
  let createdIdentity = null;
  let reusedPrior = false;
  try {
    requireSafeDirectory(finalDirectory);
    scanOutput(scanner, normalized);
    const descriptor = fs.openSync(stagingFile, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, normalized, { encoding: 'utf8' });
      fs.fsyncSync(descriptor);
      const descriptorStat = fs.fstatSync(descriptor);
      stagingIdentity = { dev: descriptorStat.dev, ino: descriptorStat.ino };
    } finally {
      fs.closeSync(descriptor);
    }
    const stagingStat = fs.lstatSync(stagingFile);
    if (
      stagingStat.isSymbolicLink()
      || !stagingStat.isFile()
      || stagingStat.nlink !== 1
      || !sameFileIdentity(stagingStat, stagingIdentity)
    ) {
      fail('PATH_POLICY_BLOCKED');
    }
    try {
      fs.linkSync(stagingFile, outputFile);
      createdIdentity = stagingIdentity;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const prior = readExistingArtifact(outputFile, scanner);
      if (!prior.bytes.equals(normalizedBytes)) fail('ARTIFACT_EXISTS');
      reusedPrior = true;
    }
    if (!requireOwnedFile(stagingFile, stagingIdentity)) {
      fail('CLEANUP_FAILED');
    }
    fs.unlinkSync(stagingFile);
    stagingIdentity = null;

    const canonical = readExistingArtifact(outputFile, scanner);
    if (!canonical.bytes.equals(normalizedBytes)) fail('ARTIFACT_EXISTS');
    if (createdIdentity && !sameFileIdentity(canonical.identity, createdIdentity)) {
      fail('PATH_POLICY_BLOCKED');
    }
    return {
      createdByAttempt: !reusedPrior,
      identity: createdIdentity,
    };
  } catch (error) {
    const normalizedError = normalizeError(error, 'ARTIFACT_WRITE_FAILED');
    let cleanupFailed = false;
    if (stagingIdentity) {
      try {
        removeOwnedFile(stagingFile, stagingIdentity, removeTree);
      } catch {
        cleanupFailed = true;
      }
    }
    if (createdIdentity) {
      try {
        removeOwnedFile(outputFile, createdIdentity, removeTree);
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) throw new RuntimeProofError('CLEANUP_FAILED');
    throw normalizedError;
  }
}

function safeIo(deps) {
  return deps.io ?? {
    stdout: process.stdout,
    stderr: process.stderr,
  };
}

function writeFailure(runtime, error, deps) {
  const normalized = normalizeError(error);
  safeIo(deps).stderr.write(`${runtime} runtime smoke: FAIL [${normalized.code}]\n`);
  return normalized.exitCode;
}

function isRealMode(options, env) {
  return typeof options.real === 'boolean'
    ? options.real
    : env.RUNTIME_PROOF_REAL === '1';
}

export async function runRuntimeSmoke(contract, options = {}, deps = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const outputRoot = path.resolve(options.outputRoot ?? path.join(ROOT, '.tmp'));
  const finalDirectory = path.join(outputRoot, `runtime-${contract.runtime}`);
  const outputFile = path.join(finalDirectory, contract.artifactName);
  const removeTree = deps.removeTree
    ?? ((target) => fs.rmSync(target, { recursive: true, force: true }));
  const makeTempDir = deps.makeTempDir
    ?? ((prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  const runner = deps.runChildSafely ?? runChildSafely;
  const resolver = deps.resolveRuntimeExecutable ?? resolveRuntimeExecutable;
  const capabilitiesFor = deps.runtimeCapabilities ?? runtimeCapabilities;
  const minimalEnvironment = deps.buildMinimalEnv ?? buildMinimalEnv;
  const scanner = deps.privacyScanner ?? scanPrivacyBuffer;
  const real = isRealMode(options, env);
  let workDirectory = null;
  let workDirectorySafe = false;
  let rawStdout = null;
  let rawStderr = null;
  let normalized = null;
  let pendingError = null;
  let executable = null;
  let lockDirectory = null;
  let lockOwned = false;
  let artifactReady = false;
  let createdArtifactIdentity = null;

  try {
    lockDirectory = acquireRuntimeLock(outputRoot, contract.runtime);
    lockOwned = true;
    prepareArtifactDirectory(finalDirectory);

    if (real) {
      executable = resolver(contract.runtime, env, platform, fs);
      if (!executable) fail('RUNTIME_MISSING');
      const capabilities = capabilitiesFor(contract.runtime, platform);
      if (
        !capabilities?.available
        || !capabilities.noSessionPersistence
        || !capabilities.workspaceOnly
        || !capabilities.processTree
      ) {
        fail('SESSION_SAFETY_UNAVAILABLE');
      }
      if (
        typeof deps.proveDetachedDescendantContainment !== 'function'
        || await deps.proveDetachedDescendantContainment(contract.runtime, platform) !== true
      ) {
        fail('PROCESS_TREE_UNAVAILABLE');
      }
    }

    workDirectory = makeTempDir(`runtime-proof-${contract.runtime}-`);
    requireSafeDirectory(workDirectory);
    workDirectorySafe = true;
    const runtimePaths = makeRuntimePaths(workDirectory);
    const initEnvironment = minimalEnvironment('synthetic', runtimePaths, {
      platform,
      sourceEnv: env,
    });
    const initResult = await runner(
      process.execPath,
      [path.join(ROOT, 'scripts/init.mjs'), '.', '--agent', contract.initAgent, '--profile', 'base'],
      {
        cwd: workDirectory,
        env: initEnvironment,
        maxOutputBytes: MAX_COMBINED_OUTPUT_BYTES,
        privacyScanner: scanner,
        realExecution: false,
      },
    );
    validateChildResult(initResult, scanner);
    if (contract.prepareFixture) contract.prepareFixture(workDirectory);

    if (real) {
      const invocation = contract.buildInvocation(executable, workDirectory);
      const runtimeEnvironment = minimalEnvironment(contract.runtime, runtimePaths, {
        platform,
        sourceEnv: env,
      });
      const result = await runner(invocation.executable, invocation.args, {
        cwd: workDirectory,
        env: runtimeEnvironment,
        stdin: invocation.stdin,
        maxOutputBytes: MAX_COMBINED_OUTPUT_BYTES,
        privacyScanner: scanner,
        realExecution: true,
      });
      validateChildResult(result, scanner);
      rawStdout = result.stdout;
      rawStderr = result.stderr;
    } else {
      rawStdout = contract.mockOutput;
      rawStderr = '';
      scanOutput(scanner, rawStdout);
    }

    if (
      Buffer.byteLength(rawStdout) + Buffer.byteLength(rawStderr)
      > MAX_COMBINED_OUTPUT_BYTES
    ) {
      fail('OUTPUT_LIMIT_EXCEEDED');
    }
    normalized = contract.normalize(rawStdout);
    scanOutput(scanner, normalized);
  } catch (error) {
    pendingError = normalizeError(error);
  } finally {
    rawStdout = null;
    rawStderr = null;
    if (workDirectorySafe) {
      try {
        removeAndVerify(workDirectory, removeTree);
      } catch {
        pendingError = new RuntimeProofError('CLEANUP_FAILED');
        normalized = null;
      }
    }
  }

  if (!pendingError && normalized !== null) {
    try {
      const publication = persistNormalizedArtifact(
        outputRoot,
        finalDirectory,
        outputFile,
        normalized,
        scanner,
        removeTree,
      );
      artifactReady = true;
      if (publication.createdByAttempt) {
        createdArtifactIdentity = publication.identity;
      }
    } catch (error) {
      pendingError = normalizeError(error);
    }
  }
  normalized = null;

  if (lockOwned) {
    try {
      releaseRuntimeLock(lockDirectory);
    } catch {
      if (createdArtifactIdentity) {
        try {
          removeOwnedFile(outputFile, createdArtifactIdentity, removeTree);
        } catch {
          // The stable cleanup failure below remains authoritative.
        }
      }
      pendingError = new RuntimeProofError('CLEANUP_FAILED');
      artifactReady = false;
      createdArtifactIdentity = null;
    }
  }

  if (pendingError || !artifactReady) {
    return writeFailure(contract.runtime, pendingError, deps);
  }

  safeIo(deps).stdout.write(`${contract.runtime} runtime smoke: PASS\n`);
  return 0;
}

const CODEX_OUTPUT = [
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
].join('\n');

const CODEX_CONTRACT = Object.freeze({
  runtime: 'codex',
  initAgent: 'codex',
  artifactName: 'codex-first-response.txt',
  mockOutput: CODEX_OUTPUT,
  normalize(raw) {
    return normalizeExactText(raw, CODEX_OUTPUT);
  },
  buildInvocation(executable, workDirectory) {
    return {
      executable,
      args: [
        'exec',
        '--ephemeral',
        '--ignore-user-config',
        '--strict-config',
        '--sandbox',
        'read-only',
        '--cd',
        workDirectory,
        '--color',
        'never',
        '--config',
        'shell_environment_policy.inherit=none',
        '-',
      ],
      stdin: [
        'Read START_HERE.md and AGENTS.md.',
        'Return exactly the approved FILES_READ, FIXED_DOCS, CONDITIONAL_DOCS, and BLOCKERS contract.',
        'Do not write files.',
      ].join(' '),
    };
  },
});

export async function main(options = {}, deps = {}) {
  return runRuntimeSmoke(CODEX_CONTRACT, options, {
    runChildSafely,
    resolveRuntimeExecutable,
    runtimeCapabilities,
    buildMinimalEnv,
    privacyScanner: scanPrivacyBuffer,
    ...deps,
  });
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entrypoint === import.meta.url) {
  process.exitCode = await main();
}
