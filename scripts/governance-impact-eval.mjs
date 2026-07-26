#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  aggregateResults,
  evaluateGate,
  normalizeAttemptManifest,
  scoreRun,
  sha256Canonical,
  validateScenario,
} from './lib/governance-impact-core.mjs';
import {
  buildMinimalEnv,
  buildRuntimeCommand,
  GovernanceImpactError,
  resolveRuntimeExecutable,
  runChildSafely,
  runtimeCapabilities,
  terminateProcessTree,
} from './lib/governance-impact-adapters.mjs';

const CONTROL_NAMES = Object.freeze([
  'baseline-wins',
  'governed-wins',
  'tie',
  'missing-telemetry',
  'forbidden-change',
]);
const CONTROL_WINNERS = Object.freeze({
  'baseline-wins': 'baseline',
  'governed-wins': 'governed',
  tie: 'tie',
  'missing-telemetry': 'tie',
  'forbidden-change': 'baseline',
});
export const MAX_JSON_INPUT_BYTES = 1_048_576;
export const MAX_SCENARIO_FILE_BYTES = 16_777_216;
const HEX_64 = /^[a-f0-9]{64}$/;
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRUSTED_RUNTIME_RESPONSE_SCHEMA = JSON.stringify({
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
  maxProperties: 0,
}) + '\n';

const COMMANDS = Object.freeze({
  validate: {
    required: ['scenario'],
    optional: ['manifest', 'policy'],
  },
  replay: {
    required: ['scenario', 'manifest', 'run', 'output'],
    optional: [],
  },
  run: {
    required: ['scenario', 'manifest', 'policy', 'attempt-id', 'output'],
    optional: ['timeout-ms'],
  },
  aggregate: {
    required: ['manifest', 'policy', 'run', 'output'],
    optional: [],
    repeated: ['run'],
  },
  gate: {
    required: ['report', 'policy', 'run'],
    optional: [],
    repeated: ['run'],
  },
});

const ERROR_CONTRACT = Object.freeze({
  USAGE_INVALID: [2, 'The command syntax is invalid.', 'Use the frozen long-form command grammar.'],
  UNKNOWN_COMMAND: [2, 'The command is not recognized.', 'Use validate, replay, run, aggregate, or gate.'],
  UNKNOWN_OPTION: [2, 'An option is not recognized.', 'Use only options declared for this command.'],
  MISSING_OPTION: [2, 'A required option is missing.', 'Provide every required long-form option.'],
  INVALID_OPTION_VALUE: [2, 'An option value is invalid.', 'Use a valid repository-relative value.'],
  INPUT_SCHEMA_INVALID: [2, 'An input does not match the closed contract.', 'Correct the input and retry.'],
  REAL_MODE_REQUIRED: [2, 'Real evaluation is not explicitly enabled.', 'Set GOVERNANCE_IMPACT_REAL=1 exactly.'],
  DATA_CLASSIFICATION_BLOCKED: [2, 'The input data classification is not allowed.', 'Use committed synthetic evaluation data.'],
  SCENARIO_NOT_COMMITTED: [2, 'The scenario is not clean committed evidence.', 'Commit and clean every scenario artifact.'],
  ARTIFACT_HASH_MISMATCH: [2, 'A scenario artifact hash does not match.', 'Recreate preregistered hashes from safe inputs.'],
  PATH_POLICY_BLOCKED: [2, 'An input path violates the path policy.', 'Use a regular repository-relative POSIX path.'],
  SYMLINK_INPUT_BLOCKED: [2, 'A linked input is not allowed.', 'Replace it with a regular committed file.'],
  PRIVACY_SOURCE_BLOCKED: [2, 'An input failed the privacy policy.', 'Use synthetic data without private markers.'],
  SESSION_SAFETY_UNAVAILABLE: [2, 'The runtime cannot prove the required isolation.', 'Use a supported safe runtime and platform.'],
  MANIFEST_MISMATCH: [2, 'The run is not registered by the manifest.', 'Use the exact preregistered attempt.'],
  MANIFEST_HASH_MISMATCH: [2, 'The manifest hash does not match policy.', 'Use the policy-pinned normalized manifest.'],
  BOOTSTRAP_SEED_MISMATCH: [2, 'The bootstrap seed does not match policy.', 'Use the policy-pinned bootstrap seed.'],
  RUNTIME_MISSING: [4, 'The requested real runtime is unavailable.', 'Install or configure the exact runtime executable.'],
  CHILD_SPAWN_FAILED: [3, 'The child process could not start safely.', 'Check the isolated runtime installation.'],
  OUTPUT_LIMIT_EXCEEDED: [3, 'Child output exceeded the safe byte limit.', 'Reduce structured child output.'],
  OUTPUT_SCHEMA_INVALID: [3, 'Child output is not valid structured evidence.', 'Return the exact trusted output contract.'],
  PRIVACY_OUTPUT_BLOCKED: [3, 'Child output failed the privacy policy.', 'Remove private markers from runtime output.'],
  PRIVACY_SCANNER_UNAVAILABLE: [3, 'The privacy scanner is unavailable.', 'Restore the scanner before evaluating.'],
  ORACLE_INTEGRITY_FAILED: [3, 'Oracle evidence integrity could not be proven.', 'Restore the trusted oracle and retry.'],
  WORKSPACE_CONTAINMENT_FAILED: [3, 'Workspace containment could not be proven.', 'Inspect the isolated workspace boundary.'],
  MINIMAL_ENV_VIOLATION: [3, 'The child environment is not minimal.', 'Use only the documented environment allowlist.'],
  PROCESS_TREE_UNAVAILABLE: [3, 'Process-tree termination could not be proven.', 'Use a platform with proven process control.'],
  CLEANUP_FAILED: [3, 'Temporary evidence cleanup could not be proven.', 'Remove isolated temporary state before retrying.'],
  PERSIST_FAILED: [3, 'The evidence artifact could not be persisted safely.', 'Choose a new non-existing output path.'],
});

function impactError(code, forcedExit) {
  const contract = ERROR_CONTRACT[code] ?? ERROR_CONTRACT.INPUT_SCHEMA_INVALID;
  return new GovernanceImpactError(code, forcedExit ?? contract[0]);
}

function fail(code, forcedExit) {
  throw impactError(code, forcedExit);
}

function normalizeError(error) {
  if (
    error &&
    typeof error.code === 'string' &&
    Object.hasOwn(ERROR_CONTRACT, error.code)
  ) {
    return impactError(error.code, error.exitCode);
  }
  return impactError('INPUT_SCHEMA_INVALID');
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function relativePosix(value) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) return false;
  if (value.includes('\0') || value.includes('\\') || value.startsWith('/')) return false;
  if (/^[A-Za-z]:/.test(value) || value.startsWith('//')) return false;
  const segments = value.split('/');
  if (
    segments.some(
      (segment, index) =>
        segment === '.' ||
        segment === '..' ||
        (segment === '' && index !== segments.length - 1),
    )
  ) {
    return false;
  }
  return path.posix.normalize(value) === value;
}

function requireRelativePath(value) {
  if (!relativePosix(value)) fail('INVALID_OPTION_VALUE');
  return value;
}

function resolveRepositoryPath(value, repositoryRoot = REPOSITORY_ROOT) {
  requireRelativePath(value);
  const root = path.resolve(repositoryRoot);
  const resolved = path.resolve(root, ...value.split('/'));
  if (resolved === root || !resolved.startsWith(root + path.sep)) fail('PATH_POLICY_BLOCKED');
  return resolved;
}

function containedPath(root, candidate) {
  return candidate === root || candidate.startsWith(root + path.sep);
}

function ensureSafeDirectoryChain(root, target, fsApi = fs, code = 'PATH_POLICY_BLOCKED') {
  const absoluteRoot = path.resolve(root);
  const absoluteTarget = path.resolve(target);
  if (!containedPath(absoluteRoot, absoluteTarget)) fail(code);
  let rootStat;
  let rootReal;
  try {
    rootStat = fsApi.lstatSync(absoluteRoot);
    rootReal = fsApi.realpathSync(absoluteRoot);
  } catch {
    fail(code);
  }
  if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) fail(code);
  const relative = path.relative(absoluteRoot, absoluteTarget);
  const segments = relative === '' ? [] : relative.split(path.sep);
  let current = absoluteRoot;
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fsApi.lstatSync(current);
    } catch (error) {
      if (error?.code !== 'ENOENT') fail(code);
      try {
        fsApi.mkdirSync(current, { mode: 0o700 });
        stat = fsApi.lstatSync(current);
      } catch {
        fail(code);
      }
    }
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail(code);
    let real;
    try {
      real = fsApi.realpathSync(current);
    } catch {
      fail(code);
    }
    if (!containedPath(rootReal, real)) fail(code);
  }
  const verified = [absoluteRoot, ...segments.map((_, index) =>
    path.join(absoluteRoot, ...segments.slice(0, index + 1))
  )].map((directory) => {
    try {
      const stat = fsApi.lstatSync(directory);
      const real = fsApi.realpathSync(directory);
      if (
        stat.isSymbolicLink() ||
        !stat.isDirectory() ||
        !containedPath(rootReal, real)
      ) {
        fail(code);
      }
      return { directory, stat, real };
    } catch (error) {
      if (error?.code && Object.hasOwn(ERROR_CONTRACT, error.code)) throw error;
      fail(code);
    }
  });
  for (const before of verified) {
    try {
      const after = fsApi.lstatSync(before.directory);
      if (
        after.isSymbolicLink() ||
        !after.isDirectory() ||
        fsApi.realpathSync(before.directory) !== before.real ||
        !sameFileIdentity(before.stat, after)
      ) {
        fail(code);
      }
    } catch (error) {
      if (error?.code && Object.hasOwn(ERROR_CONTRACT, error.code)) throw error;
      fail(code);
    }
  }
  return { rootReal, target: absoluteTarget };
}

