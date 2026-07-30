import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BUILTIN_CATALOG,
  selectResponsibilities,
} from './decision-role-core.mjs';
import {
  adapterPathFor,
  targetDefinition,
} from './target-registry.mjs';

const MAX_BYTES = 1024 * 1024;
const MAX_DEPTH = 64;
const MAX_MEMBERS = 10_000;
const MAX_IGNORE_BYTES = 64 * 1024;
const SCHEMA_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../schemas',
);
const SCHEMA_NAMES = new Set([
  'risk-profile.schema.json',
  'source-lock.schema.json',
  'governance-pack.schema.json',
  'role-catalog.schema.json',
  'role-assignment.schema.json',
  'deliberation-plan.schema.json',
  'deliberation-result.schema.json',
  'policy-manifest.schema.json',
  'codex-policy-adapter.schema.json',
  'claude-policy-adapter.schema.json',
  'compile-receipt.schema.json',
  'materialize-receipt.schema.json',
  'attest-output.schema.json',
  'cli-output.schema.json',
]);
const SAFE_SUBJECT = /^(?:SRC|REQ|DEC|DLB|AC|TASK|ROLE|POL|EVD|ATT|RISK|PACK|CAT|CONF)-[A-Z0-9@.-]+$/;
const SAFE_MESSAGES = Object.freeze({
  INVALID_UTF8: 'governance content is not valid UTF-8',
  DUPLICATE_JSON_KEY: 'governance JSON contains a duplicate key',
  FILE_TOO_LARGE: 'governance artifact exceeds the byte limit',
  JSON_LIMIT_EXCEEDED: 'governance JSON exceeds its structural limit',
  PRIVATE_CONTENT_BLOCKED: 'private governance content was blocked',
  SECRET_VALUE_BLOCKED: 'secret-like governance content was blocked',
  PATH_ESCAPE_BLOCKED: 'governance path escaped its allowed boundary',
  SYMLINK_BLOCKED: 'governance path contains an unsafe link or identity change',
  INVALID_JSON: 'governance content is not exact JSON',
  SCHEMA_VERSION_UNSUPPORTED: 'governance schema version is unsupported',
  SCHEMA_VALIDATION_FAILED: 'governance artifact does not match its schema',
  DUPLICATE_ID: 'governance artifact contains a duplicate stable ID',
  SOURCE_REVISION_UNPINNED: 'external source revision is not pinned',
  SOURCE_LICENSE_MISSING: 'external source license is missing',
  SOURCE_HASH_MISSING: 'external source hash is missing',
  SOURCE_PROVENANCE_MISMATCH: 'external source provenance does not match its lock',
  ROLE_PRIVILEGE_EXPANSION: 'role assignment exceeds the project permission ceiling',
  ROLE_SEPARATION_VIOLATION: 'role assignment violates separation of duties',
  INVALID_STATUS_TRANSITION: 'governance status transition is invalid',
  DECISION_REFERENCE_MISSING: 'referenced decision is unknown',
  TASK_REFERENCE_MISSING: 'referenced task is unknown',
  DELIBERATION_VERSION_MISMATCH: 'deliberation graph version does not match',
  DELIBERATION_HASH_MISMATCH: 'deliberation content hash does not match',
  DELIBERATION_SOURCE_MISMATCH: 'deliberation source revision does not match',
  DELIBERATION_NOT_HUMAN_CONFIRMED: 'human confirmation record is missing or invalid',
});
const schemaCache = new Map();

class GovernanceArtifactError extends Error {
  constructor(code, subject) {
    super(SAFE_MESSAGES[code] ?? 'governance artifact was blocked');
    this.name = 'GovernanceArtifactError';
    this.code = code;
    this.subject = safeSubject(subject);
  }
}

function safeSubject(subject) {
  return typeof subject === 'string' && SAFE_SUBJECT.test(subject)
    ? subject
    : 'governance-artifact';
}

function fail(code, subject) {
  throw new GovernanceArtifactError(code, subject);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalize(value, ancestors, state, depth) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON number');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (depth >= MAX_DEPTH) throw new TypeError('canonical JSON depth');
    if (ancestors.has(value)) throw new TypeError('canonical JSON cycle');
    if (Object.keys(value).length !== value.length) {
      throw new TypeError('canonical JSON sparse array');
    }
    state.members += value.length;
    if (state.members > MAX_MEMBERS) {
      throw new TypeError('canonical JSON member limit');
    }
    ancestors.add(value);
    const result = `[${value
      .map((entry) => canonicalize(entry, ancestors, state, depth + 1))
      .join(',')}]`;
    ancestors.delete(value);
    return result;
  }
  if (!isPlainObject(value)) throw new TypeError('canonical JSON object');
  if (depth >= MAX_DEPTH) throw new TypeError('canonical JSON depth');
  if (ancestors.has(value)) throw new TypeError('canonical JSON cycle');
  const keys = Object.keys(value).sort();
  state.members += keys.length;
  if (state.members > MAX_MEMBERS) {
    throw new TypeError('canonical JSON member limit');
  }
  ancestors.add(value);
  const entries = keys.map((key) => {
    const entry = value[key];
    if (
      entry === undefined
      || typeof entry === 'function'
      || typeof entry === 'symbol'
      || typeof entry === 'bigint'
    ) {
      throw new TypeError('canonical JSON value');
    }
    return `${JSON.stringify(key)}:${canonicalize(
      entry,
      ancestors,
      state,
      depth + 1,
    )}`;
  });
  ancestors.delete(value);
  return `{${entries.join(',')}}`;
}

export function canonicalJson(value) {
  return canonicalize(value, new Set(), { members: 0 }, 0);
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

export function sha256Bytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function sha256Canonical(value) {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

function isGovernanceRelative(relativePath) {
  return String(relativePath)
    .replaceAll('\\', '/')
    .split('/')
    .includes('.agent-governance');
}

function parseExactJson(text, relativePath, subject) {
  if (text.charCodeAt(0) === 0xfeff || text.includes('\0')) {
    fail(
      isGovernanceRelative(relativePath)
        ? 'PRIVATE_CONTENT_BLOCKED'
        : 'INVALID_JSON',
      subject,
    );
  }
  let index = 0;
  let members = 0;

  function skipWhitespace() {
    while (
      index < text.length
      && (
        text[index] === ' '
        || text[index] === '\n'
        || text[index] === '\r'
        || text[index] === '\t'
      )
    ) {
      index += 1;
    }
  }

  function parseString() {
    const start = index;
    index += 1;
    let escaped = false;
    while (index < text.length) {
      const code = text.charCodeAt(index);
      if (code < 0x20) fail('INVALID_JSON', subject);
      const character = text[index];
      index += 1;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        try {
          return JSON.parse(text.slice(start, index));
        } catch {
          fail('INVALID_JSON', subject);
        }
      }
    }
    fail('INVALID_JSON', subject);
  }

  function enterContainer(depth) {
    if (depth >= MAX_DEPTH) {
      fail('JSON_LIMIT_EXCEEDED', subject);
    }
  }

  function countMember() {
    members += 1;
    if (members > MAX_MEMBERS) {
      fail('JSON_LIMIT_EXCEEDED', subject);
    }
  }

  function parseValue(depth) {
    skipWhitespace();
    const character = text[index];
    if (character === '{') {
      enterContainer(depth);
      index += 1;
      const object = {};
      const keys = new Set();
      skipWhitespace();
      if (text[index] === '}') {
        index += 1;
        return object;
      }
      while (index < text.length) {
        skipWhitespace();
        if (text[index] !== '"') {
          fail('INVALID_JSON', subject);
        }
        const key = parseString();
        if (keys.has(key)) {
          fail('DUPLICATE_JSON_KEY', subject);
        }
        keys.add(key);
        countMember();
        skipWhitespace();
        if (text[index] !== ':') {
          fail('INVALID_JSON', subject);
        }
        index += 1;
        object[key] = parseValue(depth + 1);
        skipWhitespace();
        if (text[index] === '}') {
          index += 1;
          return object;
        }
        if (text[index] !== ',') {
          fail('INVALID_JSON', subject);
        }
        index += 1;
      }
      fail('INVALID_JSON', subject);
    }
    if (character === '[') {
      enterContainer(depth);
      index += 1;
      const array = [];
      skipWhitespace();
      if (text[index] === ']') {
        index += 1;
        return array;
      }
      while (index < text.length) {
        countMember();
        array.push(parseValue(depth + 1));
        skipWhitespace();
        if (text[index] === ']') {
          index += 1;
          return array;
        }
        if (text[index] !== ',') {
          fail('INVALID_JSON', subject);
        }
        index += 1;
      }
      fail('INVALID_JSON', subject);
    }
    if (character === '"') return parseString();
    for (const [literal, value] of [
      ['true', true],
      ['false', false],
      ['null', null],
    ]) {
      if (text.startsWith(literal, index)) {
        index += literal.length;
        return value;
      }
    }
    const number = text
      .slice(index)
      .match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if (number) {
      index += number[0].length;
      const value = Number(number[0]);
      if (Number.isFinite(value)) return value;
    }
    fail('INVALID_JSON', subject);
  }

  const value = parseValue(0);
  skipWhitespace();
  if (index !== text.length) {
    fail('INVALID_JSON', subject);
  }
  return value;
}

function unsafePathString(value) {
  if (typeof value !== 'string') return false;
  if (/^(?:~[\\/]|\/|[A-Za-z]:[\\/]|\\\\)/u.test(value)) return true;
  return /(?:^|[\\/])\.\.(?:[\\/]|$)/u.test(value);
}

function secretUrlKey(value) {
  const normalized = String(value)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]/gu, '');
  return normalized === 'key'
    || /(?:token|secret|signature|password|passwd|credential|cookie|session|privatekey)/u
      .test(normalized);
}

