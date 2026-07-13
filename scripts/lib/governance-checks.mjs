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

// Task 2 fills this contract after the embedded lineage tables are available.
export function evaluateTraceability(projectBrief, spec, taskContract, openLoops) {
  void projectBrief;
  void spec;
  void taskContract;
  void openLoops;
  return [];
}
