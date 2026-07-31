import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MATRIX_FILES,
  checkCoverage,
  evaluateSource,
  extractCitedPages,
  normalizeText,
  reportExitCode,
} from '../../scripts/lib/source-freshness.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCK_PATH = path.join(ROOT, 'docs/research/source-freshness.lock.json');

// The capability matrices cite official documentation two ways: full URLs in
// prose (the Codex matrix) and a base URL declared once with page slugs in
// table Source columns (the Claude and Antigravity matrices).
const SYNTHETIC_MATRIX = `# Example Matrix

Sources are pages under the official documentation root
\`https://example.com/docs/\`; see also
[Full page](https://other.example.com/guide.md) and
https://other.example.com/reference.md.

| Control | Classification | Source |
|---|---|---|
| Shell | representable-only | \`permissions\` |
| Multi | blocked | \`cli/permissions\`, \`cli/settings\` |
| None | blocked | — |

| Scope | Path | Source |
|---|---|---|
| Workspace | \`.agents/rules\` | \`ide/rules\` |
`;

test('extractCitedPages resolves slugs against the declared base and collects full urls', () => {
  const { baseUrl, pages } = extractCitedPages(SYNTHETIC_MATRIX);
  assert.equal(baseUrl, 'https://example.com/docs/');
  assert.deepEqual(pages, [
    'https://example.com/docs/cli/permissions',
    'https://example.com/docs/cli/settings',
    'https://example.com/docs/ide/rules',
    'https://example.com/docs/permissions',
    'https://other.example.com/guide.md',
    'https://other.example.com/reference.md',
  ]);
});

test('a slug citation without a declared base url is an extraction failure, not a guess', () => {
  const noBase = '| Control | Source |\n|---|---|\n| Shell | `permissions` |\n';
  assert.throws(() => extractCitedPages(noBase), /base url/iu);
});

test('two conflicting base urls are an extraction failure', () => {
  const twoBases = 'See `https://a.example.com/docs/` and `https://b.example.com/docs/`.\n'
    + '| Control | Source |\n|---|---|\n| Shell | `permissions` |\n';
  assert.throws(() => extractCitedPages(twoBases), /base url/iu);
});

test('normalizeText strips markup so an excerpt matches the rendered sentence', () => {
  assert.equal(
    normalizeText('<p>Deny &gt; <b>Ask</b> &gt; Allow.</p>\n\n  Rules&nbsp;merge.'),
    'Deny > Ask > Allow. Rules merge.',
  );
});

test('a verified source whose load-bearing sentence is still present is FRESH', () => {
  const entry = { status: 'VERIFIED', excerpt: 'Deny > Ask > Allow' };
  const result = evaluateSource(entry, { ok: true, body: '<h1>Doc</h1><p>Order: Deny &gt; Ask &gt; Allow, always.</p>' });
  assert.equal(result, 'FRESH');
});

test('a verified source whose sentence disappeared is DRIFTED', () => {
  const entry = { status: 'VERIFIED', excerpt: 'Deny > Ask > Allow' };
  assert.equal(evaluateSource(entry, { ok: true, body: 'The precedence rules changed.' }), 'DRIFTED');
});

test('a failed fetch is UNREACHABLE, not a drift verdict', () => {
  const entry = { status: 'VERIFIED', excerpt: 'anything' };
  assert.equal(evaluateSource(entry, { ok: false, error: 'HTTP 503' }), 'UNREACHABLE');
});

test('an UNVERIFIABLE source stays UNVERIFIABLE regardless of fetch output', () => {
  const entry = { status: 'UNVERIFIABLE', excerpt: 'anything', note: 'JS-rendered page' };
  assert.equal(evaluateSource(entry, { ok: true, body: 'anything' }), 'UNVERIFIABLE');
});

test('coverage is bidirectional between cited pages and the lock', () => {
  const lock = { sources: [
    { url: 'https://example.com/docs/permissions' },
    { url: 'https://example.com/docs/orphan' },
  ] };
  const cited = ['https://example.com/docs/permissions', 'https://example.com/docs/security'];
  assert.deepEqual(checkCoverage(cited, lock), {
    missingFromLock: ['https://example.com/docs/security'],
    notCited: ['https://example.com/docs/orphan'],
  });
});

test('strict mode fails on drift or coverage gaps but not on unreachable sources', () => {
  const clean = { statuses: { FRESH: 3, UNREACHABLE: 1 }, missingFromLock: [], notCited: [] };
  const drifted = { statuses: { FRESH: 2, DRIFTED: 1 }, missingFromLock: [], notCited: [] };
  const uncovered = { statuses: { FRESH: 3 }, missingFromLock: ['x'], notCited: [] };
  assert.equal(reportExitCode(clean, false), 0);
  assert.equal(reportExitCode(drifted, false), 0);
  assert.equal(reportExitCode(clean, true), 0);
  assert.equal(reportExitCode(drifted, true), 1);
  assert.equal(reportExitCode(uncovered, true), 1);
});

// The offline gate: the committed lock must cover exactly what the committed
// matrices cite. A citation added without a lock entry — or a lock entry left
// behind after a citation is removed — fails here, before any network runs.
test('every page cited by the real matrices is locked, and every locked source is cited', () => {
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  const citedByMatrix = new Map();
  for (const matrix of MATRIX_FILES) {
    const { pages } = extractCitedPages(fs.readFileSync(path.join(ROOT, matrix), 'utf8'));
    assert.ok(pages.length > 0, `${matrix} must cite at least one official page`);
    citedByMatrix.set(matrix, pages);
  }

  const allCited = [...new Set([...citedByMatrix.values()].flat())].sort();
  const coverage = checkCoverage(allCited, lock);
  assert.deepEqual(coverage, { missingFromLock: [], notCited: [] });

  for (const source of lock.sources) {
    for (const matrix of source.matrices) {
      assert.ok(
        citedByMatrix.get(matrix)?.includes(source.url),
        `${source.url} claims to support ${matrix}, which does not cite it`,
      );
    }
  }
});

// MATRIX_FILES claims to be the complete matrix list; the directory is the
// authority. A fourth matrix added without registration would silently escape
// the freshness contract.
test('the declared matrix list matches the capability matrices on disk', () => {
  const onDisk = fs.readdirSync(path.join(ROOT, 'docs/research'))
    .filter((name) => name.endsWith('-policy-capability-matrix.md'))
    .map((name) => `docs/research/${name}`)
    .sort();
  assert.deepEqual([...MATRIX_FILES].sort(), onDisk);
});

test('the committed lock is well-formed: excerpts non-empty, statuses closed, notes on the unverifiable', () => {
  const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
  assert.equal(lock.schemaVersion, 1);
  assert.match(lock.verifiedAt, /^\d{4}-\d{2}-\d{2}$/u);
  assert.ok(lock.sources.length > 0);
  for (const source of lock.sources) {
    assert.match(source.url, /^https:\/\//u);
    assert.ok(source.matrices.length > 0, `${source.url} must name the matrices it supports`);
    assert.ok(['VERIFIED', 'UNVERIFIABLE'].includes(source.status), `${source.url} has status ${source.status}`);
    if (source.status === 'VERIFIED') {
      assert.ok(source.excerpt.trim().length >= 20, `${source.url} needs a load-bearing sentence, not a fragment`);
    } else {
      assert.ok(source.note?.trim(), `${source.url} is UNVERIFIABLE and must say why`);
    }
  }
});
