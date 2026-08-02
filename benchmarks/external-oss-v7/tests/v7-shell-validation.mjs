import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const files = [
  '.github/workflows/external-oss-v7-runtime-image.yml',
  '.github/workflows/external-oss-v7-dependency-cache.yml',
];
const errors = [];
for (const file of files) {
  const source = readFileSync(path.join(repoRoot, file), 'utf8');
  const lines = source.split(/\r?\n/u);
  for (let index = 0; index < lines.length; index += 1) {
    const marker = lines[index].match(/^(\s*)run:\s*\|\s*$/u);
    if (!marker) continue;
    const indent = marker[1].length;
    const body = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const line = lines[cursor];
      const lineIndent = line.match(/^\s*/u)[0].length;
      if (line.trim() !== '' && lineIndent <= indent) break;
      body.push(line.slice(Math.min(line.length, indent + 2)));
      cursor += 1;
    }
    const result = spawnSync('bash', ['-n'], { input: body.join('\n'), encoding: 'utf8' });
    if (result.status !== 0) errors.push(`${file}:${index + 1}: ${result.stderr.trim()}`);
    index = cursor - 1;
  }
}
const result = { schemaVersion: 1, status: errors.length ? 'FAIL' : 'PASS', errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