export function parseCommand(argv) {
  if (!Array.isArray(argv)) fail('USAGE_INVALID');
  if (argv.length === 0) return { command: 'controls', options: {} };
  const command = argv[0];
  const spec = COMMANDS[command];
  if (!spec) fail('UNKNOWN_COMMAND');
  const allowed = new Set([...spec.required, ...spec.optional]);
  const repeated = new Set(spec.repeated ?? []);
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (typeof flag !== 'string' || !flag.startsWith('--') || value === undefined) {
      fail('USAGE_INVALID');
    }
    const key = flag.slice(2);
    if (!allowed.has(key)) fail('UNKNOWN_OPTION');
    if (typeof value !== 'string' || value.length === 0 || value.startsWith('--')) {
      fail('INVALID_OPTION_VALUE');
    }
    if (repeated.has(key)) {
      (options[key] ??= []).push(value);
    } else {
      if (Object.hasOwn(options, key)) fail('USAGE_INVALID');
      options[key] = value;
    }
  }
  for (const key of spec.required) {
    if (!Object.hasOwn(options, key)) fail('MISSING_OPTION');
  }
  for (const key of Object.keys(options)) {
    const values = Array.isArray(options[key]) ? options[key] : [options[key]];
    if (key === 'timeout-ms') {
      if (!/^[1-9][0-9]*$/.test(options[key]) || !Number.isSafeInteger(Number(options[key]))) {
        fail('INVALID_OPTION_VALUE');
      }
    } else if (key === 'attempt-id') {
      if (!HEX_64.test(options[key])) fail('INVALID_OPTION_VALUE');
    } else {
      values.forEach(requireRelativePath);
    }
  }
  if (options['timeout-ms'] !== undefined) options['timeout-ms'] = Number(options['timeout-ms']);
  return { command, options };
}

class ExactJsonParser {
  constructor(text) {
    this.text = text;
    this.index = 0;
  }

  whitespace() {
    while (this.index < this.text.length && /\s/u.test(this.text[this.index])) this.index += 1;
  }

  value() {
    this.whitespace();
    const character = this.text[this.index];
    if (character === '{') return this.object();
    if (character === '[') return this.array();
    if (character === '"') return this.string();
    for (const [token, value] of [['true', true], ['false', false], ['null', null]]) {
      if (this.text.startsWith(token, this.index)) {
        this.index += token.length;
        return value;
      }
    }
    const match = this.text.slice(this.index).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (!match) fail('INPUT_SCHEMA_INVALID');
    this.index += match[0].length;
    const number = Number(match[0]);
    if (!Number.isFinite(number)) fail('INPUT_SCHEMA_INVALID');
    return number;
  }

  string() {
    const start = this.index;
    this.index += 1;
    let escaped = false;
    while (this.index < this.text.length) {
      const code = this.text.charCodeAt(this.index);
      const character = this.text[this.index];
      if (!escaped && character === '"') {
        this.index += 1;
        try {
          return JSON.parse(this.text.slice(start, this.index));
        } catch {
          fail('INPUT_SCHEMA_INVALID');
        }
      }
      if (!escaped && code < 0x20) fail('INPUT_SCHEMA_INVALID');
      if (!escaped && character === '\\') escaped = true;
      else escaped = false;
      this.index += 1;
    }
    fail('INPUT_SCHEMA_INVALID');
  }

  object() {
    const result = {};
    const keys = new Set();
    this.index += 1;
    this.whitespace();
    if (this.text[this.index] === '}') {
      this.index += 1;
      return result;
    }
    while (this.index < this.text.length) {
      this.whitespace();
      if (this.text[this.index] !== '"') fail('INPUT_SCHEMA_INVALID');
      const key = this.string();
      if (keys.has(key)) fail('INPUT_SCHEMA_INVALID');
      keys.add(key);
      this.whitespace();
      if (this.text[this.index] !== ':') fail('INPUT_SCHEMA_INVALID');
      this.index += 1;
      result[key] = this.value();
      this.whitespace();
      if (this.text[this.index] === '}') {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ',') fail('INPUT_SCHEMA_INVALID');
      this.index += 1;
    }
    fail('INPUT_SCHEMA_INVALID');
  }

  array() {
    const result = [];
    this.index += 1;
    this.whitespace();
    if (this.text[this.index] === ']') {
      this.index += 1;
      return result;
    }
    while (this.index < this.text.length) {
      result.push(this.value());
      this.whitespace();
      if (this.text[this.index] === ']') {
        this.index += 1;
        return result;
      }
      if (this.text[this.index] !== ',') fail('INPUT_SCHEMA_INVALID');
      this.index += 1;
    }
    fail('INPUT_SCHEMA_INVALID');
  }
}

export function parseExactJson(buffer) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    fail('INPUT_SCHEMA_INVALID');
  }
  const parser = new ExactJsonParser(text);
  const value = parser.value();
  parser.whitespace();
  if (parser.index !== text.length || !isPlainObject(value)) fail('INPUT_SCHEMA_INVALID');
  return value;
}

export function readExactJson(filePath, options = {}) {
  const fsApi = options.fs ?? fs;
  let bytes;
  try {
    const rootReal = fsApi.realpathSync(options.root ?? REPOSITORY_ROOT);
    const stat = fsApi.lstatSync(filePath);
    if (stat.isSymbolicLink()) fail('SYMLINK_INPUT_BLOCKED');
    if (!stat.isFile() || stat.nlink !== 1) fail('PATH_POLICY_BLOCKED');
    const real = fsApi.realpathSync(filePath);
    if (real !== rootReal && !real.startsWith(rootReal + path.sep)) {
      fail('PATH_POLICY_BLOCKED');
    }
    bytes = readStableRegularFile(
      filePath,
      rootReal,
      fsApi,
      stat,
      real,
      options.maxBytes ?? MAX_JSON_INPUT_BYTES,
      'INPUT_SCHEMA_INVALID',
    );
    (options.privacyScanner ?? scanPrivacyBuffer)(bytes, { surface: 'json-input' });
  } catch (error) {
    if (error?.code && Object.hasOwn(ERROR_CONTRACT, error.code)) throw error;
    fail('INPUT_SCHEMA_INVALID');
  }
  return parseExactJson(bytes);
}

