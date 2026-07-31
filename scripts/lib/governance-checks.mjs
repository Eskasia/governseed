import fs from 'node:fs';
import path from 'node:path';

const MAX_GOVERNANCE_FILE_BYTES = 1024 * 1024;
const MAX_GOVERNANCE_FILE_BYTES_BIGINT = BigInt(MAX_GOVERNANCE_FILE_BYTES);
const PLACEHOLDER = /^(?:todo|tbd|待定|待補|<[^>]+>)$/i;
const GOVERNANCE_FILE_ALLOWLIST = new Set([
  '.agent-governance.json',
  'README.md',
  'START_HERE.md',
  'PROJECT_BRIEF.md',
  'SPEC.md',
  'CONTEXT.md',
  'TASK_CONTRACT.md',
  'OPEN_LOOPS.md',
  'TECH_STACK.md',
  'AGENTS.md',
  'CLAUDE.md',
  'UI_SPEC.md',
  'DESIGN_SYSTEM.md',
  'DESIGN_REVIEW.md',
  'DATA_MODEL.md',
  'API_CONTRACT.md',
  'ENV_CHECKLIST.md',
  'PRESENTATION_BRIEF.md',
  'RESEARCH_SYNTHESIS.md',
  'TESTER_HANDOFF.md',
  'MACOS_RELEASE_CHECKLIST.md',
  'AGENT_RUNTIME.md',
  'RAG_DESIGN.md',
  'EVAL_PLAN.md',
  'AI_SECURITY_REVIEW.md',
]);
const SAFE_SUBJECT = /^(?:SRC-\d{3,}|REQ-\d{3,}@\d+|DEC-\d{3,}|DLB-\d{3,}(?:-SEAT-\d{2})?|AC-\d{3,}|TASK-\d{3,}|ROLE-\d{3,}|POL-\d{3,}|EVD-\d{3,}|ATT-\d{3,}|CONF-\d{3,}|LOOP-\d{3,}|GATE-[A-Z0-9-]+|risk-profile|source-lock|governance-file)$/;

function safeSubject(subject, fallback = 'governance-file') {
  if (typeof subject === 'string'
    && (GOVERNANCE_FILE_ALLOWLIST.has(subject) || SAFE_SUBJECT.test(subject))) {
    return subject;
  }
  return fallback;
}

function finding(code, subject, message) {
  return { code, subject: safeSubject(subject), message };
}

function blocked(code, relativePath) {
  const message = code === 'PRIVACY_SOURCE_BLOCKED'
    ? 'governance content could not be decoded safely'
    : 'governance path did not pass the safe-read policy';
  return { ok: false, finding: finding(code, relativePath, message) };
}

function hasStableFileIdentity(stat) {
  return typeof stat?.dev === 'bigint'
    && typeof stat?.ino === 'bigint'
    && stat.ino > 0n;
}

function hasSameFileIdentity(left, right) {
  return hasStableFileIdentity(left)
    && hasStableFileIdentity(right)
    && left.dev === right.dev
    && left.ino === right.ino;
}

export function formatGovernanceFinding(item) {
  return `[${item.code}] ${safeSubject(item.subject)}: ${item.message}`;
}

export function safeReadGovernanceFile(projectDir, relativePath) {
  if (typeof relativePath !== 'string' || !GOVERNANCE_FILE_ALLOWLIST.has(relativePath)) {
    return blocked('PRIVACY_PATH_BLOCKED', 'governance-file');
  }

  let root;
  try {
    root = fs.realpathSync(projectDir);
  } catch {
    return blocked('PRIVACY_PATH_BLOCKED', relativePath);
  }

  const candidate = path.resolve(root, relativePath);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    return blocked('PRIVACY_PATH_BLOCKED', relativePath);
  }

  let stat;
  try {
    stat = fs.lstatSync(candidate, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return { ok: false, missing: true };
    return blocked('PRIVACY_PATH_BLOCKED', relativePath);
  }

  if (
    stat.isSymbolicLink()
    || !stat.isFile()
    || stat.size > MAX_GOVERNANCE_FILE_BYTES_BIGINT
    || !hasStableFileIdentity(stat)
  ) {
    return blocked('PRIVACY_PATH_BLOCKED', relativePath);
  }

  try {
    const realCandidate = fs.realpathSync(candidate);
    if (realCandidate !== root && !realCandidate.startsWith(`${root}${path.sep}`)) {
      return blocked('PRIVACY_PATH_BLOCKED', relativePath);
    }
  } catch {
    return blocked('PRIVACY_PATH_BLOCKED', relativePath);
  }

  let descriptor;
  let bytes;
  try {
    const noFollowFlag = fs.constants.O_NOFOLLOW;
    const hasNoFollowFlag = Number.isInteger(noFollowFlag) && noFollowFlag !== 0;
    // When O_NOFOLLOW is unavailable, the dev/ino checks remain the equivalent fail-closed guard.
    const openFlags = hasNoFollowFlag
      ? fs.constants.O_RDONLY | noFollowFlag
      : fs.constants.O_RDONLY;
    descriptor = fs.openSync(candidate, openFlags);
    const openedStat = fs.fstatSync(descriptor, { bigint: true });
    if (
      !openedStat.isFile()
      || openedStat.size > MAX_GOVERNANCE_FILE_BYTES_BIGINT
      || !hasSameFileIdentity(stat, openedStat)
    ) {
      return blocked('PRIVACY_PATH_BLOCKED', relativePath);
    }

    let postOpenStat;
    let postOpenRealPath;
    try {
      postOpenStat = fs.lstatSync(candidate, { bigint: true });
      postOpenRealPath = fs.realpathSync(candidate);
    } catch {
      return blocked('PRIVACY_PATH_BLOCKED', relativePath);
    }
    if (
      postOpenStat.isSymbolicLink()
      || !postOpenStat.isFile()
      || !hasSameFileIdentity(stat, postOpenStat)
      || !hasSameFileIdentity(openedStat, postOpenStat)
      || (postOpenRealPath !== root && !postOpenRealPath.startsWith(`${root}${path.sep}`))
    ) {
      return blocked('PRIVACY_PATH_BLOCKED', relativePath);
    }

    const buffer = Buffer.allocUnsafe(MAX_GOVERNANCE_FILE_BYTES + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const count = fs.readSync(descriptor, buffer, offset, buffer.length - offset, offset);
      if (count === 0) break;
      offset += count;
    }
    if (offset > MAX_GOVERNANCE_FILE_BYTES) {
      return blocked('PRIVACY_PATH_BLOCKED', relativePath);
    }
    bytes = buffer.subarray(0, offset);
  } catch {
    return blocked('PRIVACY_PATH_BLOCKED', relativePath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }

  try {
    return {
      ok: true,
      content: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    };
  } catch {
    return blocked('PRIVACY_SOURCE_BLOCKED', relativePath);
  }
}

function bulletValues(content) {
  const values = new Map();
  for (const line of String(content).split(/\r?\n/)) {
    const match = line.match(/^\s*-\s*([^:：]+?)\s*[：:]\s*(.*?)\s*$/);
    if (match) values.set(match[1].trim().toLowerCase(), match[2].trim());
  }
  return values;
}

function firstValue(values, labels) {
  for (const label of labels) {
    const value = values.get(label.toLowerCase());
    if (value !== undefined) return value;
  }
  return undefined;
}

function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDER.test(value.trim());
}