function secretQueryString(value) {
  if (typeof value !== 'string' || !/^https?:\/\//iu.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return true;
    for (const key of url.searchParams.keys()) {
      if (secretUrlKey(key)) return true;
    }
    const fragment = new URLSearchParams(
      url.hash.slice(1).replaceAll(';', '&'),
    );
    for (const key of fragment.keys()) {
      if (secretUrlKey(key)) return true;
    }
  } catch {
    return false;
  }
  return false;
}

function scanArtifact(value, subject) {
  const ancestors = new Set();
  let members = 0;

  function visit(entry, depth, key = '') {
    if (typeof entry === 'string') {
      if (unsafePathString(entry)) fail('PATH_ESCAPE_BLOCKED', subject);
      if (secretQueryString(entry)) fail('SECRET_VALUE_BLOCKED', subject);
      if (/\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/u.test(entry)) {
        fail('SECRET_VALUE_BLOCKED', subject);
      }
      if (
        /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u.test(entry)
        || /\bgithub_pat_[A-Za-z0-9_]{20,}\b/u.test(entry)
        || /\bAKIA[A-Z0-9]{16}\b/u.test(entry)
        || /-----BEGIN [A-Z ]*PRIVATE KEY-----/u.test(entry)
        || /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/iu.test(entry)
      ) {
        fail('SECRET_VALUE_BLOCKED', subject);
      }
      return;
    }
    if (entry === null || typeof entry !== 'object') return;
    if (depth >= MAX_DEPTH || ancestors.has(entry)) {
      fail('PRIVATE_CONTENT_BLOCKED', subject);
    }
    ancestors.add(entry);
    if (Array.isArray(entry)) {
      members += entry.length;
      if (members > MAX_MEMBERS) fail('PRIVATE_CONTENT_BLOCKED', subject);
      for (const item of entry) visit(item, depth + 1);
      ancestors.delete(entry);
      return;
    }
    if (!isPlainObject(entry)) fail('PRIVATE_CONTENT_BLOCKED', subject);
    const entries = Object.entries(entry);
    members += entries.length;
    if (members > MAX_MEMBERS) fail('PRIVATE_CONTENT_BLOCKED', subject);
    for (const [property, item] of entries) {
      const normalized = property.replaceAll(/[^A-Za-z0-9]/g, '').toLowerCase();
      if (
        /^(?:rawprompt|rawmodeloutput|rawstdout|rawstderr|providertrace|providersession|privateprompt)$/u
          .test(normalized)
      ) {
        fail('PRIVATE_CONTENT_BLOCKED', subject);
      }
      if (
        /^(?:apikey|accesstoken|providercookie|cookie|credential|privatekey|clientsecret|token|secret|password|authorization|sessioncookie|sessiontoken)$/u
          .test(normalized)
      ) {
        fail('SECRET_VALUE_BLOCKED', subject);
      }
      visit(item, depth + 1, property);
    }
    ancestors.delete(entry);
  }

  visit(value, 0);
}

function portableRelativePath(relativePath, subject) {
  if (
    typeof relativePath !== 'string'
    || relativePath.length === 0
    || relativePath.includes('\0')
    || path.posix.isAbsolute(relativePath)
    || path.win32.isAbsolute(relativePath)
    || /^~[\\/]/u.test(relativePath)
  ) {
    fail('PATH_ESCAPE_BLOCKED', subject);
  }
  const segments = relativePath.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => segment === '..')) {
    fail('PATH_ESCAPE_BLOCKED', subject);
  }
  return segments.filter((segment) => segment !== '' && segment !== '.');
}

function sameIdentity(left, right) {
  return (
    left
    && right
    && left.dev === right.dev
    && left.ino === right.ino
    && left.isDirectory() === right.isDirectory()
    && left.isFile() === right.isFile()
  );
}

function hasMultipleLinks(stat) {
  return typeof stat?.nlink === 'bigint'
    ? stat.nlink > 1n
    : Number(stat?.nlink) > 1;
}

function readDescriptor(fsApi, filename, limit, subject, relativePath) {
  let descriptor;
  try {
    const noFollow = Number.isInteger(fsApi.constants?.O_NOFOLLOW)
      ? fsApi.constants.O_NOFOLLOW
      : 0;
    descriptor = fsApi.openSync(
      filename,
      fsApi.constants.O_RDONLY | noFollow,
    );
    const opened = fsApi.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile()) fail('SYMLINK_BLOCKED', subject);
    if (hasMultipleLinks(opened)) fail('SYMLINK_BLOCKED', subject);
    if (opened.size > BigInt(limit)) {
      fail('FILE_TOO_LARGE', subject);
    }
    const expectedSize = Number(opened.size);
    const buffer = Buffer.allocUnsafe(expectedSize);
    const count = expectedSize === 0
      ? 0
      : fsApi.readSync(descriptor, buffer, 0, expectedSize, 0);
    if (count !== expectedSize) fail('SYMLINK_BLOCKED', subject);
    return { bytes: buffer, stat: opened };
  } catch (error) {
    if (error instanceof GovernanceArtifactError) throw error;
    if (error?.code === 'ELOOP') fail('SYMLINK_BLOCKED', subject);
    fail('PATH_ESCAPE_BLOCKED', subject);
  } finally {
    if (descriptor !== undefined) {
      try {
        fsApi.closeSync(descriptor);
      } catch {
        // The primary fail-closed error is retained.
      }
    }
  }
}

function readSmallUtf8(fsApi, filename, subject) {
  const { bytes } = readDescriptor(
    fsApi,
    filename,
    MAX_IGNORE_BYTES,
    subject,
    'governance-ignore',
  );
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    fail('PRIVATE_CONTENT_BLOCKED', subject);
  }
}

function checkLocalBoundary(root, fsApi, subject) {
  const governance = path.join(root, '.agent-governance');
  const local = path.join(governance, 'local');
  let localStat;
  try {
    localStat = fsApi.lstatSync(local, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    fail('SYMLINK_BLOCKED', subject);
  }
  if (localStat.isSymbolicLink() || !localStat.isDirectory()) {
    fail('SYMLINK_BLOCKED', subject);
  }
  const ignore = path.join(governance, '.gitignore');
  let ignoreStat;
  try {
    ignoreStat = fsApi.lstatSync(ignore, { bigint: true });
  } catch {
    fail('PRIVATE_CONTENT_BLOCKED', subject);
  }
  if (ignoreStat.isSymbolicLink() || !ignoreStat.isFile()) {
    fail('PRIVATE_CONTENT_BLOCKED', subject);
  }
  const content = readSmallUtf8(fsApi, ignore, subject);
  const rules = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== '' && !line.startsWith('#'));
  const ignored = rules.includes('local/') || rules.includes('/local/');
  const unignored = rules.includes('!local/') || rules.includes('!/local/');
  if (!ignored || unignored) fail('PRIVATE_CONTENT_BLOCKED', subject);
}

function resolveRoot(projectRoot, fsApi, subject) {
  try {
    return fsApi.realpathSync(projectRoot);
  } catch {
    fail('PATH_ESCAPE_BLOCKED', subject);
  }
}

