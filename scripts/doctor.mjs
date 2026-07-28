#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  evaluateRouteDecision,
  evaluateTraceability,
  formatGovernanceFinding,
  safeReadGovernanceFile,
} from './lib/governance-checks.mjs';

const STARTER_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PROFILES_DIR = path.join(STARTER_ROOT, 'profiles');
const PROJECT_CONFIG_FILE = '.agent-governance.json';
const FATAL_PRIVACY_STATE = Symbol('fatalPrivacyState');

function usage() {
  console.log('Usage: node scripts/doctor.mjs [--strict] [--json] [--profile base|fullstack-ai|macos] <project-directory>');
  console.log();
  console.log('--strict treats warnings as failures.');
  console.log('--json emits machine-readable doctor output.');
  process.exit(0);
}

function parseArgs(argv) {
  const options = {
    strict: false,
    json: false,
    profile: null,
    projectDir: null,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') usage();
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--profile') {
      options.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }
    if (options.projectDir) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }
    options.projectDir = arg;
  }

  options.projectDir = path.resolve(options.projectDir || process.cwd());
  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function uniqueByFile(items) {
  const byFile = new Map();
  for (const item of items) byFile.set(item.file, item);
  return [...byFile.values()];
}

function loadProfile(name, seen = new Set()) {
  const profilePath = path.join(PROFILES_DIR, `${name}.json`);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Unknown profile: ${name}`);
  }
  if (seen.has(name)) {
    throw new Error(`Profile extends cycle: ${[...seen, name].join(' -> ')}`);
  }

  const profile = readJson(profilePath);
  if (!profile.extends) {
    return {
      ...profile,
      documents: profile.documents || [],
      conditionalHints: profile.conditionalHints || [],
    };
  }

  const parent = loadProfile(profile.extends, new Set([...seen, name]));
  return {
    ...parent,
    ...profile,
    documents: uniqueByFile([...(parent.documents || []), ...(profile.documents || [])]),
    conditionalHints: uniqueByFile([...(parent.conditionalHints || []), ...(profile.conditionalHints || [])]),
  };
}

let options;
try {
  options = parseArgs(process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const projectDir = options.projectDir;
const displayProjectDir = path.relative(process.cwd(), projectDir) || '.';
const projectReadCache = new Map();

function safeProjectRead(relativePath) {
  if (!projectReadCache.has(relativePath)) {
    projectReadCache.set(relativePath, safeReadGovernanceFile(projectDir, relativePath));
  }
  return projectReadCache.get(relativePath);
}

function projectFileState(relativePath) {
  const result = safeProjectRead(relativePath);
  if (result.ok) return 'present';
  if (result.missing) return 'missing';
  return 'blocked';
}

function exists(relativePath) {
  return projectFileState(relativePath) === 'present';
}

function readFile(relativePath) {
  const result = safeProjectRead(relativePath);
  if (result.ok) return result.content;
  if (result.finding) throw new Error(formatGovernanceFinding(result.finding));
  throw new Error(`Missing governance file: ${relativePath}`);
}

function projectProfileName() {
  if (options.profile) return options.profile;
  const configRead = safeProjectRead(PROJECT_CONFIG_FILE);
  if (configRead.missing) return 'base';
  if (!configRead.ok) throw new Error(formatGovernanceFinding(configRead.finding));
  try {
    const config = JSON.parse(configRead.content);
    return config.profile || 'base';
  } catch {
    throw new Error('[PROJECT_CONFIG_INVALID] .agent-governance.json: project config is not valid JSON');
  }
}

function hasContent(relativePath) {
  if (!exists(relativePath)) return false;
  const content = readFile(relativePath).trim();
  const lines = content.split('\n').filter((l) => l.trim() && !l.startsWith('#') && !l.startsWith('|---'));
  const filledLines = lines.filter((l) => {
    const t = l.trim();
    if (/^-\s+\S+[：:]\s*$/.test(t)) return false;
    if (t.startsWith('|') && t.endsWith('|')) {
      const cells = t.split('|').slice(1, -1);
      const emptyCells = cells.filter((c) => c.trim() === '');
      if (emptyCells.length >= cells.length - 1 && cells.length > 1) return false;
    }
    if (/^\|.*\|$/.test(t) && /^\|\s*(檔案|#|Token|File|Method|Entity|Role|Table|Component|State|場景|規則|Screen|原則|Purpose)\s*\|/.test(t)) return false;
    if (t.startsWith('```')) return false;
    if (t === '- ' || t === '-' || t.endsWith('：') || /^-\s+[^:：]+[：:]\s*$/.test(t)) return false;
    return true;
  });
  if (relativePath === 'TASK_CONTRACT.md') {
    return /任務[:：]\s*(?!<任務名稱>)[^\n]+/.test(content);
  }

  if (relativePath === 'OPEN_LOOPS.md') {
    return /^\|\s*(open|closed|blocked)\s*\|\s*[^|\s][^|]*\|/im.test(content);
  }

  return filledLines.length > 5;
}

