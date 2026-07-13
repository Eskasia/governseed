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
  'TESTER_HANDOFF.md',
  'MACOS_RELEASE_CHECKLIST.md',
  'AGENT_RUNTIME.md',
  'RAG_DESIGN.md',
  'EVAL_PLAN.md',
  'AI_SECURITY_REVIEW.md',
]);
const SAFE_SUBJECT = /^(?:SRC-\d{3,}|REQ-\d{3,}@\d+|AC-\d{3,}|TASK-\d{3,}|EVD-\d{3,}|LOOP-\d{3,}|GATE-[A-Z0-9-]+)$/;

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

const SOURCE_ID = /^SRC-\d{3,}$/;
const REQUIREMENT_REVISION = /^(REQ-\d{3,})@([1-9]\d*)$/;
const ACCEPTANCE_ID = /^AC-\d{3,}$/;
const TASK_ID = /^TASK-\d{3,}$/;
const EVIDENCE_ID = /^EVD-\d{3,}$/;
const LOOP_ID = /^LOOP-\d{3,}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EMPTY_LEDGER_VALUE = /^(?:|n\/a|none|-|—)$/i;
const PRIVATE_SOURCE_CLASSES = new Set(['approved-private-external', 'private-interactive']);
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
const MASKED_EXCERPT = /\b(?:masked|redacted|excerpt)\b|(?:遮罩|遮蔽|節錄|摘錄)/i;
const SECRET_QUERY = /[?&](?:access[_-]?token|token|api[_-]?key|key|secret|signature|auth|password)=/i;

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

function parseExactTable(content, headers) {
  const lines = String(content).split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const cells = markdownCells(lines[index]);
    if (!cells || cells.length !== headers.length) continue;
    if (!cells.every((cell, cellIndex) => cell === headers[cellIndex])) continue;
    if (!isTableSeparator(markdownCells(lines[index + 1]), headers.length)) continue;

    const rows = [];
    for (let rowIndex = index + 2; rowIndex < lines.length; rowIndex += 1) {
      const row = markdownCells(lines[rowIndex]);
      if (!row) break;
      if (row.length !== headers.length || row.every((cell) => cell === '')) continue;
      rows.push(Object.fromEntries(headers.map((header, cellIndex) => [header, row[cellIndex]])));
    }
    return { found: true, rows };
  }
  return { found: false, rows: [] };
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

function isEmptyLedgerValue(value) {
  return EMPTY_LEDGER_VALUE.test(String(value).trim());
}

function isYesNoCriterion(value) {
  const text = String(value).trim();
  return (/\byes\b/i.test(text) && /\bno\b/i.test(text))
    || (text.includes('是') && text.includes('否'));
}

function locatorHasSecret(value) {
  return HOME_PATH.test(value) || CREDENTIAL.test(value) || SECRET_QUERY.test(value);
}

function privateSourceLocatorIsUnsafe(sourceClass, traceMode, sourceRef, retained) {
  if (!PRIVATE_SOURCE_CLASSES.has(sourceClass)) return false;
  if (!['opaque-pointer', 'attestation-only'].includes(traceMode)) return true;
  if (retained !== 'no') return true;
  if (locatorHasSecret(sourceRef) || PRIVATE_HASH.test(sourceRef) || MASKED_EXCERPT.test(sourceRef)) {
    return true;
  }
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(sourceRef) || sourceRef.includes('?')) return true;
  if (sourceClass === 'private-interactive') {
    return traceMode !== 'attestation-only' || !isEmptyLedgerValue(sourceRef);
  }
  return traceMode === 'attestation-only' && !isEmptyLedgerValue(sourceRef);
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