function inspectComponents(root, segments, fsApi, subject, allowMissing) {
  let current = root;
  let lastStat = fsApi.lstatSync(root, { bigint: true });
  const components = [{ absolute: root, stat: lastStat }];
  for (const segment of segments) {
    current = path.join(current, segment);
    let stat;
    try {
      stat = fsApi.lstatSync(current, { bigint: true });
    } catch (error) {
      if (allowMissing && error?.code === 'ENOENT') {
        fsApi.mkdirSync(current, { mode: 0o700 });
        stat = fsApi.lstatSync(current, { bigint: true });
      } else {
        throw error;
      }
    }
    if (stat.isSymbolicLink()) fail('SYMLINK_BLOCKED', subject);
    lastStat = stat;
    components.push({ absolute: current, stat });
  }
  return { absolute: current, stat: lastStat, components };
}

function resolveReadPath(projectRoot, relativePath, fsApi, subject) {
  const segments = portableRelativePath(relativePath, subject);
  const root = resolveRoot(projectRoot, fsApi, subject);
  checkLocalBoundary(root, fsApi, subject);
  let inspected;
  try {
    inspected = inspectComponents(root, segments, fsApi, subject, false);
  } catch (error) {
    if (error instanceof GovernanceArtifactError) throw error;
    fail('PATH_ESCAPE_BLOCKED', subject);
  }
  if (!inspected.stat.isFile()) fail('SYMLINK_BLOCKED', subject);
  const real = fsApi.realpathSync(inspected.absolute);
  if (real !== root && !real.startsWith(`${root}${path.sep}`)) {
    fail('PATH_ESCAPE_BLOCKED', subject);
  }
  return { ...inspected, root };
}

function readJsonArtifactRecord(projectRoot, relativePath, options = {}) {
  const fsApi = options.fs ?? fs;
  const subject = options.subject;
  const resolved = resolveReadPath(
    projectRoot,
    relativePath,
    fsApi,
    subject,
  );
  const opened = readDescriptor(
    fsApi,
    resolved.absolute,
    MAX_BYTES,
    subject,
    relativePath,
  );
  let after;
  try {
    after = fsApi.lstatSync(resolved.absolute, { bigint: true });
  } catch {
    fail('SYMLINK_BLOCKED', subject);
  }
  for (const component of resolved.components.slice(0, -1)) {
    let current;
    try {
      current = fsApi.lstatSync(component.absolute, { bigint: true });
    } catch {
      fail('SYMLINK_BLOCKED', subject);
    }
    if (
      current.isSymbolicLink()
      || !current.isDirectory()
      || !sameIdentity(component.stat, current)
    ) {
      fail('SYMLINK_BLOCKED', subject);
    }
  }
  if (
    after.isSymbolicLink()
    || !after.isFile()
    || hasMultipleLinks(resolved.stat)
    || hasMultipleLinks(opened.stat)
    || hasMultipleLinks(after)
    || !sameIdentity(resolved.stat, opened.stat)
    || !sameIdentity(opened.stat, after)
    || resolved.stat.size !== opened.stat.size
    || opened.stat.size !== after.size
  ) {
    fail('SYMLINK_BLOCKED', subject);
  }
  let text;
  if (
    opened.bytes.length >= 3
    && opened.bytes[0] === 0xef
    && opened.bytes[1] === 0xbb
    && opened.bytes[2] === 0xbf
  ) {
    fail(
      isGovernanceRelative(relativePath)
        ? 'PRIVATE_CONTENT_BLOCKED'
        : 'INVALID_JSON',
      subject,
    );
  }
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(opened.bytes);
  } catch {
    fail('INVALID_UTF8', subject);
  }
  const value = parseExactJson(text, relativePath, subject);
  scanArtifact(value, subject);
  return { value, bytes: opened.bytes };
}

export function readJsonArtifact(projectRoot, relativePath, options = {}) {
  return readJsonArtifactRecord(
    projectRoot,
    relativePath,
    options,
  ).value;
}

export function readJsonArtifactWithBytes(
  projectRoot,
  relativePath,
  options = {},
) {
  return readJsonArtifactRecord(projectRoot, relativePath, options);
}

function ensureWriteParent(projectRoot, relativePath, fsApi, subject) {
  const segments = portableRelativePath(relativePath, subject);
  if (segments.length === 0) fail('PATH_ESCAPE_BLOCKED', subject);
  const filename = segments.pop();
  const root = resolveRoot(projectRoot, fsApi, subject);
  checkLocalBoundary(root, fsApi, subject);
  let inspected;
  try {
    inspected = inspectComponents(root, segments, fsApi, subject, true);
  } catch (error) {
    if (error instanceof GovernanceArtifactError) throw error;
    fail('PATH_ESCAPE_BLOCKED', subject);
  }
  if (!inspected.stat.isDirectory()) fail('SYMLINK_BLOCKED', subject);
  return {
    root,
    parent: inspected.absolute,
    parentStat: inspected.stat,
    components: inspected.components,
    target: path.join(inspected.absolute, filename),
  };
}

function assertWriteBoundary(resolved, fsApi, subject) {
  for (const component of resolved.components) {
    let current;
    try {
      current = fsApi.lstatSync(component.absolute, { bigint: true });
    } catch {
      fail('SYMLINK_BLOCKED', subject);
    }
    if (
      current.isSymbolicLink()
      || !current.isDirectory()
      || !sameIdentity(component.stat, current)
    ) {
      fail('SYMLINK_BLOCKED', subject);
    }
  }
}

function checkedRegularFile(fsApi, file, subject) {
  let stat;
  try {
    stat = fsApi.lstatSync(file, { bigint: true });
  } catch {
    fail('SYMLINK_BLOCKED', subject);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) {
    fail('SYMLINK_BLOCKED', subject);
  }
  return stat;
}

function unlinkIfIdentityMatches(fsApi, file, expected) {
  if (!expected) return false;
  try {
    const current = fsApi.lstatSync(file, { bigint: true });
    if (
      !current.isSymbolicLink()
      && current.isFile()
      && sameIdentity(expected, current)
    ) {
      fsApi.unlinkSync(file);
      return true;
    }
  } catch {
    // Best-effort rollback never removes an identity it did not create.
  }
  return false;
}

