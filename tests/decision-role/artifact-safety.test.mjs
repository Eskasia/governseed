import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ARTIFACT_MODULE = path.join(
  ROOT,
  'scripts/lib/governance-artifacts.mjs',
);
const MODULE_PRESENT = fs.existsSync(ARTIFACT_MODULE);
const artifactApi = MODULE_PRESENT
  ? await import(pathToFileURL(ARTIFACT_MODULE).href)
  : {};
const {
  readJsonArtifact,
  writeJsonArtifact,
  validateArtifact,
  canonicalJson,
  sha256Canonical,
} = artifactApi;
const API_PRESENT = [
  readJsonArtifact,
  writeJsonArtifact,
  validateArtifact,
  canonicalJson,
  sha256Canonical,
].every((item) => typeof item === 'function');
const MAX_BYTES = 1024 * 1024;

function makeProject(t, label) {
  const sandbox = fs.mkdtempSync(
    path.join(fs.realpathSync(os.tmpdir()), `artifact-safety-${label}-`),
  );
  const project = path.join(sandbox, 'project');
  const governance = path.join(project, '.agent-governance');
  fs.mkdirSync(path.join(governance, 'local'), {
    recursive: true,
    mode: 0o700,
  });
  fs.writeFileSync(path.join(governance, '.gitignore'), 'local/\n', 'utf8');
  t.after(() => fs.rmSync(sandbox, { recursive: true, force: true }));
  return { sandbox, project, governance };
}

function writeRaw(project, relativePath, bytes) {
  const absolute = path.join(project, relativePath);
  fs.mkdirSync(path.dirname(absolute), { recursive: true });
  fs.writeFileSync(absolute, bytes);
  return absolute;
}

function safeValue(overrides = {}) {
  return {
    schemaVersion: 1,
    taskId: 'TASK-001',
    note: 'bounded public metadata',
    ...overrides,
  };
}

function nestedJson(depth) {
  let value = '0';
  for (let index = 0; index < depth; index += 1) {
    value = `{"level":${value}}`;
  }
  return value;
}

function memberJson(count) {
  const members = Array.from(
    { length: count },
    (_, index) => `"k${index}":${index}`,
  );
  return `{${members.join(',')}}`;
}