export const CONDITIONAL_DEPTH_FILES = Object.freeze([
  'AGENT_RUNTIME.md',
  'EVAL_PLAN.md',
  'AI_SECURITY_REVIEW.md',
]);

/**
 * The fields each conditional document must actually cover, not merely mention.
 *
 * A column carries every accepted spelling. The starter now ships English
 * templates, but a project bootstrapped from an earlier release labels these
 * tables in Chinese; matching one vocabulary would fail whichever document
 * happened to use the other.
 */
const CONDITIONAL_DEPTH_SPECS = Object.freeze([
  {
    file: 'AGENT_RUNTIME.md',
    fields: [
      {
        field: 'tool permission, side effect, and rollback',
        section: 'Tools',
        columns: [['權限', 'permission'], ['副作用', 'side effect'], ['rollback']],
      },
      { field: 'human approval', section: 'Human Approval' },
      // Inherited policy rather than a project answer, so a filled document
      // that drops it silently loses the retention and fail-closed rules.
      { field: 'evidence persistence', section: 'Evidence Persistence' },
    ],
  },
  {
    file: 'EVAL_PLAN.md',
    fields: [
      {
        field: 'golden set',
        section: 'Golden Set',
        columns: [['case'], ['input'], ['expected behavior']],
      },
      { field: 'regression method', section: 'Regression Gate' },
      // What may be observed and retained in production is the monitoring
      // boundary; the claim boundary below it is a separate statement.
      { field: 'monitoring boundary', section: 'Traces' },
      { field: 'claim boundary', section: 'Evidence / Claim Boundary' },
    ],
  },
  {
    file: 'AI_SECURITY_REVIEW.md',
    fields: [
      { field: 'prompt injection', section: 'Prompt Injection' },
      {
        field: 'tool side effect',
        section: 'Tool Side Effects',
        columns: [['permission'], ['side effect'], ['human approval'], ['rollback']],
      },
      { field: 'tenant and PII risk', section: 'Data Leakage' },
      { field: 'tenant isolation', section: 'Tenant / Access Isolation' },
      { field: 'kill switch', section: 'Kill Switch' },
    ],
  },
]);

function sectionLines(content, section) {
  const lines = visibleMarkdownLines(content);
  const sections = findSections(lines, [section]);
  if (sections.length !== 1) return null;
  const [{ start, end }] = sections;
  return lines.slice(start, end).filter((line) => line !== null);
}

function columnIndex(header, accepted) {
  return header.findIndex((cell) => accepted.includes(cell.trim().toLowerCase()));
}

/** The first table in the section, as a header row plus its data rows. */
function firstTable(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const header = markdownCells(lines[index]);
    if (!header) continue;
    if (!isTableSeparator(markdownCells(lines[index + 1]), header.length)) continue;
    const rows = [];
    for (let cursor = index + 2; cursor < lines.length; cursor += 1) {
      const row = markdownCells(lines[cursor]);
      if (!row || row.length !== header.length) break;
      if (row.every((cell) => cell === '')) continue;
      rows.push(row);
    }
    return { header, rows };
  }
  return null;
}

function isUnfilled(value) {
  return typeof value !== 'string' || value.trim() === '' || isPlaceholder(value);
}

function tableFindings(spec, lines) {
  const table = firstTable(lines);
  if (!table) {
    return [`the ${spec.field} table in "${spec.section}" is missing`];
  }
  const findings = [];
  for (const accepted of spec.columns) {
    const index = columnIndex(table.header, accepted);
    if (index === -1) {
      findings.push(`"${spec.section}" has no ${accepted[0]} column`);
      continue;
    }
    if (table.rows.length === 0) {
      findings.push(`"${spec.section}" has no ${accepted[0]} entry`);
      continue;
    }
    if (table.rows.some((row) => isUnfilled(row[index]))) {
      findings.push(`"${spec.section}" leaves ${accepted[0]} empty for at least one entry`);
    }
  }
  return findings;
}

/**
 * A labelled section is covered when every label carries a value. A section
 * written as plain bullets is covered when at least one bullet says something.
 */
function proseFindings(spec, lines) {
  const labelled = [...bulletValues(lines.join('\n')).entries()];
  if (labelled.length > 0) {
    const empty = labelled.filter(([, value]) => isUnfilled(value)).map(([label]) => label);
    return empty.length === 0
      ? []
      : [`"${spec.section}" leaves empty: ${empty.sort().join(', ')}`];
  }
  const said = lines.some((line) => /^\s*-\s*\S/u.test(line) && !isUnfilled(line.replace(/^\s*-\s*/u, '')));
  return said ? [] : [`"${spec.section}" is present but says nothing`];
}

export function evaluateConditionalDocumentDepth(documents = {}) {
  const findings = [];
  for (const { file, fields } of CONDITIONAL_DEPTH_SPECS) {
    const content = documents[file];
    if (typeof content !== 'string') continue;
    for (const spec of fields) {
      const lines = sectionLines(content, spec.section);
      if (lines === null) {
        findings.push(finding(
          'CONDITIONAL_FIELD_MISSING',
          file,
          `${spec.field} has no "${spec.section}" section`,
        ));
        continue;
      }
      const messages = spec.columns
        ? tableFindings(spec, lines)
        : proseFindings(spec, lines);
      for (const message of messages) {
        findings.push(finding('CONDITIONAL_FIELD_UNFILLED', file, message));
      }
    }
  }
  return findings;
}

export function evaluateRouteDecision(projectBrief, techStack) {
  const projectValues = bulletValues(projectBrief);
  const stackValues = bulletValues(techStack);
  const projectMode = firstValue(projectValues, ['決策模式', 'Decision mode']);
  const stackMode = firstValue(stackValues, ['決策模式', 'Decision mode']);
  const productShape = firstValue(projectValues, ['第一版產品形態', 'Product shape']);
  const technologyRoute = firstValue(stackValues, ['唯一主路線', 'Primary route']);
  const projectStatus = firstValue(projectValues, ['決策狀態', 'Decision status']);
  const stackStatus = firstValue(stackValues, ['決策狀態', 'Decision status']);
  const findings = [];

  if (
    projectMode
    && stackMode
    && !isPlaceholder(projectMode)
    && !isPlaceholder(stackMode)
    && projectMode.trim().toLowerCase() !== stackMode.trim().toLowerCase()
  ) {
    findings.push(finding(
      'ROUTE_MODE_CONFLICT',
      'GATE-ROUTE-001',
      'route decision modes do not match',
    ));
  }

  for (const [value, file] of [
    [projectMode, 'PROJECT_BRIEF.md'],
    [productShape, 'PROJECT_BRIEF.md'],
    [projectStatus, 'PROJECT_BRIEF.md'],
    [stackMode, 'TECH_STACK.md'],
    [technologyRoute, 'TECH_STACK.md'],
    [stackStatus, 'TECH_STACK.md'],
  ]) {
    if (isPlaceholder(value)) {
      findings.push(finding(
        'ROUTE_PLACEHOLDER',
        file,
        'route decision contains an unfilled field',
      ));
    }
  }

  for (const [value, file] of [
    [projectStatus, 'PROJECT_BRIEF.md'],
    [stackStatus, 'TECH_STACK.md'],
  ]) {
    if (value?.trim().toLowerCase() === 'recheck-required') {
      findings.push(finding(
        'STALE_DECISION',
        file,
        'route decision requires re-evaluation',
      ));
    }
  }

  return findings;
}

