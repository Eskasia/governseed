import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

// The surfaces an adopter reads first: the templates `init` copies into their
// project, the filled examples they compare against, the base fixture the npm
// package ships, and the guides the package ships alongside them. Every one of
// them is English-only.
const SCANNED_DIRECTORIES = [
  'templates',
  'examples/template-adoption',
  'tests/policy-compiler/base-project',
  'startup',
  'workflows',
  'prompts',
];

// Han covers the characters that actually appear here; the two ranges add the
// CJK punctuation and fullwidth forms that travel with them, so a translated
// heading cannot keep a stray fullwidth colon and still pass.
const CJK = /[\p{Script=Han}　-〿＀-￯]/u;

// Detection of Chinese *user* content stays in the governance checks by
// design — the Han-identity and masked-excerpt rules in
// scripts/lib/governance-checks.mjs exist to flag what an adopter writes.
// This invariant governs what the starter itself ships, nothing else.
function collectMarkdown(directory, collected = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectMarkdown(absolute, collected);
      continue;
    }
    if (!entry.isFile()) continue;
    if (path.extname(entry.name) !== '.md') continue;
    collected.push(absolute);
  }
  return collected;
}

function cjkOccurrences(file) {
  const relative = path.relative(ROOT, file).replaceAll('\\', '/');
  return fs.readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line, index) => (CJK.test(line) ? [`${relative}:${index + 1}: ${line.trim()}`] : []));
}

test('every shipped template and example is English-only', () => {
  const files = SCANNED_DIRECTORIES.flatMap((directory) => collectMarkdown(path.join(ROOT, directory)));
  const findings = files.flatMap(cjkOccurrences);

  // A scan that collected nothing would satisfy the assertion below while
  // checking nothing, which is the failure this invariant exists to catch.
  assert.ok(
    files.length >= 100,
    `expected the shipped template surface to be scanned, collected ${files.length} files`,
  );
  assert.deepEqual(
    findings,
    [],
    `templates and examples must not contain CJK characters:\n${findings.join('\n')}`,
  );
});
