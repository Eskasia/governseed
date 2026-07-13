#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const tmpDir = path.join(root, '.tmp');

const fixtures = [
  'base-minimal',
  'fullstack-ai-saas',
  'macos-beta-handoff',
];

function doctorResult(projectDir, strict = false) {
  return spawnSync(process.execPath, [
    'scripts/doctor.mjs',
    ...(strict ? ['--strict'] : []),
    '--json',
    projectDir,
  ], {
    cwd: root,
    encoding: 'utf8',
    shell: false,
  });
}

function runDoctor(fixture) {
  const result = doctorResult(`examples/template-adoption/${fixture}`);
  if (result.status !== 0) {
    throw new Error(`doctor failed for ${fixture} with exit ${result.status}`);
  }
  try {
    return JSON.stringify(JSON.parse(result.stdout), null, 2) + '\n';
  } catch {
    throw new Error(`doctor returned invalid JSON for ${fixture}`);
  }
}

function firstMismatch(expected, actual) {
  const expectedLines = expected.split(/\r?\n/);
  const actualLines = actual.split(/\r?\n/);
  const max = Math.max(expectedLines.length, actualLines.length);
  for (let i = 0; i < max; i += 1) {
    if (expectedLines[i] !== actualLines[i]) {
      return {
        line: i + 1,
        expected: expectedLines[i] ?? '<missing>',
        actual: actualLines[i] ?? '<missing>',
      };
    }
  }
  return null;
}

function mutateFile(projectDir, relativePath, mutate) {
  const filePath = path.join(projectDir, relativePath);
  const before = fs.readFileSync(filePath, 'utf8');
  const after = mutate(before);
  if (after === before) throw new Error(`mutation setup failed for ${relativePath}`);
  fs.writeFileSync(filePath, after);
}

function runMutationChecks() {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'governance-fixtures-'));
  const source = path.join(root, 'examples/template-adoption/base-minimal');
  const cases = [
    {
      name: 'route-mode-conflict',
      code: 'ROUTE_MODE_CONFLICT',
      mutate(projectDir) {
        mutateFile(projectDir, 'TECH_STACK.md', (content) => content.replace(
          '決策模式：user-declared route',
          '決策模式：ai-recommended route',
        ));
      },
    },
    {
      name: 'route-placeholder',
      code: 'ROUTE_PLACEHOLDER',
      mutate(projectDir) {
        mutateFile(projectDir, 'PROJECT_BRIEF.md', (content) => content.replace(
          /(^-\s*第一版產品形態[：:].*$)/m,
          '- 第一版產品形態：TODO',
        ));
      },
    },
    {
      name: 'stale-decision',
      code: 'STALE_DECISION',
      mutate(projectDir) {
        mutateFile(projectDir, 'TECH_STACK.md', (content) => {
          if (/^-\s*(?:Decision status|決策狀態)[：:].*$/m.test(content)) {
            return content.replace(
              /^-\s*(?:Decision status|決策狀態)[：:].*$/m,
              '- Decision status: recheck-required',
            );
          }
          return content.replace(
            '## 技術路線決策',
            '## 技術路線決策\n\n- Decision status: recheck-required',
          );
        });
      },
    },
  ];

  try {
    for (const mutation of cases) {
      const projectDir = path.join(temporaryRoot, mutation.name);
      fs.cpSync(source, projectDir, { recursive: true });
      mutation.mutate(projectDir);
      const result = doctorResult(projectDir, true);
      if (!Number.isInteger(result.status) || result.status === 0) {
        throw new Error(`strict doctor did not fail for mutation ${mutation.name}`);
      }

      let output;
      try {
        output = JSON.parse(result.stdout);
      } catch {
        throw new Error(`strict doctor returned invalid JSON for mutation ${mutation.name}`);
      }
      if (!output.warnings?.some((warning) => warning.startsWith(`[${mutation.code}] `))) {
        throw new Error(`strict doctor omitted ${mutation.code} for mutation ${mutation.name}`);
      }
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
}

try {
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const fixture of fixtures) {
    const actual = runDoctor(fixture);
    const actualPath = path.join(tmpDir, `${fixture}-doctor.json`);
    const expectedPath = path.join(root, `examples/template-adoption/${fixture}/expected/doctor.json`);
    fs.writeFileSync(actualPath, actual);

    const expected = fs.readFileSync(expectedPath, 'utf8');
    if (actual !== expected) {
      const mismatch = firstMismatch(expected, actual);
      console.error(`Fixture doctor JSON mismatch: ${fixture}`);
      console.error(`Expected: ${expectedPath}`);
      console.error(`Actual: ${actualPath}`);
      if (mismatch) {
        console.error(`First mismatch at line ${mismatch.line}`);
        console.error(`- expected: ${mismatch.expected}`);
        console.error(`+ actual:   ${mismatch.actual}`);
      }
      process.exit(1);
    }
  }
  runMutationChecks();
  console.log('Fixture doctor JSON and governance mutation checks passed.');
} catch (error) {
  console.error(`Fixture checks failed:\n${error.message}`);
  process.exit(1);
}