export function writeJsonArtifact(
  projectRoot,
  relativePath,
  value,
  options = {},
) {
  const fsApi = options.fs ?? fs;
  const subject = options.subject;
  scanArtifact(value, subject);
  const bytes = canonicalJsonBytes(value);
  if (bytes.length > MAX_BYTES) fail('PRIVATE_CONTENT_BLOCKED', subject);
  const resolved = ensureWriteParent(
    projectRoot,
    relativePath,
    fsApi,
    subject,
  );
  const temp = path.join(
    resolved.parent,
    `.agent-governance-${randomBytes(12).toString('hex')}.tmp`,
  );
  let tempCreated = false;
  let backupCreated = false;
  let backup = null;
  let backupIdentity = null;
  try {
    const descriptor = fsApi.openSync(
      temp,
      fsApi.constants.O_CREAT
        | fsApi.constants.O_EXCL
        | fsApi.constants.O_WRONLY,
      0o600,
    );
    tempCreated = true;
    try {
      fsApi.writeFileSync(descriptor, bytes);
      fsApi.fsyncSync(descriptor);
    } finally {
      fsApi.closeSync(descriptor);
    }
    const tempStat = checkedRegularFile(fsApi, temp, subject);
    assertWriteBoundary(resolved, fsApi, subject);

    let existing;
    try {
      existing = fsApi.lstatSync(resolved.target, { bigint: true });
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (existing) {
      if (existing.isSymbolicLink() || !existing.isFile()) {
        fail('SYMLINK_BLOCKED', subject);
      }
      const current = readJsonArtifactWithBytes(projectRoot, relativePath, {
        ...options,
        fs: fsApi,
      });
      if (current.bytes.equals(bytes)) {
        assertWriteBoundary(resolved, fsApi, subject);
        fsApi.unlinkSync(temp);
        tempCreated = false;
        assertWriteBoundary(resolved, fsApi, subject);
        options.onWriteResult?.('unchanged');
        return value;
      }
      if (!options.allowReplace) fail('INVALID_STATUS_TRANSITION', subject);
      backup = path.join(
        resolved.parent,
        `.agent-governance-${randomBytes(12).toString('hex')}.bak`,
      );
      assertWriteBoundary(resolved, fsApi, subject);
      const existingBefore = checkedRegularFile(
        fsApi,
        resolved.target,
        subject,
      );
      if (!sameIdentity(existing, existingBefore)) {
        fail('SYMLINK_BLOCKED', subject);
      }
      backupIdentity = existingBefore;
      fsApi.linkSync(resolved.target, backup);
      backupCreated = true;
      const backupStat = checkedRegularFile(fsApi, backup, subject);
      if (!sameIdentity(existingBefore, backupStat)) {
        fail('SYMLINK_BLOCKED', subject);
      }
      backupIdentity = backupStat;
      assertWriteBoundary(resolved, fsApi, subject);
      const existingReady = checkedRegularFile(
        fsApi,
        resolved.target,
        subject,
      );
      if (!sameIdentity(existingBefore, existingReady)) {
        fail('SYMLINK_BLOCKED', subject);
      }
      let replaced = false;
      try {
        fsApi.renameSync(temp, resolved.target);
        tempCreated = false;
        replaced = true;
        assertWriteBoundary(resolved, fsApi, subject);
        const published = checkedRegularFile(
          fsApi,
          resolved.target,
          subject,
        );
        if (!sameIdentity(tempStat, published)) {
          fail('SYMLINK_BLOCKED', subject);
        }
      } catch (error) {
        if (replaced) {
          const currentTarget = checkedRegularFile(
            fsApi,
            resolved.target,
            subject,
          );
          const currentBackup = checkedRegularFile(fsApi, backup, subject);
          if (
            sameIdentity(tempStat, currentTarget)
            && sameIdentity(existingBefore, currentBackup)
          ) {
            fsApi.renameSync(backup, resolved.target);
            backupCreated = false;
          }
        }
        throw error;
      }
      fsApi.unlinkSync(backup);
      backupCreated = false;
      options.onWriteResult?.('updated');
      return value;
    }

    let published = false;
    try {
      fsApi.linkSync(temp, resolved.target);
      published = true;
      assertWriteBoundary(resolved, fsApi, subject);
      const targetStat = checkedRegularFile(
        fsApi,
        resolved.target,
        subject,
      );
      if (!sameIdentity(tempStat, targetStat)) {
        fail('SYMLINK_BLOCKED', subject);
      }
      fsApi.unlinkSync(temp);
      tempCreated = false;
      assertWriteBoundary(resolved, fsApi, subject);
      const finalStat = checkedRegularFile(
        fsApi,
        resolved.target,
        subject,
      );
      if (!sameIdentity(tempStat, finalStat)) {
        fail('SYMLINK_BLOCKED', subject);
      }
    } catch (error) {
      if (published) {
        unlinkIfIdentityMatches(fsApi, resolved.target, tempStat);
      }
      throw error;
    }
    options.onWriteResult?.('created');
    return value;
  } catch (error) {
    if (error instanceof GovernanceArtifactError) throw error;
    if (error?.code === 'EEXIST' || error?.code === 'ELOOP') {
      fail('SYMLINK_BLOCKED', subject);
    }
    fail('PATH_ESCAPE_BLOCKED', subject);
  } finally {
    if (backupCreated && backup) {
      unlinkIfIdentityMatches(fsApi, backup, backupIdentity);
    }
    if (tempCreated) {
      try {
        fsApi.unlinkSync(temp);
      } catch {
        // A failed cleanup never turns the operation into success.
      }
    }
  }
}

function schemaError(code, location = '$') {
  return {
    code,
    path: location,
    subject: 'governance-artifact',
    message: SAFE_MESSAGES[code] ?? SAFE_MESSAGES.SCHEMA_VALIDATION_FAILED,
  };
}

function addSchemaError(errors, code, location) {
  if (!errors.some((error) => error.code === code && error.path === location)) {
    errors.push(schemaError(code, location));
  }
}

function loadSchema(schemaName) {
  if (!SCHEMA_NAMES.has(schemaName)) return null;
  if (schemaCache.has(schemaName)) return schemaCache.get(schemaName);
  const schema = JSON.parse(
    fs.readFileSync(path.join(SCHEMA_ROOT, schemaName), 'utf8'),
  );
  schemaCache.set(schemaName, schema);
  return schema;
}

function resolveSchemaRef(rootSchema, reference) {
  let targetRoot = rootSchema;
  let fragment = reference;
  if (!reference.startsWith('#')) {
    const separator = reference.indexOf('#');
    const schemaName = separator === -1
      ? reference
      : reference.slice(0, separator);
    if (!SCHEMA_NAMES.has(schemaName)) return null;
    targetRoot = loadSchema(schemaName);
    fragment = separator === -1 ? '' : reference.slice(separator);
  }
  if (fragment === '') {
    return { schema: targetRoot, rootSchema: targetRoot };
  }
  if (!fragment.startsWith('#/')) return null;
  let current = targetRoot;
  for (const segment of fragment.slice(2).split('/')) {
    current = current?.[segment.replaceAll('~1', '/').replaceAll('~0', '~')];
  }
  return current
    ? { schema: current, rootSchema: targetRoot }
    : null;
}

function matchesType(type, value) {
  if (Array.isArray(type)) return type.some((entry) => matchesType(entry, value));
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'object') return isPlainObject(value);
  if (type === 'integer') return Number.isInteger(value);
  return typeof value === type;
}

function validateSchemaNode(schema, value, rootSchema, location, errors) {
  if (!schema) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    return;
  }
  if (schema.$ref) {
    const resolved = resolveSchemaRef(rootSchema, schema.$ref);
    if (!resolved) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
      return;
    }
    validateSchemaNode(
      resolved.schema,
      value,
      resolved.rootSchema,
      location,
      errors,
    );
    return;
  }
  if (schema.oneOf) {
    let matches = 0;
    for (const candidate of schema.oneOf) {
      const candidateErrors = [];
      validateSchemaNode(
        candidate,
        value,
        rootSchema,
        location,
        candidateErrors,
      );
      if (candidateErrors.length === 0) matches += 1;
    }
    if (matches !== 1) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
      return;
    }
  }
  if (schema.const !== undefined && value !== schema.const) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    return;
  }
  if (schema.enum && !schema.enum.some((entry) => Object.is(entry, value))) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    return;
  }
  if (schema.type && !matchesType(schema.type, value)) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    return;
  }
  if (typeof value === 'string') {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
    if (schema.pattern && !new RegExp(schema.pattern, 'u').test(value)) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
    if (
      schema.format === 'date-time'
      && (
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/u
          .test(value)
        || Number.isNaN(Date.parse(value))
      )
    ) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
  }
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
    }
    if (schema.uniqueItems) {
      const identities = value.map((entry) => canonicalJson(entry));
      if (new Set(identities).size !== identities.length) {
        addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', location);
      }
    }
    value.forEach((entry, index) => {
      validateSchemaNode(
        schema.items ?? {},
        entry,
        rootSchema,
        `${location}[${index}]`,
        errors,
      );
    });
  }
  if (isPlainObject(value)) {
    for (const required of schema.required ?? []) {
      if (!Object.hasOwn(value, required)) {
        addSchemaError(
          errors,
          'SCHEMA_VALIDATION_FAILED',
          `${location}.${required}`,
        );
      }
    }
    for (const [key, entry] of Object.entries(value)) {
      if (schema.properties?.[key]) {
        validateSchemaNode(
          schema.properties[key],
          entry,
          rootSchema,
          `${location}.${key}`,
          errors,
        );
      } else if (schema.additionalProperties === false) {
        addSchemaError(
          errors,
          'SCHEMA_VALIDATION_FAILED',
          `${location}.${key}`,
        );
      }
    }
  }
}

function duplicateId(values, key) {
  if (!Array.isArray(values)) return false;
  const ids = values.map((entry) => entry?.[key]).filter(Boolean);
  return new Set(ids).size !== ids.length;
}

function duplicateValue(values) {
  if (!Array.isArray(values)) return false;
  return new Set(values).size !== values.length;
}

function addDuplicateError(errors, values, key, location) {
  if (duplicateId(values, key)) {
    addSchemaError(errors, 'DUPLICATE_ID', location);
  }
}

function sameCanonicalSet(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right)) return false;
  const normalize = (values) => values
    .map((entry) => canonicalJson(entry))
    .sort();
  const normalizedLeft = normalize(left);
  const normalizedRight = normalize(right);
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every(
      (entry, index) => entry === normalizedRight[index],
    );
}