function hasRouteMode(content) {
  return /^-\s*決策模式[：:]\s*(user-declared route|ai-recommended route)\s*$/im.test(content);
}

function hasFilledLine(content, label) {
  return new RegExp(`^-\\s*${label}[：:]\\s*\\S.+$`, 'im').test(content);
}

function hasProductShapeDecision() {
  if (!exists('PROJECT_BRIEF.md')) return false;
  const content = readFile('PROJECT_BRIEF.md');
  return content.includes('## 產品形態決策')
    && hasRouteMode(content)
    && hasFilledLine(content, '第一版產品形態')
    && hasFilledLine(content, 'Q1-Q9 依據');
}

function hasTechnologyRouteDecision() {
  if (!exists('TECH_STACK.md')) return false;
  const content = readFile('TECH_STACK.md');
  return content.includes('## 技術路線決策')
    && hasRouteMode(content)
    && hasFilledLine(content, '唯一主路線')
    && hasFilledLine(content, '選擇理由')
    && content.includes('| Frontend |')
    && content.includes('| Backend |')
    && content.includes('| Database |')
    && content.includes('| Main framework / SDK |')
    && content.includes('| Deployment |');
}

function hasResolvedResearchSynthesisDecision() {
  if (!exists('RESEARCH_SYNTHESIS.md')) return false;
  const decisions = [...readFile('RESEARCH_SYNTHESIS.md').matchAll(
    /^-\s*User decision:\s*(.+)$/gim,
  )].map((match) => match[1].trim().toLowerCase());
  return decisions.length === 1 && ['confirmed', 'declined'].includes(decisions[0]);
}

function statusForRequired(doc) {
  const state = projectFileState(doc.file);
  if (state === 'missing') return 'missing';
  if (state === 'blocked') return 'blocked';
  if (!hasContent(doc.file)) return 'unfilled';
  return 'ok';
}

