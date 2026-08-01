import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const workflowPath = path.join(repoRoot, '.github/workflows/external-oss-v5-dependency-cache.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const errors = [];
const checks = [];
const assert = (condition, message) => {
  checks.push(message);
  if (!condition) errors.push(message);
};

assert(workflow.includes('name: External OSS V5 dependency cache'), 'V5 workflow name');
assert(workflow.includes('workflow_dispatch:'), 'manual dispatch only');
assert(workflow.includes('GS-OSS-2026-08-01-V5'), 'V5 benchmark id');
for (const taskId of ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09']) {
  assert(workflow.includes(taskId), taskId + ' is in matrix');
}
assert(workflow.includes('task-seed-identity.json'), 'workflow reads task seed contract');
assert(workflow.includes('upstreamBaseCommit'), 'workflow reads upstream base commit');
assert(workflow.includes('git -C "$source_root" fetch --depth=1 --filter=blob:none --no-tags origin "$upstream_base"'), 'workflow fetches exact upstream base only');
assert(workflow.includes('git -C "$source_root" remote set-url --push origin no_push://disabled'), 'workflow disables push remote');
assert(workflow.includes('git -C "$source_root" cat-file -e "$upstream_base^{commit}"'), 'workflow verifies fetched base object');
assert(workflow.includes('git -C "$source_root" archive "$upstream_base"'), 'workflow reconstructs from base tree');
assert(workflow.includes('seed-tree-hash.mjs'), 'workflow checks canonical tree hash');
assert(workflow.includes('git -C "$sealed_root" add --all --force'), 'workflow retains ignored upstream seed files');
assert(workflow.includes('if test "$overlay_path" != "-"; then'), 'workflow preserves empty overlay field identity');
assert(!workflow.includes('sealedSeedCommit'), 'workflow does not fetch sealed commit');
assert(!/fetch[^\n]*seed_commit/iu.test(workflow), 'workflow has no seed commit fetch');
assert(!workflow.includes('origin/main'), 'workflow has no default-branch fallback');
assert(!workflow.match(/git\s+pull\b/iu), 'workflow has no git pull fallback');
assert(!workflow.match(/git\s+push\b/iu), 'workflow has no upstream push');
assert(!workflow.includes('secrets.'), 'workflow has no credential reference');
assert(!workflow.match(/codex|hidden-oracle|oracle/iu), 'workflow has no agent or oracle execution');
assert(!workflow.includes('external-oss-v4'), 'workflow is not a V4 workflow');

const result = { status: errors.length === 0 ? 'PASS' : 'FAIL', checks: checks.length, errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
