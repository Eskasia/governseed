#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, '.tmp/base');
const allTarget = path.join(root, '.tmp/base-all');
const researchTrigger = 'Has material evidence conflict / high-impact decision / multiple credible routes, and user confirms synthesis';

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

fs.rmSync(target, { recursive: true, force: true });
fs.rmSync(allTarget, { recursive: true, force: true });
run(process.execPath, ['scripts/init.mjs', target, '--agent', 'codex']);

const startHere = fs.readFileSync(path.join(target, 'START_HERE.md'), 'utf8');
if (!startHere.includes('Q9.')) {
  console.error('smoke:base failed: START_HERE.md does not include Q9.');
  process.exit(1);
}
if (!startHere.includes(`RESEARCH_SYNTHESIS.md: ${researchTrigger}`)) {
  console.error('smoke:base failed: START_HERE.md does not include the research-synthesis conditional hint.');
  process.exit(1);
}
if (!startHere.includes('### 條件研究候選偵測')
  || !startHere.includes('這不是 Q10')
  || !startHere.includes('是否建立 `RESEARCH_SYNTHESIS.md`')) {
  console.error('smoke:base failed: START_HERE.md does not include the user-confirmed research-synthesis intake contract.');
  process.exit(1);
}
if (fs.existsSync(path.join(target, 'RESEARCH_SYNTHESIS.md'))) {
  console.error('smoke:base failed: conditional research synthesis was copied without --all.');
  process.exit(1);
}

run(process.execPath, ['scripts/init.mjs', allTarget, '--agent', 'codex', '--all']);
if (!fs.existsSync(path.join(allTarget, 'RESEARCH_SYNTHESIS.md'))) {
  console.error('smoke:base failed: --all did not copy RESEARCH_SYNTHESIS.md.');
  process.exit(1);
}

run(process.execPath, ['scripts/doctor.mjs', target]);