function createFsProxy(overrides) {
  return new Proxy(fs, {
    get(target, property) {
      if (Object.hasOwn(overrides, property)) return overrides[property];
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function changedIdentity(stat) {
  return new Proxy(stat, {
    get(target, property) {
      if (property === 'ino') {
        return typeof target.ino === 'bigint'
          ? target.ino + 1n
          : target.ino + 1;
      }
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

function failureFromResult(result) {
  if (Array.isArray(result) && result.length > 0 && result[0]?.code) {
    return { code: result[0].code, subject: result[0].subject, raw: result };
  }
  if (result?.ok === false || result?.valid === false) {
    const finding = result.finding ?? result.findings?.[0] ?? result;
    return {
      code: result.code ?? finding.code,
      subject: result.subject ?? finding.subject,
      raw: result,
    };
  }
  return null;
}

function printable(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function capture(operation) {
  try {
    const result = await operation();
    const failure = failureFromResult(result);
    if (failure) {
      return {
        blocked: true,
        ...failure,
        details: printable(failure.raw),
      };
    }
    return { blocked: false, result };
  } catch (error) {
    return {
      blocked: true,
      code: error?.code ?? error?.finding?.code,
      subject: error?.subject ?? error?.finding?.subject,
      details: [
        String(error),
        error?.message,
        printable(error?.finding),
        printable(error?.findings),
      ].join('\n'),
    };
  }
}

async function assertBlocked(operation, code, forbidden = []) {
  const outcome = await capture(operation);
  assert.equal(outcome.blocked, true, `expected ${code} but operation succeeded`);
  assert.equal(outcome.code, code);
  for (const value of forbidden) {
    assert.equal(
      outcome.details.includes(value),
      false,
      `blocked diagnostic reflected forbidden input: ${value}`,
    );
  }
  return outcome;
}

async function assertAllowed(operation) {
  const outcome = await capture(operation);
  assert.equal(
    outcome.blocked,
    false,
    `unexpected block: ${outcome.code ?? outcome.details}`,
  );
  const result = outcome.result;
  if (result?.ok === true && 'value' in result) return result.value;
  if (result?.ok === true && 'artifact' in result) return result.artifact;
  return result;
}

function createSymlinkOrSkip(t, target, link, type) {
  try {
    fs.symlinkSync(
      target,
      link,
      process.platform === 'win32' && type === 'dir' ? 'junction' : type,
    );
    return true;
  } catch (error) {
    if (error?.code === 'EPERM' || error?.code === 'EACCES') {
      t.skip(`symlink creation unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
}

test('RED prerequisite: governance artifact safety module exports the contract', () => {
  assert.equal(
    MODULE_PRESENT,
    true,
    'scripts/lib/governance-artifacts.mjs must exist',
  );
  for (const name of [
    'readJsonArtifact',
    'writeJsonArtifact',
    'validateArtifact',
    'canonicalJson',
    'sha256Canonical',
  ]) {
    assert.equal(typeof artifactApi[name], 'function', `${name} must be exported`);
  }
});

test(
  'canonical JSON and project-local writes are deterministic',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'canonical');
    const value = { z: 3, a: { y: 2, x: 1 } };
    const expected = '{"a":{"x":1,"y":2},"z":3}';
    assert.equal(canonicalJson(value), expected);
    assert.equal(
      sha256Canonical(value),
      createHash('sha256').update(expected, 'utf8').digest('hex'),
    );

    const relative = '.agent-governance/generated.json';
    await assertAllowed(() => writeJsonArtifact(state.project, relative, value));
    const first = fs.readFileSync(path.join(state.project, relative));
    await assertAllowed(() => writeJsonArtifact(state.project, relative, value));
    assert.deepEqual(fs.readFileSync(path.join(state.project, relative)), first);
    assert.deepEqual(
      await assertAllowed(() => readJsonArtifact(state.project, relative)),
      value,
    );
  },
);

test(
  'fatal UTF-8 and exact JSON reject BOM, NUL, and decoded duplicate keys',
  { skip: !API_PRESENT },
  async (t) => {
    const cases = [
      [
        'invalid UTF-8',
        Buffer.from([0x7b, 0x22, 0x78, 0x22, 0x3a, 0xc3, 0x28, 0x7d]),
        'INVALID_UTF8',
      ],
      [
        'UTF-8 BOM',
        Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('{}')]),
        'PRIVATE_CONTENT_BLOCKED',
      ],
      [
        'NUL',
        Buffer.from('{"x":"a\\u0000b"}'.replace('\\u0000', '\0')),
        'PRIVATE_CONTENT_BLOCKED',
      ],
      [
        'escape-equivalent duplicate key',
        Buffer.from(String.raw`{"a":1,"\u0061":2}`),
        'DUPLICATE_JSON_KEY',
      ],
    ];

    for (const [label, bytes, code] of cases) {
      await t.test(label, async () => {
        const state = makeProject(t, label.replaceAll(' ', '-'));
        const relative = `.agent-governance/${label.replaceAll(' ', '-')}.json`;
        writeRaw(state.project, relative, bytes);
        await assertBlocked(
          () => readJsonArtifact(state.project, relative),
          code,
        );
      });
    }
  },
);

test(
  'exact JSON enforces 64-depth and 10,000-member bounds',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'bounds');
    writeRaw(
      state.project,
      '.agent-governance/depth-64.json',
      nestedJson(64),
    );
    await assertAllowed(() => readJsonArtifact(
      state.project,
      '.agent-governance/depth-64.json',
    ));

    for (const [name, raw] of [
      ['depth-65', nestedJson(65)],
      ['members-10001', memberJson(10_001)],
    ]) {
      writeRaw(state.project, `.agent-governance/${name}.json`, raw);
      await assertBlocked(
        () => readJsonArtifact(state.project, `.agent-governance/${name}.json`),
        'JSON_LIMIT_EXCEEDED',
      );
    }

    writeRaw(
      state.project,
      '.agent-governance/members-10000.json',
      memberJson(10_000),
    );
    await assertAllowed(() => readJsonArtifact(
      state.project,
      '.agent-governance/members-10000.json',
    ));
  },
);

test(
  'reader is descriptor-bounded at 1 MiB plus one and accepts LF or CRLF',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'descriptor');
    const relative = '.agent-governance/oversized.json';
    const prefix = Buffer.from('{"padding":"');
    const suffix = Buffer.from('"}');
    const oversized = Buffer.concat([
      prefix,
      Buffer.alloc(MAX_BYTES + 1 - prefix.length - suffix.length, 0x78),
      suffix,
    ]);
    writeRaw(state.project, relative, oversized);

    let openCalls = 0;
    let fstatCalls = 0;
    let readCalls = 0;
    let readFileCalls = 0;
    const observedFs = createFsProxy({
      openSync(...args) {
        openCalls += 1;
        return fs.openSync(...args);
      },
      fstatSync(...args) {
        fstatCalls += 1;
        return fs.fstatSync(...args);
      },
      readSync(...args) {
        readCalls += 1;
        return fs.readSync(...args);
      },
      readFileSync(...args) {
        readFileCalls += 1;
        return fs.readFileSync(...args);
      },
    });
    await assertBlocked(
      () => readJsonArtifact(state.project, relative, { fs: observedFs }),
      'FILE_TOO_LARGE',
    );
    assert.ok(openCalls > 0, 'reader must open a descriptor');
    assert.ok(fstatCalls > 0, 'reader must check the opened descriptor');
    assert.equal(readFileCalls, 0, 'reader must not use unbounded readFile');
    assert.ok(readCalls <= 1, 'known oversized input should stop before bulk reads');

    for (const [name, lineEnding] of [['lf', '\n'], ['crlf', '\r\n']]) {
      const file = `.agent-governance/${name}.json`;
      writeRaw(
        state.project,
        file,
        `{${lineEnding}  "schemaVersion": 1,${lineEnding}  "taskId": "TASK-001"${lineEnding}}${lineEnding}`,
      );
      assert.deepEqual(
        await assertAllowed(() => readJsonArtifact(state.project, file)),
        { schemaVersion: 1, taskId: 'TASK-001' },
      );
    }
  },
);

test(
  'portable path policy rejects traversal and POSIX, macOS, Windows, home, or UNC absolutes',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'paths');
    const outside = path.join(state.sandbox, 'outside-private.json');
    fs.writeFileSync(outside, '{"apiKey":"outside-secret"}', 'utf8');

    await assertBlocked(
      () => readJsonArtifact(state.project, '../outside-private.json'),
      'PATH_ESCAPE_BLOCKED',
      [outside, 'outside-secret'],
    );

    for (const unsafePath of [
      '/etc/passwd',
      '/Users/alice/private.json',
      '/home/alice/private.json',
      'C:\\Users\\Alice\\private.json',
      '\\\\server\\share\\private.json',
      '~/private.json',
      '../../private.json',
    ]) {
      await assertBlocked(
        () => validateArtifact(
          { schemaVersion: 1, artifactPath: unsafePath },
          { subject: 'TASK-001' },
        ),
        'PATH_ESCAPE_BLOCKED',
        [unsafePath],
      );
    }
  },
);

test(
  'file and parent-directory symlinks fail closed for reads and writes',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'symlink');
    const outside = path.join(state.sandbox, 'outside');
    fs.mkdirSync(outside);
    fs.writeFileSync(path.join(outside, 'secret.json'), '{"safe":true}', 'utf8');

    const fileLink = path.join(state.governance, 'file-link.json');
    if (!createSymlinkOrSkip(
      t,
      path.join(outside, 'secret.json'),
      fileLink,
      'file',
    )) return;
    await assertBlocked(
      () => readJsonArtifact(
        state.project,
        '.agent-governance/file-link.json',
      ),
      'SYMLINK_BLOCKED',
    );

    const parentLink = path.join(state.governance, 'parent-link');
    if (!createSymlinkOrSkip(t, outside, parentLink, 'dir')) return;
    await assertBlocked(
      () => readJsonArtifact(
        state.project,
        '.agent-governance/parent-link/secret.json',
      ),
      'SYMLINK_BLOCKED',
    );
    await assertBlocked(
      () => writeJsonArtifact(
        state.project,
        '.agent-governance/parent-link/new.json',
        safeValue(),
      ),
      'SYMLINK_BLOCKED',
    );
    assert.equal(fs.existsSync(path.join(outside, 'new.json')), false);
  },
);

test(
  'hard-linked files cannot import content from outside the project boundary',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'hardlink');
    const outside = path.join(state.sandbox, 'outside.json');
    fs.writeFileSync(outside, '{"safe":true}\n', 'utf8');
    const linked = path.join(state.governance, 'hard-link.json');
    try {
      fs.linkSync(outside, linked);
    } catch (error) {
      if (['EPERM', 'EACCES', 'EXDEV', 'ENOTSUP'].includes(error?.code)) {
        t.skip(`hard-link creation unavailable: ${error.code}`);
        return;
      }
      throw error;
    }
    await assertBlocked(
      () => readJsonArtifact(
        state.project,
        '.agent-governance/hard-link.json',
      ),
      'SYMLINK_BLOCKED',
    );
  },
);

test(
  'write rejects a deterministic parent identity swap before commit',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'identity-swap');
    const parent = path.join(state.governance, 'generated');
    fs.mkdirSync(parent);
    let parentChecks = 0;
    const swappingFs = createFsProxy({
      lstatSync(target, ...args) {
        const stat = fs.lstatSync(target, ...args);
        if (path.resolve(String(target)) === path.resolve(parent)) {
          parentChecks += 1;
          if (parentChecks > 1) return changedIdentity(stat);
        }
        return stat;
      },
      statSync(target, ...args) {
        const stat = fs.statSync(target, ...args);
        if (
          path.resolve(String(target)) === path.resolve(parent)
          && parentChecks > 1
        ) {
          return changedIdentity(stat);
        }
        return stat;
      },
    });

    await assertBlocked(
      () => writeJsonArtifact(
        state.project,
        '.agent-governance/generated/result.json',
        safeValue(),
        { fs: swappingFs },
      ),
      'SYMLINK_BLOCKED',
    );
    assert.ok(parentChecks > 1, 'writer must re-check parent identity');
    assert.equal(fs.existsSync(path.join(parent, 'result.json')), false);
  },
);

test(
  'privacy scanning blocks private fields and secrets without reflection',
  { skip: !API_PRESENT },
  async (t) => {
    const syntheticApiKey = `sk-proj-${'A'.repeat(48)}`;
    const secretUrl =
      `https://example.test/callback?token=${'B'.repeat(40)}&mode=test`;
    const cases = [
      ['raw prompt', { rawPrompt: 'private deliberation body' }, 'PRIVATE_CONTENT_BLOCKED'],
      ['provider cookie', { providerCookie: 'session=private-cookie' }, 'SECRET_VALUE_BLOCKED'],
      ['API key', { apiKey: syntheticApiKey }, 'SECRET_VALUE_BLOCKED'],
      ['secret query', { callbackUrl: secretUrl }, 'SECRET_VALUE_BLOCKED'],
    ];

    for (const [label, value, code] of cases) {
      await t.test(label, async () => {
        await assertBlocked(
          () => validateArtifact(
            { schemaVersion: 1, ...value },
            { subject: 'TASK-001' },
          ),
          code,
          Object.values(value),
        );
      });
    }
  },
);

test(
  'local ignore boundary is verified without scanning local contents',
  { skip: !API_PRESENT },
  async (t) => {
    const state = makeProject(t, 'local-boundary');
    const relative = '.agent-governance/risk-profile.json';
    writeRaw(state.project, relative, JSON.stringify(safeValue()));
    writeRaw(
      state.project,
      '.agent-governance/local/raw-provider.json',
      JSON.stringify({
        rawPrompt: 'must not be scanned',
        apiKey: `sk-proj-${'C'.repeat(48)}`,
      }),
    );

    assert.deepEqual(
      await assertAllowed(() => readJsonArtifact(state.project, relative)),
      safeValue(),
    );

    fs.writeFileSync(
      path.join(state.governance, '.gitignore'),
      '# local is not ignored\n',
      'utf8',
    );
    await assertBlocked(
      () => readJsonArtifact(state.project, relative),
      'PRIVATE_CONTENT_BLOCKED',
    );

    fs.writeFileSync(path.join(state.governance, '.gitignore'), 'local/\n');
    fs.rmSync(path.join(state.governance, 'local'), {
      recursive: true,
      force: true,
    });
    const outside = path.join(state.sandbox, 'private-local');
    fs.mkdirSync(outside);
    if (!createSymlinkOrSkip(
      t,
      outside,
      path.join(state.governance, 'local'),
      'dir',
    )) return;
    await assertBlocked(
      () => readJsonArtifact(state.project, relative),
      'SYMLINK_BLOCKED',
    );
  },
);
