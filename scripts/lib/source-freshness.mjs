// The capability matrices ground every classification in official
// documentation as of a fixed date. Upstream tools ship weekly, so a claim's
// load-bearing sentence can disappear without anything here noticing. This
// module gives each cited page a pinned excerpt and a way to re-check that the
// sentence is still there — a claim with an expiry date instead of a snapshot.

export const MATRIX_FILES = Object.freeze([
  'docs/research/2026-07-29-codex-policy-capability-matrix.md',
  'docs/research/2026-07-31-antigravity-policy-capability-matrix.md',
  'docs/research/2026-07-31-claude-code-policy-capability-matrix.md',
]);

const URL_PATTERN = /https:\/\/[^\s)`\]]+/gu;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9/-]*$/u;

function tableRows(content) {
  return content.split('\n').filter((line) => line.trim().startsWith('|'));
}

function cells(row) {
  return row.trim().replace(/^\|/u, '').replace(/\|$/u, '').split('|')
    .map((cell) => cell.trim());
}

// A Source cell may carry several backticked slugs: `cli/permissions`, `cli/settings`
function slugsFromCell(cell) {
  return cell.replaceAll('`', '').split(',')
    .map((token) => token.trim())
    .filter((token) => SLUG_PATTERN.test(token));
}

export function extractCitedPages(content) {
  const fullUrls = [...content.matchAll(URL_PATTERN)]
    .map((match) => match[0].replace(/[.,;:]+$/u, ''));
  const bases = [...new Set(fullUrls.filter((url) => url.endsWith('/')))];
  if (bases.length > 1) {
    throw new Error(`conflicting base urls declared: ${bases.join(', ')}`);
  }
  const baseUrl = bases[0] ?? null;

  const slugs = [];
  let sourceColumn = null;
  for (const row of tableRows(content)) {
    const rowCells = cells(row);
    if (rowCells.includes('Source')) {
      sourceColumn = rowCells.indexOf('Source');
      continue;
    }
    if (sourceColumn === null) continue;
    if (rowCells.every((cell) => /^:?-+:?$/u.test(cell))) continue;
    if (rowCells.length <= sourceColumn) {
      sourceColumn = null;
      continue;
    }
    slugs.push(...slugsFromCell(rowCells[sourceColumn]));
  }

  if (slugs.length > 0 && !baseUrl) {
    throw new Error('slug citations found but no base url is declared');
  }

  const pages = new Set(fullUrls.filter((url) => url !== baseUrl));
  for (const slug of slugs) pages.add(baseUrl + slug);
  return { baseUrl, pages: [...pages].sort() };
}

const ENTITIES = new Map([
  ['&amp;', '&'], ['&lt;', '<'], ['&gt;', '>'],
  ['&quot;', '"'], ['&#39;', "'"], ['&nbsp;', ' '],
]);

export function normalizeText(input) {
  let text = String(input).replace(/<[^>]*>/gu, ' ');
  for (const [entity, replacement] of ENTITIES) {
    text = text.replaceAll(entity, replacement);
  }
  return text.replace(/\s+/gu, ' ').trim();
}

export function evaluateSource(entry, fetchResult) {
  if (entry.status === 'UNVERIFIABLE') return 'UNVERIFIABLE';
  if (!fetchResult.ok) return 'UNREACHABLE';
  return normalizeText(fetchResult.body).includes(normalizeText(entry.excerpt))
    ? 'FRESH'
    : 'DRIFTED';
}

export function checkCoverage(citedPages, lock) {
  const locked = new Set(lock.sources.map((source) => source.url));
  const cited = new Set(citedPages);
  return {
    missingFromLock: [...cited].filter((url) => !locked.has(url)).sort(),
    notCited: [...locked].filter((url) => !cited.has(url)).sort(),
  };
}

export function reportExitCode(report, strict) {
  if (!strict) return 0;
  const drifted = report.statuses.DRIFTED ?? 0;
  const gaps = report.missingFromLock.length + report.notCited.length;
  return drifted > 0 || gaps > 0 ? 1 : 0;
}
