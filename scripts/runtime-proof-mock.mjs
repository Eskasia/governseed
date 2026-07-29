#!/usr/bin/env node

import { main as runCodexProof } from './runtime-smoke-codex.mjs';
import { main as runClaudeProof } from './runtime-smoke-claude.mjs';
import { main as runAntigravityProof } from './runtime-smoke-antigravity.mjs';

for (const run of [runCodexProof, runClaudeProof, runAntigravityProof]) {
  const exitCode = await run({ real: false });
  if (exitCode !== 0) {
    process.exitCode = exitCode;
    break;
  }
}
