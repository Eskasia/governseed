#!/usr/bin/env node
// Re-checks that every official-documentation sentence the capability
// matrices rest on is still present upstream. Network happens here and only
// here — check/validate/ci stay offline, and the offline half (coverage
// between matrix citations and the lock) also runs in test:governance.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MATRIX_FILES,
  checkCoverage,
  evaluateSource,
  extractCitedPages,
  reportExitCode,
} from './lib/source-freshness.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCK_PATH = path.join(root, 'docs/research/source-freshness.lock.json');
const FETCH_TIMEOUT_MS = 15000;

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');
const unknown = args.filter((arg) => !['--strict', '--json'].includes(arg));
if (unknown.length) {
  console.error(`Unknown arguments: ${unknown.join(' ')}\nUsage: verify-sources.mjs [--strict] [--json]`);
  process.exit(2);
}

async function fetchPage(url) {
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { 'user-agent': 'governseed-source-freshness/1' },
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true, body: await response.text() };
  } catch (error) {
    return { ok: false, error: error?.cause?.code ?? error?.name ?? String(error) };
  }
}

const lock = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
const allCited = [...new Set(MATRIX_FILES.flatMap(
  (matrix) => extractCitedPages(fs.readFileSync(path.join(root, matrix), 'utf8')).pages,
))].sort();
const { missingFromLock, notCited } = checkCoverage(allCited, lock);

const results = await Promise.all(lock.sources.map(async (entry) => {
  const fetchResult = entry.status === 'UNVERIFIABLE'
    ? { ok: false, error: 'not fetched' }
    : await fetchPage(entry.url);
  const status = evaluateSource(entry, fetchResult);
  return {
    url: entry.url,
    status,
    ...(status === 'UNREACHABLE' ? { error: fetchResult.error } : {}),
    ...(entry.note ? { note: entry.note } : {}),
  };
}));

const statuses = {};
for (const result of results) {
  statuses[result.status] = (statuses[result.status] ?? 0) + 1;
}
const report = {
  verifiedAt: lock.verifiedAt,
  statuses,
  missingFromLock,
  notCited,
  sources: results.sort((a, b) => a.url.localeCompare(b.url)),
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  for (const result of report.sources) {
    console.log(`${result.status.padEnd(12)} ${result.url}${result.error ? ` (${result.error})` : ''}`);
  }
  const summary = Object.entries(statuses).map(([key, count]) => `${key} ${count}`).join(', ');
  console.log(`\n${lock.sources.length} sources pinned at ${lock.verifiedAt}: ${summary}`);
  for (const url of missingFromLock) console.log(`COVERAGE     cited but not locked: ${url}`);
  for (const url of notCited) console.log(`COVERAGE     locked but not cited: ${url}`);
  if (report.statuses.DRIFTED) {
    console.log('\nDRIFTED means the pinned sentence is gone upstream: re-read the page, re-verify the matrix rows that cite it, then re-seed the lock entry.');
  }
}

process.exit(reportExitCode(report, strict));
