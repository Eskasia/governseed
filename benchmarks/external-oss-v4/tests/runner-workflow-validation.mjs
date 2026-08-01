import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/external-oss-v4-runner-preflight.yml', 'utf8');
const requirements = [
  ['workflow_dispatch', /workflow_dispatch:/u],
  ['contents read permission', /permissions:\s*\n\s+contents:\s+read/u],
  ['Ubuntu 24.04 runner', /runs-on:\s+ubuntu-24\.04/u],
  ['digest-only input validation', /\^sha256:\[0-9a-f\]\{64\}\$/u],
  ['network none', /--network none/u],
  ['read-only root filesystem', /--read-only/u],
  ['drop all capabilities', /--cap-drop=ALL/u],
  ['no new privileges', /--security-opt no-new-privileges:true/u],
  ['non-root user', /--user 65532:65532/u],
  ['finite pids limit', /--pids-limit/u],
  ['no Docker socket mount', /dockerSocketMounted|docker\.sock/u],
  ['credential denylist', /OPENAI(?:_API_KEY|""_API_KEY)[\s\S]*ANTHROPIC_API_KEY[\s\S]*GITHUB_TOKEN/u],
  ['workspace read-write mount', /dst=\/workspace,rw/u],
  ['cache read-only mount', /dst=\/cache,ro/u],
  ['container state proof', /\.State\.Status.*\.State\.Running.*\.State\.Pid/u],
  ['cgroup populated proof', /cgroup\.events|populated 0/u],
  ['container removal proof', /docker rm.*container_id/u],
  ['no Codex execution', /does not execute Codex|preflight/u],
];
const failures = requirements.filter(([, pattern]) => !pattern.test(workflow)).map(([name]) => name);
assert.deepEqual(failures, [], `runner workflow requirements failed: ${failures.join(', ')}`);
assert.doesNotMatch(workflow, /secrets\./u, 'V4 preflight must not reference GitHub secrets');
assert.doesNotMatch(workflow, /environment:/u, 'V4 preflight must not use a GitHub Environment');
console.log(JSON.stringify({ status: 'PASS', checks: requirements.length, failures: [] }, null, 2));
