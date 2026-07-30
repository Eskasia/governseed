import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { main } from '../../scripts/governance-impact-eval.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CORE_SCRIPTS = path.join(ROOT, 'scripts');
const EXPERIMENTAL_ENTRY = 'experimental/governance-impact/eval.mjs';

function collectModules(directory) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectModules(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.mjs')) {
      found.push(fullPath);
    }
  }
  return found;
}

// Import specifiers only. A path mentioned inside a message string is not a
// dependency, so the boundary is measured on what the module actually loads.
function importSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:^|[\s;}])(?:import|export)[\s\S]*?\sfrom\s*['"]([^'"]+)['"]/g,
    /(?:^|[\s;}])import\s*['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(source))) specifiers.push(match[1]);
  }
  return specifiers;
}

test('Core scripts never import the experimental containment surface', () => {
  const modules = collectModules(CORE_SCRIPTS);
  assert.ok(modules.length > 0, 'expected Core modules under scripts/');
  const violations = [];
  for (const modulePath of modules) {
    const source = fs.readFileSync(modulePath, 'utf8');
    for (const specifier of importSpecifiers(source)) {
      const resolved = specifier.startsWith('.')
        ? path.relative(ROOT, path.resolve(path.dirname(modulePath), specifier))
        : specifier;
      if (resolved.split(path.sep).includes('experimental')) {
        violations.push(`${path.relative(ROOT, modulePath)} imports ${specifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});

test('the experimental containment surface is absent from Core scripts', () => {
  const staleCoreFiles = [
    'scripts/governance-impact-oci-integration.mjs',
    'scripts/governance-impact-uds-relay.mjs',
    'scripts/lib/governance-impact-credential-proxy.mjs',
    'scripts/lib/governance-impact-oci-proxy-facade.mjs',
    'scripts/lib/governance-impact-oci-supervisor.mjs',
  ];
  for (const relative of staleCoreFiles) {
    assert.equal(
      fs.existsSync(path.join(ROOT, relative)),
      false,
      `${relative} belongs to the experimental unit`,
    );
  }
  assert.ok(fs.existsSync(path.join(ROOT, EXPERIMENTAL_ENTRY)));
});

for (const argv of [
  [
    'run',
    '--scenario', 'scenario',
    '--manifest', 'manifest.json',
    '--policy', 'policy.json',
    '--attempt-id', 'a'.repeat(64),
    '--output', 'raw-run.json',
  ],
  [
    'preflight',
    '--model', 'gpt-5.6-codex',
    '--runtime-image', `registry.example/codex@sha256:${'b'.repeat(64)}`,
    '--codex-version', 'codex-cli 1.2.3',
    '--codex-binary-sha256', 'c'.repeat(64),
    '--timeout-ms', '300000',
    '--output', 'artifacts/governance-impact/preflight.json',
  ],
]) {
  test(`Core refuses ${argv[0]} and points at the experimental entry`, async () => {
    let stdout = '';
    let stderr = '';
    const io = {
      stdout: { write(value) { stdout += value; } },
      stderr: { write(value) { stderr += value; } },
    };
    const exitCode = await main(argv, io, {
      env: { GOVERNANCE_IMPACT_REAL: '1' },
    });
    assert.equal(exitCode, 2);
    assert.equal(stdout, '');
    const envelope = JSON.parse(stderr);
    assert.equal(envelope.code, 'EXPERIMENTAL_ENTRY_REQUIRED');
    assert.equal(envelope.exitCode, 2);
    assert.match(envelope.suggestion, /experimental\/governance-impact\/eval\.mjs/u);
  });
}