function validatePolicyManifestSemantic(value, errors) {
  // A manifest is compiled for exactly one target and records it in targets[0];
  // targetSupport is keyed by that same name. Reading it here keeps the
  // expectations below derived from the artifact rather than from a literal.
  const manifestTarget = value?.targets?.[0]?.target;
  addDuplicateError(errors, value?.inputHashes, 'path', '$.inputHashes');
  for (const [index, input] of (value?.inputHashes ?? []).entries()) {
    if (
      input?.path === '.agent-governance/local'
      || input?.path?.startsWith('.agent-governance/local/')
    ) {
      addSchemaError(
        errors,
        'PRIVATE_CONTENT_BLOCKED',
        `$.inputHashes[${index}].path`,
      );
    }
  }
  addDuplicateError(
    errors,
    value?.roleAssignmentRefs,
    'assignmentId',
    '$.roleAssignmentRefs',
  );
  addDuplicateError(
    errors,
    value?.roleAssignmentRefs,
    'taskId',
    '$.roleAssignmentRefs',
  );
  addDuplicateError(
    errors,
    value?.roleAssignmentRefs,
    'path',
    '$.roleAssignmentRefs',
  );
  addDuplicateError(errors, value?.enabledPacks, 'packId', '$.enabledPacks');
  addDuplicateError(errors, value?.enabledPacks, 'path', '$.enabledPacks');
  addDuplicateError(errors, value?.targets, 'target', '$.targets');
  const packEvidenceRefs = [];
  for (const [index, pack] of (value?.enabledPacks ?? []).entries()) {
    const expectedRequirements = [
      ...(pack.mechanicalCheckIds ?? []).map((checkId) => ({
        checkId,
        kind: 'mechanical',
      })),
      ...(pack.humanReviewCheckIds ?? []).map((checkId) => ({
        checkId,
        kind: 'human-review',
      })),
    ].map((requirement) => ({
      ...requirement,
      evidenceRef: `EVD-PACK-${sha256Canonical({
        packId: pack.packId,
        version: pack.version,
        ...requirement,
      }).slice(0, 16).toUpperCase()}`,
    }));
    if (!sameCanonicalSet(
      pack.checkRequirements,
      expectedRequirements,
    )) {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        `$.enabledPacks[${index}].checkRequirements`,
      );
    }
    packEvidenceRefs.push(
      ...expectedRequirements.map((entry) => entry.evidenceRef),
    );
  }

  const controls = Object.values(value?.controls ?? {})
    .filter(Array.isArray)
    .flat();
  addDuplicateError(errors, controls, 'controlId', '$.controls');
  addDuplicateError(errors, controls, 'capability', '$.controls');
  if (
    duplicateValue(packEvidenceRefs)
    || packEvidenceRefs.some((evidenceRef) => (
      !value?.evidenceRequirements?.includes(evidenceRef)
      || controls.some(
        (control) => !control.evidenceRequirement?.includes(evidenceRef),
      )
    ))
  ) {
    addSchemaError(
      errors,
      'SCHEMA_VALIDATION_FAILED',
      '$.evidenceRequirements',
    );
  }
  const byId = new Map(
    controls.map((control) => [control.controlId, control]),
  );
  addDuplicateError(
    errors,
    value?.unsupportedControls,
    'controlId',
    '$.unsupportedControls',
  );
  addDuplicateError(
    errors,
    value?.unsupportedControls,
    'capability',
    '$.unsupportedControls',
  );
  for (const [index, unsupported] of (
    value?.unsupportedControls ?? []
  ).entries()) {
    const control = byId.get(unsupported.controlId);
    if (
      !control
      || control.capability !== unsupported.capability
      || control.targetSupport?.[manifestTarget] !== 'unsupported'
    ) {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        `$.unsupportedControls[${index}]`,
      );
    }
  }
  const expectedUnsupported = controls
    .filter((control) => control.targetSupport?.[manifestTarget] === 'unsupported')
    .map((control) => ({
      controlId: control.controlId,
      capability: control.capability,
      target: manifestTarget,
      support: 'unsupported',
      reasonCode: targetDefinition(manifestTarget)?.unsupportedReasonCode,
    }));
  if (!sameCanonicalSet(value?.unsupportedControls, expectedUnsupported)) {
    addSchemaError(
      errors,
      'SCHEMA_VALIDATION_FAILED',
      '$.unsupportedControls',
    );
  }
  if (duplicateValue(value?.humanApprovalControls)) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.humanApprovalControls');
  }
  for (const [index, controlId] of (
    value?.humanApprovalControls ?? []
  ).entries()) {
    if (!byId.has(controlId)) {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        `$.humanApprovalControls[${index}]`,
      );
    }
  }
  const expectedApproval = controls
    .filter((control) => (
      control.mode === 'require-approval'
      || (
        control.mode !== 'deny'
        && control.targetSupport?.[manifestTarget] === 'requires-human-approval'
      )
    ))
    .map((control) => control.controlId);
  if (!sameCanonicalSet(value?.humanApprovalControls, expectedApproval)) {
    addSchemaError(
      errors,
      'SCHEMA_VALIDATION_FAILED',
      '$.humanApprovalControls',
    );
  }
  if (typeof value?.policyId === 'string') {
    const seed = structuredClone(value);
    delete seed.policyId;
    const expectedPolicyId =
      `POL-${sha256Canonical(seed).slice(0, 12).toUpperCase()}`;
    if (value.policyId !== expectedPolicyId) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.policyId');
    }
  }
}

function validateTargetAdapterSemantic(value, context, errors) {
  const mapped = value?.mappedControls ?? [];
  const unsupported = value?.unsupportedControls ?? [];
  addDuplicateError(errors, mapped, 'controlId', '$.mappedControls');
  addDuplicateError(errors, mapped, 'capability', '$.mappedControls');
  addDuplicateError(
    errors,
    unsupported,
    'controlId',
    '$.unsupportedControls',
  );
  addDuplicateError(
    errors,
    unsupported,
    'capability',
    '$.unsupportedControls',
  );
  const mappedIds = new Set(mapped.map((entry) => entry?.controlId));
  const mappedCapabilities = new Set(
    mapped.map((entry) => entry?.capability),
  );
  if (unsupported.some((entry) => (
    mappedIds.has(entry?.controlId)
    || mappedCapabilities.has(entry?.capability)
  ))) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.unsupportedControls');
  }
  if (typeof value?.policyId === 'string') {
    const expected = [
      adapterPathFor(value.target, value.policyId),
      `.agent-governance/policies/${value.policyId}.json`,
    ].sort();
    const actual = [...(value.generatedFiles ?? [])].sort();
    if (
      actual.length !== expected.length
      || actual.some((entry, index) => entry !== expected[index])
    ) {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        '$.generatedFiles',
      );
    }
  }
  const manifest = context.manifest;
  if (manifest) {
    const controls = Object.values(manifest.controls ?? {})
      .filter(Array.isArray)
      .flat();
    const expectedMapped = controls
      .filter((control) => control.targetSupport?.[value.target] !== 'unsupported')
      .map((control) => ({
        controlId: control.controlId,
        capability: control.capability,
        mode: control.mode,
        support: control.targetSupport[value.target],
        representation: control.targetSupport[value.target] === 'enforceable'
          ? 'compiler-owned-artifact'
          : control.targetSupport[value.target] === 'requires-human-approval'
            ? 'human-approval-guidance'
            : 'guidance',
      }));
    if (
      value.policyId !== manifest.policyId
      || value.policyHash !== sha256Bytes(canonicalJsonBytes(manifest))
      || !sameCanonicalSet(value.mappedControls, expectedMapped)
      || !sameCanonicalSet(
        value.unsupportedControls,
        manifest.unsupportedControls,
      )
      || !sameCanonicalSet(
        value.humanReviewRequired,
        manifest.humanApprovalControls,
      )
    ) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$');
    }
  }
}

