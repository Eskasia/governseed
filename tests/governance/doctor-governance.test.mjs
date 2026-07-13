import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateRouteDecision,
  safeReadGovernanceFile,
} from '../../scripts/lib/governance-checks.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE_FIXTURE = path.join(ROOT, 'examples/template-adoption/base-minimal');

function temporaryDirectory(t, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function temporaryProject(t) {
  const directory = temporaryDirectory(t, 'governance-doctor-');
  fs.cpSync(BASE_FIXTURE, directory, { recursive: true });
  return directory;
}

function runDoctor(projectDir, ...options) {
  return spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/doctor.mjs'),
    ...options,
    projectDir,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
}

test('reports conflicting route modes', () => {
  const findings = evaluateRouteDecision(
    '- 決策模式：user-declared route\n- 第一版產品形態：web app\n',
    '- 決策模式：ai-recommended route\n- 唯一主路線：Node.js\n',
  );
  assert.ok(findings.some((item) => item.code === 'ROUTE_MODE_CONFLICT'));
});

test('reports placeholders as unfilled decisions', () => {
  const findings = evaluateRouteDecision(
    '- 決策模式：user-declared route\n- 第一版產品形態：TODO\n',
    '- 決策模式：user-declared route\n- 唯一主路線：TBD\n',
  );
  assert.equal(findings.filter((item) => item.code === 'ROUTE_PLACEHOLDER').length, 2);
});

test('reports route decisions that require rechecking', () => {
  const findings = evaluateRouteDecision(
    '- 決策模式：user-declared route\n- 第一版產品形態：web app\n- Decision status: active\n',
    '- 決策模式：user-declared route\n- 唯一主路線：Node.js\n- Decision status: recheck-required\n',
  );
  assert.equal(findings.filter((item) => item.code === 'STALE_DECISION').length, 1);
});

test('rejects governance-file symlinks without reading the target', (t) => {
  const root = temporaryDirectory(t, 'governance-safe-read-');
  const target = path.join(root, 'secret.txt');
  fs.writeFileSync(target, 'CANARY_SECRET');
  fs.symlinkSync(target, path.join(root, 'PROJECT_BRIEF.md'));

  const result = safeReadGovernanceFile(root, 'PROJECT_BRIEF.md');

  assert.equal(result.ok, false);
  assert.equal(result.finding.code, 'PRIVACY_PATH_BLOCKED');
  assert.equal(JSON.stringify(result).includes('CANARY_SECRET'), false);
  assert.equal(JSON.stringify(result).includes(os.homedir()), false);
});

test('allows only contained governance paths', (t) => {
  const root = temporaryDirectory(t, 'governance-path-read-');
  fs.writeFileSync(path.join(root, 'PROJECT_BRIEF.md'), 'safe governance text');

  assert.deepEqual(
    safeReadGovernanceFile(root, 'PROJECT_BRIEF.md'),
    { ok: true, content: 'safe governance text' },
  );

  for (const unsafePath of ['../PROJECT_BRIEF.md', 'secret.txt', path.join(root, 'PROJECT_BRIEF.md')]) {
    const result = safeReadGovernanceFile(root, unsafePath);
    assert.equal(result.ok, false);
    assert.equal(result.finding.code, 'PRIVACY_PATH_BLOCKED');
    assert.equal(JSON.stringify(result).includes(root), false);
  }
});

test('blocks oversized and invalid UTF-8 governance files without echoing bytes', (t) => {
  const root = temporaryDirectory(t, 'governance-source-read-');
  const file = path.join(root, 'SPEC.md');

  fs.writeFileSync(file, Buffer.alloc((1024 * 1024) + 1, 0x41));
  const oversized = safeReadGovernanceFile(root, 'SPEC.md');
  assert.equal(oversized.ok, false);
  assert.equal(oversized.finding.code, 'PRIVACY_PATH_BLOCKED');

  fs.writeFileSync(file, Buffer.from([0xc3, 0x28]));
  const invalidUtf8 = safeReadGovernanceFile(root, 'SPEC.md');
  assert.equal(invalidUtf8.ok, false);
  assert.equal(invalidUtf8.finding.code, 'PRIVACY_SOURCE_BLOCKED');
  assert.equal(JSON.stringify(invalidUtf8).includes('\ufffd'), false);
});

test('doctor preserves schema version 1 and strict warning semantics', (t) => {
  const projectDir = temporaryProject(t);
  const techStackPath = path.join(projectDir, 'TECH_STACK.md');
  const techStack = fs.readFileSync(techStackPath, 'utf8');
  fs.writeFileSync(techStackPath, techStack.replace(
    '決策模式：user-declared route',
    '決策模式：ai-recommended route',
  ));
  fs.appendFileSync(path.join(projectDir, 'PROJECT_BRIEF.md'), '\nCANARY_GOVERNANCE_CONTENT\n');

  const result = runDoctor(projectDir, '--strict', '--json');

  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes('CANARY_GOVERNANCE_CONTENT'), false);
  assert.equal(result.stdout.includes(os.homedir()), false);
  const output = JSON.parse(result.stdout);
  assert.equal(output.schemaVersion, 1);
  assert.equal(output.strict, true);
  assert.equal(output.status, 'warning');
  assert.ok(output.warnings.some((warning) => warning.startsWith('[ROUTE_MODE_CONFLICT] ')));
  assert.deepEqual(
    Object.keys(output).sort(),
    [
      'conditional',
      'missing',
      'profile',
      'projectDir',
      'recommended',
      'required',
      'schemaVersion',
      'status',
      'strict',
      'unfilled',
      'warnings',
    ],
  );
});

test('doctor fails closed on a symlinked governance file without leaking its target', (t) => {
  const projectDir = temporaryProject(t);
  const projectBriefPath = path.join(projectDir, 'PROJECT_BRIEF.md');
  const targetPath = path.join(projectDir, 'private-source.txt');
  fs.rmSync(projectBriefPath);
  fs.writeFileSync(targetPath, 'CANARY_DOCTOR_PRIVATE_SOURCE');
  fs.symlinkSync(targetPath, projectBriefPath);

  const result = runDoctor(projectDir, '--json');

  assert.equal(result.status, 1);
  assert.equal(result.stderr, '');
  assert.equal(result.stdout.includes('CANARY_DOCTOR_PRIVATE_SOURCE'), false);
  assert.equal(result.stdout.includes(os.homedir()), false);
  const output = JSON.parse(result.stdout);
  assert.ok(output.warnings.some((warning) => warning.startsWith('[PRIVACY_PATH_BLOCKED] ')));
  assert.ok(output.missing.includes('PROJECT_BRIEF.md'));
});
