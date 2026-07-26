#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  buildMinimalEnv,
  resolveRuntimeExecutable,
  runChildSafely,
  runtimeCapabilities,
} from './lib/governance-impact-adapters.mjs';
import { scanPrivacyBuffer } from './governance-impact-eval.mjs';
import {
  normalizeExactObject,
  runRuntimeSmoke,
} from './runtime-smoke-codex.mjs';

const REQUIRED_KEYS = Object.freeze([
  'files_read',
  'fixed_docs_present',
  'conditional_docs_likely_needed',
  'blockers',
]);

const CLAUDE_RESPONSE = Object.freeze({
  files_read: ['START_HERE.md', 'AGENTS.md', 'CLAUDE.md'],
  fixed_docs_present: [
    'README.md',
    'PROJECT_BRIEF.md',
    'SPEC.md',
    'CONTEXT.md',
    'TASK_CONTRACT.md',
    'OPEN_LOOPS.md',
    'AGENTS.md',
    'TECH_STACK.md',
  ],
  conditional_docs_likely_needed: ['UI_SPEC.md', 'DATA_MODEL.md'],
  blockers: ['Q1-Q9 intake is not complete.'],
});

const CLAUDE_OUTPUT = `${JSON.stringify(CLAUDE_RESPONSE, null, 2)}\n`;

const CLAUDE_CONTRACT = Object.freeze({
  runtime: 'claude',
  initAgent: 'claude',
  artifactName: 'claude-first-response.json',
  mockOutput: CLAUDE_OUTPUT,
  normalize(raw) {
    return normalizeExactObject(raw, CLAUDE_RESPONSE, REQUIRED_KEYS);
  },
  buildInvocation(executable) {
    return {
      executable,
      args: [
        '-p',
        [
          'Read START_HERE.md, CLAUDE.md, and AGENTS.md.',
          'Return only the approved first-response JSON contract.',
          'Do not write files.',
        ].join(' '),
        '--output-format',
        'json',
        '--max-turns',
        '1',
        '--no-session-persistence',
      ],
      stdin: '',
    };
  },
});

export async function main(options = {}, deps = {}) {
  return runRuntimeSmoke(CLAUDE_CONTRACT, options, {
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
