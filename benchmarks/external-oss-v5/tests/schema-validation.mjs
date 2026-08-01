import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const root = path.join(repoRoot, 'benchmarks/external-oss-v5');
const files = [];
const walk = (directory) => {
  for (const entry of readdirSync(directory)) {
    const file = path.join(directory, entry);
    if (statSync(file).isDirectory()) walk(file);
    else if (file.endsWith('.json')) files.push(file);
  }
};
walk(root);
const errors = [];
for (const file of files) {
  try {
    JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    errors.push(path.relative(repoRoot, file) + ': ' + error.message);
  }
}
const result = { status: errors.length === 0 ? 'PASS' : 'FAIL', jsonFilesParsed: files.length, errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