function buildResult(profile) {
  const warnings = [];
  let fatalPrivacy = false;
  const addFinding = (item) => {
    if (item.code.startsWith('PRIVACY_')) fatalPrivacy = true;
    warnings.push(formatGovernanceFinding(item));
  };
  const requiredDocs = profile.documents.filter((doc) => doc.required);
  const recommendedDocs = profile.documents.filter((doc) => !doc.required);
  const profileFiles = new Set(profile.documents.map((doc) => doc.file));
  const projectFiles = new Set([
    ...profile.documents.map((doc) => doc.file),
    ...profile.conditionalHints.map((doc) => doc.file),
  ]);

  for (const file of projectFiles) {
    const result = safeProjectRead(file);
    if (result.finding) addFinding(result.finding);
  }

  const required = requiredDocs.map((doc) => ({
    file: doc.file,
    status: statusForRequired(doc),
    trigger: doc.trigger,
  }));

  const recommended = recommendedDocs.map((doc) => {
    const state = projectFileState(doc.file);
    if (state === 'missing') {
      warnings.push(formatGovernanceFinding({
        code: 'PROFILE_DOCUMENT_MISSING',
        subject: doc.file,
        message: `profile ${profile.name} document is missing`,
      }));
    }
    return {
      file: doc.file,
      status: state === 'present' ? 'present' : state === 'blocked' ? 'blocked' : 'absent',
      trigger: doc.trigger,
    };
  });

  const conditional = profile.conditionalHints
    .filter((doc) => !profileFiles.has(doc.file))
    .map((doc) => {
      const state = projectFileState(doc.file);
      return {
        file: doc.file,
        present: state === 'present',
        ...(state === 'blocked' ? { blocked: true } : {}),
        trigger: doc.trigger,
      };
    });

  for (const check of required) {
    if (check.status === 'unfilled') {
      warnings.push(formatGovernanceFinding({
        code: 'UNFILLED_TEMPLATE',
        subject: check.file,
        message: 'document appears to be an unfilled template',
      }));
    }
  }

  if (exists('SPEC.md')) {
    const spec = readFile('SPEC.md');
    if (!spec.includes('yes') && !spec.includes('no') && !spec.includes('是') && !spec.includes('否') && !spec.includes('[ ]') && !spec.includes('[x]')) {
      warnings.push(formatGovernanceFinding({
        code: 'ACCEPTANCE_NOT_TESTABLE',
        subject: 'SPEC.md',
        message: 'acceptance criteria should be yes/no testable',
      }));
    }
  }

  if (exists('TASK_CONTRACT.md')) {
    const tc = readFile('TASK_CONTRACT.md');
    if (!tc.includes('驗證') && !tc.includes('verif') && !tc.includes('test')) {
      warnings.push(formatGovernanceFinding({
        code: 'TASK_VERIFICATION_MISSING',
        subject: 'TASK_CONTRACT.md',
        message: 'tasks should each have a verification method',
      }));
    }
  }

  if (exists('RESEARCH_SYNTHESIS.md') && !hasResolvedResearchSynthesisDecision()) {
    warnings.push(formatGovernanceFinding({
      code: 'RESEARCH_CONFIRMATION_MISSING',
      subject: 'RESEARCH_SYNTHESIS.md',
      message: 'document is present but its activation record does not contain one explicit confirmed or declined user decision',
    }));
  }

  if (exists('PROJECT_BRIEF.md') && !hasProductShapeDecision()) {
    warnings.push(formatGovernanceFinding({
      code: 'ROUTE_DECISION_INCOMPLETE',
      subject: 'PROJECT_BRIEF.md',
      message: 'product shape decision should be documented',
    }));
  }

  if (exists('TECH_STACK.md') && !hasTechnologyRouteDecision()) {
    warnings.push(formatGovernanceFinding({
      code: 'ROUTE_DECISION_INCOMPLETE',
      subject: 'TECH_STACK.md',
      message: 'technology route decision should be documented',
    }));
  }

  const projectBriefRead = safeProjectRead('PROJECT_BRIEF.md');
  const techStackRead = safeProjectRead('TECH_STACK.md');
  if (projectBriefRead.ok && techStackRead.ok) {
    for (const item of evaluateRouteDecision(
      projectBriefRead.content,
      techStackRead.content,
    )) addFinding(item);
  }

  const specRead = safeProjectRead('SPEC.md');
  const taskContractRead = safeProjectRead('TASK_CONTRACT.md');
  const openLoopsRead = safeProjectRead('OPEN_LOOPS.md');
  if (projectBriefRead.ok && specRead.ok && taskContractRead.ok && openLoopsRead.ok) {
    for (const item of evaluateTraceability(
      projectBriefRead.content,
      specRead.content,
      taskContractRead.content,
      openLoopsRead.content,
      techStackRead.ok ? techStackRead.content : '',
    )) addFinding(item);
  }

  const missing = required.filter((check) => check.status === 'missing').map((check) => check.file);
  const unfilled = required.filter((check) => check.status === 'unfilled').map((check) => check.file);
  const status = missing.length > 0 ? 'missing' : warnings.length > 0 ? 'warning' : 'ready';

  return {
    [FATAL_PRIVACY_STATE]: fatalPrivacy,
    schemaVersion: 1,
    projectDir: displayProjectDir,
    profile: profile.name,
    status,
    strict: options.strict,
    required,
    recommended,
    conditional,
    warnings,
    missing,
    unfilled,
  };
}

