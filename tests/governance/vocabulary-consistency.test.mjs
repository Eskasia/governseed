import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  MATERIALIZABLE_TARGETS,
  targetDefinition,
} from '../../scripts/lib/target-registry.mjs';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  'node_modules',
  '.bat-worktrees',
]);

const SCANNED_EXTENSIONS = new Set(['.md', '.mjs', '.json']);

// Frozen sources, historical records, and one unrelated fourth meaning. Each
// entry is justified in the phase-one design, section 9.2.
const ALLOWLISTED_FILES = new Set([
  'docs/adr/003-deliberation-and-role-assignment-model.md',
  'docs/adr/004-risk-to-policy-compiler.md',
  'docs/adr/005-target-materialization-and-attestation-boundary.md',
  'docs/research/2026-07-29-codex-policy-capability-matrix.md',
  'docs/superpowers/plans/2026-07-29-decision-role-foundation-plan.md',
  'docs/superpowers/plans/2026-07-29-risk-to-policy-compiler-plan.md',
  'docs/superpowers/plans/2026-07-30-milestone-3-materialization-attestation-plan.md',
  'docs/superpowers/specs/2026-07-29-decision-role-foundation-design.md',
  'docs/superpowers/specs/2026-07-29-risk-to-policy-compiler-design.md',
  'docs/superpowers/specs/2026-07-30-materialization-attestation-design.md',
  'scripts/governance-impact-eval.mjs',
  'tests/governance-impact/runner.test.mjs',
  'tests/governance/vocabulary-consistency.test.mjs',
]);

// The two explicit terms and the one machine level built from them. Masked
// first so a line that already uses the qualified form is not reported.
const ALLOWLISTED_IDENTIFIERS = [
  'adapter-materialized',
  'target-materialized',
  'materialized-unverified',
];

// The rule governs the published governance term, not machine names: a field
// called materialized makes no claim, a sentence containing the bare word does.
// Markdown is scanned whole; source and schema files are scanned only inside
// quoted strings that read as prose, which is where user-visible text lives.
const PROSE_STRING = /(["'`])((?:(?!\1)[^\\]|\\.)*\s(?:(?!\1)[^\\]|\\.)*)\1/gu;

function collectFiles(directory, collected = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.github') {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    }
    if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      collectFiles(absolute, collected);
      continue;
    }
    if (!entry.isFile()) continue;
    if (!SCANNED_EXTENSIONS.has(path.extname(entry.name))) continue;
    collected.push(absolute);
  }
  return collected;
}

function maskAllowedIdentifiers(line) {
  let masked = line;
  for (const identifier of ALLOWLISTED_IDENTIFIERS) {
    masked = masked.replaceAll(identifier, '_'.repeat(identifier.length));
  }
  return masked;
}

function scannedText(file, line) {
  if (path.extname(file) === '.md') return line;
  return [...line.matchAll(PROSE_STRING)].map((match) => match[2]).join(' ');
}

function ambiguousOccurrences(file) {
  const relative = path.relative(ROOT, file).replaceAll('\\', '/');
  if (ALLOWLISTED_FILES.has(relative)) return [];
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  const findings = [];
  for (const [index, line] of lines.entries()) {
    const masked = maskAllowedIdentifiers(scannedText(file, line));
    if (/materialized/iu.test(masked)) {
      findings.push(`${relative}:${index + 1}: ${line.trim()}`);
    }
  }
  return findings;
}

test('the ambiguous governance term materialized is always qualified', () => {
  const findings = collectFiles(ROOT).flatMap(ambiguousOccurrences);
  assert.deepEqual(
    findings,
    [],
    `unqualified "materialized" must be adapter-materialized or target-materialized:\n${findings.join('\n')}`,
  );
});

test('both explicit terms are defined by their canonical owner', () => {
  const adr = fs.readFileSync(
    path.join(ROOT, 'docs/adr/005-target-materialization-and-attestation-boundary.md'),
    'utf8',
  );
  assert.match(adr, /`adapter-materialized`\s+—/u);
  assert.match(adr, /`target-materialized`\s+—/u);
});

test('the superseded four-level naming no longer stands unqualified', () => {
  const compiler = fs.readFileSync(
    path.join(ROOT, 'docs/policy-compiler.md'),
    'utf8',
  );
  assert.equal(
    /`materialized`/u.test(compiler),
    false,
    'docs/policy-compiler.md must use the explicit terms',
  );
  assert.match(compiler, /adapter-materialized/u);
  assert.match(compiler, /target-materialized/u);
});

test('the published enforcement boundary names the schema-reserved level', () => {
  const boundary = fs.readFileSync(
    path.join(ROOT, 'docs/enforcement-boundary.md'),
    'utf8',
  );
  assert.match(boundary, /project-layer-observed/u);
  assert.match(boundary, /schema-reserved/u);
  assert.match(boundary, /materialized-unverified/u);
  assert.match(
    boundary,
    /restriction-only/u,
    'the invariant scope belongs in the published narrative',
  );
  assert.match(boundary, /read-only/u);
});

// These two are the published claim surface, so a target that ships without
// appearing in them publishes a narrower claim than the tool actually makes.
test('the published claim surface covers every materializable target', () => {
  for (const relative of ['docs/enforcement-boundary.md', 'README.md']) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    for (const target of MATERIALIZABLE_TARGETS) {
      const { targetPath } = targetDefinition(target);
      assert.ok(
        text.includes(targetPath),
        `${relative} must state what materialize writes into ${targetPath}`,
      );
    }
  }
});

test('no public document describes materialize as agent-self-bootstrappable', () => {
  for (const relative of [
    'README.md',
    'docs/policy-compiler.md',
    'docs/enforcement-boundary.md',
  ]) {
    const text = fs.readFileSync(path.join(ROOT, relative), 'utf8');
    assert.equal(
      /agent (?:can |will )?(?:self-|auto)?bootstraps? (?:its own )?\.codex/iu.test(text),
      false,
      `${relative} must not imply self-bootstrapping`,
    );
  }
});