function validateCompileReceiptSemantic(value, context, errors) {
  addDuplicateError(errors, value?.inputHashes, 'path', '$.inputHashes');
  addDuplicateError(errors, value?.outputHashes, 'path', '$.outputHashes');
  const fileStates = [
    ...(value?.filesCreated ?? []),
    ...(value?.filesUpdated ?? []),
    ...(value?.filesUnchanged ?? []),
  ];
  if (duplicateValue(fileStates)) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.filesCreated');
  }
  if (
    typeof value?.policyId === 'string'
    && typeof value?.compileId === 'string'
  ) {
    const expectedStates = [
      adapterPathFor(value.target, value.policyId),
      `.agent-governance/policies/${value.policyId}.json`,
      `.agent-governance/receipts/${value.compileId}.json`,
    ].sort();
    const actualStates = [...fileStates].sort();
    if (
      actualStates.length !== expectedStates.length
      || actualStates.some(
        (entry, index) => entry !== expectedStates[index],
      )
    ) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.filesCreated');
    }
  }
  if (typeof value?.policyId === 'string') {
    const expected = [
      adapterPathFor(value.target, value.policyId),
      `.agent-governance/policies/${value.policyId}.json`,
    ].sort();
    const actual = (value.outputHashes ?? [])
      .map((entry) => entry?.path)
      .sort();
    if (
      actual.length !== expected.length
      || actual.some((entry, index) => entry !== expected[index])
    ) {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        '$.outputHashes',
      );
    }
  }
  if (
    typeof value?.compileId === 'string'
    && typeof value?.policyId === 'string'
    && Array.isArray(value?.outputHashes)
  ) {
    const expectedCompileId =
      `COMPILE-${sha256Canonical({
        policyId: value.policyId,
        target: value.target,
        outputHashes: value.outputHashes,
      }).slice(0, 12).toUpperCase()}`;
    if (value.compileId !== expectedCompileId) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.compileId');
    }
  }
  const manifest = context.manifest;
  const adapter = context.adapter;
  if (manifest && adapter) {
    const expectedOutputHashes = [
      {
        path: adapterPathFor(value.target, manifest.policyId),
        sha256: sha256Bytes(canonicalJsonBytes(adapter)),
      },
      {
        path: `.agent-governance/policies/${manifest.policyId}.json`,
        sha256: sha256Bytes(canonicalJsonBytes(manifest)),
      },
    ];
    const expectedWarnings = [
      ...(manifest.unsupportedControls.length > 0
        ? ['POLICY_UNSUPPORTED_CONTROL']
        : []),
      ...(Object.values(manifest.controls).flat().some(
        (control) => !['enforceable', 'unsupported'].includes(
          control.targetSupport[value.target],
        ),
      )
        ? [targetDefinition(value.target)?.unsupportedReasonCode]
        : []),
    ];
    if (
      value.policyId !== manifest.policyId
      || !sameCanonicalSet(value.inputHashes, manifest.inputHashes)
      || !sameCanonicalSet(value.outputHashes, expectedOutputHashes)
      || !sameCanonicalSet(
        value.unsupportedControls,
        manifest.unsupportedControls,
      )
      || !sameCanonicalSet(value.warnings, expectedWarnings)
    ) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$');
    }
  }
}

function findLockedSource(sourceLock, sourceId) {
  return sourceLock?.sources?.find((entry) => entry.sourceId === sourceId);
}

function validateExternalSource(
  source,
  sourceLock,
  errors,
  location,
  artifactPath = null,
) {
  if (!source) return;
  if (!source.revision) {
    addSchemaError(errors, 'SOURCE_REVISION_UNPINNED', `${location}.revision`);
  }
  if (!source.license) {
    addSchemaError(errors, 'SOURCE_LICENSE_MISSING', `${location}.license`);
  }
  if (!source.sha256) {
    addSchemaError(errors, 'SOURCE_HASH_MISSING', `${location}.sha256`);
  }
  const locked = findLockedSource(sourceLock, source.sourceId);
  if (
    sourceLock
    && (
      !locked
      || locked.repository !== source.repository
      || locked.commit !== source.revision
      || locked.license !== source.license
      || locked.importedMode !== source.importedMode
      || locked.sha256 !== source.sha256
      || (
        artifactPath
        && !locked.importedFiles?.includes(
          artifactPath.replaceAll('\\', '/'),
        )
      )
    )
  ) {
    addSchemaError(errors, 'SOURCE_PROVENANCE_MISMATCH', location);
  }
}

const PERMISSION_RANK = Object.freeze({
  deny: 0,
  'require-human-approval': 1,
  'constrained-allow': 2,
  allow: 3,
  advisory: 4,
});

function rootCapability(capability) {
  if (typeof capability !== 'string') return capability;
  if (capability.startsWith('network.')) return 'network';
  if (capability.startsWith('credentials.')) return 'credentials';
  return capability;
}

function validateRoleAssignment(value, context, errors) {
  const selectedRoles = Array.isArray(value?.selectedRoles)
    ? value.selectedRoles
    : [];
  const specialistIds = selectedRoles
    .map((role) => role?.specialistRoleId)
    .filter((roleId) => roleId && roleId !== 'unassigned');
  if (
    new Set(specialistIds).size !== specialistIds.length
    || duplicateId(selectedRoles, 'responsibility')
  ) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.selectedRoles');
  }
  if (
    Array.isArray(context.knownTaskIds)
    && !context.knownTaskIds.includes(value?.taskId)
  ) {
    addSchemaError(errors, 'TASK_REFERENCE_MISSING', '$.taskId');
  }
  const ceiling = context.riskProfile?.permissionCeiling
    ?? value?.permissionCeiling;
  const task = context.riskProfile?.tasks?.find(
    (candidate) => candidate.taskId === value?.taskId,
  );
  const taskCapabilities = task
    ? new Set((task.requestedCapabilities ?? []).map(rootCapability))
    : null;
  for (const [index, selectedRole] of selectedRoles.entries()) {
    const role = selectedRole
      && typeof selectedRole === 'object'
      && !Array.isArray(selectedRole)
      ? selectedRole
      : {};
    const assignedTaskScope = Array.isArray(role.assignedTaskScope)
      ? role.assignedTaskScope
      : [];
    const requestedCapabilities = Array.isArray(role.requestedCapabilities)
      ? role.requestedCapabilities
      : [];
    const grantedCapabilityCeiling = role.grantedCapabilityCeiling
      && typeof role.grantedCapabilityCeiling === 'object'
      && !Array.isArray(role.grantedCapabilityCeiling)
      ? role.grantedCapabilityCeiling
      : {};
    const allowedRequests = new Set(taskCapabilities ?? []);
    if (role.responsibility !== 'implementation-owner') {
      allowedRequests.add('filesystem.project-read');
    }
    if (
      assignedTaskScope.length !== 1
      || assignedTaskScope[0] !== value?.taskId
      || (
        Array.isArray(context.knownTaskIds)
        && !context.knownTaskIds.includes(assignedTaskScope[0])
      )
      || (
        taskCapabilities
        && requestedCapabilities.some(
          (capability) => !allowedRequests.has(rootCapability(capability)),
        )
      )
    ) {
      addSchemaError(
        errors,
        'ROLE_PRIVILEGE_EXPANSION',
        `$.selectedRoles[${index}]`,
      );
    }
    for (const [capability, grant] of Object.entries(
      grantedCapabilityCeiling,
    )) {
      const allowed = ceiling?.[rootCapability(capability)];
      const assignmentAllowed =
        value?.permissionCeiling?.[rootCapability(capability)];
      if (
        allowed === undefined
        || assignmentAllowed === undefined
        || PERMISSION_RANK[grant] === undefined
        || PERMISSION_RANK[allowed] === undefined
        || PERMISSION_RANK[assignmentAllowed] === undefined
        || PERMISSION_RANK[grant] > PERMISSION_RANK[allowed]
        || PERMISSION_RANK[grant] > PERMISSION_RANK[assignmentAllowed]
      ) {
        addSchemaError(
          errors,
          'ROLE_PRIVILEGE_EXPANSION',
          `$.selectedRoles[${index}].grantedCapabilityCeiling`,
        );
      }
    }
    if (['external', 'external-catalog'].includes(role.source)) {
      const catalog = context.roleCatalog;
      const source = catalog?.source;
      const catalogPath = context.roleCatalogPath?.replaceAll('\\', '/');
      const assignedCatalogPath = typeof role.sourceCatalog === 'string'
        ? role.sourceCatalog.replaceAll('\\', '/')
        : null;
      const locked = findLockedSource(
        context.sourceLock,
        source?.sourceId,
      );
      const catalogRole = (catalog?.roles ?? []).find(
        (candidate) => candidate.roleId === role.specialistRoleId,
      );
      if (
        !catalog
        || !catalogPath
        || catalogPath !== assignedCatalogPath
        || source?.revision !== role.sourceRevision
        || source?.license !== role.sourceLicense
        || source?.sha256 !== role.sourceHash
        || !locked
        || locked.repository !== source?.repository
        || locked.commit !== source?.revision
        || locked.license !== source?.license
        || locked.importedMode !== source?.importedMode
        || locked.sha256 !== source?.sha256
        || !locked.importedFiles?.includes(catalogPath)
        || !catalogRole
      ) {
        addSchemaError(
          errors,
          'SOURCE_PROVENANCE_MISMATCH',
          `$.selectedRoles[${index}]`,
        );
      }
      if (
        catalogRole
        && task
        && (
          !catalogRole.supportedResponsibilities?.includes(
            role.responsibility,
          )
          || !(catalogRole.supportedSurfaces ?? []).some(
            (surface) => (task.surfaces ?? []).includes(surface),
          )
          || !sameCanonicalSet(
            requestedCapabilities,
            catalogRole.requestedCapabilities ?? [],
          )
        )
      ) {
        addSchemaError(
          errors,
          'ROLE_CATALOG_INVALID',
          `$.selectedRoles[${index}]`,
        );
      }
    } else if (
      role.source === 'builtin'
      && (
        role.sourceCatalog !== BUILTIN_CATALOG.catalogId
        || role.sourceRevision !== BUILTIN_CATALOG.revision
        || role.sourceLicense !== BUILTIN_CATALOG.license
        || role.sourceHash !== BUILTIN_CATALOG.sourceHash
      )
    ) {
      addSchemaError(
        errors,
        'SOURCE_PROVENANCE_MISMATCH',
        `$.selectedRoles[${index}]`,
      );
    }
  }
  const selectedByResponsibility = new Map(
    selectedRoles.map((role) => [role?.responsibility, role]),
  );
  const requiredResponsibilities = task
    ? selectResponsibilities(task).responsibilities
    : ['implementation-owner'];
  const implementation =
    selectedByResponsibility.get('implementation-owner');
  const reviewerIds = new Set(
    selectedRoles
      .filter((role) => role?.responsibility !== 'implementation-owner')
      .map((role) => role?.specialistRoleId),
  );
  const separation = value?.separationOfDuties;
  if (
    value?.status === 'assigned'
    && separation?.required === true
    && (
      requiredResponsibilities.some(
        (responsibility) => !selectedByResponsibility.has(responsibility),
      )
      || !implementation
      || separation.implementationOwner
        !== implementation.specialistRoleId
      || implementation.cannotApprove !== true
      || !reviewerIds.has(separation?.finalVerifier)
      || separation.finalVerifier === implementation.specialistRoleId
    )
  ) {
    addSchemaError(errors, 'ROLE_SEPARATION_VIOLATION', '$.separationOfDuties');
  }
  const previous = context.previousArtifact;
  if (previous) {
    const allowed = {
      assigned: new Set(['superseded']),
      'needs-human-selection': new Set(['assigned', 'superseded']),
      blocked: new Set(['superseded']),
    };
    if (!allowed[previous.status]?.has(value.status)) {
      addSchemaError(errors, 'INVALID_STATUS_TRANSITION', '$.status');
    }
  }
}

