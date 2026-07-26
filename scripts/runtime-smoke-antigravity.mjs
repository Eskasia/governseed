#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  buildMinimalEnv,
  resolveRuntimeExecutable,
  runChildSafely,
  runtimeCapabilities,
} from './lib/governance-impact-adapters.mjs';
import { scanPrivacyBuffer } from './governance-impact-eval.mjs';
import {
  normalizeExactText,
  runRuntimeSmoke,
} from './runtime-smoke-codex.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const ANTIGRAVITY_OUTPUT = [
  'SKILL_USED: intake-audit',
  'FILES_READ:',
  '- START_HERE.md',
  '- AGENTS.md',
  '- .agents/AGENTS.md',
  'BLOCKERS:',
  '- Q1-Q9 intake is not complete.',
  'NEXT_INTAKE_QUESTION:',
  'Q1. 這個東西要解決誰的什麼問題？',
  '',
].join('\n');

function installSkillFixture(workDirectory) {
  const source = path.join(ROOT, 'tests/runtime/antigravity/skill-template/SKILL.md');
  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isSymbolicLink() || !sourceStat.isFile() || sourceStat.nlink !== 1) {
    const error = new Error('PATH_POLICY_BLOCKED');
    error.code = 'PATH_POLICY_BLOCKED';
    throw error;
  }
  const target = path.join(workDirectory, '.agents/skills/intake-audit/SKILL.md');
  fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
  fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
}

const ANTIGRAVITY_CONTRACT = Object.freeze({
  runtime: 'antigravity',
  initAgent: 'all',
  artifactName: 'antigravity-first-response.txt',
  mockOutput: ANTIGRAVITY_OUTPUT,
  prepareFixture: installSkillFixture,
  normalize(raw) {
    return normalizeExactText(raw, ANTIGRAVITY_OUTPUT);
  },
  buildInvocation(executable) {
    return {
      executable,
      args: [
        '-p',
        [
          'Use the generated intake-audit skill.',
          'Read START_HERE.md, AGENTS.md, and .agents/AGENTS.md.',
          'Return exactly the approved SKILL_USED, FILES_READ, BLOCKERS, and NEXT_INTAKE_QUESTION contract.',
          'Do not write files.',
        ].join(' '),
      ],
      stdin: '',
    };
  },
});

export async function main(options = {}, deps = {}) {
  return runRuntimeSmoke(ANTIGRAVITY_CONTRACT, options, {
    runChildSafely,
    resolveRuntimeExecutable,
    runtimeCapabilities,
    buildMinimalEnv,
    privacyScanner: scanPrivacyBuffer,
    ...deps,
  });
}

const entrypoint = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (entrypoint === import.meta.url) {
  process.exitCode = await main();
}
