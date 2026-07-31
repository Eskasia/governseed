#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STARTER_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const TEMPLATES_DIR = path.join(STARTER_ROOT, 'templates');
const PROFILES_DIR = path.join(STARTER_ROOT, 'profiles');
const PROJECT_CONFIG_FILE = '.agent-governance.json';
const AGENTS = new Set(['codex', 'claude', 'antigravity', 'all']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTemplate(templatePath) {
  const src = path.join(TEMPLATES_DIR, templatePath);
  if (!fs.existsSync(src)) {
    throw new Error(`Missing runtime template: templates/${templatePath}`);
  }
  return fs.readFileSync(src, 'utf8');
}

function renderTemplate(templatePath, replacements) {
  let content = readTemplate(templatePath);
  for (const [key, value] of Object.entries(replacements)) {
    content = content.replaceAll(`{{${key}}}`, value);
  }
  return content;
}

function availableProfiles() {
  if (!fs.existsSync(PROFILES_DIR)) return [];
  return fs.readdirSync(PROFILES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => path.basename(file, '.json'))
    .sort();
}

function uniqueByFile(items) {
  const byFile = new Map();
  for (const item of items) byFile.set(item.file, item);
  return [...byFile.values()];
}

function loadProfile(name, seen = new Set()) {
  const profilePath = path.join(PROFILES_DIR, `${name}.json`);
  if (!fs.existsSync(profilePath)) {
    throw new Error(`Invalid --profile: ${name}. Available: ${availableProfiles().join(', ')}`);
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
  const documents = uniqueByFile([
    ...(parent.documents || []),
    ...(profile.documents || []),
  ]);
  const conditionalHints = uniqueByFile([
    ...(parent.conditionalHints || []),
    ...(profile.conditionalHints || []),
  ]);

  return {
    ...parent,
    ...profile,
    documents,
    conditionalHints,
  };
}

function usage() {
  const profiles = availableProfiles().join('|') || 'base';
  let fixedDocs = [];
  try {
    fixedDocs = loadProfile('base').documents
      .filter((doc) => doc.required)
      .map((doc) => doc.file);
  } catch {
    fixedDocs = [];
  }

  console.log('GovernSeed — Governance foundations for agent-native projects.');
  console.log('Command: agent-governance-init');
  console.log();
  console.log(`Usage: node scripts/init.mjs <target-directory> [--agent codex|claude|antigravity|all] [--profile ${profiles}] [--all]`);
  console.log();
  console.log('Defaults: --agent codex --profile base');
  console.log('--all copies every fixed and conditional markdown template.');
  if (fixedDocs.length > 0) {
    console.log();
    console.log('Base required documents:');
    for (const doc of fixedDocs) console.log(`  - ${doc}`);
  }
  process.exit(0);
}

function parseArgs(argv) {
  const options = {
    targetDir: null,
    agent: 'codex',
    profile: 'base',
    all: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--help' || arg === '-h') usage();

    if (arg === '--all') {
      options.all = true;
      continue;
    }

    if (arg === '--agent') {
      options.agent = argv[i + 1];
      i += 1;
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

    if (options.targetDir) {
      throw new Error(`Unexpected extra argument: ${arg}`);
    }

    options.targetDir = arg;
  }

  if (!options.targetDir) usage();
  if (!AGENTS.has(options.agent)) throw new Error(`Invalid --agent: ${options.agent}`);

  return options;
}

function collectMarkdownFiles(dir) {
  if (!fs.existsSync(dir)) return [];

  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(fullPath);
    }
  }
  return files;
}

function templateIndex() {
  const index = new Map();
  for (const group of ['fixed', 'conditional']) {
    const groupDir = path.join(TEMPLATES_DIR, group);
    for (const filePath of collectMarkdownFiles(groupDir)) {
      index.set(path.basename(filePath), {
        file: path.basename(filePath),
        template: path.relative(TEMPLATES_DIR, filePath),
        category: group,
        required: false,
        trigger: '--all',
      });
    }
  }
  return index;
}

function allTemplateDocs() {
  return [...templateIndex().values()]
    .sort((a, b) => a.file.localeCompare(b.file));
}

function templateSource(doc) {
  if (doc.template) return path.join(TEMPLATES_DIR, doc.template);
  const indexed = templateIndex().get(doc.file);
  return indexed ? path.join(TEMPLATES_DIR, indexed.template) : null;
}

function copyTemplate(doc, targetDir, stats) {
  const src = templateSource(doc);
  const dest = path.join(targetDir, doc.file);

  if (!src || !fs.existsSync(src)) {
    console.warn(`  WARN Template not found: ${doc.file}`);
    return;
  }

  if (fs.existsSync(dest)) {
    console.log(`  SKIP Already exists: ${doc.file}`);
    stats.skipped += 1;
    return;
  }

  fs.copyFileSync(src, dest);
  console.log(`  COPY ${doc.file}`);
  stats.copied += 1;
}

function writeGenerated(file, targetDir, content, stats) {
  const dest = path.join(targetDir, file);

  if (fs.existsSync(dest)) {
    console.log(`  SKIP Already exists: ${file}`);
    stats.skipped += 1;
    return;
  }

  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, `${content.trim()}\n`);
  console.log(`  GEN  ${file}`);
  stats.generated += 1;
}

