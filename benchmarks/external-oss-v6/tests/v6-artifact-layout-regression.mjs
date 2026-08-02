import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/external-oss-v6-dependency-cache.yml'), 'utf8');
const tasks = ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09'];
const work = path.join(os.tmpdir(), `governseed-v6-artifact-layout-${process.pid}`);
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };
function collectReceipts(root) {
  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const current = path.join(root, entry.name);
    if (entry.isDirectory()) found.push(...collectReceipts(current));
    else if (entry.name === 'cache-receipt.json') found.push(current);
  }
  return found;
}

mkdirSync(work, { recursive: true, mode: 0o700 });
try {
  for (const taskId of tasks) {
    const artifactRoot = path.join(work, `external-oss-v6-receipt-${taskId}`);
    mkdirSync(artifactRoot, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(artifactRoot, 'cache-receipt.json'), JSON.stringify({ taskId, status: 'READY' }) + '\n');
  }
  const receipts = collectReceipts(work);
  const taskIds = receipts.map((file) => JSON.parse(readFileSync(file, 'utf8')).taskId).sort();
  check(receipts.length === 3, `expected three distinct receipt paths, found ${receipts.length}`);
  check(new Set(receipts).size === 3, 'receipt paths are not distinct');
  check(JSON.stringify(taskIds) === JSON.stringify([...tasks].sort()), `receipt task set mismatch: ${taskIds.join(',')}`);
  check(workflow.includes('pattern: external-oss-v6-receipt-TASK-OSS-*'), 'workflow receipt pattern missing');
  check(workflow.includes('path: ${{ runner.temp }}/v6-receipts'), 'workflow receipt path missing');
  check(!workflow.includes('merge-multiple: true'), 'workflow merges artifact roots and can collide receipt paths');
  const result = { schemaVersion: 1, status: errors.length ? 'FAIL' : 'PASS', taskIds, distinctReceiptPaths: receipts.length, errors };
  console.log(JSON.stringify(result));
  if (errors.length) process.exitCode = 1;
} finally {
  rmSync(work, { recursive: true, force: true });
}
