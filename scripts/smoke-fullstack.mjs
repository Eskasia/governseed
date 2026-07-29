#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const target = path.join(root, '.tmp/fullstack');

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });
  if (result.status !== 0) process.exit(result.status || 1);
}

fs.rmSync(target, { recursive: true, force: true });
run(process.execPath, ['scripts/init.mjs', target, '--agent', 'all', '--profile', 'fullstack-ai']);
run(process.execPath, ['scripts/doctor.mjs', target]);
