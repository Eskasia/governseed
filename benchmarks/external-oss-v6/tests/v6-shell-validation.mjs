import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const source = readFileSync(path.join(repoRoot, '.github/workflows/external-oss-v6-dependency-cache.yml'), 'utf8');
const lines = source.split(/\r?\n/u);
const errors = [];
const blocks = [];
for (let index = 0; index < lines.length; index += 1) {
  const marker = lines[index].match(/^(\s*)run:\s*\|\s*$/u);
  if (!marker) continue;
  const markerIndent = marker[1].length;
  const body = [];
  let cursor = index + 1;
  while (cursor < lines.length) {
    const line = lines[cursor];
    const indent = line.match(/^\s*/u)[0].length;
    if (line.trim() !== '' && indent <= markerIndent) break;
    body.push(line.slice(Math.min(line.length, markerIndent + 2)));
    cursor += 1;
  }
  blocks.push({ line: index + 1, source: body.join('\n') });
  index = cursor - 1;
}
for (const block of blocks) {
  const result = spawnSync('bash', ['-n'], { input: block.source, encoding: 'utf8' });
  if (result.status !== 0) errors.push(`run block at line ${block.line}: ${result.stderr.trim()}`);
}
const result = { schemaVersion: 1, status: errors.length ? 'FAIL' : 'PASS', shellBlocks: blocks.length, errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