function hasFatalPrivacyFinding(result) {
  return result[FATAL_PRIVACY_STATE] === true;
}

function printHuman(result) {
  console.log(`\nProject doctor: ${displayProjectDir}`);
  if (options.strict) console.log('Mode: strict');
  console.log(`Profile: ${result.profile}`);
  console.log();

  console.log('Required documents:');
  for (const check of result.required) {
    if (check.status === 'missing') console.log(`  MISSING ${check.file}`);
    else if (check.status === 'blocked') console.log(`  BLOCKED ${check.file}`);
    else if (check.status === 'unfilled') console.log(`  WARN Unfilled template: ${check.file}`);
    else console.log(`  OK ${check.file}`);
  }
  console.log();

  const presentRecommended = result.recommended.filter((check) => check.status === 'present');
  if (presentRecommended.length > 0) {
    console.log('Profile documents (present):');
    for (const check of presentRecommended) console.log(`  OK ${check.file}`);
    console.log();
  }

  const blockedRecommended = result.recommended.filter((check) => check.status === 'blocked');
  if (blockedRecommended.length > 0) {
    console.log('Profile documents (blocked):');
    for (const check of blockedRecommended) console.log(`  BLOCKED ${check.file}`);
    console.log();
  }

  const presentConditional = result.conditional.filter((check) => check.present);
  const blockedConditional = result.conditional.filter((check) => check.blocked);
  const absentConditional = result.conditional.filter((check) => !check.present && !check.blocked);

  if (presentConditional.length > 0) {
    console.log('Conditional documents (present):');
    for (const check of presentConditional) console.log(`  OK ${check.file}`);
    console.log();
  }

  if (blockedConditional.length > 0) {
    console.log('Conditional documents (blocked):');
    for (const check of blockedConditional) console.log(`  BLOCKED ${check.file}`);
    console.log();
  }

  if (absentConditional.length > 0) {
    console.log('Conditional documents (not present - check if needed):');
    for (const check of absentConditional) console.log(`  - ${check.file} - needed if: ${check.trigger}`);
    console.log();
  }

  if (result.warnings.length > 0) {
    console.log('Warnings:');
    for (const warning of result.warnings) console.log(`  WARN ${warning}`);
    console.log();
  }

  if (result.missing.length > 0) {
    console.log(`Result: ${result.missing.length} required document(s) missing. Not ready to proceed.`);
    return;
  }

  if (hasFatalPrivacyFinding(result)) {
    console.log('Result: Privacy-safe governance input check failed.');
    return;
  }

  if (options.strict && result.warnings.length > 0) {
    console.log(`Result: Strict mode failed with ${result.warnings.length} warning(s).`);
    return;
  }

  if (result.warnings.length > 0) {
    console.log(`Result: All required documents present. ${result.warnings.length} warning(s) to review.`);
  } else {
    console.log('Result: All required documents present and filled. Ready to proceed.');
  }
}

let profile;
let result;
try {
  profile = loadProfile(projectProfileName());
  result = buildResult(profile);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (options.json) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman(result);
}

if (result.missing.length > 0) {
  process.exit(1);
}

if (hasFatalPrivacyFinding(result)) {
  process.exit(1);
}

if (options.strict && result.warnings.length > 0) {
  process.exit(1);
}