function validatePlan(value, context, errors) {
  if (
    Array.isArray(context.knownDecisionIds)
    && !context.knownDecisionIds.includes(value.decisionId)
  ) {
    addSchemaError(errors, 'DECISION_REFERENCE_MISSING', '$.decisionId');
  }
  if (duplicateId(value.seats, 'seatId')) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.seats');
  }
  if (duplicateId(value.rounds, 'round')) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.rounds');
  }
  if (context.decision) {
    if (
      context.decision.decisionId !== value.decisionId
      || context.decision.revision !== value.decisionRevision
    ) {
      addSchemaError(errors, 'DECISION_REFERENCE_MISSING', '$.decisionId');
    }
    if (sha256Canonical(context.decision) !== value.decisionSha256) {
      addSchemaError(errors, 'DELIBERATION_HASH_MISMATCH', '$.decisionSha256');
    }
  }
  if (value.planSha256) {
    const unhashed = structuredClone(value);
    delete unhashed.planSha256;
    if (sha256Canonical(unhashed) !== value.planSha256) {
      addSchemaError(errors, 'DELIBERATION_HASH_MISMATCH', '$.planSha256');
    }
  }
}

function importedResultHashInput(value) {
  const hashable = structuredClone(value);
  delete hashable.resultSha256;
  hashable.importStatus = 'imported';
  return hashable;
}

function normalizedReceiptHashInput(value) {
  const hashable = importedResultHashInput(value);
  if (
    hashable.afterReceipt
    && Object.hasOwn(hashable.afterReceipt, 'normalizedResultSha256')
  ) {
    delete hashable.afterReceipt.normalizedResultSha256;
  }
  return hashable;
}

function validateResult(value, context, errors) {
  for (const [values, key, location] of [
    [value.seatResults, 'seatId', '$.seatResults'],
    [value.claims, 'claimId', '$.claims'],
    [value.disagreements, 'disagreementId', '$.disagreements'],
    [value.assumptions, 'assumptionId', '$.assumptions'],
    [value.unknowns, 'unknownId', '$.unknowns'],
    [value.rankedOptions, 'optionId', '$.rankedOptions'],
  ]) {
    if (duplicateId(values, key)) {
      addSchemaError(errors, 'DUPLICATE_ID', location);
    }
  }
  const plan = context.plan;
  if (
    Array.isArray(context.knownDecisionIds)
    && !context.knownDecisionIds.includes(value.decisionId)
  ) {
    addSchemaError(errors, 'DECISION_REFERENCE_MISSING', '$.decisionId');
  }
  if (plan) {
    if (
      value.graphId !== plan.graphId
      || value.graphVersion !== plan.graphVersion
    ) {
      addSchemaError(errors, 'DELIBERATION_VERSION_MISMATCH', '$.graphVersion');
    }
    if (value.sourceRevision !== plan.sourceRevision) {
      addSchemaError(errors, 'DELIBERATION_SOURCE_MISMATCH', '$.sourceRevision');
    }
    if (
      value.decisionId !== plan.decisionId
      || value.decisionRevision !== plan.decisionRevision
    ) {
      addSchemaError(errors, 'DECISION_REFERENCE_MISSING', '$.decisionId');
    }
    if (
      value.decisionSha256 !== plan.decisionSha256
      || value.planRevision !== plan.planRevision
      || value.planSha256 !== plan.planSha256
    ) {
      addSchemaError(errors, 'DELIBERATION_HASH_MISMATCH', '$.planSha256');
    }
    if (
      value.beforeReceipt
      && Object.hasOwn(value.beforeReceipt, 'decisionSha256')
      && (
        value.beforeReceipt.decisionSha256 !== plan.decisionSha256
        || value.beforeReceipt.planSha256 !== plan.planSha256
        || value.beforeReceipt.graphId !== plan.graphId
        || value.beforeReceipt.graphVersion !== plan.graphVersion
        || value.beforeReceipt.sourceRevision !== plan.sourceRevision
      )
    ) {
      addSchemaError(errors, 'DELIBERATION_HASH_MISMATCH', '$.beforeReceipt');
    }
    if (
      value.afterReceipt
      && Object.hasOwn(value.afterReceipt, 'normalizedResultSha256')
      && (
        value.afterReceipt.graphId !== plan.graphId
        || value.afterReceipt.graphVersion !== plan.graphVersion
        || value.afterReceipt.sourceRevision !== plan.sourceRevision
        || value.afterReceipt.normalizedResultSha256
          !== sha256Canonical(normalizedReceiptHashInput(value))
      )
    ) {
      addSchemaError(errors, 'DELIBERATION_HASH_MISMATCH', '$.afterReceipt');
    }
  }
  if (
    value.resultSha256 !== undefined
    && value.resultSha256 !== sha256Canonical(importedResultHashInput(value))
  ) {
    addSchemaError(errors, 'DELIBERATION_HASH_MISMATCH', '$.resultSha256');
  }
  if (
    context.operation === 'stored'
    && value.resultSha256 === undefined
  ) {
    addSchemaError(errors, 'DELIBERATION_HASH_MISMATCH', '$.resultSha256');
  }
  if (
    value.beforeReceipt?.stage === 'before'
    && value.beforeReceipt.status !== 'accepted'
  ) {
    addSchemaError(errors, 'INVALID_STATUS_TRANSITION', '$.beforeReceipt.status');
  }
  if (
    value.afterReceipt?.stage === 'after'
    && value.afterReceipt.status !== 'ready'
  ) {
    addSchemaError(errors, 'INVALID_STATUS_TRANSITION', '$.afterReceipt.status');
  }
  if (value.importStatus === 'human-confirmed') {
    if (context.operation === 'import') {
      addSchemaError(errors, 'INVALID_STATUS_TRANSITION', '$.importStatus');
      return;
    }
    const confirmation = context.humanConfirmation;
    const imported = structuredClone(value);
    imported.importStatus = 'imported';
    if (
      !confirmation
      || confirmation.decisionId !== value.decisionId
      || confirmation.decisionRevision !== value.decisionRevision
      || confirmation.decisionSha256 !== value.decisionSha256
      || confirmation.planSha256 !== value.planSha256
      || confirmation.resultSha256
        !== (value.resultSha256 ?? sha256Canonical(importedResultHashInput(imported)))
      || confirmation.status !== 'human-confirmed'
    ) {
      addSchemaError(
        errors,
        'DELIBERATION_NOT_HUMAN_CONFIRMED',
        '$.importStatus',
      );
    }
  }
}

