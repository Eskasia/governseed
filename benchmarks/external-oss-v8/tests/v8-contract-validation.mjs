import { existsSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const workflow = readFileSync('.github/workflows/external-oss-v8-dependency-cache.yml', 'utf8');
const runtimeScript = readFileSync('benchmarks/external-oss-v8/tests/v8-runtime-contract.sh', 'utf8');
const offlineScript = readFileSync('benchmarks/external-oss-v8/tests/v8-offline-smoke.sh', 'utf8');
const inherited = JSON.parse(readFileSync('benchmarks/external-oss-v8/inherited-evidence.json', 'utf8'));
const inheritedVerification = JSON.parse(readFileSync('benchmarks/external-oss-v8/control/G0/inherited-source-verification.json', 'utf8'));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const errors = [];
const requireText = (text, needle, label = needle) => {
  if (!text.includes(needle)) errors.push(`missing ${label}`);
};
const forbidText = (text, needle, label = needle) => {
  if (text.includes(needle)) errors.push(`forbidden ${label}`);
};

requireText(workflow, 'GS-OSS-2026-08-02-V8');
requireText(workflow, 'external-observational');
requireText(workflow, 'V7_SOURCE_RUN_ID: 30732978684');
requireText(workflow, 'qualify-runtime-image:');
requireText(workflow, 'prepare-dependency-cache:');
requireText(workflow, 'verify-workspace-exec-contract:');
requireText(workflow, 'verify-dependency-cache-offline:');
requireText(workflow, 'aggregate-cache-qualification:');
requireText(workflow, 'run-id: 30732978684');
requireText(workflow, 'external-oss-v7-runtime-image-${{ matrix.task_id }}');
requireText(workflow, 'external-oss-v7-dependency-cache-${{ matrix.task_id }}');
requireText(workflow, '--tmpfs "/workspace:rw,exec,nosuid,nodev,size=8g,uid=65532,gid=65532,mode=0750"');
requireText(workflow, '--tmpfs "/home/benchmark:rw,noexec,nosuid,nodev,size=1g,uid=65532,gid=65532,mode=0700"');
requireText(workflow, '--tmpfs "/tmp:rw,noexec,nosuid,nodev,size=2g,uid=65532,gid=65532,mode=1770"');
requireText(workflow, '--network none');
requireText(workflow, '--read-only');
requireText(workflow, '--cap-drop=ALL');
requireText(workflow, '--security-opt no-new-privileges:true');
requireText(workflow, '--user 65532:65532');
requireText(workflow, 'cp benchmarks/external-oss-v8/tests/v8-runtime-contract.sh');
requireText(workflow, 'v8-container-wrapper.sh');
requireText(workflow, 'docker exec "$container_id" cat');
requireText(workflow, 'docker exec "$id" cat');
requireText(workflow, '/workspace/.v8-release');
forbidText(workflow, 'docker start -a', 'attached start cannot export tmpfs evidence');
forbidText(workflow, 'docker cp "$container_id:/workspace/', 'workspace tmpfs docker cp in contract job');
forbidText(workflow, 'docker cp "$id:/workspace/', 'workspace tmpfs docker cp in offline job');
requireText(workflow, 'for script in v8-runtime-contract.sh v8-offline-smoke.sh');
requireText(workflow, 'rm -rf "$negative_cache/$required_path"');
requireText(workflow, 'test "$negative_rc" -eq 42');
requireText(workflow, 'DEPENDENCY_CACHE_INCOMPLETE');
requireText(workflow, 'workspaceMountExec');
requireText(workflow, 'workspaceMountNoexec');
requireText(workflow, 'runtimeBinaryExecutionPass');
requireText(workflow, 'cacheReadOnlyObserved');
requireText(workflow, 'readonlyRootObserved');
requireText(workflow, 'vitestVersionProbePass');
requireText(workflow, 'vitestSmokePass');
requireText(workflow, 'seedArchiveSha256');
requireText(workflow, '.HostConfig.Tmpfs');
requireText(workflow, 'size=8g');
requireText(workflow, 'mode=0750');
requireText(workflow, 'libmagic-library-path.txt');
requireText(workflow, 'libmagic-database-path.txt');
const nodeDelimiters = workflow.split('\n').filter((line) => line.trim() === 'NODE');
if (nodeDelimiters.some((line) => line !== '          NODE')) errors.push('workflow heredoc delimiter has invalid indentation');
forbidText(workflow, "for spec in '/workspace true'", 'tmpfs treated as .Mounts bind entry');
requireText(workflow, "for spec in '/seed false'", 'bind mount inspection');

for (const source of inherited.sources) {
  if (!/^[0-9a-f]{64}$/.test(source.sha256)) errors.push(`invalid inherited SHA-256: ${source.path}`);
  if (!existsSync(source.path) && !/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\/.+/.test(source.sourceLocator || '')) errors.push(`unresolvable inherited source: ${source.path}`);
  if (existsSync(source.path)) {
    const actual = sha256(source.path);
    if (actual !== source.sha256) errors.push(`inherited SHA-256 mismatch: ${source.path}`);
  }
}
for (const source of inheritedVerification.sources) {
  if (source.status !== 'PASS' || source.sha256 !== source.observedSha256 || !/^https:\/\/raw\.githubusercontent\.com\/[^/]+\/[^/]+\/[0-9a-f]{40}\/.+/.test(source.sourceLocator)) errors.push(`inherited source verification failed: ${source.path}`);
}
for (const contract of inherited.taskContracts) {
  if (!existsSync(contract.path)) errors.push(`missing task contract: ${contract.path}`);
  else {
    const actual = sha256(contract.path);
    if (actual !== contract.sha256) errors.push(`task contract SHA-256 mismatch: ${contract.path}`);
  }
}

for (const [text, label] of [[runtimeScript, 'runtime script']]) {
  requireText(text, 'cat /proc/self/mountinfo', `${label} mountinfo capture`);
  requireText(text, 'findmnt -T "$target" -o TARGET,FSTYPE,OPTIONS', `${label} findmnt capture`);
  requireText(text, 'findmnt -T / -no OPTIONS', `${label} root mount flags`);
  requireText(text, '/workspace/workspace-exec-probe.sh', `${label} actual workspace probe`);
  requireText(text, 'chmod 0755 /workspace/workspace-exec-probe.sh', `${label} probe mode`);
  requireText(text, 'vitest --version', `${label} Vitest version probe`);
  requireText(text, 'readlink -e ./node_modules/.bin/vitest', `${label} resolved Vitest path`);
  requireText(text, 'test -L ./node_modules/.bin/vitest', `${label} symlink-or-regular-file probe`);
  requireText(text, 'REGULAR_FILE', `${label} regular-file evidence`);
  requireText(text, 'node --test', `${label} Node test-runner probe`);
  requireText(text, 'python -m pytest --version', `${label} pytest probe`);
  requireText(text, 'WORKSPACE_EXECUTION_DENIED', `${label} execution failure code`);
  requireText(text, 'RUNTIME_BINARY_EXECUTION_DENIED', `${label} binary failure code`);
  requireText(text, 'SYMLINK_TARGET_EXECUTION_DENIED', `${label} symlink failure code`);
  requireText(text, 'workspaceMountNoexec":false', `${label} noexec receipt field`);
  forbidText(text, 'test -x ./node_modules/.bin/vitest', `${label} test-x-only Vitest assertion`);
}
for (const [text, label] of [[offlineScript, 'offline script']]) {
  requireText(text, '/harness/v8-runtime-contract.sh', `${label} contract probe`);
  requireText(text, 'OFFLINE_SMOKE_FAILED', `${label} public smoke failure code`);
  requireText(text, 'DEPENDENCY_CACHE_INCOMPLETE', `${label} negative cache code`);
  requireText(text, 'publicTestSmokePass', `${label} public smoke receipt`);
}

forbidText(workflow, 'tmpfs-mode=0777');
forbidText(workflow, '/workspace:rw,noexec', 'workspace noexec mount');
forbidText(workflow, '--privileged');
forbidText(workflow, 'docker.sock');
forbidText(workflow, '--network bridge');
forbidText(workflow, 'chmod 777');
forbidText(workflow, '--user 0');
forbidText(workflow, 'codex --', 'Codex execution');
forbidText(workflow, 'provider --', 'provider execution');

const tracked = execFileSync('git', ['ls-files', 'benchmarks/external-oss-v8'], { encoding: 'utf8' });
if (/\.tgz$|\.tar\.gz$|cache\.zip$/.test(tracked)) errors.push('cache archive is tracked in Git');
if (statSync('.github/workflows/external-oss-v7-dependency-cache.yml').isFile() === false) errors.push('V7 workflow missing');
if (errors.length) {
  console.error(JSON.stringify({ status: 'FAIL', errors }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ schemaVersion: 1, benchmarkId: 'GS-OSS-2026-08-02-V8', status: 'PASS', checks: ['V8 mount contract', 'runtime probes', 'negative cache boundary', 'V7 immutability boundary'] }));