export function evaluateTraceability(projectBrief, spec, taskContract, openLoops) {
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

  const sourceTable = parseExactTable(projectBrief, SOURCE_HEADERS);
  const sources = new Map();
  if (!sourceTable.found || sourceTable.rows.length === 0) {
    add('TRACE_SOURCE_MISSING', 'PROJECT_BRIEF.md', 'source attestation ledger is missing');
  }
  for (const row of sourceTable.rows) {
    const sourceId = row['Source ID'];
    const subject = traceSubject(sourceId, SOURCE_ID, 'PROJECT_BRIEF.md');
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

    if (!SOURCE_CLASSES.has(sourceClass) || !TRACE_MODES.has(traceMode) || !SOURCE_ATTESTATIONS.has(attestation)) {
      add('TRACE_SOURCE_MISSING', sourceId, 'source attestation row is invalid');
    }
    if (
      privateSourceLocatorIsUnsafe(sourceClass, traceMode, sourceRef, retained)
      || (!PRIVATE_SOURCE_CLASSES.has(sourceClass) && locatorHasSecret(sourceRef))
    ) {
      add('PRIVACY_SOURCE_BLOCKED', sourceId, 'source attestation violates the privacy policy');
    }
    if (
      attestation === 'confirmed'
      && (isEmptyLedgerValue(confirmedBy) || !ISO_DATE.test(confirmedAt))
    ) {
      add('TRACE_CONFIRMATION_MISSING', sourceId, 'confirmed source attestation is incomplete');
    }

    sources.set(sourceId, {
      attestation,
      confirmed: attestation === 'confirmed'
        && !isEmptyLedgerValue(confirmedBy)
        && ISO_DATE.test(confirmedAt),
    });
  }

  const requirementTable = parseExactTable(spec, REQUIREMENT_HEADERS);
  const requirementRowsByRevision = new Map();
  if (!requirementTable.found || requirementTable.rows.length === 0) {
    add('TRACE_REVISION_INVALID', 'SPEC.md', 'requirement revision ledger is missing');
  }
  for (const row of requirementTable.rows) {
    const revision = row['Revision'];
    const subject = traceSubject(revision, REQUIREMENT_REVISION, 'SPEC.md');
    if (!REQUIREMENT_REVISION.test(revision) || requirementRowsByRevision.has(revision)) {
      add('TRACE_REVISION_INVALID', subject, 'requirement revision identifier is invalid');
      continue;
    }
    requirementRowsByRevision.set(revision, row);

    const sourceId = row['Source'];
    if (!SOURCE_ID.test(sourceId) || !sources.has(sourceId)) {
      add('TRACE_SOURCE_MISSING', revision, 'requirement source attestation is missing');
    } else if (!sources.get(sourceId).confirmed || isEmptyLedgerValue(row['Confirmed by'])) {
      add('TRACE_CONFIRMATION_MISSING', revision, 'requirement confirmation is missing');
    }
  }

  if (hasSupersedesCycle(requirementRowsByRevision)) {
    add('TRACE_REVISION_INVALID', 'SPEC.md', 'requirement supersedes graph contains a cycle');
  }

  const seenRevisions = new Set();
  const seenRequirementIds = new Set();
  const activeByRequirement = new Map();
  const graphValidRevisions = new Set();
  for (const row of requirementTable.rows) {
    const revision = row['Revision'];
    const revisionMatch = revision.match(REQUIREMENT_REVISION);
    if (!revisionMatch || seenRevisions.has(revision)) continue;

    const [, requirementId, revisionNumberText] = revisionMatch;
    const revisionNumber = Number(revisionNumberText);
    const operation = row['Operation'].toLowerCase();
    const requirementClass = row['Class'].toLowerCase();
    const supersedes = row['Supersedes'];
    let graphValid = REQUIREMENT_OPERATIONS.has(operation)
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

  const acceptanceTable = parseExactTable(spec, ACCEPTANCE_HEADERS);
  const acceptances = new Map();
  const acceptanceIdsByRevision = new Map();
  for (const row of acceptanceTable.rows) {
    const acceptanceId = row['AC ID'];
    const revision = row['Requirement revision'];
    const subject = traceSubject(acceptanceId, ACCEPTANCE_ID, 'SPEC.md');
    if (!ACCEPTANCE_ID.test(acceptanceId) || acceptances.has(acceptanceId)) {
      add('TRACE_ACCEPTANCE_MISSING', subject, 'acceptance criterion identifier is invalid');
      continue;
    }
    if (!graphValidRevisions.has(revision) || !activeRevisions.has(revision)) {
      add('TRACE_REVISION_INVALID', subject, 'acceptance criterion references an inactive requirement revision');
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

  const taskTable = parseExactTable(taskContract, TASK_HEADERS);
  const tasks = new Map();
  const coveredRevisions = new Set();
  for (const row of taskTable.rows) {
    const taskId = row['Task ID'];
    const subject = traceSubject(taskId, TASK_ID, 'TASK_CONTRACT.md');
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
      && !isEmptyLedgerValue(row['Verification']);

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

    if (referencesValid) {
      for (const { revision } of pairs) coveredRevisions.add(revision);
    }
    tasks.set(taskId, { status, pairs: referencesValid ? pairs : [] });
  }
  for (const revision of activeRevisions) {
    if (!coveredRevisions.has(revision)) {
      add('TRACE_TASK_COVERAGE_MISSING', revision, 'active requirement has no task coverage');
    }
  }

  const evidenceTable = parseExactTable(taskContract, EVIDENCE_HEADERS);
  const evidenceIds = new Set();
  const passingEvidence = new Set();
  for (const row of evidenceTable.rows) {
    const evidenceId = row['Evidence ID'];
    const subject = traceSubject(evidenceId, EVIDENCE_ID, 'TASK_CONTRACT.md');
    if (!EVIDENCE_ID.test(evidenceId) || evidenceIds.has(evidenceId)) {
      add('TRACE_EVIDENCE_MISSING', subject, 'evidence identifier is invalid');
      continue;
    }
    evidenceIds.add(evidenceId);

    const acceptanceId = row['AC'];
    const revision = row['Requirement'];
    const acceptance = acceptances.get(acceptanceId);
    let evidenceValid = true;
    if (!activeRevisions.has(revision)) {
      add('TRACE_REVISION_INVALID', evidenceId, 'evidence references an inactive requirement revision');
      evidenceValid = false;
    }
    if (!acceptance || acceptance.revision !== revision) {
      add('TRACE_ACCEPTANCE_MISSING', evidenceId, 'evidence acceptance reference is invalid');
      evidenceValid = false;
    }
    if (locatorHasSecret(row['Safe evidence locator'])) {
      add('PRIVACY_PATH_BLOCKED', evidenceId, 'evidence locator violates the safe-path policy');
      evidenceValid = false;
    }
    if (isEmptyLedgerValue(row['Safe evidence locator']) || !ISO_DATE.test(row['Verified at'])) {
      evidenceValid = false;
    }
    if (evidenceValid && row['Result'].toLowerCase() === 'passing') {
      passingEvidence.add(`${acceptanceId}\u0000${revision}`);
    }
  }

  for (const [taskId, task] of tasks) {
    if (task.status !== 'completed') continue;
    if (
      task.pairs.length === 0
      || task.pairs.some(({ acceptanceId, revision }) => !passingEvidence.has(`${acceptanceId}\u0000${revision}`))
    ) {
      add('TRACE_EVIDENCE_MISSING', taskId, 'completed task has no passing acceptance evidence');
    }
  }

  const openLoopTable = parseExactTable(openLoops, OPEN_LOOP_HEADERS);
  const loopIds = new Set();
  for (const row of openLoopTable.rows) {
    const loopId = row['Loop ID'];
    const subject = traceSubject(loopId, LOOP_ID, 'OPEN_LOOPS.md');
    if (!LOOP_ID.test(loopId) || loopIds.has(loopId) || !LOOP_STATUSES.has(row['Status'].toLowerCase())) {
      add('TRACE_CONFIRMATION_MISSING', subject, 'open-loop lineage row is invalid');
      continue;
    }
    loopIds.add(loopId);
    if (row['Basis'].toLowerCase() !== 'not-stated') {
      add('TRACE_CONFIRMATION_MISSING', loopId, 'open-loop basis is not recorded');
    }
    if (row['Status'].toLowerCase() === 'closed') {
      const resolutionSource = row['Resolution source'];
      if (!SOURCE_ID.test(resolutionSource) || !sources.has(resolutionSource)) {
        add('TRACE_SOURCE_MISSING', loopId, 'open-loop resolution source is missing');
      } else if (!sources.get(resolutionSource).confirmed) {
        add('TRACE_CONFIRMATION_MISSING', loopId, 'open-loop resolution source is not confirmed');
      }
    }
  }

  return findings;
}