export function scanPrivacyBuffer(buffer) {
  try {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    const normalized = decoded.normalize('NFKC');
    const variants = [normalized];
    try {
      variants.push(decodeURIComponent(normalized));
    } catch {
      // Invalid percent encoding is scanned in its original form.
    }
    const patterns = [
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu,
      /\+[1-9]\d{7,14}\b/u,
      /\b09\d{2}[-\s]?\d{3}[-\s]?\d{3}\b/u,
      /\b0\d{1,2}[-\s]\d{3,4}[-\s]\d{4}\b/u,
      /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s/\\]+/iu,
      /https?:\/\/[^/\s:@]+:[^/\s@]+@/iu,
      /[?&](?:token|key|secret|password|credential)=[^&#\s]+/iu,
      /(?:api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*\S+/iu,
      /(?:md5|sha(?:1|224|256|384|512)?|hash)\s*[:=]\s*[a-f0-9]{16,128}\b/iu,
      /(?:masked[-_\s]?excerpt|遮罩.{0,3}摘錄)/iu,
    ];
    if (variants.some((value) => patterns.some((pattern) => pattern.test(value)))) {
      fail('PRIVACY_SOURCE_BLOCKED');
    }
  } catch (error) {
    if (error?.code === 'PRIVACY_SOURCE_BLOCKED') throw error;
    fail('PRIVACY_SCANNER_UNAVAILABLE');
  }
}

function collectArtifactEntries(root, relative, options) {
  const fsApi = options.fs ?? fs;
  const absolute = path.resolve(root, ...relative.split('/'));
  const rootReal = fsApi.realpathSync(root);
  let stat;
  try {
    stat = fsApi.lstatSync(absolute);
  } catch {
    fail('PATH_POLICY_BLOCKED');
  }
  if (stat.isSymbolicLink()) fail('SYMLINK_INPUT_BLOCKED');
  const real = fsApi.realpathSync(absolute);
  if (real !== rootReal && !real.startsWith(rootReal + path.sep)) fail('PATH_POLICY_BLOCKED');
  if (stat.isFile()) {
    if (stat.nlink !== 1) fail('PATH_POLICY_BLOCKED');
    const bytes = readStableRegularFile(
      absolute,
      rootReal,
      fsApi,
      stat,
      real,
      options.maxFileBytes ?? MAX_SCENARIO_FILE_BYTES,
      'PATH_POLICY_BLOCKED',
    );
    return [{ type: 'file', path: relative, byteLength: bytes.length, bytes }];
  }
  if (!stat.isDirectory()) fail('PATH_POLICY_BLOCKED');
  const entries = [];
  const walk = (directory, prefix) => {
    const names = fsApi.readdirSync(directory).sort((left, right) =>
      Buffer.from(left).compare(Buffer.from(right)),
    );
    for (const name of names) {
      const child = path.join(directory, name);
      const childRelative = prefix ? `${prefix}/${name}` : name;
      const childStat = fsApi.lstatSync(child);
      if (childStat.isSymbolicLink()) fail('SYMLINK_INPUT_BLOCKED');
      if (childStat.isDirectory()) {
        entries.push({ type: 'directory', path: childRelative, byteLength: 0, bytes: Buffer.alloc(0) });
        walk(child, childRelative);
      } else if (childStat.isFile() && childStat.nlink === 1) {
        const childReal = fsApi.realpathSync(child);
        if (childReal !== rootReal && !childReal.startsWith(rootReal + path.sep)) {
          fail('PATH_POLICY_BLOCKED');
        }
        const bytes = readStableRegularFile(
          child,
          rootReal,
          fsApi,
          childStat,
          childReal,
          options.maxFileBytes ?? MAX_SCENARIO_FILE_BYTES,
          'PATH_POLICY_BLOCKED',
        );
        entries.push({ type: 'file', path: childRelative, byteLength: bytes.length, bytes });
      } else {
        fail('PATH_POLICY_BLOCKED');
      }
    }
  };
  walk(absolute, '');
  return entries;
}

function sameFileIdentity(left, right) {
  return (
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

function readStableRegularFile(
  absolute,
  rootReal,
  fsApi,
  before,
  beforeReal,
  maxBytes = MAX_SCENARIO_FILE_BYTES,
  tooLargeCode = 'PATH_POLICY_BLOCKED',
) {
  if (
    typeof fsApi.openSync !== 'function' ||
    typeof fsApi.fstatSync !== 'function' ||
    typeof fsApi.closeSync !== 'function'
  ) {
    fail('PATH_POLICY_BLOCKED');
  }
  let descriptor;
  try {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || before.size > maxBytes) {
      fail(tooLargeCode);
    }
    const noFollow = fsApi.constants?.O_NOFOLLOW ?? 0;
    descriptor = fsApi.openSync(absolute, (fsApi.constants?.O_RDONLY ?? 0) | noFollow);
    const opened = fsApi.fstatSync(descriptor);
    if (!opened.isFile() || opened.nlink !== 1 || !sameFileIdentity(before, opened)) {
      fail('SYMLINK_INPUT_BLOCKED');
    }
    const bytes = fsApi.readFileSync(descriptor);
    if (bytes.length > maxBytes) fail(tooLargeCode);
    const afterDescriptor = fsApi.fstatSync(descriptor);
    const afterPath = fsApi.lstatSync(absolute);
    const afterReal = fsApi.realpathSync(absolute);
    if (
      afterPath.isSymbolicLink() ||
      afterReal !== beforeReal ||
      (afterReal !== rootReal && !afterReal.startsWith(rootReal + path.sep)) ||
      !sameFileIdentity(opened, afterDescriptor) ||
      !sameFileIdentity(opened, afterPath)
    ) {
      fail('SYMLINK_INPUT_BLOCKED');
    }
    return bytes;
  } catch (error) {
    if (error?.code && Object.hasOwn(ERROR_CONTRACT, error.code)) throw error;
    fail('SYMLINK_INPUT_BLOCKED');
  } finally {
    if (descriptor !== undefined) {
      try {
        fsApi.closeSync(descriptor);
      } catch {
        fail('PATH_POLICY_BLOCKED');
      }
    }
  }
}

function defaultArtifactHasher(entries) {
  const hash = createHash('sha256');
  // This purpose tag is the frozen hash domain. The canonical payload below
  // deliberately excludes the artifact role and host metadata.
  hash.update('governance-impact-artifact-v1\0');
  for (const entry of entries) {
    hash.update(entry.type);
    hash.update('\0');
    hash.update(entry.path);
    hash.update('\0');
    hash.update(String(entry.byteLength));
    hash.update('\0');
    hash.update(entry.bytes);
    hash.update('\0');
  }
  return hash.digest('hex');
}

export async function hashScenarioArtifacts(scenarioRoot, scenario, options = {}) {
  if (!['synthetic', 'public'].includes(scenario?.dataClassification)) {
    fail('DATA_CLASSIFICATION_BLOCKED');
  }
  const names = {
    seed: scenario.paths?.seedDir,
    task: scenario.paths?.taskFile,
    governedOverlay: scenario.paths?.governedOverlayDir,
    oracle: scenario.paths?.oracleDir,
  };
  const entries = {};
  for (const [key, relative] of Object.entries(names)) {
    if (!relativePosix(relative)) fail('PATH_POLICY_BLOCKED');
    entries[key] = collectArtifactEntries(scenarioRoot, relative, options);
  }
  const scanner = options.privacyScanner ?? scanPrivacyBuffer;
  for (const artifactEntries of Object.values(entries)) {
    for (const entry of artifactEntries) {
      if (entry.type === 'file') scanner(entry.bytes, { path: entry.path });
    }
  }
  const hasher = options.artifactHasher ?? defaultArtifactHasher;
  return Object.fromEntries(
    Object.entries(entries).map(([key, artifactEntries]) => [key, hasher(artifactEntries, key)]),
  );
}

export function normalizeAndVerifyManifest(manifest, policy = null, options = {}) {
  let normalized;
  try {
    normalized = normalizeAttemptManifest(manifest);
  } catch {
    fail('INPUT_SCHEMA_INVALID');
  }
  if (policy) {
    if (
      options.requirePolicyPin === true &&
      (typeof policy.expectedManifestHash !== 'string' ||
        !HEX_64.test(policy.expectedManifestHash))
    ) {
      fail('MANIFEST_HASH_MISMATCH');
    }
    if (
      policy.expectedManifestHash !== null &&
      policy.expectedManifestHash !== undefined &&
      policy.expectedManifestHash !== normalized.manifestHash
    ) {
      fail('MANIFEST_HASH_MISMATCH');
    }
  }
  return normalized;
}

export async function persistJsonAtomically(filePath, value, options = {}) {
  const fsPromises = options.fsPromises ?? fs.promises;
  const fsApi = options.fs ?? fs;
  const directory = path.dirname(filePath);
  const repositoryRoot = options.repositoryRoot ?? directory;
  const { rootReal } = ensureSafeDirectoryChain(
    repositoryRoot,
    directory,
    fsApi,
    'PATH_POLICY_BLOCKED',
  );
  const temporary = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`,
  );
  let handle;
  let published = false;
  try {
    try {
      const existing = await fsPromises.lstat(filePath);
      if (existing) fail('PERSIST_FAILED');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    handle = await fsPromises.open(temporary, 'wx', 0o600);
    await handle.writeFile(JSON.stringify(value) + '\n', 'utf8');
    await handle.sync();
    await handle.close();
    handle = null;
    ensureSafeDirectoryChain(repositoryRoot, directory, fsApi, 'PATH_POLICY_BLOCKED');
    const temporaryStat = fsApi.lstatSync(temporary);
    if (
      temporaryStat.isSymbolicLink() ||
      !temporaryStat.isFile() ||
      temporaryStat.nlink !== 1 ||
      !containedPath(rootReal, fsApi.realpathSync(temporary))
    ) {
      fail('PATH_POLICY_BLOCKED');
    }
    // Same-directory hard-link publication is the Node-stdlib safety equivalent
    // of an atomic no-replace rename: link() is atomic and fails on collision,
    // whereas rename() would silently overwrite existing evidence.
    await fsPromises.link(temporary, filePath);
    published = true;
    await fsPromises.rm(temporary);
    ensureSafeDirectoryChain(repositoryRoot, directory, fsApi, 'PATH_POLICY_BLOCKED');
    const publishedStat = fsApi.lstatSync(filePath);
    if (
      publishedStat.isSymbolicLink() ||
      !publishedStat.isFile() ||
      publishedStat.nlink !== 1 ||
      !containedPath(rootReal, fsApi.realpathSync(filePath))
    ) {
      fail('PATH_POLICY_BLOCKED');
    }
    try {
      const directoryHandle = await fsPromises.open(directory, 'r');
      await directoryHandle.sync();
      await directoryHandle.close();
    } catch {
      // Some supported filesystems do not permit directory fsync.
    }
  } catch (error) {
    try {
      await handle?.close();
      if (published) await fsPromises.rm(filePath, { force: true });
      await fsPromises.rm(temporary, { force: true });
    } catch {
      // The public result remains the same stable persistence failure.
    }
    if (error?.code === 'PATH_POLICY_BLOCKED') throw error;
    fail('PERSIST_FAILED');
  }
  return {
    path: filePath,
    sha256: createHash('sha256').update(JSON.stringify(value) + '\n').digest('hex'),
  };
}

function writeExclusiveFile(destination, bytes, fsApi) {
  fsApi.mkdirSync(path.dirname(destination), { recursive: true });
  let descriptor;
  try {
    descriptor = fsApi.openSync(
      destination,
      (fsApi.constants?.O_WRONLY ?? 1) |
        (fsApi.constants?.O_CREAT ?? 64) |
        (fsApi.constants?.O_EXCL ?? 128) |
        (fsApi.constants?.O_NOFOLLOW ?? 0),
      0o600,
    );
    fsApi.writeFileSync(descriptor, bytes);
    fsApi.fsyncSync?.(descriptor);
  } catch {
    try {
      fsApi.rmSync(destination, { force: true });
    } catch {
      // The stable public outcome is the path-policy failure below.
    }
    fail('PATH_POLICY_BLOCKED');
  } finally {
    if (descriptor !== undefined) {
      try {
        fsApi.closeSync(descriptor);
      } catch {
        fail('PATH_POLICY_BLOCKED');
      }
    }
  }
}

function pinCopyEntries(
  scenarioRoot,
  relative,
  expectedHash,
  fsApi,
  surface = 'workspace-input',
) {
  const entries = collectArtifactEntries(scenarioRoot, relative, {
    fs: fsApi,
    maxFileBytes: MAX_SCENARIO_FILE_BYTES,
  });
  for (const entry of entries) {
    if (entry.type === 'file') scanPrivacyBuffer(entry.bytes, { surface });
  }
  if (typeof expectedHash === 'string' && defaultArtifactHasher(entries) !== expectedHash) {
    fail('ARTIFACT_HASH_MISMATCH');
  }
  return entries;
}

function materializePinnedEntries(entries, destinationRoot, fsApi) {
  for (const entry of entries) {
    const destination = path.join(destinationRoot, ...entry.path.split('/'));
    if (entry.type === 'directory') {
      fsApi.mkdirSync(destination, { recursive: true });
    } else {
      writeExclusiveFile(destination, entry.bytes, fsApi);
    }
  }
}

function removeTreeAndProve(root, fsApi) {
  try {
    fsApi.rmSync(root, { recursive: true, force: true });
    try {
      fsApi.lstatSync(root);
      fail('CLEANUP_FAILED');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  } catch (error) {
    if (error?.code === 'CLEANUP_FAILED') throw error;
    fail('CLEANUP_FAILED');
  }
}

export async function prepareArmWorkspace(options) {
  const fsApi = options.fs ?? fs;
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const base = options.tempRoot ?? path.join(repositoryRoot, '.tmp', 'governance-impact');
  ensureSafeDirectoryChain(repositoryRoot, base, fsApi);
  let root;
  try {
    root = fsApi.mkdtempSync(path.join(base, 'run-'));
    ensureSafeDirectoryChain(repositoryRoot, root, fsApi);
    const workspace = path.join(root, 'workspace');
    const home = path.join(root, 'home');
    const tmp = path.join(root, 'tmp');
    fsApi.mkdirSync(workspace);
    fsApi.mkdirSync(home);
    fsApi.mkdirSync(tmp);
    const scenarioRoot = options.scenarioRoot;
    const seedEntries = pinCopyEntries(
      scenarioRoot,
      options.scenario.paths.seedDir,
      options.scenario.artifactHashes?.seed,
      fsApi,
    );
    const taskEntries = pinCopyEntries(
      scenarioRoot,
      options.scenario.paths.taskFile,
      options.scenario.artifactHashes?.task,
      fsApi,
    );
    materializePinnedEntries(seedEntries, workspace, fsApi);
    materializePinnedEntries(taskEntries, workspace, fsApi);
    if (options.arm === 'governed') {
      const overlayEntries = pinCopyEntries(
        scenarioRoot,
        options.scenario.paths.governedOverlayDir,
        options.scenario.artifactHashes?.governedOverlay,
        fsApi,
      );
      materializePinnedEntries(overlayEntries, workspace, fsApi);
    }
    return { root, workspace, home, tmp };
  } catch (error) {
    if (root) removeTreeAndProve(root, fsApi);
    throw error;
  }
}

export function snapshotWorkspace(workspace, options = {}) {
  const fsApi = options.fs ?? fs;
  const scanner = options.privacyScanner ?? scanPrivacyBuffer;
  const result = [];
  try {
    const rootStat = fsApi.lstatSync(workspace);
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      fail('WORKSPACE_CONTAINMENT_FAILED');
    }
    const rootReal = fsApi.realpathSync(workspace);
    const walk = (directory, prefix = '') => {
      const before = fsApi.lstatSync(directory);
      const beforeReal = fsApi.realpathSync(directory);
      if (
        before.isSymbolicLink() ||
        !before.isDirectory() ||
        !containedPath(rootReal, beforeReal)
      ) {
        fail('WORKSPACE_CONTAINMENT_FAILED');
      }
      const names = fsApi.readdirSync(directory).sort((left, right) =>
        Buffer.from(left).compare(Buffer.from(right)),
      );
      for (const name of names) {
        const absolute = path.join(directory, name);
        const relative = prefix ? `${prefix}/${name}` : name;
        const stat = fsApi.lstatSync(absolute);
        if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) {
          fail('WORKSPACE_CONTAINMENT_FAILED');
        }
        const real = fsApi.realpathSync(absolute);
        if (!containedPath(rootReal, real)) fail('WORKSPACE_CONTAINMENT_FAILED');
        if (stat.isDirectory()) {
          walk(absolute, relative);
        } else {
          if (stat.nlink !== 1) fail('WORKSPACE_CONTAINMENT_FAILED');
          const bytes = readStableRegularFile(
            absolute,
            rootReal,
            fsApi,
            stat,
            real,
            MAX_SCENARIO_FILE_BYTES,
            'WORKSPACE_CONTAINMENT_FAILED',
          );
          scanner(bytes, { path: relative });
          result.push({
            path: relative,
            byteLength: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'),
          });
        }
      }
      const after = fsApi.lstatSync(directory);
      const afterNames = fsApi.readdirSync(directory).sort((left, right) =>
        Buffer.from(left).compare(Buffer.from(right)),
      );
      if (
        after.isSymbolicLink() ||
        fsApi.realpathSync(directory) !== beforeReal ||
        !sameFileIdentity(before, after) ||
        JSON.stringify(afterNames) !== JSON.stringify(names)
      ) {
        fail('WORKSPACE_CONTAINMENT_FAILED');
      }
    };
    walk(workspace);
    const afterRoot = fsApi.lstatSync(workspace);
    if (
      afterRoot.isSymbolicLink() ||
      fsApi.realpathSync(workspace) !== rootReal ||
      !sameFileIdentity(rootStat, afterRoot)
    ) {
      fail('WORKSPACE_CONTAINMENT_FAILED');
    }
    return result;
  } catch (error) {
    if (
      error?.code === 'PRIVACY_SOURCE_BLOCKED' ||
      error?.code === 'PRIVACY_SCANNER_UNAVAILABLE' ||
      error?.code === 'WORKSPACE_CONTAINMENT_FAILED'
    ) {
      throw error;
    }
    fail('WORKSPACE_CONTAINMENT_FAILED');
  }
}

function changedPathsBetween(before, after) {
  const beforeByPath = new Map(before.map((entry) => [entry.path, entry]));
  const afterByPath = new Map(after.map((entry) => [entry.path, entry]));
  return [...new Set([...beforeByPath.keys(), ...afterByPath.keys()])]
    .filter((entryPath) => {
      const left = beforeByPath.get(entryPath);
      const right = afterByPath.get(entryPath);
      return !left || !right || left.sha256 !== right.sha256 || left.byteLength !== right.byteLength;
    })
    .sort();
}

function verifyOracleArtifact(scenarioRoot, scenario) {
  const entries = collectArtifactEntries(
    scenarioRoot,
    scenario.paths.oracleDir,
    { fs, privacyScanner: scanPrivacyBuffer },
  );
  for (const entry of entries) {
    if (entry.type === 'file') scanPrivacyBuffer(entry.bytes, { surface: 'oracle-input' });
  }
  if (defaultArtifactHasher(entries) !== scenario.artifactHashes.oracle) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
}

function stableDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pinDirectoryEntries(scenarioRoot, relative, expectedHash, surface) {
  if (!relativePosix(relative)) fail('ORACLE_INTEGRITY_FAILED');
  const absolute = path.resolve(scenarioRoot, ...relative.split('/'));
  const scenarioReal = fs.realpathSync(scenarioRoot);
  const before = fs.lstatSync(absolute);
  const beforeReal = fs.realpathSync(absolute);
  if (
    before.isSymbolicLink() ||
    !before.isDirectory() ||
    !containedPath(scenarioReal, beforeReal)
  ) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  const entries = pinCopyEntries(
    scenarioRoot,
    relative,
    expectedHash,
    fs,
    surface,
  );
  const after = fs.lstatSync(absolute);
  if (
    after.isSymbolicLink() ||
    !after.isDirectory() ||
    fs.realpathSync(absolute) !== beforeReal ||
    !sameFileIdentity(before, after)
  ) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  return entries;
}

function materializeMirroredDirectory(pinnedRoot, relative, entries) {
  const destinationRoot = path.resolve(pinnedRoot, ...relative.split('/'));
  ensureSafeDirectoryChain(
    pinnedRoot,
    destinationRoot,
    fs,
    'ORACLE_INTEGRITY_FAILED',
  );
  materializePinnedEntries(entries, destinationRoot, fs);
  return entries
    .filter((entry) => entry.type === 'file')
    .map((entry) => ({
      path: path.join(destinationRoot, ...entry.path.split('/')),
      bytes: entry.bytes,
      maxBytes: MAX_SCENARIO_FILE_BYTES,
    }));
}

function recordPinnedFile(entry) {
  fs.chmodSync(entry.path, 0o400);
  const identity = fs.lstatSync(entry.path);
  if (identity.isSymbolicLink() || !identity.isFile() || identity.nlink !== 1) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  return {
    path: entry.path,
    identity,
    digest: stableDigest(entry.bytes),
    maxBytes: entry.maxBytes,
  };
}

function pinOracleCommand(options) {
  const command = options.scenario?.oracle?.command;
  const seedRelative = options.scenario?.paths?.seedDir;
  const oracleRelative = options.scenario?.paths?.oracleDir;
  if (
    !Array.isArray(command) ||
    command.length < 2 ||
    !['node', process.execPath].includes(command[0]) ||
    !relativePosix(command[1]) ||
    !relativePosix(seedRelative) ||
    !relativePosix(oracleRelative) ||
    seedRelative === oracleRelative ||
    seedRelative.startsWith(oracleRelative + '/') ||
    oracleRelative.startsWith(seedRelative + '/')
  ) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  const oracleRoot = path.resolve(
    options.scenarioRoot,
    ...oracleRelative.split('/'),
  );
  let pinnedRoot;
  try {
    const oracleRootStat = fs.lstatSync(oracleRoot);
    const oracleRootReal = fs.realpathSync(oracleRoot);
    if (oracleRootStat.isSymbolicLink() || !oracleRootStat.isDirectory()) {
      fail('ORACLE_INTEGRITY_FAILED');
    }
    const scriptPath = path.resolve(options.scenarioRoot, ...command[1].split('/'));
    const scriptReal = fs.realpathSync(scriptPath);
    if (
      scriptReal === oracleRootReal ||
      !containedPath(oracleRootReal, scriptReal)
    ) {
      fail('ORACLE_INTEGRITY_FAILED');
    }
    const oracleEntries = pinDirectoryEntries(
      options.scenarioRoot,
      oracleRelative,
      options.scenario.artifactHashes?.oracle,
      'oracle-input',
    );
    const seedEntries = pinDirectoryEntries(
      options.scenarioRoot,
      seedRelative,
      options.scenario.artifactHashes?.seed,
      'oracle-seed-input',
    );
    const schemaBytes = Buffer.from(TRUSTED_RUNTIME_RESPONSE_SCHEMA, 'utf8');
    scanPrivacyBuffer(schemaBytes, { surface: 'runtime-response-schema' });
    parseExactJson(schemaBytes);
    const trustedBase = path.resolve(options.trustedTempRoot ?? os.tmpdir());
    const trustedBaseStat = fs.lstatSync(trustedBase);
    if (trustedBaseStat.isSymbolicLink() || !trustedBaseStat.isDirectory()) {
      fail('ORACLE_INTEGRITY_FAILED');
    }
    pinnedRoot = fs.mkdtempSync(
      path.join(fs.realpathSync(trustedBase), 'governance-impact-oracle-'),
    );
    ensureSafeDirectoryChain(
      fs.realpathSync(trustedBase),
      pinnedRoot,
      fs,
      'ORACLE_INTEGRITY_FAILED',
    );
    fs.chmodSync(pinnedRoot, 0o700);
    const pendingFiles = [
      ...materializeMirroredDirectory(pinnedRoot, oracleRelative, oracleEntries),
      ...materializeMirroredDirectory(pinnedRoot, seedRelative, seedEntries),
    ];
    const pinnedScript = path.resolve(pinnedRoot, ...command[1].split('/'));
    const pinnedSchema = path.join(pinnedRoot, '.runtime-response.schema.json');
    writeExclusiveFile(pinnedSchema, schemaBytes, fs);
    pendingFiles.push({
      path: pinnedSchema,
      bytes: schemaBytes,
      maxBytes: MAX_JSON_INPUT_BYTES,
    });
    if (!pendingFiles.some((entry) => entry.path === pinnedScript)) {
      fail('ORACLE_INTEGRITY_FAILED');
    }
    const files = pendingFiles.map(recordPinnedFile);
    const rootIdentity = fs.lstatSync(pinnedRoot);
    return {
      root: pinnedRoot,
      rootIdentity,
      executable: process.execPath,
      script: pinnedScript,
      responseSchema: pinnedSchema,
      trailingArgs: command.slice(2),
      files,
    };
  } catch (error) {
    if (pinnedRoot) removeTreeAndProve(pinnedRoot, fs);
    if (error?.code === 'CLEANUP_FAILED') throw error;
    if (error?.code === 'ORACLE_INTEGRITY_FAILED') throw error;
    fail('ORACLE_INTEGRITY_FAILED');
  }
}

function verifyPinnedOracle(pin) {
  try {
    const rootStat = fs.lstatSync(pin.root);
    if (
      rootStat.isSymbolicLink() ||
      !rootStat.isDirectory() ||
      !sameFileIdentity(pin.rootIdentity, rootStat)
    ) {
      fail('ORACLE_INTEGRITY_FAILED');
    }
    const rootReal = fs.realpathSync(pin.root);
    for (const file of pin.files) {
      const stat = fs.lstatSync(file.path);
      if (
        stat.isSymbolicLink() ||
        !sameFileIdentity(file.identity, stat) ||
        !containedPath(rootReal, fs.realpathSync(file.path))
      ) {
        fail('ORACLE_INTEGRITY_FAILED');
      }
      const bytes = readStableRegularFile(
        file.path,
        rootReal,
        fs,
        stat,
        fs.realpathSync(file.path),
        file.maxBytes,
        'ORACLE_INTEGRITY_FAILED',
      );
      if (stableDigest(bytes) !== file.digest) fail('ORACLE_INTEGRITY_FAILED');
    }
  } catch (error) {
    if (error?.code === 'ORACLE_INTEGRITY_FAILED') throw error;
    fail('ORACLE_INTEGRITY_FAILED');
  }
}

function requireExactObject(value, required, allowed = required) {
  if (!isPlainObject(value)) fail('ORACLE_INTEGRITY_FAILED');
  const keys = Object.keys(value);
  if (
    required.some((key) => !Object.hasOwn(value, key)) ||
    keys.some((key) => !allowed.includes(key))
  ) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
}

function validateOracleResult(value, scenario) {
  const rootKeys = [
    'acceptanceChecks',
    'requirements',
    'scope',
    'prohibitions',
    'documentChecks',
    'privacyChecks',
    'repairRounds',
    'time',
    'tokens',
  ];
  requireExactObject(value, rootKeys);
  for (const key of [
    'acceptanceChecks',
    'requirements',
    'prohibitions',
    'documentChecks',
    'privacyChecks',
  ]) {
    if (!Array.isArray(value[key])) fail('ORACLE_INTEGRITY_FAILED');
  }
  const checkArrays = {
    acceptance: [value.acceptanceChecks, ['id', 'passed', 'critical']],
    prohibition: [value.prohibitions, ['id', 'violated', 'critical']],
    document: [value.documentChecks, ['id', 'drifted', 'critical']],
    privacy: [value.privacyChecks, ['id', 'passed', 'critical']],
  };
  for (const [kind, [entries, keys]] of Object.entries(checkArrays)) {
    const expected = scenario.checks.filter((check) => check.kind === kind);
    if (entries.length !== expected.length) fail('ORACLE_INTEGRITY_FAILED');
    const expectedById = new Map(expected.map((check) => [check.id, check]));
    const seen = new Set();
    for (const entry of entries) {
      requireExactObject(entry, keys);
      const contract = expectedById.get(entry.id);
      if (!contract || seen.has(entry.id) || entry.critical !== contract.critical) {
        fail('ORACLE_INTEGRITY_FAILED');
      }
      seen.add(entry.id);
      for (const key of keys.slice(1)) {
        if (typeof entry[key] !== 'boolean') fail('ORACLE_INTEGRITY_FAILED');
      }
    }
  }
  const requirementIds = scenario.facts
    .filter((fact) => fact.kind === 'requirement')
    .map((fact) => fact.id);
  if (
    value.requirements.length !== requirementIds.length ||
    value.requirements.some((entry) => {
      try {
        requireExactObject(entry, ['id', 'omitted']);
      } catch {
        return true;
      }
      return !requirementIds.includes(entry.id) || typeof entry.omitted !== 'boolean';
    }) ||
    new Set(value.requirements.map((entry) => entry.id)).size !== requirementIds.length
  ) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  requireExactObject(value.scope, ['changedPaths', 'allowedPaths', 'forbiddenPaths']);
  for (const key of ['changedPaths', 'allowedPaths', 'forbiddenPaths']) {
    if (
      !Array.isArray(value.scope[key]) ||
      value.scope[key].some((entry) => !relativePosix(entry)) ||
      new Set(value.scope[key]).size !== value.scope[key].length
    ) {
      fail('ORACLE_INTEGRITY_FAILED');
    }
  }
  if (
    JSON.stringify([...value.scope.allowedPaths].sort()) !==
      JSON.stringify([...scenario.allowedChangePaths].sort()) ||
    JSON.stringify([...value.scope.forbiddenPaths].sort()) !==
      JSON.stringify([...scenario.forbiddenChangePaths].sort())
  ) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  if (!Number.isSafeInteger(value.repairRounds) || value.repairRounds < 0) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  requireExactObject(value.time, ['availability', 'wallTimeMs']);
  requireExactObject(value.tokens, ['availability', 'total']);
  if (
    !(
      (value.time.availability === 'unavailable' && value.time.wallTimeMs === null) ||
      (value.time.availability === 'available' &&
        typeof value.time.wallTimeMs === 'number' &&
        Number.isFinite(value.time.wallTimeMs) &&
        value.time.wallTimeMs >= 0)
    ) ||
    !(
      (value.tokens.availability === 'unavailable' && value.tokens.total === null) ||
      (value.tokens.availability === 'available' &&
        Number.isSafeInteger(value.tokens.total) &&
        value.tokens.total >= 0)
    )
  ) {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  return value;
}

export async function runOracle(options) {
  const ownsPin = !options.pinnedOracle;
  const pin = options.pinnedOracle ?? pinOracleCommand(options);
  try {
    verifyPinnedOracle(pin);
    const result = await (options.runChildSafely ?? runChildSafely)(
      pin.executable,
      [pin.script, ...pin.trailingArgs, '--workspace', options.workspace],
      {
        cwd: pin.root,
        env: options.env,
        timeoutMs: options.timeoutMs,
        privacyScanner(buffer, context) {
          try {
            (options.privacyScanner ?? scanPrivacyBuffer)(buffer, context);
          } catch {
            fail('PRIVACY_OUTPUT_BLOCKED');
          }
        },
      },
    );
    verifyPinnedOracle(pin);
    if (result.status !== 'completed') fail('ORACLE_INTEGRITY_FAILED');
    let parsed;
    try {
      parsed = parseExactJson(Buffer.from(result.stdout, 'utf8'));
    } catch {
      fail('ORACLE_INTEGRITY_FAILED');
    }
    try {
      return validateOracleResult(parsed, options.scenario);
    } catch (error) {
      if (error?.code === 'ORACLE_INTEGRITY_FAILED') throw error;
      fail('ORACLE_INTEGRITY_FAILED');
    }
  } finally {
    if (ownsPin) {
      removeTreeAndProve(pin.root, fs);
    }
  }
}

export function deterministicArmOrder(seed) {
  const digest = sha256Canonical({
    domain: 'governance-impact-arm-order-v1',
    seed,
  });
  return Number.parseInt(digest.slice(0, 2), 16) % 2 === 0
    ? ['baseline', 'governed']
    : ['governed', 'baseline'];
}

async function defaultCleanup(prepared) {
  for (const entry of prepared.reverse()) {
    await fs.promises.rm(entry.root, { recursive: true, force: true });
    try {
      await fs.promises.lstat(entry.root);
      fail('CLEANUP_FAILED');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

export async function runPairedScenario(options) {
  const deps = options.deps ?? {};
  const attempt = options.manifest?.attempts?.find(
    (entry) => entry.attemptId === options.attemptId,
  );
  if (!attempt) fail('MANIFEST_MISMATCH');
  const cohort = options.manifest.cohort;
  const armOrder = (deps.order ?? deterministicArmOrder)(attempt.seed);
  const prepared = [];
  const arms = {};
  let pendingError = null;
  let oraclePin = null;
  try {
    if (!deps.runOracle) {
      oraclePin = (deps.pinOracleCommand ?? pinOracleCommand)(options);
      prepared.push({ root: oraclePin.root });
    }
    for (const arm of armOrder) {
      if (!deps.prepareArmWorkspace) verifyOracleArtifact(options.scenarioRoot, options.scenario);
      const armPaths = await (deps.prepareArmWorkspace ?? prepareArmWorkspace)({
        ...options,
        arm,
      });
      prepared.push(armPaths);
      const snapshot = deps.snapshotWorkspace ?? (
        deps.prepareArmWorkspace ? null : snapshotWorkspace
      );
      const beforeSnapshot = snapshot ? await snapshot(armPaths.workspace) : null;
      const command = (deps.buildRuntimeCommand ?? buildRuntimeCommand)(
        cohort.runtime,
        armPaths.workspace,
        options.scenario.paths?.taskFile ?? 'task.md',
        {
          executable: options.executable,
          model: cohort.model,
          responseSchema: oraclePin?.responseSchema ?? options.responseSchema,
          platform: options.platform,
        },
      );
      const environment = (deps.buildMinimalEnv ?? buildMinimalEnv)(
        cohort.runtime,
        { ...armPaths, codexHome: options.codexHome },
        { sourceEnv: options.sourceEnv, platform: options.platform },
      );
      const execution = await (deps.runChildSafely ?? runChildSafely)(
        command.executable,
        command.args,
        {
          cwd: armPaths.workspace,
          env: environment,
          stdin: command.stdin,
          timeoutMs: options.timeoutMs,
          privacyScanner(buffer, context) {
            try {
              (options.privacyScanner ?? scanPrivacyBuffer)(buffer, context);
            } catch {
              fail('PRIVACY_OUTPUT_BLOCKED');
            }
          },
          realExecution: true,
        },
      );
      const oracle = await (deps.runOracle ?? runOracle)({
        ...options,
        arm,
        workspace: armPaths.workspace,
        execution,
        env: environment,
        pinnedOracle: oraclePin,
      });
      if (!deps.prepareArmWorkspace) verifyOracleArtifact(options.scenarioRoot, options.scenario);
      if (deps.verifyContainment) {
        const contained = await deps.verifyContainment({ arm, armPaths, options });
        if (contained !== true) fail('WORKSPACE_CONTAINMENT_FAILED');
      }
      if (snapshot) {
        const afterSnapshot = await snapshot(armPaths.workspace);
        const changedPaths = changedPathsBetween(beforeSnapshot, afterSnapshot);
        if (
          !Array.isArray(oracle.scope?.changedPaths) ||
          JSON.stringify([...oracle.scope.changedPaths].sort()) !== JSON.stringify(changedPaths)
        ) {
          fail('ORACLE_INTEGRITY_FAILED');
        }
      }
      const {
        repairRounds = 0,
        time = {
          availability: 'available',
          wallTimeMs: execution.wallTimeMs ?? 0,
        },
        tokens = { availability: 'unavailable', total: null },
        ...evidence
      } = oracle;
      arms[arm] = {
        scenarioHash: attempt.scenarioHash,
        ...cohort,
        execution: {
          status: execution.status,
          repairRounds,
          errorCode: execution.errorCode,
        },
        ...evidence,
        time,
        tokens,
      };
    }
  } catch (error) {
    pendingError = error;
  }

  try {
    await (deps.cleanup ?? defaultCleanup)(prepared);
  } catch {
    throw impactError('CLEANUP_FAILED');
  }
  if (pendingError) throw normalizeError(pendingError);

  const rawRun = {
    schemaVersion: 1,
    runId: (deps.runIdFactory ?? randomUUID)(),
    attemptId: attempt.attemptId,
    repetitionId: attempt.repetitionId,
    seed: attempt.seed,
    scenario: options.scenario,
    arms: {
      baseline: arms.baseline,
      governed: arms.governed,
    },
  };
  let scored;
  try {
    scored = (deps.scoreRun ?? scoreRun)(rawRun);
  } catch {
    fail('ORACLE_INTEGRITY_FAILED');
  }
  try {
    scanPrivacyBuffer(Buffer.from(JSON.stringify(rawRun)), { surface: 'candidate-run' });
  } catch {
    fail('PRIVACY_OUTPUT_BLOCKED');
  }
  if (deps.persist) await deps.persist(rawRun);
  else if (options.outputPath) {
    await persistJsonAtomically(options.outputPath, rawRun, {
      repositoryRoot: options.repositoryRoot,
    });
  }
  return { rawRun, scored, armOrder };
}

function enumerateScenarioArtifactFiles(scenarioRoot, scenario, fsApi) {
  const scenarioState = fsApi.lstatSync(scenarioRoot);
  if (scenarioState.isSymbolicLink() || !scenarioState.isDirectory()) {
    fail('SCENARIO_NOT_COMMITTED');
  }
  const files = new Set();
  const walk = (absolute) => {
    let state;
    try {
      state = fsApi.lstatSync(absolute);
    } catch {
      fail('SCENARIO_NOT_COMMITTED');
    }
    if (state.isSymbolicLink()) fail('SCENARIO_NOT_COMMITTED');
    if (state.isFile()) {
      if (state.nlink !== 1) fail('SCENARIO_NOT_COMMITTED');
      files.add(absolute);
      return;
    }
    if (!state.isDirectory()) fail('SCENARIO_NOT_COMMITTED');
    for (const name of fsApi.readdirSync(absolute).sort((left, right) =>
      Buffer.from(left).compare(Buffer.from(right)),
    )) {
      walk(path.join(absolute, name));
    }
  };
  for (const relative of [
    'scenario.json',
    scenario.paths.seedDir,
    scenario.paths.taskFile,
    scenario.paths.governedOverlayDir,
    scenario.paths.oracleDir,
  ]) {
    walk(path.join(scenarioRoot, relative));
  }
  return [...files].sort((left, right) => Buffer.from(left).compare(Buffer.from(right)));
}

function verifyTrackedScenario(scenarioRoot, scenario, options = {}) {
  const repositoryRoot = options.repositoryRoot ?? REPOSITORY_ROOT;
  const gitRunner = options.gitRunner ?? spawnSync;
  const fsApi = options.fs ?? fs;
  const scopePaths = [
    'scenario.json',
    scenario.paths.seedDir,
    scenario.paths.taskFile,
    scenario.paths.governedOverlayDir,
    scenario.paths.oracleDir,
  ];
  const gitPath = (absolute) => {
    const relativeToRepository = path.relative(repositoryRoot, absolute);
    if (relativeToRepository.startsWith('..' + path.sep) || path.isAbsolute(relativeToRepository)) {
      fail('SCENARIO_NOT_COMMITTED');
    }
    return relativeToRepository.split(path.sep).join('/');
  };
  const runGit = (args, output = false) => gitRunner('git', args, {
    cwd: repositoryRoot,
    ...(output ? { encoding: 'utf8' } : { stdio: 'ignore' }),
    shell: false,
  });
  const scenarioFiles = enumerateScenarioArtifactFiles(scenarioRoot, scenario, fsApi);
  for (const absolute of scenarioFiles) {
    const relativeToRepository = gitPath(absolute);
    const literal = [relativeToRepository];
    const tracked = runGit([
      '--literal-pathspecs',
      'ls-files',
      '--error-unmatch',
      '--',
      ...literal,
    ]);
    const clean = runGit([
      '--literal-pathspecs',
      'diff',
      '--quiet',
      '--',
      ...literal,
    ]);
    const staged = runGit([
      '--literal-pathspecs',
      'diff',
      '--cached',
      '--quiet',
      '--',
      ...literal,
    ]);
    const stage = runGit([
      '--literal-pathspecs',
      'ls-files',
      '--stage',
      '-z',
      '--',
      ...literal,
    ], true);
    const stageText = String(stage.stdout ?? '');
    if (
      tracked.status !== 0 ||
      clean.status !== 0 ||
      staged.status !== 0 ||
      stage.status !== 0 ||
      !(stageText.startsWith('100644 ') || stageText.startsWith('100755 ')) ||
      stageText.split('\0').length !== 2 ||
      stageText.at(-1) !== '\0'
    ) {
      fail('SCENARIO_NOT_COMMITTED');
    }
  }
  for (const relative of scopePaths) {
    const relativeToRepository = gitPath(path.join(scenarioRoot, relative));
    const literal = [relativeToRepository];
    const clean = runGit([
      '--literal-pathspecs',
      'diff',
      '--quiet',
      '--',
      ...literal,
    ]);
    const staged = runGit([
      '--literal-pathspecs',
      'diff',
      '--cached',
      '--quiet',
      '--',
      ...literal,
    ]);
    const stage = runGit([
      '--literal-pathspecs',
      'ls-files',
      '--stage',
      '-z',
      '--',
      ...literal,
    ], true);
    if (
      clean.status !== 0 ||
      staged.status !== 0 ||
      stage.status !== 0 ||
      String(stage.stdout ?? '').split('\0').some((line) => line.startsWith('160000 '))
    ) {
      fail('SCENARIO_NOT_COMMITTED');
    }
  }
}

async function loadScenario(options, deps) {
  const repositoryRoot = deps.repositoryRoot ?? REPOSITORY_ROOT;
  const scenarioRoot = resolveRepositoryPath(options.scenario, repositoryRoot);
  const descriptor = deps.readExactJson ?? readExactJson;
  const scenario = descriptor(path.join(scenarioRoot, 'scenario.json'), {
    root: repositoryRoot,
  });
  const validation = validateScenario(scenario, scenarioRoot);
  if (!validation.valid) fail('INPUT_SCHEMA_INVALID');
  return { repositoryRoot, scenarioRoot, scenario, scenarioHash: validation.scenarioHash };
}

async function verifyScenarioHashes(scenarioRoot, scenario, deps) {
  const actual = await (deps.hashScenarioArtifacts ?? hashScenarioArtifacts)(
    scenarioRoot,
    scenario,
    deps.hashOptions,
  );
  for (const key of ['seed', 'task', 'governedOverlay', 'oracle']) {
    if (actual[key] !== scenario.artifactHashes[key]) fail('ARTIFACT_HASH_MISMATCH');
  }
  return actual;
}

async function handleValidate(options, deps) {
  if (options.policy && !options.manifest) fail('MISSING_OPTION');
  const loaded = await loadScenario(options, deps);
  const trackedVerifier = deps.verifyTrackedScenario ?? verifyTrackedScenario;
  const trackingOptions = {
    repositoryRoot: loaded.repositoryRoot,
    gitRunner: deps.gitRunner,
    fs: deps.fs,
  };
  trackedVerifier(
    loaded.scenarioRoot,
    loaded.scenario,
    trackingOptions,
  );
  await verifyScenarioHashes(loaded.scenarioRoot, loaded.scenario, deps);
  trackedVerifier(loaded.scenarioRoot, loaded.scenario, trackingOptions);
  let manifestHash = null;
  if (options.manifest) {
    const reader = deps.readExactJson ?? readExactJson;
    const manifest = reader(
      resolveRepositoryPath(options.manifest, loaded.repositoryRoot),
      { root: loaded.repositoryRoot },
    );
    const policy = options.policy
      ? reader(resolveRepositoryPath(options.policy, loaded.repositoryRoot), {
          root: loaded.repositoryRoot,
        })
      : null;
    manifestHash = normalizeAndVerifyManifest(manifest, policy).manifestHash;
  }
  return {
    artifact: null,
    summary: {
      scenarioId: loaded.scenario.id,
      scenarioHash: loaded.scenarioHash,
      manifestHash,
    },
  };
}

async function handleReplay(options, deps) {
  const loaded = await loadScenario(options, deps);
  await verifyScenarioHashes(loaded.scenarioRoot, loaded.scenario, deps);
  const reader = deps.readExactJson ?? readExactJson;
  const manifest = reader(resolveRepositoryPath(options.manifest, loaded.repositoryRoot), {
    root: loaded.repositoryRoot,
  });
  const rawRun = reader(resolveRepositoryPath(options.run, loaded.repositoryRoot), {
    root: loaded.repositoryRoot,
  });
  normalizeAndVerifyManifest(manifest);
  if (sha256Canonical(rawRun.scenario) !== loaded.scenarioHash) fail('ARTIFACT_HASH_MISMATCH');
  if (!manifest.attempts.some((attempt) => attempt.attemptId === rawRun.attemptId)) {
    fail('MANIFEST_MISMATCH');
  }
  let scored;
  try {
    scored = (deps.scoreRun ?? scoreRun)(rawRun);
  } catch {
    fail('INPUT_SCHEMA_INVALID');
  }
  const outputPath = resolveRepositoryPath(options.output, loaded.repositoryRoot);
  const artifact = await (deps.persistJsonAtomically ?? persistJsonAtomically)(
    outputPath,
    scored,
    { repositoryRoot: loaded.repositoryRoot, fs: deps.fs },
  );
  return {
    artifact: {
      path: options.output,
      sha256: artifact.sha256,
    },
    summary: {
      attemptId: scored.attemptId,
      scenarioHash: scored.scenarioHash,
      deliveryPass: scored.arms.baseline.deliveryPass && scored.arms.governed.deliveryPass,
      winner: scored.comparison.winner,
    },
  };
}

async function handleRun(options, deps) {
  const loaded = await loadScenario(options, deps);
  if (loaded.scenario.dataClassification !== 'synthetic') fail('DATA_CLASSIFICATION_BLOCKED');
  const trackedVerifier = deps.verifyTrackedScenario ?? verifyTrackedScenario;
  const trackingOptions = {
    repositoryRoot: loaded.repositoryRoot,
    gitRunner: deps.gitRunner,
    fs: deps.fs,
  };
  trackedVerifier(
    loaded.scenarioRoot,
    loaded.scenario,
    trackingOptions,
  );
  await verifyScenarioHashes(loaded.scenarioRoot, loaded.scenario, deps);
  trackedVerifier(loaded.scenarioRoot, loaded.scenario, trackingOptions);
  const reader = deps.readExactJson ?? readExactJson;
  const manifest = reader(resolveRepositoryPath(options.manifest, loaded.repositoryRoot), {
    root: loaded.repositoryRoot,
  });
  const policy = reader(resolveRepositoryPath(options.policy, loaded.repositoryRoot), {
    root: loaded.repositoryRoot,
  });
  const normalized = normalizeAndVerifyManifest(manifest, policy, {
    requirePolicyPin: true,
  });
  const attempt = normalized.manifest.attempts.find(
    (entry) => entry.attemptId === options['attempt-id'],
  );
  if (!attempt || attempt.scenarioHash !== loaded.scenarioHash) fail('MANIFEST_MISMATCH');
  const runtime = normalized.manifest.cohort.runtime;
  const executable = (deps.resolveRuntimeExecutable ?? resolveRuntimeExecutable)(
    runtime,
    deps.env ?? process.env,
    deps.platform ?? process.platform,
    deps.fs ?? fs,
  );
  if (!executable) fail('RUNTIME_MISSING');
  const capabilities = (deps.runtimeCapabilities ?? runtimeCapabilities)(
    runtime,
    deps.platform ?? process.platform,
  );
  if (
    !capabilities.noSessionPersistence ||
    !capabilities.workspaceOnly ||
    !capabilities.processTree
  ) {
    fail('SESSION_SAFETY_UNAVAILABLE');
  }
  const codexHome = runtime === 'codex' ? (deps.env ?? process.env).CODEX_HOME : undefined;
  if (runtime === 'codex') {
    const sourceHome = (deps.env ?? process.env).HOME;
    if (
      !path.isAbsolute(codexHome ?? '') ||
      (sourceHome && path.resolve(codexHome) === path.resolve(sourceHome, '.codex'))
    ) {
      fail('SESSION_SAFETY_UNAVAILABLE');
    }
    try {
      const state = (deps.fs ?? fs).lstatSync(codexHome);
      if (!state.isDirectory() || state.isSymbolicLink()) fail('SESSION_SAFETY_UNAVAILABLE');
    } catch {
      fail('SESSION_SAFETY_UNAVAILABLE');
    }
  }
  const outputPath = resolveRepositoryPath(options.output, loaded.repositoryRoot);
  ensureSafeDirectoryChain(
    loaded.repositoryRoot,
    path.dirname(outputPath),
    deps.fs ?? fs,
    'PATH_POLICY_BLOCKED',
  );
  const response = await runPairedScenario({
    scenario: loaded.scenario,
    scenarioRoot: loaded.scenarioRoot,
    manifest: normalized.manifest,
    policy,
    attemptId: attempt.attemptId,
    outputPath,
    executable,
    codexHome,
    timeoutMs: options['timeout-ms'],
    sourceEnv: deps.env ?? process.env,
    platform: deps.platform ?? process.platform,
    repositoryRoot: loaded.repositoryRoot,
    deps: deps.runnerDeps,
  });
  const serialized = JSON.stringify(response.rawRun) + '\n';
  return {
    artifact: {
      path: options.output,
      sha256: createHash('sha256').update(serialized).digest('hex'),
    },
    summary: {
      attemptId: response.scored.attemptId,
      scenarioHash: response.scored.scenarioHash,
      armOrder: response.armOrder,
      deliveryPass:
        response.scored.arms.baseline.deliveryPass &&
        response.scored.arms.governed.deliveryPass,
      winner: response.scored.comparison.winner,
    },
  };
}

async function handleAggregate(options, deps) {
  const root = deps.repositoryRoot ?? REPOSITORY_ROOT;
  const reader = deps.readExactJson ?? readExactJson;
  const manifest = reader(resolveRepositoryPath(options.manifest, root), { root });
  const policy = reader(resolveRepositoryPath(options.policy, root), { root });
  const runs = options.run.map((entry) =>
    reader(resolveRepositoryPath(entry, root), { root }),
  );
  const normalized = normalizeAndVerifyManifest(manifest, policy, {
    requirePolicyPin: true,
  });
  if (policy.expectedBootstrapSeed === null || policy.expectedBootstrapSeed === undefined) {
    fail('BOOTSTRAP_SEED_MISMATCH');
  }
  const report = (deps.aggregateResults ?? aggregateResults)(
    runs,
    policy.expectedBootstrapSeed,
    normalized.manifest,
  );
  if (report.manifestHash !== normalized.manifestHash) fail('MANIFEST_HASH_MISMATCH');
  const expectedCommitment = sha256Canonical({
    manifestHash: report.manifestHash,
    acceptedRuns: report.evidence.acceptedRuns,
  });
  if (report.evidence.commitment !== expectedCommitment) fail('INPUT_SCHEMA_INVALID');
  const artifactResult = await (deps.persistJsonAtomically ?? persistJsonAtomically)(
    resolveRepositoryPath(options.output, root),
    report,
    { repositoryRoot: root, fs: deps.fs },
  );
  return {
    artifact: { path: options.output, sha256: artifactResult.sha256 },
    summary: {
      manifestHash: report.manifestHash,
      commitment: report.evidence.commitment,
      expectedPairs: report.pairing.expectedPairs,
      comparablePairs: report.pairing.comparablePairs,
      rejectedPairs: report.pairing.rejectedPairs,
    },
  };
}

async function handleGate(options, deps) {
  const root = deps.repositoryRoot ?? REPOSITORY_ROOT;
  const reader = deps.readExactJson ?? readExactJson;
  const report = reader(resolveRepositoryPath(options.report, root), { root });
  const policy = reader(resolveRepositoryPath(options.policy, root), { root });
  const rawRuns = options.run.map((entry) =>
    reader(resolveRepositoryPath(entry, root), { root }),
  );
  return { gate: (deps.evaluateGate ?? evaluateGate)(report, policy, rawRuns) };
}

async function executeCommand(command, options, deps) {
  if (deps.commandHandlers?.[command]) return deps.commandHandlers[command](options, deps);
  if (command === 'validate') return handleValidate(options, deps);
  if (command === 'replay') return handleReplay(options, deps);
  if (command === 'run') return handleRun(options, deps);
  if (command === 'aggregate') return handleAggregate(options, deps);
  if (command === 'gate') return handleGate(options, deps);
  fail('UNKNOWN_COMMAND');
}

function writeJson(stream, value) {
  stream.write(JSON.stringify(value) + '\n');
}

async function runControls(deps) {
  const controlsRoot =
    deps.controlsRoot ?? path.join(REPOSITORY_ROOT, 'tests', 'governance-impact', 'controls');
  let passed = 0;
  for (const name of CONTROL_NAMES) {
    const rawRun = readExactJson(path.join(controlsRoot, name, 'run.json'), {
      root: controlsRoot,
    });
    const result = scoreRun(rawRun);
    if (result.comparison.winner !== CONTROL_WINNERS[name]) fail('INPUT_SCHEMA_INVALID');
    passed += 1;
  }
  return {
    artifact: null,
    summary: { controls: [...CONTROL_NAMES], passed },
  };
}

export async function main(argv = process.argv.slice(2), io = {}, deps = {}) {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  let parsed;
  try {
    parsed = parseCommand(argv);
    if (
      parsed.command === 'run' &&
      (deps.env ?? process.env).GOVERNANCE_IMPACT_REAL !== '1'
    ) {
      fail('REAL_MODE_REQUIRED');
    }
    const result =
      parsed.command === 'controls'
        ? await runControls(deps)
        : await executeCommand(parsed.command, parsed.options, deps);
    if (parsed.command === 'gate') {
      if (!result.gate.pass) {
        writeJson(stdout, {
          schemaVersion: 1,
          ok: false,
          command: 'gate',
          code: 'GATE_REJECTED',
          claim: result.gate.claim,
          failures: result.gate.failures,
        });
        return 1;
      }
      writeJson(stdout, {
        schemaVersion: 1,
        ok: true,
        command: 'gate',
        code: 'OK',
        claim: result.gate.claim,
        failures: [],
      });
      return 0;
    }
    writeJson(stdout, {
      schemaVersion: 1,
      ok: true,
      command: parsed.command,
      code: 'OK',
      artifact: result.artifact,
      summary: result.summary,
    });
    return 0;
  } catch (caught) {
    const error = normalizeError(caught);
    const [defaultExit, message, suggestion] =
      ERROR_CONTRACT[error.code] ?? ERROR_CONTRACT.INPUT_SCHEMA_INVALID;
    const exitCode = Number.isInteger(error.exitCode) ? error.exitCode : defaultExit;
    writeJson(stderr, {
      schemaVersion: 1,
      error: true,
      code: error.code,
      exitCode,
      message,
      suggestion,
    });
    return exitCode;
  }
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  process.exitCode = await main();
}

export {
  buildMinimalEnv,
  buildRuntimeCommand,
  resolveRuntimeExecutable,
  runChildSafely,
  runtimeCapabilities,
  terminateProcessTree,
};