const SOURCE_HEADERS = [
  'Source ID',
  'Source class',
  'Trace mode',
  'Source ref',
  'Content retained',
  'Attestation',
  'Confirmed by',
  'Confirmed at',
];
const REQUIREMENT_HEADERS = [
  'Revision',
  'Operation',
  'Class',
  'Normalized requirement',
  'Source',
  'Confirmed by',
  'Supersedes',
];
const ACCEPTANCE_HEADERS = [
  'AC ID',
  'Requirement revision',
  'Yes/no criterion',
  'Failure signal',
];
const TASK_HEADERS = ['Task ID', 'Status', 'Requirement', 'AC', 'Verification'];
const EVIDENCE_HEADERS = [
  'Evidence ID',
  'AC',
  'Requirement',
  'Safe evidence locator',
  'Result',
  'Verified at',
];
const OPEN_LOOP_HEADERS = [
  'Status',
  'Loop ID',
  'Basis',
  'Question / Risk',
  'Impact',
  'Owner',
  'Next Step',
  'Due',
  'Resolution source',
];
const SOURCE_SECTIONS = ['Privacy-safe source attestations'];
const REQUIREMENT_SECTIONS = ['Requirement revision ledger'];
const ACCEPTANCE_SECTIONS = ['Acceptance criteria ledger'];
const TASK_SECTIONS = ['任務總覽', 'Task coverage ledger'];
const EVIDENCE_SECTIONS = ['Acceptance evidence ledger'];
const OPEN_LOOP_SECTIONS = ['未決事項', 'Open loops ledger'];

