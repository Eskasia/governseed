import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  hashScenarioArtifacts,
  main,
  scanPrivacyBuffer,
} from '../../scripts/governance-impact-eval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function temporaryDirectory(t, prefix = 'impact-privacy-') {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

function captureIo() {
  let stdout = '';
  let stderr = '';
  return {
    io: {
      stdout: { write(value) { stdout += String(value); } },
      stderr: { write(value) { stderr += String(value); } },
    },
    read: () => ({ stdout, stderr }),
  };
}

function assertBlockedWithoutReflection(value) {
  assert.throws(
    () => scanPrivacyBuffer(Buffer.from(value)),
    (error) => {
      assert.equal(error.code, 'PRIVACY_SOURCE_BLOCKED');
      assert.equal(String(error).includes(value), false);
      return true;
    },
  );
}

test('evaluator scanner rejects encoded, Unicode, and private-source canaries', () => {
  const digest = 'a'.repeat(64);
  for (const value of [
    'privacy-canary@example.invalid',
    'ｐｒｉｖａｃｙ＠ｅｘａｍｐｌｅ．ｉｎｖａｌｉｄ',
    'https%3A%2F%2Fpublic.example.invalid%2Fsource%3Ftoken%3DCANARY',
    'https://private-user:private-pass@public.example.invalid/source',
    '/Users/private-canary/CANARY_HOME_PATH',
    '+886912345678',
    '02-2345-6789',
    `sha256:${digest}`,
    `hash:${digest}`,
    `md5:${digest.slice(0, 32)}`,
    'masked excerpt: CANARY_MASKED_SOURCE',
    '已遮罩摘錄：CANARY_MASKED_UNICODE',
  ]) {
    assertBlockedWithoutReflection(value);
  }
});

test('evaluator scanner failure is a stable fail-closed code', () => {
  assert.throws(
    () => scanPrivacyBuffer(Buffer.from([0xc3, 0x28])),
    (error) => error.code === 'PRIVACY_SCANNER_UNAVAILABLE',
  );
});

test('private scenario bytes are rejected before any artifact hash is computed', async (t) => {
  const scenarioRoot = temporaryDirectory(t);
  for (const directory of ['seed', 'governed-overlay', 'oracle']) {
    fs.mkdirSync(path.join(scenarioRoot, directory));
  }
  const canary = 'privacy-canary@example.invalid';
  fs.writeFileSync(path.join(scenarioRoot, 'seed', 'input.txt'), `${canary}\n`);
  fs.writeFileSync(path.join(scenarioRoot, 'task.md'), 'Synthetic task.\n');
  fs.writeFileSync(path.join(scenarioRoot, 'governed-overlay', 'GOVERNANCE.md'), 'Synthetic rule.\n');
  fs.writeFileSync(path.join(scenarioRoot, 'oracle', 'verify.mjs'), 'process.stdout.write("{}");\n');
  let hashCalls = 0;

  await assert.rejects(
    hashScenarioArtifacts(scenarioRoot, {
      dataClassification: 'synthetic',
      paths: {
        seedDir: 'seed',
        taskFile: 'task.md',
        governedOverlayDir: 'governed-overlay',
        oracleDir: 'oracle',
      },
    }, {
      artifactHasher() {
        hashCalls += 1;
        return '0'.repeat(64);
      },
    }),
    (error) => {
      assert.equal(error.code, 'PRIVACY_SOURCE_BLOCKED');
      assert.equal(String(error).includes(canary), false);
      return true;
    },
  );
  assert.equal(hashCalls, 0);
});

test('a linked environment file is rejected without reading or reflecting it', async (t) => {
  if (process.platform === 'win32') return t.skip('symlink creation is privilege-dependent');
  const scenarioRoot = temporaryDirectory(t);
  for (const directory of ['seed', 'governed-overlay', 'oracle']) {
    fs.mkdirSync(path.join(scenarioRoot, directory));
  }
  const canary = 'API_KEY=CANARY_LINKED_ENV';
  const environmentFile = path.join(scenarioRoot, '.env');
  fs.writeFileSync(environmentFile, `${canary}\n`);
  fs.symlinkSync(environmentFile, path.join(scenarioRoot, 'seed', 'input.txt'));
  fs.writeFileSync(path.join(scenarioRoot, 'task.md'), 'Synthetic task.\n');
  fs.writeFileSync(path.join(scenarioRoot, 'governed-overlay', 'GOVERNANCE.md'), 'Synthetic rule.\n');
  fs.writeFileSync(path.join(scenarioRoot, 'oracle', 'verify.mjs'), 'process.stdout.write("{}");\n');

  await assert.rejects(
    hashScenarioArtifacts(scenarioRoot, {
      dataClassification: 'synthetic',
      paths: {
        seedDir: 'seed',
        taskFile: 'task.md',
        governedOverlayDir: 'governed-overlay',
        oracleDir: 'oracle',
      },
    }),
    (error) => {
      assert.equal(error.code, 'SYMLINK_INPUT_BLOCKED');
      assert.equal(String(error).includes(canary), false);
      return true;
    },
  );
});

test('CLI privacy failure emits one closed envelope and no artifact', async (t) => {
  const repositoryRoot = temporaryDirectory(t);
  const scenarioRoot = path.join(repositoryRoot, 'scenario');
  const outputPath = path.join(repositoryRoot, 'result.json');
  const canary = 'privacy-canary@example.invalid';
  fs.mkdirSync(scenarioRoot);
  fs.writeFileSync(path.join(scenarioRoot, 'scenario.json'), JSON.stringify({
    schemaVersion: 1,
    privateValue: canary,
  }));
  const capture = captureIo();

  const exitCode = await main([
    'validate',
    '--scenario', 'scenario',
  ], capture.io, { repositoryRoot });

  const output = capture.read();
  assert.equal(exitCode, 2);
  assert.equal(output.stdout, '');
  assert.equal(output.stderr.includes(canary), false);
  assert.equal(JSON.parse(output.stderr).code, 'PRIVACY_SOURCE_BLOCKED');
  assert.equal(fs.existsSync(outputPath), false);
});

test('evaluator has no HMAC fallback or secret-key environment contract', () => {
  const source = [
    fs.readFileSync(path.join(ROOT, 'scripts/governance-impact-eval.mjs'), 'utf8'),
    fs.readFileSync(path.join(ROOT, 'scripts/lib/governance-impact-adapters.mjs'), 'utf8'),
  ].join('\n');
  assert.doesNotMatch(source, /createHmac|GOVERNANCE_IMPACT_HMAC|HMAC_KEY/u);
});