function listDocs(docs) {
  if (docs.length === 0) return '- None';
  return docs.map((doc) => `- ${doc.file}: ${doc.trigger}`).join('\n');
}

function intakeQuestions() {
  const source = fs.readFileSync(path.join(STARTER_ROOT, 'startup/01-bootstrap-gates.md'), 'utf8');
  const match = source.match(/(?:^|\n)## Q1-Q9\s*\n([\s\S]*?)(?=\n## |\s*$)/);
  if (!match) {
    throw new Error('startup/01-bootstrap-gates.md missing Q1-Q9 section');
  }
  return match[1].trim();
}

function startHereContent(agent, profile) {
  const requiredDocs = profile.documents.filter((doc) => doc.required);
  const includedDocs = profile.documents.filter((doc) => !doc.required);
  const includedFiles = new Set(profile.documents.map((doc) => doc.file));
  const conditionalHints = profile.conditionalHints.filter((doc) => !includedFiles.has(doc.file));

  return renderTemplate('runtime/START_HERE.md', {
    AGENT: agent,
    PROFILE_NAME: profile.name,
    INTAKE_QUESTIONS: intakeQuestions(),
    REQUIRED_DOCUMENTS: listDocs(requiredDocs),
    INCLUDED_PROFILE_DOCUMENTS: listDocs(includedDocs),
    CONDITIONAL_DOCUMENTS: listDocs(conditionalHints),
  });
}

function readmeContent(agent, profile) {
  const requiredDocs = profile.documents.filter((doc) => doc.required);
  const includedDocs = profile.documents.filter((doc) => !doc.required);
  const includedFiles = new Set(profile.documents.map((doc) => doc.file));
  const conditionalHints = profile.conditionalHints.filter((doc) => !includedFiles.has(doc.file));

  return renderTemplate('runtime/README.md', {
    AGENT: agent,
    PROFILE_NAME: profile.name,
    REQUIRED_DOCUMENTS: listDocs(requiredDocs),
    INCLUDED_PROFILE_DOCUMENTS: listDocs(includedDocs),
    CONDITIONAL_DOCUMENTS: listDocs(conditionalHints),
  });
}

function claudeContent() {
  return `# CLAUDE.md

@AGENTS.md

## Claude Code Adapter

AGENTS.md is the canonical project rule source. This file is a thin Claude Code adapter only.
Follow GATE-INTENT-001 and GATE-ROUTE-001 from AGENTS.md; do not copy their lifecycle fields into this adapter.

## First Response

Report:
- files read
- fixed documents present
- conditional documents likely needed
- product shape / technology route mode: user-declared route or ai-recommended route
- open blockers
- why code cannot start yet

Then start Q1-Q9 intake. Ask one question at a time.`;
}

function antigravityAgentsContent() {
  return `# Antigravity Managed Agent

Canonical project rules live in ../AGENTS.md. Read ../START_HERE.md and ../AGENTS.md before using these skills.
Follow GATE-INTENT-001 and GATE-ROUTE-001 from ../AGENTS.md; this adapter does not own their lifecycle fields.

## Skills

- bootstrap-intake: start Q1-Q9 intake and document selection.
- validation-gate: check required docs, open loops, and verification before implementation or handoff.

## Boundary

This adapter must not duplicate the canonical AGENTS.md rules.`;
}

function bootstrapIntakeSkillContent() {
  return `---
name: bootstrap-intake
description: Start a governance bootstrap by reading START_HERE.md, AGENTS.md, and required docs before code changes.
---

# Bootstrap Intake

## Trigger

Use when a project is newly initialized or the user asks to start governed agent work.

## Steps

1. Read ../../../START_HERE.md and ../../../AGENTS.md.
2. Read GATE-INTENT-001 and GATE-ROUTE-001 only from ../../../AGENTS.md; do not restate their lifecycle fields.
3. Report files read, required documents present, likely conditional documents, and blockers.
4. Ask Q1-Q9 one question at a time.
5. Decide product shape / technology route mode: user-declared route or ai-recommended route.
6. Apply both gate IDs from ../../../AGENTS.md before implementation.`;
}

function validationGateSkillContent() {
  return `---
name: validation-gate
description: Check governance documents and verification state before implementation, release, or handoff.
---

# Validation Gate

## Trigger

Use before starting implementation, before reporting completion, or before handing work to another agent.

## Steps

1. Check PROJECT_BRIEF.md, SPEC.md, CONTEXT.md, TASK_CONTRACT.md, OPEN_LOOPS.md, AGENTS.md, and TECH_STACK.md.
2. Evaluate GATE-INTENT-001 and GATE-ROUTE-001 only from AGENTS.md; do not restate their lifecycle fields.
3. Confirm conditional documents exist when the project surface requires them.
4. Run the repo-specific verification command if AGENTS.md defines one.
5. Report passed checks, blocked checks, and open loops without treating warnings as completion.`;
}

function runtimeFiles(agent, profile) {
  const baseRuntimeFiles = [
    ['README.md', readmeContent(agent, profile)],
    ['AGENTS.md', readTemplate('runtime/AGENTS.md')],
  ];

  if (agent === 'all') {
    return [
      ...baseRuntimeFiles,
      ['CLAUDE.md', claudeContent()],
      ['.agents/AGENTS.md', antigravityAgentsContent()],
      ['.agents/skills/bootstrap-intake/SKILL.md', bootstrapIntakeSkillContent()],
      ['.agents/skills/validation-gate/SKILL.md', validationGateSkillContent()],
    ];
  }

  if (agent === 'codex') {
    return baseRuntimeFiles;
  }

  if (agent === 'claude') {
    return [
      ...baseRuntimeFiles,
      ['CLAUDE.md', claudeContent()],
    ];
  }

  return [
    ...baseRuntimeFiles,
    ['.agents/AGENTS.md', antigravityAgentsContent()],
    ['.agents/skills/bootstrap-intake/SKILL.md', bootstrapIntakeSkillContent()],
    ['.agents/skills/validation-gate/SKILL.md', validationGateSkillContent()],
  ];
}

function projectConfigContent(options, profile) {
  return JSON.stringify({
    schemaVersion: 1,
    generator: 'agent-governance-starter',
    profile: profile.name,
    agent: options.agent,
    requiredDocuments: profile.documents.filter((doc) => doc.required).map((doc) => doc.file),
    includedDocuments: profile.documents.map((doc) => doc.file),
  }, null, 2);
}

let options;
let profile;
try {
  options = parseArgs(process.argv.slice(2));
  profile = loadProfile(options.profile);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

const targetDir = path.resolve(options.targetDir);
const stats = { copied: 0, generated: 0, skipped: 0 };

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`Created directory: ${targetDir}`);
}

const templateDocs = options.all
  ? allTemplateDocs()
  : profile.documents.filter((doc) => doc.category !== 'runtime');

for (const doc of templateDocs) {
  copyTemplate(doc, targetDir, stats);
}

writeGenerated('START_HERE.md', targetDir, startHereContent(options.agent, profile), stats);
writeGenerated(PROJECT_CONFIG_FILE, targetDir, projectConfigContent(options, profile), stats);

for (const [file, content] of runtimeFiles(options.agent, profile)) {
  writeGenerated(file, targetDir, content, stats);
}

console.log();
console.log(`Done. Copied ${stats.copied} template file(s), generated ${stats.generated} file(s), skipped ${stats.skipped} existing file(s).`);
console.log();
console.log('Next steps:');
console.log('  1. Fill PROJECT_BRIEF.md with the one-line project direction, target user, and product shape decision.');
console.log('  2. Fill TECH_STACK.md with the user-declared or AI-recommended technology route.');
console.log('  3. Ask the agent to read START_HERE.md and its runtime instruction file.');
console.log('  4. Run: agent-governance-doctor <target-directory> when installed from npm,');
console.log('     or node governseed/scripts/doctor.mjs <target-directory> from a clone.');