const SOURCE_ID = /^SRC-\d{3,}$/;
const REQUIREMENT_REVISION = /^(REQ-\d{3,})@([1-9]\d*)$/;
const ACCEPTANCE_ID = /^AC-\d{3,}$/;
const TASK_ID = /^TASK-\d{3,}$/;
const EVIDENCE_ID = /^EVD-\d{3,}$/;
const LOOP_ID = /^LOOP-\d{3,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_LEDGER_VALUE = /^(?:|n\/a|none|-|—)$/i;
const SOURCE_CLASSES = new Set(['public', 'approved-private-external', 'private-interactive', 'synthetic']);
const TRACE_MODES = new Set(['public-pointer', 'opaque-pointer', 'attestation-only']);
const SOURCE_ATTESTATIONS = new Set(['confirmed', 'rejected', 'pending']);
const REQUIREMENT_OPERATIONS = new Set(['add', 'replace', 'withdraw']);
const REQUIREMENT_CLASSES = new Set(['must', 'redline']);
const TASK_STATUSES = new Set(['planned', 'in-progress', 'completed', 'blocked']);
const LOOP_STATUSES = new Set(['open', 'closed', 'blocked']);
const HOME_PATH = /(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)/i;
const CREDENTIAL = /(?:\b(?:sk|ghp)-[A-Za-z0-9_]+|\bgithub_pat_[A-Za-z0-9_]+|\bAKIA[0-9A-Z]{16}\b|\b(?:token|password|secret|api[_-]?key)\s*[=:])/i;
const PRIVATE_HASH = /\b(?:md5|sha(?:1|224|256|384|512)?|hash)\s*[:=]/i;
const BARE_DIGEST = /\b(?:[a-f0-9]{128}|[a-f0-9]{96}|[a-f0-9]{64}|[a-f0-9]{56}|[a-f0-9]{40}|[a-f0-9]{32})\b/i;
const MASKED_EXCERPT = /\b(?:(?:masked|redacted|excerpt)(?:[\s_-]+)(?:masked|redacted|excerpt|private|content|text|record)|(?:masked|redacted|excerpt)\s*[：:=])|(?:已)?(?:遮罩|遮蔽)(?:內容|節錄|摘錄)|(?:節錄|摘錄)\s*[：:]/i;
const SECRET_QUERY = /[?&](?:access[_-]?token|token|api[_-]?key|key|secret|signature|auth|password)=/i;
const EMAIL_ADDRESS = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const PHONE_NUMBER = /(?:\+\d[\d .()-]{7,}\d|\(\d{2,4}\)[ -]?\d{3,4}[ -]?\d{3,4})/;
const TAIWAN_MOBILE = /\b09\d{2}(?:[- ]?\d{3})[- ]?\d{3}\b/;
const TAIWAN_LANDLINE = /\b0\d{1,3}(?:[- ]?\d){7,8}\b/;
const LATIN_IDENTITY_TOKEN = String.raw`(?:[A-Z][a-z]{1,30}|[A-Z]{2,30})`;
const LATIN_IDENTITY_PAIR = new RegExp(
  String.raw`^${LATIN_IDENTITY_TOKEN}\s+${LATIN_IDENTITY_TOKEN}$`,
);
const LATIN_IDENTITY_PAIR_SCAN = new RegExp(
  String.raw`(?=(\b${LATIN_IDENTITY_TOKEN}\s+${LATIN_IDENTITY_TOKEN}\b))`,
  'g',
);
const LATIN_IDENTITY_CONTEXT_BEFORE = /(?:\b(?:contact|owner)\s*[:=-]?|\b(?:confirmed|approved|reviewed)\s+by)\s*$/i;
const LATIN_IDENTITY_CONTEXT_AFTER = /^\s*(?:confirmed|approved|reviewed|contacted|(?:is\s+)?owner)\b/i;
const SAFE_PUBLIC_ENTITY_PHRASES = ['GitHub Actions'];
const HIGH_CONFIDENCE_LATIN_GIVEN_NAMES = new Set([
  'alice', 'amanda', 'andrew', 'anthony', 'barbara', 'benjamin', 'bob',
  'carol', 'charles', 'christopher', 'daniel', 'david', 'deborah', 'donald',
  'edward', 'elizabeth', 'emily', 'emma', 'george', 'helen', 'james',
  'jane', 'jennifer', 'jessica', 'john', 'joseph', 'karen', 'kevin',
  'laura', 'linda', 'mark', 'mary', 'michael', 'nancy', 'patricia',
  'paul', 'rebecca', 'richard', 'robert', 'sarah', 'steven', 'susan',
  'thomas', 'william',
]);
const HIGH_CONFIDENCE_LATIN_SURNAMES = new Set([
  'anderson', 'brown', 'chen', 'davis', 'doe', 'example', 'garcia',
  'harris', 'jackson', 'johnson', 'jones', 'lee', 'lewis', 'martin',
  'martinez', 'miller', 'moore', 'robinson', 'smith', 'taylor',
  'thomas', 'thompson', 'walker', 'wang', 'white', 'williams', 'wilson',
]);
const SAFE_STANDALONE_HAN_VALUES = new Set(['程式碼', '高可用']);
const STANDALONE_HAN_VALUE = /^\p{Script=Han}{2,4}$/u;
const HAN_IDENTITY_VALUE = String.raw`\p{Script=Han}{2,4}`;
const CHINESE_IDENTITY_CONTEXT = new RegExp(
  String.raw`(?:由\s*[：:]?\s*${HAN_IDENTITY_VALUE}\s*(?:確認|核准)|\b(?:confirmed|approved|reviewed|contact|owner)\s*[：:]?\s*${HAN_IDENTITY_VALUE}(?!\p{Script=Han})|(?:由|負責人|聯絡人|確認|核准)\s*[：:]?\s*${HAN_IDENTITY_VALUE}(?!\p{Script=Han})|(?<!\p{Script=Han})${HAN_IDENTITY_VALUE}\s*\b(?:confirmed|approved|reviewed|contact|owner)|(?<!\p{Script=Han})${HAN_IDENTITY_VALUE}\s*(?:確認|核准|負責|聯絡))`,
  'iu',
);
const ROLE_TOKENS = new Set([
  'admin', 'approver', 'auditor', 'compliance', 'data', 'design', 'developer',
  'engineering', 'eval', 'legal', 'maintainer', 'operator', 'owner', 'platform',
  'privacy', 'product', 'qa', 'release', 'reviewer', 'security', 'tester',
]);
const OPAQUE_POINTER = /^external-record:([a-z0-9]+(?:[._-][a-z0-9]+)*)$/i;
const OPAQUE_CATEGORY_PREFIXES = new Set([
  'artifact', 'case', 'item', 'project', 'record', 'source', 'test',
]);
const EVIDENCE_CHECK = /^(?:check|ci):[a-z0-9][a-z0-9._-]{0,127}$/i;

function markdownCells(line) {
  const trimmed = String(line).trim();
  if (!trimmed.startsWith('|') || !trimmed.endsWith('|')) return null;
  return trimmed.slice(1, -1).split('|').map((cell) => cell.trim());
}

function isTableSeparator(cells, width) {
  return Array.isArray(cells)
    && cells.length === width
    && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function visibleMarkdownLines(content) {
  const withoutComments = String(content).replace(/<!--[\s\S]*?(?:-->|$)/g, (comment) => (
    '\n'.repeat((comment.match(/\n/g) || []).length)
  ));
  const lines = withoutComments.split(/\r?\n/);
  let fence = null;
  return lines.map((line) => {
    if (fence !== null) {
      const closingMatch = line.match(/^ {0,3}(`+|~+)([ \t]*)$/);
      if (
        closingMatch
        && closingMatch[1][0] === fence.marker
        && closingMatch[1].length >= fence.length
      ) {
        fence = null;
      }
      return null;
    }
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      return null;
    }
    if (fence !== null || /^(?: {4}|\t)/.test(line)) return null;
    return line;
  });
}

function markdownHeading(line) {
  if (typeof line !== 'string') return null;
  const match = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
  return match ? { level: match[1].length, title: match[2].trim() } : null;
}

function findSections(lines, sectionTitles) {
  const wanted = new Set(sectionTitles.map((title) => title.toLowerCase()));
  const sections = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = markdownHeading(lines[index]);
    if (!heading || !wanted.has(heading.title.toLowerCase())) continue;
    let end = lines.length;
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const nextHeading = markdownHeading(lines[cursor]);
      if (nextHeading && nextHeading.level <= heading.level) {
        end = cursor;
        break;
      }
    }
    sections.push({ start: index + 1, end });
  }
  return sections;
}

function parseExactTable(content, headers, sectionTitles) {
  const lines = visibleMarkdownLines(content);
  const sections = findSections(lines, sectionTitles);
  if (sections.length !== 1) {
    return { found: false, valid: false, rows: [] };
  }

  const [{ start, end }] = sections;
  const headersAt = [];
  for (let index = start; index < end; index += 1) {
    const cells = markdownCells(lines[index]);
    if (
      cells?.length === headers.length
      && cells.every((cell, cellIndex) => cell === headers[cellIndex])
    ) {
      headersAt.push(index);
    }
  }
  if (headersAt.length !== 1) {
    return { found: headersAt.length > 0, valid: false, rows: [] };
  }

  const headerIndex = headersAt[0];
  if (!isTableSeparator(markdownCells(lines[headerIndex + 1]), headers.length)) {
    return { found: true, valid: false, rows: [] };
  }

  const rows = [];
  let malformed = false;
  for (let rowIndex = headerIndex + 2; rowIndex < end; rowIndex += 1) {
    const line = lines[rowIndex];
    if (line === null) break;
    const row = markdownCells(line);
    if (!row) {
      if (String(line).trim().startsWith('|')) malformed = true;
      break;
    }
    if (row.length !== headers.length) {
      malformed = true;
      break;
    }
    if (row.every((cell) => cell === '')) continue;
    if (isTableSeparator(row, headers.length)) {
      malformed = true;
      break;
    }
    rows.push(Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex]])));
  }
  return {
    found: true,
    valid: !malformed && rows.length > 0,
    rows: malformed ? [] : rows,
  };
}

function traceSubject(value, pattern, fallback) {
  return pattern.test(value) ? value : fallback;
}

function splitReferences(value) {
  return String(value)
    .split(/\s*(?:,|;|<br\s*\/?\s*>)\s*/i)
    .map((item) => item.replace(/^`|`$/g, '').trim())
    .filter(Boolean);
}

function decisionEvidence(content, sectionTitles) {
  const lines = visibleMarkdownLines(content);
  const sections = findSections(lines, sectionTitles);
  if (sections.length !== 1) return { valid: false, value: '' };
  const [{ start, end }] = sections;
  const values = [];
  for (let index = start; index < end; index += 1) {
    const match = String(lines[index] ?? '').match(/^\s*-\s*Evidence\s*[：:]\s*(.*?)\s*$/i);
    if (match) values.push(match[1]);
  }
  return {
    valid: values.length === 1 && values[0].length > 0 && !isPlaceholder(values[0]),
    value: values.length === 1 ? values[0] : '',
  };
}

function isEmptyLedgerValue(value) {
  return EMPTY_LEDGER_VALUE.test(String(value).trim());
}

function isoDateIsValid(value) {
  const text = String(value);
  if (!ISO_DATE.test(text)) return false;
  const date = new Date(`${text}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

function isYesNoCriterion(value) {
  const text = String(value).trim();
  return (/\byes\b/i.test(text) && /\bno\b/i.test(text))
    || (text.includes('是') && text.includes('否'));
}

function publicHttpsUrlIsSafe(value) {
  try {
    const url = new URL(String(value));
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return false;
    if (!hostname.includes('.') || /(?:^|\.)(?:localhost|local|invalid|test|example)$/.test(hostname)) return false;
    if (/^\d+(?:\.\d+){3}$/.test(hostname) || hostname.includes(':')) return false;
    return /^[a-z0-9.-]+$/.test(hostname);
  } catch {
    return false;
  }
}

function latinPairIsHighConfidenceName(pair) {
  const tokens = pair.split(/\s+/).map((token) => token.toLowerCase());
  return tokens.length === 2
    && HIGH_CONFIDENCE_LATIN_GIVEN_NAMES.has(tokens[0])
    && HIGH_CONFIDENCE_LATIN_SURNAMES.has(tokens[1]);
}

function latinNameBlocked(value) {
  const text = String(value);
  const trimmed = text.trim();
  if (LATIN_IDENTITY_PAIR.test(trimmed)) {
    return latinPairIsHighConfidenceName(trimmed);
  }
  for (const match of text.matchAll(LATIN_IDENTITY_PAIR_SCAN)) {
    const pair = match[1];
    if (SAFE_PUBLIC_ENTITY_PHRASES.includes(pair)) continue;
    const before = text.slice(0, match.index);
    const after = text.slice(match.index + pair.length);
    if (
      LATIN_IDENTITY_CONTEXT_BEFORE.test(before)
      || LATIN_IDENTITY_CONTEXT_AFTER.test(after)
    ) return true;
  }
  return false;
}

function chineseIdentityBlocked(value) {
  const text = String(value);
  const trimmed = text.trim();
  if (STANDALONE_HAN_VALUE.test(trimmed) && !SAFE_STANDALONE_HAN_VALUES.has(trimmed)) return true;
  return CHINESE_IDENTITY_CONTEXT.test(text);
}

function scalarPrivacyBlocked(value) {
  const text = String(value);
  return HOME_PATH.test(text)
    || CREDENTIAL.test(text)
    || PRIVATE_HASH.test(text)
    || BARE_DIGEST.test(text)
    || MASKED_EXCERPT.test(text)
    || SECRET_QUERY.test(text)
    || EMAIL_ADDRESS.test(text)
    || PHONE_NUMBER.test(text)
    || TAIWAN_MOBILE.test(text)
    || TAIWAN_LANDLINE.test(text)
    || latinNameBlocked(text)
    || chineseIdentityBlocked(text);
}

function privacyBlocked(value) {
  const text = String(value);
  if (scalarPrivacyBlocked(text)) return true;

  for (const match of text.matchAll(/https?:\/\/[^\s<>()]+/gi)) {
    try {
      const url = new URL(match[0].replace(/[.,;!?]+$/, ''));
      if (url.username || url.password || SECRET_QUERY.test(url.search)) return true;
      if (scalarPrivacyBlocked(decodeURIComponent(url.pathname))) return true;
      if (!publicHttpsUrlIsSafe(url.href)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function rowPrivacyBlocked(row, excludedHeaders = []) {
  return Object.entries(row).some(([header, value]) => (
    !excludedHeaders.includes(header) && privacyBlocked(value)
  ));
}

function opaquePointerIsSafe(value) {
  const match = String(value).match(OPAQUE_POINTER);
  if (!match) return false;
  const suffix = match[1];
  if (BARE_DIGEST.test(suffix) || /(?:masked|redacted|excerpt)/i.test(suffix)) return false;
  const tokens = suffix.split(/[._-]/);
  return tokens.length === 1 || OPAQUE_CATEGORY_PREFIXES.has(tokens[0].toLowerCase());
}

function sourceMatrixIsSafe(sourceClass, traceMode, sourceRef, retained) {
  if (!SOURCE_CLASSES.has(sourceClass) || !TRACE_MODES.has(traceMode)) return false;
  if (!['yes', 'no'].includes(retained)) return false;
  if (sourceClass === 'public') {
    return traceMode === 'public-pointer' && publicHttpsUrlIsSafe(sourceRef);
  }
  if (sourceClass === 'approved-private-external') {
    return traceMode === 'opaque-pointer' && retained === 'no' && opaquePointerIsSafe(sourceRef);
  }
  if (sourceClass === 'private-interactive') {
    return traceMode === 'attestation-only' && retained === 'no' && isEmptyLedgerValue(sourceRef);
  }
  return retained === 'no' && (
    (traceMode === 'attestation-only' && isEmptyLedgerValue(sourceRef))
    || (traceMode === 'public-pointer' && publicHttpsUrlIsSafe(sourceRef))
  );
}

function roleLabelIsSafe(value) {
  const label = String(value);
  if (!label.endsWith('-role')) return false;
  const tokens = label.slice(0, -'-role'.length).split('-');
  return tokens.length > 0 && tokens.every((token) => ROLE_TOKENS.has(token));
}

function evidenceLocatorIsSafe(value) {
  const locator = String(value).trim();
  if (privacyBlocked(locator)) return false;
  if (EVIDENCE_CHECK.test(locator)) return true;
  if (locator.startsWith('public-artifact:')) {
    return publicHttpsUrlIsSafe(locator.slice('public-artifact:'.length));
  }
  if (!locator.startsWith('command:')) return false;
  const command = locator.slice('command:'.length);
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._/@:=+-]*(?: [A-Za-z0-9-][A-Za-z0-9._/@:=+-]*)*$/.test(command)
  ) return false;
  return command.split(' ').every((token) => (
    !token.startsWith('/')
    && !token.startsWith('~')
    && !token.split('/').includes('..')
    && !/(?:token|secret|password|api[_-]?key|auth)/i.test(token)
  ));
}

function hasSupersedesCycle(rowsByRevision) {
  const visiting = new Set();
  const visited = new Set();

  function visit(revision) {
    if (visiting.has(revision)) return true;
    if (visited.has(revision)) return false;
    visiting.add(revision);
    const next = rowsByRevision.get(revision)?.['Supersedes'];
    if (REQUIREMENT_REVISION.test(next) && rowsByRevision.has(next) && visit(next)) return true;
    visiting.delete(revision);
    visited.add(revision);
    return false;
  }

  return [...rowsByRevision.keys()].some(visit);
}

export function evaluateTraceability(projectBrief, spec, taskContract, openLoops, techStack) {
  const findings = [];
  const findingKeys = new Set();
  const add = (code, subject, message) => {
    const item = finding(code, subject, message);
    const key = `${item.code}\u0000${item.subject}\u0000${item.message}`;
    if (!findingKeys.has(key)) {
      findingKeys.add(key);
      findings.push(item);
    }
  };
  const requireTable = (table, code, file, label) => {
    if (!table.valid) add(code, file, `${label} ledger is missing, empty, duplicated, or malformed`);
    return table.valid ? table.rows : [];
  };
  const pairKey = (revision, acceptanceId) => `${revision}\u0000${acceptanceId}`;

  const sourceTable = parseExactTable(projectBrief, SOURCE_HEADERS, SOURCE_SECTIONS);
  const sourceRows = requireTable(
    sourceTable,
    'TRACE_SOURCE_MISSING',
    'PROJECT_BRIEF.md',
    'source attestation',
  );
  const sources = new Map();
  for (const row of sourceRows) {
    const sourceId = row['Source ID'];
    const subject = traceSubject(sourceId, SOURCE_ID, 'PROJECT_BRIEF.md');
    if (rowPrivacyBlocked(row)) {
      add('PRIVACY_SOURCE_BLOCKED', subject, 'source attestation violates the privacy policy');
    }
    if (!SOURCE_ID.test(sourceId) || sources.has(sourceId)) {
      add('TRACE_SOURCE_MISSING', subject, 'source attestation identifier is invalid');
      continue;
    }

    const sourceClass = row['Source class'].toLowerCase();
    const traceMode = row['Trace mode'].toLowerCase();
    const sourceRef = row['Source ref'];
    const retained = row['Content retained'].toLowerCase();
    const attestation = row['Attestation'].toLowerCase();
    const confirmedBy = row['Confirmed by'];
    const confirmedAt = row['Confirmed at'];
    const enumValid = SOURCE_CLASSES.has(sourceClass)
      && TRACE_MODES.has(traceMode)
      && SOURCE_ATTESTATIONS.has(attestation);
    const rolePresent = !isEmptyLedgerValue(confirmedBy);
    const dateValid = isoDateIsValid(confirmedAt)
      || (attestation !== 'confirmed' && isEmptyLedgerValue(confirmedAt));
    const privacySafe = !privacyBlocked(sourceRef)
      && (!rolePresent || (!privacyBlocked(confirmedBy) && roleLabelIsSafe(confirmedBy)))
      && !privacyBlocked(confirmedAt)
      && sourceMatrixIsSafe(sourceClass, traceMode, sourceRef, retained);

    if (!enumValid) add('TRACE_SOURCE_MISSING', sourceId, 'source attestation row is invalid');
    if (!privacySafe) {
      add('PRIVACY_SOURCE_BLOCKED', sourceId, 'source attestation violates the privacy policy');
    }
    if ((attestation === 'confirmed' && !rolePresent) || !dateValid) {
      add('TRACE_CONFIRMATION_MISSING', sourceId, 'source attestation confirmation metadata is invalid');
    }

    sources.set(sourceId, {
      attestation,
      confirmedBy,
      confirmed: enumValid
        && privacySafe
        && attestation === 'confirmed'
        && rolePresent
        && dateValid,
    });
  }

  const requirementTable = parseExactTable(spec, REQUIREMENT_HEADERS, REQUIREMENT_SECTIONS);
  const requirementRows = requireTable(
    requirementTable,
    'TRACE_REVISION_INVALID',
    'SPEC.md',
    'requirement revision',
  );
  const requirementRowsByRevision = new Map();
  const provenanceValidByRevision = new Map();
  for (const row of requirementRows) {
    const revision = row['Revision'];
    const subject = traceSubject(revision, REQUIREMENT_REVISION, 'SPEC.md');
    if (rowPrivacyBlocked(row)) {
      add('PRIVACY_SOURCE_BLOCKED', subject, 'requirement lineage violates the privacy policy');
    }
    if (!REQUIREMENT_REVISION.test(revision) || requirementRowsByRevision.has(revision)) {
      add('TRACE_REVISION_INVALID', subject, 'requirement revision identifier is invalid');
      continue;
    }
    requirementRowsByRevision.set(revision, row);

    const normalizedRequirement = row['Normalized requirement'];
    const confirmedBy = row['Confirmed by'];
    const safeFreeText = !privacyBlocked(normalizedRequirement)
      && !privacyBlocked(confirmedBy)
      && roleLabelIsSafe(confirmedBy);
    if (!safeFreeText) {
      add('PRIVACY_SOURCE_BLOCKED', revision, 'requirement lineage violates the privacy policy');
    }

    const sourceId = row['Source'];
    let provenanceValid = safeFreeText;
    if (!SOURCE_ID.test(sourceId) || !sources.has(sourceId)) {
      add('TRACE_SOURCE_MISSING', revision, 'requirement source attestation is missing');
      provenanceValid = false;
    } else {
      const source = sources.get(sourceId);
      if (!source.confirmed || confirmedBy !== source.confirmedBy) {
        add('TRACE_CONFIRMATION_MISSING', revision, 'requirement confirmation does not match its source attestation');
        provenanceValid = false;
      }
    }
    provenanceValidByRevision.set(revision, provenanceValid);
  }

  if (hasSupersedesCycle(requirementRowsByRevision)) {
    add('TRACE_REVISION_INVALID', 'SPEC.md', 'requirement supersedes graph contains a cycle');
  }

  const seenRevisions = new Set();
  const seenRequirementIds = new Set();
  const activeByRequirement = new Map();
  const graphValidRevisions = new Set();
  for (const row of requirementRows) {
    const revision = row['Revision'];
    const revisionMatch = revision.match(REQUIREMENT_REVISION);
    if (!revisionMatch || seenRevisions.has(revision)) continue;

    const [, requirementId, revisionNumberText] = revisionMatch;
    const revisionNumber = Number(revisionNumberText);
    const operation = row['Operation'].toLowerCase();
    const requirementClass = row['Class'].toLowerCase();
    const supersedes = row['Supersedes'];
    let graphValid = provenanceValidByRevision.get(revision) === true
      && REQUIREMENT_OPERATIONS.has(operation)
      && REQUIREMENT_CLASSES.has(requirementClass)
      && !isEmptyLedgerValue(row['Normalized requirement']);

    if (operation === 'add') {
      graphValid = graphValid
        && revisionNumber === 1
        && isEmptyLedgerValue(supersedes)
        && !seenRequirementIds.has(requirementId);
    } else if (operation === 'replace' || operation === 'withdraw') {
      const supersedesMatch = supersedes.match(REQUIREMENT_REVISION);
      graphValid = graphValid
        && Boolean(supersedesMatch)
        && supersedesMatch?.[1] === requirementId
        && Number(supersedesMatch?.[2]) < revisionNumber
        && seenRevisions.has(supersedes)
        && graphValidRevisions.has(supersedes)
        && activeByRequirement.get(requirementId) === supersedes;
    } else {
      graphValid = false;
    }

    if (!graphValid) {
      add('TRACE_REVISION_INVALID', revision, 'requirement revision replay is invalid');
    } else {
      graphValidRevisions.add(revision);
      if (operation === 'withdraw') activeByRequirement.delete(requirementId);
      else activeByRequirement.set(requirementId, revision);
    }

    seenRevisions.add(revision);
    seenRequirementIds.add(requirementId);
  }
  const activeRevisions = new Set(activeByRequirement.values());

  const routeEvidenceByFile = new Map();
  for (const [content, file, section] of [
    [projectBrief, 'PROJECT_BRIEF.md', ['產品形態決策', 'Product shape decision']],
    [techStack, 'TECH_STACK.md', ['技術路線決策', 'Technology route decision']],
  ]) {
    const evidence = decisionEvidence(content, section);
    const tokens = splitReferences(evidence.value);
    const uniqueTokens = new Set(tokens);
    const sourceTokens = tokens.filter((token) => SOURCE_ID.test(token));
    const revisionTokens = tokens.filter((token) => REQUIREMENT_REVISION.test(token));
    const malformed = tokens.filter((token) => !SOURCE_ID.test(token) && !REQUIREMENT_REVISION.test(token));
    if (privacyBlocked(evidence.value)) {
      add('PRIVACY_SOURCE_BLOCKED', file, 'route evidence violates the privacy policy');
    }
    if (!evidence.valid || sourceTokens.length === 0 || malformed.length > 0 || uniqueTokens.size !== tokens.length) {
      add('TRACE_SOURCE_MISSING', file, 'route evidence must contain unique confirmed source IDs');
    }
    if (!evidence.valid || revisionTokens.length === 0 || malformed.length > 0 || uniqueTokens.size !== tokens.length) {
      add('TRACE_REVISION_INVALID', file, 'route evidence must contain unique active requirement revisions');
    }
    for (const sourceId of sourceTokens) {
      if (!sources.has(sourceId)) {
        add('TRACE_SOURCE_MISSING', file, 'route evidence references an unknown source attestation');
      } else if (!sources.get(sourceId).confirmed) {
        add('TRACE_CONFIRMATION_MISSING', file, 'route evidence references an unconfirmed source attestation');
      }
    }
    for (const revision of revisionTokens) {
      if (!activeRevisions.has(revision)) {
        add('TRACE_REVISION_INVALID', file, 'route evidence references an inactive requirement revision');
      }
    }
    routeEvidenceByFile.set(file, uniqueTokens);
  }
  const projectEvidence = routeEvidenceByFile.get('PROJECT_BRIEF.md');
  const stackEvidence = routeEvidenceByFile.get('TECH_STACK.md');
  if (
    projectEvidence.size !== stackEvidence.size
    || [...projectEvidence].some((token) => !stackEvidence.has(token))
  ) {
    add('ROUTE_MODE_CONFLICT', 'GATE-ROUTE-001', 'route evidence does not match across decision documents');
  }

  const acceptanceTable = parseExactTable(spec, ACCEPTANCE_HEADERS, ACCEPTANCE_SECTIONS);
  const acceptanceRows = requireTable(
    acceptanceTable,
    'TRACE_ACCEPTANCE_MISSING',
    'SPEC.md',
    'acceptance criteria',
  );
  const acceptances = new Map();
  const acceptanceIdsByRevision = new Map();
  for (const row of acceptanceRows) {
    const acceptanceId = row['AC ID'];
    const revision = row['Requirement revision'];
    const subject = traceSubject(acceptanceId, ACCEPTANCE_ID, 'SPEC.md');
    if (rowPrivacyBlocked(row)) {
      add('PRIVACY_SOURCE_BLOCKED', subject, 'acceptance criterion violates the privacy policy');
    }
    if (!ACCEPTANCE_ID.test(acceptanceId) || acceptances.has(acceptanceId)) {
      add('TRACE_ACCEPTANCE_MISSING', subject, 'acceptance criterion identifier is invalid');
      continue;
    }
    if (!graphValidRevisions.has(revision) || !activeRevisions.has(revision)) {
      add('TRACE_REVISION_INVALID', subject, 'acceptance criterion references an inactive requirement revision');
      continue;
    }
    if (privacyBlocked(row['Yes/no criterion']) || privacyBlocked(row['Failure signal'])) {
      add('PRIVACY_SOURCE_BLOCKED', acceptanceId, 'acceptance criterion violates the privacy policy');
      continue;
    }
    if (!isYesNoCriterion(row['Yes/no criterion']) || isEmptyLedgerValue(row['Failure signal'])) {
      add('TRACE_ACCEPTANCE_MISSING', acceptanceId, 'yes/no acceptance criterion is incomplete');
      continue;
    }
    acceptances.set(acceptanceId, { revision });
    if (!acceptanceIdsByRevision.has(revision)) acceptanceIdsByRevision.set(revision, new Set());
    acceptanceIdsByRevision.get(revision).add(acceptanceId);
  }
  for (const revision of activeRevisions) {
    if (!acceptanceIdsByRevision.has(revision)) {
      add('TRACE_ACCEPTANCE_MISSING', revision, 'active requirement has no acceptance criterion');
    }
  }

  const taskTable = parseExactTable(taskContract, TASK_HEADERS, TASK_SECTIONS);
  const taskRows = requireTable(
    taskTable,
    'TRACE_TASK_COVERAGE_MISSING',
    'TASK_CONTRACT.md',
    'task coverage',
  );
  const tasks = new Map();
  const taskedPairs = new Set();
  for (const row of taskRows) {
    const taskId = row['Task ID'];
    const subject = traceSubject(taskId, TASK_ID, 'TASK_CONTRACT.md');
    if (rowPrivacyBlocked(row)) {
      add('PRIVACY_SOURCE_BLOCKED', subject, 'task verification violates the privacy policy');
    }
    if (!TASK_ID.test(taskId) || tasks.has(taskId)) {
      add('TRACE_TASK_COVERAGE_MISSING', subject, 'task identifier is invalid');
      continue;
    }

    const status = row['Status'].toLowerCase();
    const requirements = splitReferences(row['Requirement']);
    const acceptanceIds = splitReferences(row['AC']);
    const pairs = [];
    let referencesValid = TASK_STATUSES.has(status)
      && requirements.length > 0
      && acceptanceIds.length > 0
      && !isEmptyLedgerValue(row['Verification'])
      && !privacyBlocked(row['Verification'])
      && new Set(requirements).size === requirements.length
      && new Set(acceptanceIds).size === acceptanceIds.length;
    if (
      !TASK_STATUSES.has(status)
      || requirements.length === 0
      || acceptanceIds.length === 0
      || isEmptyLedgerValue(row['Verification'])
      || privacyBlocked(row['Verification'])
      || new Set(requirements).size !== requirements.length
      || new Set(acceptanceIds).size !== acceptanceIds.length
    ) {
      add('TRACE_TASK_COVERAGE_MISSING', taskId, 'task status, verification, or references are invalid');
    }
    if (privacyBlocked(row['Verification'])) {
      add('PRIVACY_SOURCE_BLOCKED', taskId, 'task verification violates the privacy policy');
    }

    for (const revision of requirements) {
      if (!activeRevisions.has(revision)) {
        add('TRACE_REVISION_INVALID', taskId, 'task references an inactive requirement revision');
        referencesValid = false;
      }
    }
    for (const acceptanceId of acceptanceIds) {
      const acceptance = acceptances.get(acceptanceId);
      if (!acceptance || !requirements.includes(acceptance.revision)) {
        add('TRACE_ACCEPTANCE_MISSING', taskId, 'task acceptance reference is invalid');
        referencesValid = false;
      } else {
        pairs.push({ acceptanceId, revision: acceptance.revision });
      }
    }
    for (const revision of requirements) {
      if (!pairs.some((pair) => pair.revision === revision)) {
        add('TRACE_TASK_COVERAGE_MISSING', taskId, 'task requirement has no matching acceptance criterion');
        referencesValid = false;
      }
    }

    if (referencesValid) {
      for (const { revision, acceptanceId } of pairs) taskedPairs.add(pairKey(revision, acceptanceId));
    }
    tasks.set(taskId, { status, pairs: referencesValid ? pairs : [] });
  }
  for (const [acceptanceId, { revision }] of acceptances) {
    if (!taskedPairs.has(pairKey(revision, acceptanceId))) {
      add('TRACE_TASK_COVERAGE_MISSING', acceptanceId, 'acceptance criterion has no matching task pair');
    }
  }
  for (const revision of activeRevisions) {
    if (![...taskedPairs].some((key) => key.startsWith(`${revision}\u0000`))) {
      add('TRACE_TASK_COVERAGE_MISSING', revision, 'active requirement has no task coverage');
    }
  }

  const evidenceTable = parseExactTable(taskContract, EVIDENCE_HEADERS, EVIDENCE_SECTIONS);
  const evidenceRows = requireTable(
    evidenceTable,
    'TRACE_EVIDENCE_MISSING',
    'TASK_CONTRACT.md',
    'acceptance evidence',
  );
  const evidenceIds = new Set();
  const passingEvidence = new Set();
  for (const row of evidenceRows) {
    const evidenceId = row['Evidence ID'];
    const subject = traceSubject(evidenceId, EVIDENCE_ID, 'TASK_CONTRACT.md');
    if (rowPrivacyBlocked(row, ['Safe evidence locator'])) {
      add('PRIVACY_SOURCE_BLOCKED', subject, 'evidence lineage violates the privacy policy');
    }
    if (privacyBlocked(row['Safe evidence locator'])) {
      add('PRIVACY_PATH_BLOCKED', subject, 'evidence locator violates the safe-path policy');
    }
    if (!EVIDENCE_ID.test(evidenceId) || evidenceIds.has(evidenceId)) {
      add('TRACE_EVIDENCE_MISSING', subject, 'evidence identifier is invalid');
      continue;
    }
    evidenceIds.add(evidenceId);

    const acceptanceId = row['AC'];
    const revision = row['Requirement'];
    const acceptance = acceptances.get(acceptanceId);
    const key = pairKey(revision, acceptanceId);
    let evidenceValid = true;
    if (!activeRevisions.has(revision)) {
      add('TRACE_REVISION_INVALID', evidenceId, 'evidence references an inactive requirement revision');
      evidenceValid = false;
    }
    if (!acceptance || acceptance.revision !== revision) {
      add('TRACE_ACCEPTANCE_MISSING', evidenceId, 'evidence acceptance reference is invalid');
      evidenceValid = false;
    }
    if (!taskedPairs.has(key)) {
      add('TRACE_EVIDENCE_MISSING', evidenceId, 'evidence has no matching task pair');
      evidenceValid = false;
    }
    if (!evidenceLocatorIsSafe(row['Safe evidence locator'])) {
      add('PRIVACY_PATH_BLOCKED', evidenceId, 'evidence locator violates the safe-path policy');
      evidenceValid = false;
    }
    const result = row['Result'].toLowerCase();
    if (!['passing', 'failing', 'blocked'].includes(result) || !isoDateIsValid(row['Verified at'])) {
      add('TRACE_EVIDENCE_MISSING', evidenceId, 'evidence result is incomplete');
      evidenceValid = false;
    }
    if (evidenceValid) {
      if (result === 'passing') passingEvidence.add(key);
    }
  }

  for (const [taskId, task] of tasks) {
    if (task.status !== 'completed') continue;
    if (
      task.pairs.length === 0
      || task.pairs.some(({ acceptanceId, revision }) => !passingEvidence.has(pairKey(revision, acceptanceId)))
    ) {
      add('TRACE_EVIDENCE_MISSING', taskId, 'completed task has no passing acceptance evidence');
    }
  }

  const openLoopTable = parseExactTable(openLoops, OPEN_LOOP_HEADERS, OPEN_LOOP_SECTIONS);
  const openLoopRows = requireTable(
    openLoopTable,
    'TRACE_CONFIRMATION_MISSING',
    'OPEN_LOOPS.md',
    'open-loop lineage',
  );
  const loopIds = new Set();
  for (const row of openLoopRows) {
    const loopId = row['Loop ID'];
    const subject = traceSubject(loopId, LOOP_ID, 'OPEN_LOOPS.md');
    if (rowPrivacyBlocked(row)) {
      add('PRIVACY_SOURCE_BLOCKED', subject, 'open-loop lineage violates the privacy policy');
    }
    const status = row['Status'].toLowerCase();
    if (!LOOP_ID.test(loopId) || loopIds.has(loopId) || !LOOP_STATUSES.has(status)) {
      add('TRACE_CONFIRMATION_MISSING', subject, 'open-loop lineage row is invalid');
      continue;
    }
    loopIds.add(loopId);
    const freeText = [
      row['Basis'],
      row['Question / Risk'],
      row['Impact'],
      row['Owner'],
      row['Next Step'],
      row['Due'],
    ];
    const resolutionSource = row['Resolution source'];
    if (
      freeText.some(privacyBlocked)
      || privacyBlocked(resolutionSource)
      || !roleLabelIsSafe(row['Owner'])
    ) {
      add('PRIVACY_SOURCE_BLOCKED', loopId, 'open-loop lineage violates the privacy policy');
    }
    if (
      row['Basis'].toLowerCase() !== 'not-stated'
      || freeText.some(isEmptyLedgerValue)
    ) {
      add('TRACE_CONFIRMATION_MISSING', loopId, 'open-loop lineage row is incomplete');
    }
    if (status === 'closed') {
      if (!SOURCE_ID.test(resolutionSource) || !sources.has(resolutionSource)) {
        add('TRACE_SOURCE_MISSING', loopId, 'open-loop resolution source is missing');
      } else if (!sources.get(resolutionSource).confirmed) {
        add('TRACE_CONFIRMATION_MISSING', loopId, 'open-loop resolution source is not confirmed');
      }
    } else if (!isEmptyLedgerValue(resolutionSource)) {
      add('TRACE_CONFIRMATION_MISSING', loopId, 'unresolved open loop must not cite a resolution source');
    }
  }

  return findings;
}
