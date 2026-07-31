import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const FIXTURE = path.join(ROOT, 'examples/template-adoption/antigravity-base');
const SKILLS = path.join(FIXTURE, '.agents/skills');

function skillDirectories() {
  return fs.readdirSync(SKILLS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

/**
 * Antigravity reads a skill by its frontmatter, so a SKILL.md whose block is
 * absent, unterminated, or missing a field is not a skill the runtime can route
 * to. Parsed strictly rather than grepped: a `name:` line inside the body would
 * otherwise pass for a file that has no frontmatter at all.
 */
function frontmatter(file) {
  const lines = fs.readFileSync(file, 'utf8').split('\n');
  if (lines[0] !== '---') return null;
  const end = lines.indexOf('---', 1);
  if (end === -1) return null;
  const fields = new Map();
  for (const line of lines.slice(1, end)) {
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/u);
    if (!match) return null;
    fields.set(match[1], match[2].trim());
  }
  return fields;
}

test('the antigravity fixture ships the runtime files the adapter is read from', () => {
  assert.ok(
    fs.existsSync(path.join(FIXTURE, '.agents/AGENTS.md')),
    'the fixture must carry .agents/AGENTS.md, which is the runtime entry point',
  );
  assert.ok(
    skillDirectories().length >= 2,
    'the adapter generates bootstrap-intake and validation-gate; a fixture with fewer proves less than the generator',
  );
});

test('every shipped SKILL.md carries frontmatter the runtime can route on', () => {
  for (const name of skillDirectories()) {
    const file = path.join(SKILLS, name, 'SKILL.md');
    const fields = frontmatter(file);
    assert.ok(fields, `${name}/SKILL.md must open with a terminated frontmatter block`);
    assert.equal(
      fields.get('name'),
      name,
      `${name}/SKILL.md must declare the name its directory routes as`,
    );
    const description = fields.get('description') ?? '';
    assert.ok(
      description.length > 0,
      `${name}/SKILL.md must describe when the skill applies`,
    );
  }
});

// The adapter must point at the canonical rules rather than restate them, which
// is the same boundary AGENTS.md sets for CLAUDE.md and the Antigravity file.
test('the antigravity adapter defers to the canonical rules', () => {
  const adapter = fs.readFileSync(path.join(FIXTURE, '.agents/AGENTS.md'), 'utf8');
  assert.match(adapter, /\.\.\/AGENTS\.md/u, 'the adapter must name the canonical rule source');
  assert.equal(
    /^\|\s*GATE-[A-Z0-9-]+\s*\|/mu.test(adapter),
    false,
    'the adapter must not restate a gate lifecycle row it does not own',
  );
});