function validateMaterializeReceiptSemantic(value, errors) {
  const fileStates = [
    ...(value?.filesCreated ?? []),
    ...(value?.filesUpdated ?? []),
    ...(value?.filesUnchanged ?? []),
  ];
  if (duplicateValue(fileStates)) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.filesCreated');
  }
  if (
    typeof value?.materializeId === 'string'
    && value?.dryRun === false
  ) {
    const expected = [
      '.agent-governance/receipts/' + value.materializeId + '.json',
      '.codex/config.toml',
    ].sort();
    const actual = [...fileStates].sort();
    if (
      actual.length !== expected.length
      || actual.some((entry, index) => entry !== expected[index])
    ) {
      addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.filesCreated');
    }
  }
  if (value?.dryRun === true && fileStates.length > 0) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.filesCreated');
  }
  if (
    (value?.dryRun === true && value?.status !== 'dry-run')
    || (value?.dryRun === false && value?.status !== 'target-materialized')
  ) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.status');
  }
  for (const [index, entry] of (value?.targetFiles ?? []).entries()) {
    if (entry?.path !== '.codex/config.toml') {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        `$.targetFiles[${index}].path`,
      );
    }
  }
  // A deny that is only prompted for must never read as full coverage.
  for (const [index, entry] of (value?.materializedControls ?? []).entries()) {
    if (
      entry?.mode === 'deny'
      && Array.isArray(entry?.nativeKeys)
      && entry.nativeKeys.length === 1
      && entry.nativeKeys[0] === 'approval_policy'
      && entry?.modeCoverage !== 'approval-gate-only'
    ) {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        `$.materializedControls[${index}].modeCoverage`,
      );
    }
  }
  if (
    duplicateValue(
      (value?.materializedControls ?? []).map((entry) => entry?.controlId),
    )
    || duplicateValue(
      (value?.unmaterializedControls ?? []).map((entry) => entry?.controlId),
    )
  ) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.materializedControls');
  }
}

function validateAttestOutputSemantic(value, errors) {
  // The higher level requires observed trust. Trust is not observable in this
  // milestone, so the level stays reserved rather than merely unreached.
  if (
    value?.level === 'project-layer-observed'
    && value?.trustStateObserved !== 'trusted'
  ) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.level');
  }
  const breakdown = value?.materializationBreakdown;
  if (breakdown && typeof value?.declared === 'number') {
    const total = ['not-applicable', 'materializable', 'deferred']
      .reduce((sum, key) => sum + (breakdown[key] ?? 0), 0);
    if (total !== value.declared) {
      addSchemaError(
        errors,
        'SCHEMA_VALIDATION_FAILED',
        '$.materializationBreakdown',
      );
    }
  }
  if (
    typeof value?.materialized === 'number'
    && typeof value?.declared === 'number'
    && value.materialized > value.declared
  ) {
    addSchemaError(errors, 'SCHEMA_VALIDATION_FAILED', '$.materialized');
  }
  if (
    typeof value?.projectLayerObserved === 'number'
    && typeof value?.materialized === 'number'
    && value.projectLayerObserved > value.materialized
  ) {
    addSchemaError(
      errors,
      'SCHEMA_VALIDATION_FAILED',
      '$.projectLayerObserved',
    );
  }
  if (
    duplicateValue(
      (value?.classificationSourceDivergence ?? []).map(
        (entry) => entry?.controlId,
      ),
    )
  ) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.classificationSourceDivergence');
  }
}

function validateSemantic(schemaName, value, context, errors) {
  if (value?.schemaVersion !== 1) {
    addSchemaError(errors, 'SCHEMA_VERSION_UNSUPPORTED', '$.schemaVersion');
  }
  if (schemaName === 'source-lock.schema.json') {
    if (duplicateId(value?.sources, 'sourceId')) {
      addSchemaError(errors, 'DUPLICATE_ID', '$.sources');
    }
    for (const [index, source] of (value?.sources ?? []).entries()) {
      if (!source.commit) {
        addSchemaError(
          errors,
          'SOURCE_REVISION_UNPINNED',
          `$.sources[${index}].commit`,
        );
      }
      if (!source.license) {
        addSchemaError(
          errors,
          'SOURCE_LICENSE_MISSING',
          `$.sources[${index}].license`,
        );
      }
      if (!source.sha256) {
        addSchemaError(
          errors,
          'SOURCE_HASH_MISSING',
          `$.sources[${index}].sha256`,
        );
      }
      const importedFiles = source.importedFiles ?? [];
      const folded = importedFiles.map((entry) => entry.toLowerCase());
      if (
        duplicateValue(importedFiles)
        || duplicateValue(folded)
      ) {
        addSchemaError(
          errors,
          'DUPLICATE_ID',
          `$.sources[${index}].importedFiles`,
        );
      }
      if (importedFiles.some((entry) => (
        typeof entry !== 'string'
        || entry.includes('\\')
      ))) {
        addSchemaError(
          errors,
          'SCHEMA_VALIDATION_FAILED',
          `$.sources[${index}].importedFiles`,
        );
      }
    }
  }
  if (
    schemaName === 'risk-profile.schema.json'
    && duplicateId(value?.tasks, 'taskId')
  ) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.tasks');
  }
  if (
    schemaName === 'role-catalog.schema.json'
    || schemaName === 'governance-pack.schema.json'
  ) {
    validateExternalSource(
      value?.source,
      context.sourceLock,
      errors,
      '$.source',
      context.artifactPath,
    );
  }
  if (schemaName === 'governance-pack.schema.json') {
    addDuplicateError(errors, value?.controls, 'controlId', '$.controls');
    addDuplicateError(
      errors,
      value?.mechanicalChecks,
      'checkId',
      '$.mechanicalChecks',
    );
    addDuplicateError(
      errors,
      value?.humanReviewChecks,
      'checkId',
      '$.humanReviewChecks',
    );
  }
  if (
    schemaName === 'role-catalog.schema.json'
    && duplicateId(value?.roles, 'roleId')
  ) {
    addSchemaError(errors, 'DUPLICATE_ID', '$.roles');
  }
  if (schemaName === 'role-assignment.schema.json') {
    validateRoleAssignment(value, context, errors);
  }
  if (schemaName === 'deliberation-plan.schema.json') {
    validatePlan(value, context, errors);
  }
  if (schemaName === 'deliberation-result.schema.json') {
    validateResult(value, context, errors);
  }
  if (schemaName === 'policy-manifest.schema.json') {
    validatePolicyManifestSemantic(value, errors);
  }
  if (
    schemaName === 'codex-policy-adapter.schema.json'
    || schemaName === 'claude-policy-adapter.schema.json'
  ) {
    validateTargetAdapterSemantic(value, context, errors);
  }
  if (schemaName === 'compile-receipt.schema.json') {
    validateCompileReceiptSemantic(value, context, errors);
  }
  if (schemaName === 'materialize-receipt.schema.json') {
    validateMaterializeReceiptSemantic(value, errors);
  }
  if (schemaName === 'attest-output.schema.json') {
    validateAttestOutputSemantic(value, errors);
  }
}

export function validateArtifact(nameOrValue, valueOrOptions = {}, context = {}) {
  if (
    typeof nameOrValue === 'string'
    && SCHEMA_NAMES.has(nameOrValue)
  ) {
    const schemaName = nameOrValue;
    const value = valueOrOptions;
    const schema = loadSchema(schemaName);
    const errors = [];
    validateSchemaNode(schema, value, schema, '$', errors);
    try {
      scanArtifact(value, context.subject);
    } catch (error) {
      addSchemaError(errors, error.code, '$');
    }
    validateSemantic(schemaName, value, context, errors);
    return { valid: errors.length === 0, errors };
  }
  const value = nameOrValue;
  const options = valueOrOptions ?? {};
  scanArtifact(value, options.subject);
  return { valid: true, errors: [] };
}
