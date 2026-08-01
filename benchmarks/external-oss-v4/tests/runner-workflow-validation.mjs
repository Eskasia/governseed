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
  ['workspace default writable mount', /dst=\/workspace"/u],
  ['cache explicit readonly mount', /dst=\/cache,readonly"/u],
  ['harness explicit readonly mount', /dst=\/harness,readonly"/u],
  ['mount mode inspection artifact', /container-mounts\.json/u],
  ['effective workspace mount mode proof', /test "\$workspace_rw" = true/u],
  ['effective cache mount mode proof', /test "\$cache_rw" = false/u],
  ['effective harness mount mode proof', /test "\$harness_rw" = false/u],
  ['unique destination proof', /grep -Fxc "\$destination"/u],
  ['container state proof', /\.State\.Status.*\.State\.Running.*\.State\.Pid/u],
  ['bounded container readiness marker', /touch \/workspace\/container-ready/u],
  ['bounded container release handshake', /for _ in \$\(seq 1 300\)[\s\S]*container-release[\s\S]*release_observed/u],
  ['cleanup trap', /trap cleanup_container EXIT/u],
  ['cleanup trap force removal', /docker rm -f "\$container_id"/u],
  ['running PID inspection', /container_pid=\$\([\s\S]*\.State\.Pid/u],
  ['running proc cgroup inspection', /\/proc\/\$container_pid\/cgroup/u],
  ['root cgroup rejection', /test "\$cgroup_relative" != \//u],
  ['exact cgroup path resolution', /cgroup_path=\$\([\s\S]*realpath -m/u],
  ['running cgroup artifact', /container-cgroup-events-running\.txt/u],
  ['running cgroup populated proof', /populated 1/u],
  ['bounded release before wait', /touch "\$workspace\/container-release"[\s\S]*docker wait "\$container_id"/u],
  ['zero container exit proof', /cat runner-artifacts\/container-exit-code\.txt\)" = 0/u],
  ['stopped cgroup artifact', /container-cgroup-events-stopped\.txt/u],
  ['cgroup cleanup observation artifact', /container-cgroup-cleanup-observation\.txt/u],
  ['populated-zero cleanup result', /cleanup_observation="populated-zero"/u],
  ['removed-cgroup cleanup result', /cleanup_observation="cgroup-removed"/u],
  ['unproven cleanup rejection', /V4_PREFLIGHT_CGROUP_CLEANUP_UNPROVEN/u],
  ['removed container identity', /removed_container_id="\$container_id"/u],
  ['cleanup trap disabled after explicit removal', /container_id=""[\s\S]*trap - EXIT/u],
  ['container removal proof', /docker rm.*container_id/u],
  ['receipt success gate', /Publish only sanitized preflight receipt[\s\S]*if: success\(\)/u],
  ['no Codex execution', /does not execute Codex|preflight/u],
];
const failures = requirements.filter(([, pattern]) => !pattern.test(workflow)).map(([name]) => name);
assert.deepEqual(failures, [], `runner workflow requirements failed: ${failures.join(', ')}`);
assert.doesNotMatch(workflow, /secrets\./u, 'V4 preflight must not reference GitHub secrets');
assert.doesNotMatch(workflow, /environment:/u, 'V4 preflight must not use a GitHub Environment');
assert.doesNotMatch(workflow, /find \/sys\/fs\/cgroup/u, 'cgroup cleanup must not search guessed host paths');
assert.doesNotMatch(workflow, /docker-\$\{container_id\}\.scope/u, 'cgroup cleanup must not infer systemd scope names');
assert.doesNotMatch(workflow, /cgroup_events=/u, 'cgroup cleanup must not use post-exit guessed event paths');

const parseDockerMountMode = (source) => {
  const match = source.match(/--mount\s+"([^"]+)"/u);
  if (!match) return { accepted: false, writable: false };
  const options = match[1].split(',');
  if (!options.every((option) => option.includes('=') || option === 'readonly')) {
    return { accepted: false, writable: false };
  }
  return { accepted: true, writable: !options.includes('readonly') };
};

const mountModeCases = [
  {
    name: 'bare rw is rejected',
    source: '--mount "type=bind,src=/tmp/workspace,dst=/workspace,rw"',
    expected: { accepted: false, writable: false },
  },
  {
    name: 'workspace without mode is writable',
    source: '--mount "type=bind,src=/tmp/workspace,dst=/workspace"',
    expected: { accepted: true, writable: true },
  },
  {
    name: 'cache readonly is accepted',
    source: '--mount "type=bind,src=/tmp/cache,dst=/cache,readonly"',
    expected: { accepted: true, writable: false },
  },
  {
    name: 'harness readonly is accepted',
    source: '--mount "type=bind,src=/tmp/harness,dst=/harness,readonly"',
    expected: { accepted: true, writable: false },
  },
];

for (const { name, source, expected } of mountModeCases) {
  assert.deepEqual(parseDockerMountMode(source), expected, name);
}

assert.doesNotMatch(workflow, /dst=\/workspace,rw(?:"|\s|$)/u, 'bare workspace rw must stay rejected');
assert.doesNotMatch(workflow, /dst=\/(?:cache|harness),ro(?:"|\s|$)/u, 'bare ro must stay rejected');

console.log(JSON.stringify({
  status: 'PASS',
  checks: requirements.length + mountModeCases.length + 2,
  failures: [],
  mountModeCases: mountModeCases.map(({ name, expected }) => ({ name, ...expected })),
}, null, 2));
