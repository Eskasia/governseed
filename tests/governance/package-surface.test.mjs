import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

// npm always ships these regardless of the whitelist.
const ALWAYS_SHIPPED = new Set(['package.json', 'README.md', 'LICENSE']);

// Run npm through its own CLI entry point rather than the `npm` shim: on
// Windows the shim is a .cmd batch file that spawnSync cannot launch without a
// shell, so a bare 'npm' never starts and reports status null.
function packedPaths() {
  const npmExecPath = process.env.npm_execpath;
  assert.ok(
    npmExecPath && fs.existsSync(npmExecPath),
    'npm_execpath must identify the npm CLI used to run this test',
  );
  const result = spawnSync(
    process.execPath,
    [npmExecPath, 'pack', '--dry-run', '--json'],
    {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      env: {
        ...process.env,
        NO_UPDATE_NOTIFIER: '1',
        npm_config_audit: 'false',
        npm_config_fund: 'false',
        npm_config_update_notifier: 'false',
      },
      shell: false,
    },
  );
  assert.equal(
    result.status,
    0,
    result.error?.message ?? result.stderr ?? result.stdout,
  );
  const [tarball] = JSON.parse(result.stdout);
  return tarball.files.map((entry) => entry.path.replaceAll('\\', '/'));
}

/**
 * The whitelist is the contract. A directory entry ships its whole subtree; a
 * file entry ships exactly itself.
 */
function whitelistMatchers() {
  const { files } = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'),
  );
  assert.ok(
    Array.isArray(files) && files.length > 0,
    'package.json must declare a files whitelist',
  );
  return files.map((entry) => entry.replaceAll('\\', '/'));
}

function isWhitelisted(packedPath, matchers) {
  if (ALWAYS_SHIPPED.has(packedPath)) return true;
  return matchers.some((matcher) => (
    matcher.endsWith('/')
      ? packedPath.startsWith(matcher)
      : packedPath === matcher
  ));
}

test('the tarball ships nothing outside the files whitelist', () => {
  const matchers = whitelistMatchers();
  const leaked = packedPaths()
    .filter((entry) => !isWhitelisted(entry, matchers))
    .sort();
  assert.deepEqual(
    leaked,
    [],
    `every published entry must be covered by package.json files:\n${leaked.join('\n')}`,
  );
});

test('the directories kept out of the release unit never ship', () => {
  const packed = packedPaths();
  for (const prefix of ['experimental/', 'examples/', '.github/', 'startup/../']) {
    assert.deepEqual(
      packed.filter((entry) => entry.startsWith(prefix)),
      [],
      `${prefix} must stay out of the published package`,
    );
  }
});

test('the published surface the brand test pins is still shipped', () => {
  const packed = new Set(packedPaths());
  for (const required of [
    'docs/migrations/governseed-brand-transition.md',
    'docs/policy-compiler.md',
    'docs/enforcement-boundary.md',
    'docs/research/2026-07-29-codex-policy-capability-matrix.md',
    // Every claude knownLimitation names this file as its source, so a package
    // that omits it publishes an attestation pointing at nothing.
    'docs/research/2026-07-31-claude-code-policy-capability-matrix.md',
    'docs/research/2026-07-29-governseed-name-audit.md',
    'tests/policy-compiler/fixture-contracts.test.mjs',
    'schemas/materialize-receipt.schema.json',
    'schemas/attest-output.schema.json',
    'scripts/lib/claude-target-materializer.mjs',
    'scripts/lib/codex-target-materializer.mjs',
    'scripts/lib/target-attest.mjs',
  ]) {
    assert.ok(packed.has(required), `${required} must remain published`);
  }
});
