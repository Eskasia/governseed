import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile('.github/workflows/external-oss-v4-dependency-cache.yml', 'utf8');
const identity = JSON.parse(await readFile('benchmarks/external-oss-v4/dependency-cache/task-identities.json', 'utf8'));
const inherited = JSON.parse(await readFile('benchmarks/external-oss-v4/inherited-evidence.json', 'utf8'));
const taskIds = ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09'];
const repositories = ['immich-app/immich', 'louislam/uptime-kuma', 'paperless-ngx/paperless-ngx'];
const seedCommits = [
  '0ad23a4f16331512f49c570acc2e9ff8093c8248',
  '2ccc49b77ba0c0e9dc159fcce5516efa7c0e7a18',
  '5f5ab1beea4feaaecee7131b4b36185f09e2f53c',
];
const seedTrees = [
  '88c4510ad2c5825cad031671e8188fe8f6164324fd4eccd98f5160fc81a676fa',
  '5fdbf067da484e3778a1345297a33d984779be73c020ded93198a1c84f5a07ca',
  '64d046e9abad54f4f10d2e489d4385e5ca6df1e0d5b8d67ecf48ad560bf4ad42',
];

assert.equal(identity.benchmarkId, 'GS-OSS-2026-08-01-V4');
assert.equal(identity.evidenceClass, 'external-observational');
assert.equal(identity.inheritedFromBenchmark, 'GS-OSS-2026-08-01-V3');
assert.equal(identity.status, 'COMPLETE_FOR_CACHE_WORKFLOW');
assert.deepEqual(identity.tasks.map(({ taskId }) => taskId), taskIds);
assert.deepEqual(identity.tasks.map(({ repository }) => repository), repositories);
const inheritedHashes = new Map(inherited.items.map((item) => [item.sourcePath, item.sourceSha256]));
for (const task of identity.tasks) {
  assert.match(task.seedCommit, /^[0-9a-f]{40}$/u);
  assert.match(task.seedTreeSha256, /^[0-9a-f]{64}$/u);
  assert.ok(task.publicTestCommand.length > 0);
  assert.ok(task.dependencyRehearsalCommands.length > 0);
  assert.ok(task.allowedPaths.length > 0);
  assert.ok(task.forbiddenPaths.length > 0);
  assert.ok(task.sourceRefs.length >= 4);
  for (const sourceRef of task.sourceRefs) {
    assert.equal(inheritedHashes.get(sourceRef.sourcePath), sourceRef.sourceSha256, sourceRef.sourcePath);
  }
}

assert.match(workflow, /workflow_dispatch:/u);
assert.match(workflow, /permissions:\s*\n\s+contents:\s+read/u);
assert.match(workflow, /prepare-cache:/u);
assert.match(workflow, /verify-cache-offline:/u);
assert.match(workflow, /runs-on:\s+ubuntu-24\.04/u);
assert.doesNotMatch(workflow, /secrets\./u);
assert.doesNotMatch(workflow, /environment:/u);
assert.doesNotMatch(workflow, /\bcodex\b/iu);
assert.doesNotMatch(workflow, /oracle\.(?:mjs|py|test\.[cm]?js|test\.ts)/iu);
assert.doesNotMatch(workflow, /npm\s+update/u);
assert.doesNotMatch(workflow, /uv\s+lock\s+--upgrade/u);
assert.doesNotMatch(workflow, /path:\s*benchmarks\/external-oss-v4\/dependency-cache/u);
assert.doesNotMatch(workflow, /docker\.sock|\/run\/secrets/u);

const verifySection = workflow.slice(workflow.indexOf('  verify-cache-offline:'));
const prepareSection = workflow.slice(workflow.indexOf('  prepare-cache:'), workflow.indexOf('  verify-cache-offline:'));
assert.match(prepareSection, /https:\/\/github\.com\/\$REPOSITORY\.git/u);
assert.match(prepareSection, /git\s+-C\s+"\$seed_root"\s+fetch\s+--depth\s+1\s+origin\s+"\$SEED_COMMIT"/u);
assert.match(prepareSection, /pnpm install --frozen-lockfile --ignore-scripts/u);
assert.match(prepareSection, /npm ci --no-audit --no-fund/u);
assert.match(prepareSection, /uv sync --group testing/u);
assert.match(prepareSection, /sha256sum/u);
assert.match(prepareSection, /preparationNetworkUsed.*true/u);
assert.match(prepareSection, /cache\.tgz/u);
assert.match(prepareSection, /runtime-image\.tgz/u);

for (const taskId of taskIds) assert.ok(workflow.split(taskId).length - 1 >= 2, `${taskId} must be fixed in both jobs`);
for (const repository of repositories) assert.match(workflow, new RegExp(repository.replace('/', '\\/'), 'u'));
for (const commit of seedCommits) assert.match(workflow, new RegExp(commit, 'u'));
for (const tree of seedTrees) assert.match(workflow, new RegExp(tree, 'u'));

for (const requirement of [
  '--network none',
  '--read-only',
  '--cap-drop=ALL',
  '--security-opt no-new-privileges:true',
  '--user 65532:65532',
  '--pids-limit 256',
  '--cpus 4',
  '--memory 15g',
]) assert.match(verifySection, new RegExp(requirement.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'u'), requirement);

assert.match(verifySection, /dst=\/workspace"/u);
assert.match(verifySection, /dst=\/cache,readonly"/u);
assert.match(verifySection, /dst=\/harness,readonly"/u);
assert.doesNotMatch(verifySection, /dst=\/(?:cache|harness),(?:rw|ro)(?:"|\s|$)/u);
assert.match(verifySection, /DEPENDENCY_CACHE_INCOMPLETE/u);
assert.match(verifySection, /CACHE_NEGATIVE_TEST_DID_NOT_FAIL/u);
assert.match(verifySection, /seedArchiveSha256/u);
assert.match(verifySection, /negative_status=\$\?/u);
assert.match(verifySection, /test "\$negative_status" = 42/u);
assert.match(verifySection, /preparationNetworkUsed.*true/u);
assert.match(verifySection, /measuredNetworkUsed.*false/u);
assert.match(verifySection, /cacheReadOnlyObserved.*true/u);
assert.match(verifySection, /Upload structured cache receipt/u);

console.log(JSON.stringify({
  status: 'PASS',
  checks: 32 + identity.tasks.length * 6,
  taskIds,
  repositories,
  failures: [],
  runtimeQualification: 'STATIC_ONLY',
}, null, 2));
