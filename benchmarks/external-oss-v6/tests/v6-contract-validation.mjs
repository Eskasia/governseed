import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const workflowPath = path.join(repoRoot, '.github/workflows/external-oss-v6-dependency-cache.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const taskIds = ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09'];
const errors = [];
const require = (condition, message) => { if (!condition) errors.push(message); };
const section = (start, end) => {
  const begin = workflow.indexOf(start);
  const finish = end ? workflow.indexOf(end, begin + start.length) : workflow.length;
  return begin < 0 ? '' : workflow.slice(begin, finish < 0 ? workflow.length : finish);
};

for (const file of [
  'benchmarks/external-oss-v6/inherited-evidence.json',
  'benchmarks/external-oss-v6/permission-root-cause.json',
  'benchmarks/external-oss-v6/reproducer-result.json',
  'benchmarks/external-oss-v6/control/G0/luna-handoff.json',
]) JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8'));

const inherited = JSON.parse(readFileSync(path.join(repoRoot, 'benchmarks/external-oss-v6/inherited-evidence.json'), 'utf8'));
for (const source of inherited.sources) {
  const bytes = readFileSync(path.join(repoRoot, source.path));
  require(createHash('sha256').update(bytes).digest('hex') === source.sha256, `inherited hash mismatch: ${source.path}`);
}
require(inherited.immutableBoundary.v6Scope.includes('No V6 workflow'), 'immutable boundary changed');

require(workflow.includes('name: External OSS V6 dependency cache'), 'V6 workflow name');
require(workflow.includes('workflow_dispatch:'), 'workflow_dispatch required');
require(workflow.includes('permissions:\n  contents: read'), 'contents read permission');
require(workflow.includes('GS-OSS-2026-08-02-V6'), 'benchmark ID');
require(!workflow.includes('secrets.'), 'no secrets');
require(!workflow.includes('environment:'), 'no environment');
require(!/(?:uses|run):[^\n]*(?:codex|hidden-oracle|provider credential|oracle)/iu.test(workflow), 'no Codex/oracle/provider execution');
const jobNames = ['qualify-seed-identity', 'prepare-dependency-cache', 'diagnose-offline-permissions', 'verify-dependency-cache-offline', 'aggregate-cache-qualification'];
for (const job of jobNames) require(workflow.includes(`  ${job}:`), `missing job ${job}`);
const topJobs = [...workflow.matchAll(/^  ([a-z0-9-]+):$/gmu)].map((m) => m[1]);
require(JSON.stringify(topJobs) === JSON.stringify(jobNames), `job set/order mismatch: ${topJobs.join(',')}`);
for (const id of taskIds) require(workflow.includes(`task_id: ${id}`), `missing task ${id}`);
require((workflow.match(/task_id: TASK-OSS-\d+/gu) ?? []).length === 12, 'task matrix scope is not exactly three tasks per four matrix jobs');

const prepare = section('  prepare-dependency-cache:', '  diagnose-offline-permissions:');
const diagnose = section('  diagnose-offline-permissions:', '  verify-dependency-cache-offline:');
const offline = section('  verify-dependency-cache-offline:', '  aggregate-cache-qualification:');
const aggregate = section('  aggregate-cache-qualification:');
require(prepare.includes('git clone --no-checkout --filter=blob:none --no-tags'), 'public source reconstruction');
require(prepare.includes('upstreamBaseCommit'), 'exact upstream base');
require(prepare.includes('seed-tree-hash.mjs'), 'seed tree hash');
require(prepare.includes('remote set-url --push origin no_push://disabled'), 'push disabled');
require(prepare.includes('cache.tgz'), 'cache archive');
require(prepare.includes('runtime-image.tgz'), 'runtime image archive');
require(prepare.includes('preparationNetworkUsed'), 'preparation provenance');
require(prepare.includes('measuredNetworkUsed'), 'measured provenance');
require(prepare.includes('chmod -R a-w "$cache_root"'), 'source cache is made readonly before archive');
const requireOrder = (block, needles, label) => {
  let previous = -1;
  for (const needle of needles) {
    const position = block.indexOf(needle);
    require(position > previous, `${label} order missing or invalid: ${needle}`);
    previous = position;
  }
};
for (const [label, block] of [['diagnose', diagnose], ['offline', offline]]) {
  requireOrder(block, ['cp -a "$cache_root/." "$negative_cache/"', 'chmod -R u+rwX "$negative_cache"', 'rm -rf "$negative_cache/$required_path"', 'chmod -R a-w "$negative_cache"'], `${label} negative-cache repair`);
}
require(diagnose.includes('cp -a "$cache_root/." "$negative_cache/"'), 'diagnose copies disposable negative tree');
require(diagnose.includes('rm -rf "$negative_cache/$required_path"'), 'diagnose removes required path');
require(diagnose.includes('chmod -R a-w "$negative_cache"'), 'diagnose restores negative tree readonly');
require(!diagnose.includes('chmod 0777'), 'no chmod 777');
for (const code of ['WORKSPACE_TRAVERSE_DENIED','HARNESS_EXECUTION_DENIED','CACHE_READ_DENIED','RUNTIME_BINARY_EXECUTION_DENIED','WORKING_DIRECTORY_DENIED','HOME_NOT_WRITABLE','TMP_NOT_WRITABLE','DEPENDENCY_CACHE_INCOMPLETE','OFFLINE_PERMISSION_CAUSE_UNKNOWN']) {
  require(workflow.includes(code), `missing structured code ${code}`);
}
require(offline.includes('--network none'), 'network none');
require(offline.includes('--read-only'), 'readonly rootfs');
require(offline.includes('--cap-drop=ALL'), 'cap drop all');
require(offline.includes('--security-opt no-new-privileges:true'), 'no new privileges');
require(offline.includes('--user 65532:65532'), 'fixed non-root identity');
for (const mount of ['/workspace', '/tmp', '/home/benchmark']) require(offline.includes(`dst=${mount}`), `writable disposable mount ${mount}`);
require(offline.includes('dst=/cache,readonly'), 'readonly cache mount');
require(offline.includes('dst=/harness,readonly'), 'readonly harness mount');
require(offline.includes('docker inspect'), 'runtime integration inspection');
require(offline.includes('negative_cache'), 'negative runtime smoke');
require(diagnose.includes('diagnostics.json'), 'sanitized always diagnostics');
require(offline.includes('extract_failure_code'), 'specific failure code preservation');
require(offline.includes('diagnostic_code="$failure_code"'), 'bounded diagnostic fallback');
require(offline.includes('test -r "/cache/$2" || fail DEPENDENCY_CACHE_INCOMPLETE'), 'unreadable cache fails incomplete');
require(aggregate.includes('READY'), 'aggregate readiness gate');
require(aggregate.includes('TASK-OSS-01') && aggregate.includes('TASK-OSS-03') && aggregate.includes('TASK-OSS-09'), 'aggregate fixed tasks');
require(!offline.match(/\b(?:curl|wget|npm|pnpm|uv)\s+(?:install|ci|sync)/iu), 'no offline dependency mutation');
require(!offline.includes('benchmarks/external-oss-v5/'), 'offline job does not mutate V5 inputs');

const result = { schemaVersion: 1, status: errors.length ? 'FAIL' : 'PASS', checks: errors.length ? errors : ['V6 workflow contract', 'V6 inherited evidence hashes', 'V6 security and negative boundary'] };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
