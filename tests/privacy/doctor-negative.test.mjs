import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'examples/template-adoption/base-minimal');
const REQUIREMENT = 'Strict doctor reports the filled base fixture as ready.';

function temporaryProject(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-privacy-'));
  fs.cpSync(FIXTURE, directory, { recursive: true });
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function runDoctor(projectDir) {
  return spawnSync(process.execPath, [
    path.join(ROOT, 'scripts/doctor.mjs'),
    '--strict',
    '--json',
    projectDir,
  ], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: false,
  });
}

function assertPrivacyFailure(result, canaries) {
  assert.equal(result.status, 1);
  const parentOutput = `${result.stdout}${result.stderr}`;
  for (const canary of canaries) assert.equal(parentOutput.includes(canary), false);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.warnings.some((warning) => warning.startsWith(
    '[PRIVACY_SOURCE_BLOCKED] ',
  )));
}

test('doctor blocks private source patterns without reflecting matched values', (t) => {
  const cases = [
    'privacy-canary@example.invalid',
    '+886912345678',
    'https://public.example.invalid/source?token=CANARY_QUERY_TOKEN',
    '/Users/private-canary/CANARY_HOME_PATH',
    `sha256:${'a'.repeat(64)}`,
    'masked excerpt: CANARY_MASKED_SOURCE',
  ];

  for (const value of cases) {
    const projectDir = temporaryProject(t);
    const specPath = path.join(projectDir, 'SPEC.md');
    const spec = fs.readFileSync(specPath, 'utf8');
    fs.writeFileSync(specPath, spec.replace(REQUIREMENT, value));

    assertPrivacyFailure(runDoctor(projectDir), [value, 'CANARY_']);
  }
});

test('doctor refuses a governance symlink to an environment file without reading it', (t) => {
  const projectDir = temporaryProject(t);
  const target = path.join(projectDir, '.env');
  const canary = 'API_KEY=CANARY_SYMLINK_SECRET';
  fs.writeFileSync(target, `${canary}\n`);
  fs.rmSync(path.join(projectDir, 'SPEC.md'));
  fs.symlinkSync(target, path.join(projectDir, 'SPEC.md'));

  const result = runDoctor(projectDir);

  assert.equal(result.status, 1);
  assert.equal(`${result.stdout}${result.stderr}`.includes(canary), false);
  const parsed = JSON.parse(result.stdout);
  assert.ok(parsed.warnings.includes(
    '[PRIVACY_PATH_BLOCKED] SPEC.md: governance path did not pass the safe-read policy',
  ));
});
