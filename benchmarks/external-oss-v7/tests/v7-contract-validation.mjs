import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const dependencyWorkflow = readFileSync(path.join(repoRoot, '.github/workflows/external-oss-v7-dependency-cache.yml'), 'utf8');
const imageWorkflow = readFileSync(path.join(repoRoot, '.github/workflows/external-oss-v7-runtime-image.yml'), 'utf8');
const tasks = ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09'];
const errors = [];
const require = (condition, message) => { if (!condition) errors.push(message); };
const readJson = (file) => JSON.parse(readFileSync(path.join(repoRoot, file), 'utf8'));
const section = (source, start, end) => {
  const begin = source.indexOf(start);
  const finish = end ? source.indexOf(end, begin + start.length) : source.length;
  return begin < 0 ? '' : source.slice(begin, finish < 0 ? source.length : finish);
};

const inherited = readJson('benchmarks/external-oss-v7/inherited-evidence.json');
const rootCause = readJson('benchmarks/external-oss-v7/control/G0/root-cause.json');
const minimalResult = readJson('benchmarks/external-oss-v7/control/G0/minimal-libmagic-result.json');
const imageLock = readJson('benchmarks/external-oss-v7/runtime-image/image-lock.json');
const structuredCodes = readJson('benchmarks/external-oss-v7/control/structured-codes.json');
for (const file of [
  'benchmarks/external-oss-v7/control/G0/runtime-image-audit.json',
  'benchmarks/external-oss-v7/runtime-image/image-lock.json',
]) readJson(file);

require(inherited.benchmarkId === 'GS-OSS-2026-08-02-V7', 'V7 inherited benchmark ID');
require(inherited.evidenceClass === 'external-observational', 'V7 inherited evidence class');
require(inherited.baseCommit === '0f4b844673af47d654a1e84ba5463ac21bd09cba', 'V7 base commit');
require(inherited.v6Identity.failedRunId === '30726888838', 'V6 failed run identity');
require(inherited.v6Identity.failureEvidenceCommit === '3ff3273eff5d1165d9d7b694fc9eb8eedf72e603', 'V6 evidence commit');
require(inherited.v6Identity.repairBudget.resetForV7 === true, 'V7 repair budget reset');
require(rootCause.classification === 'LIBMAGIC_SHARED_LIBRARY_MISSING', 'root-cause classification');
require(rootCause.v6ObservedFailure.observedError.includes('failed to find libmagic'), 'V6 observed libmagic error');
require(rootCause.v6ObservedFailure.importPath.some((entry) => entry.includes('magic/loader.py')), 'python-magic loader import path');
require(rootCause.sharedLibraryLookup.requiredV7Checks.some((x) => x.includes('ldconfig')), 'ldconfig lookup required');
require(rootCause.sharedLibraryLookup.requiredV7Checks.some((x) => x.includes('libmagic.so')), 'shared-library find required');
require(minimalResult.localReproducer.result === 'EXPECTED_NOT_RUN: LOCAL_DOCKER_DAEMON_UNAVAILABLE', 'honest local Docker boundary');
require(imageLock.runtimeChange.measuredJobDynamicSystemPackageInstall === false, 'no measured dynamic system package installation');
require(imageLock.runtimeChange.confirmedCause === rootCause.classification, 'image change is bound to confirmed cause');
require(imageLock.baseImages.node.lockedReference.startsWith('node@sha256:'), 'Node base digest lock');
require(imageLock.baseImages.paperless.lockedReference.startsWith('python@sha256:'), 'Paperless base digest lock');
require(JSON.stringify(imageLock.baseImages.paperless.declaredAddedPackages) === JSON.stringify(['libmagic1', 'libmagic-mgc']), 'Paperless declared package set');

for (const source of inherited.sources) {
  const localPath = path.join(repoRoot, source.path);
  if (existsSync(localPath)) {
    const actual = createHash('sha256').update(readFileSync(localPath)).digest('hex');
    require(actual === source.sha256, `inherited hash mismatch: ${source.path}`);
  } else {
    const probe = spawnSync('git', ['cat-file', '-e', `${source.sourceCommit}:${source.path}`], { cwd: repoRoot, encoding: 'utf8' });
    require(source.sourceCommit === '3ff3273eff5d1165d9d7b694fc9eb8eedf72e603', `external source commit required: ${source.path}`);
    require(source.path.includes('30726888838-failure.json'), `missing source must be the V6 failure evidence: ${source.path}`);
    if (probe.status === 0) {
      const shown = spawnSync('git', ['show', `${source.sourceCommit}:${source.path}`], { cwd: repoRoot, encoding: 'buffer' });
      if (shown.status === 0) require(createHash('sha256').update(shown.stdout).digest('hex') === source.sha256, `git source hash mismatch: ${source.path}`);
    }
  }
}
for (const source of inherited.taskIdentitySources) {
  const actual = createHash('sha256').update(readFileSync(path.join(repoRoot, source.path))).digest('hex');
  require(actual === source.sha256, `task identity hash mismatch: ${source.path}`);
}

require(dependencyWorkflow.includes('name: External OSS V7 dependency cache'), 'V7 dependency workflow name');
require(dependencyWorkflow.includes('workflow_dispatch:'), 'V7 dependency workflow dispatch');
require(dependencyWorkflow.includes('permissions:\n  contents: read'), 'V7 read-only workflow permission');
const jobNames = ['qualify-seed-identity', 'build-runtime-image', 'prepare-dependency-cache', 'verify-dependency-cache-offline', 'aggregate-cache-qualification'];
const topJobs = [...dependencyWorkflow.matchAll(/^  ([a-z0-9-]+):$/gmu)].map((m) => m[1]);
require(JSON.stringify(topJobs) === JSON.stringify(jobNames), `V7 job set/order mismatch: ${topJobs.join(',')}`);
for (const taskId of tasks) require(dependencyWorkflow.includes(`task_id: ${taskId}`), `missing task ${taskId}`);
require((dependencyWorkflow.match(/task_id: TASK-OSS-\d+/gu) ?? []).length === 9, 'V7 matrix scope is not exactly three tasks in three matrix jobs');
require(dependencyWorkflow.includes('uses: ./.github/workflows/external-oss-v7-runtime-image.yml'), 'dependency workflow calls V7 image workflow');
require(dependencyWorkflow.includes('external-oss-v7-runtime-image-${{ matrix.task_id }}'), 'exact runtime image artifact per task');
require(dependencyWorkflow.includes('docker load --input "$artifact/runtime-image.tgz"'), 'prepared cache loads exact image archive');
require(dependencyWorkflow.includes('runtimeImageArchiveHashRecomputed: true'), 'runtime archive hash is recomputed');
require(dependencyWorkflow.includes('runtimeImageIdentityPass: true'), 'runtime image identity receipt');
require(dependencyWorkflow.includes('runtimeImageArchiveSha256'), 'runtime image archive hash in manifest');
require(dependencyWorkflow.includes('cacheSha256'), 'cache archive hash in manifest');
require(dependencyWorkflow.includes('cache-files.sha256'), 'cache file inventory');
require(dependencyWorkflow.includes('manifest.sha256'), 'manifest hash');
require(dependencyWorkflow.includes('remote set-url --push origin no_push://disabled'), 'external push disabled');
require(dependencyWorkflow.match(/GIT_AUTHOR_DATE=2026-08-01T00:00:00Z/g)?.length === 2, 'fixed seed author date');
require(dependencyWorkflow.match(/GIT_COMMITTER_DATE=2026-08-01T00:00:00Z/g)?.length === 2, 'fixed seed committer date');
require(dependencyWorkflow.includes('setfacl'), 'workspace uses bounded UID-specific ACL rather than chmod 777');
require(!dependencyWorkflow.includes('sudo'), 'V7 workflow does not use sudo');
require(!dependencyWorkflow.includes('chmod 777'), 'V7 workflow does not use chmod 777');
require(!dependencyWorkflow.includes('--user 0'), 'offline workflow contains no root container');
require(!dependencyWorkflow.match(/secrets\.|GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY/iu), 'no credentials');
require(!dependencyWorkflow.match(/(?:uses:|run:)[^\n]*(?:codex|hidden[- ]oracle|provider credential)/iu), 'no Codex/oracle/provider execution');

const offline = section(dependencyWorkflow, '  verify-dependency-cache-offline:', '  aggregate-cache-qualification:');
for (const literal of ['--network none', '--read-only', '--cap-drop=ALL', '--security-opt no-new-privileges:true', '--user 65532:65532', '--pids-limit 256', '--cpus 4', '--memory 15g', 'dst=/workspace', 'dst=/cache,readonly', 'dst=/harness,readonly', 'dst=/home/benchmark', 'dst=/tmp']) require(offline.includes(literal), `offline containment literal: ${literal}`);
for (const code of structuredCodes.codes) require(structuredCodes.codes.includes(code), `structured code registry: ${code}`);
require(offline.includes('rm -rf "$negative_cache/$required_path"'), 'negative test removes actual required path');
require(offline.includes('grep -Fq DEPENDENCY_CACHE_INCOMPLETE'), 'negative test checks structured block');
require(offline.includes('test "$negative_rc" -eq 42'), 'negative test checks exit 42');
require(offline.includes('measuredNetworkUsed: false'), 'offline measured network false');
require(!offline.match(/apt-get|pip install|npm (?:ci|install)|pnpm install|uv sync/iu), 'offline job has no dependency/system install');
require(dependencyWorkflow.includes('status: \'READY\''), 'cache READY status');
require(dependencyWorkflow.includes('cachesReady: \'3/3\''), 'aggregate requires three caches');
require(dependencyWorkflow.includes('negativeCacheTests: \'3/3 BLOCKED with DEPENDENCY_CACHE_INCOMPLETE exit 42\''), 'aggregate negative result');
for (const field of ['cacheReadOnlyObserved', 'workspaceWritableObserved', 'homeWritableObserved', 'tmpWritableObserved', 'nonRootObserved', 'readonlyRootObserved', 'publicTestSmokePass', 'negativeCacheMissBlocked', 'permissionDiagnosticsPass']) require(dependencyWorkflow.includes(`${field}: true`), `receipt field ${field}`);
for (const field of ['libmagicLibraryObserved', 'libmagicDatabaseObserved', 'pythonMagicImportPass', 'pythonMagicFunctionalSmokePass']) require(dependencyWorkflow.includes(`${field}: true`), `Paperless receipt field ${field}`);

require(imageWorkflow.includes('workflow_call:'), 'runtime image reusable workflow');
require(imageWorkflow.includes('workflow_dispatch:'), 'runtime image manual workflow');
require(imageWorkflow.includes('docker build --pull=false --platform linux/amd64'), 'digest-locked build');
require(imageWorkflow.includes('runtime-image.tgz'), 'runtime image archive');
require(imageWorkflow.includes('sha256sum'), 'runtime image hash');
require(imageWorkflow.includes('package-inventory.txt'), 'package inventory');
require(imageWorkflow.includes('sbom.json'), 'SBOM artifact');
require(imageWorkflow.includes('ldconfig -p'), 'libmagic linker audit');
require(imageWorkflow.includes('magic.mgc'), 'magic database audit');
require(imageWorkflow.includes('python-magic'), 'Python functional binding audit');
require(!imageWorkflow.match(/secrets\.|GITHUB_TOKEN|GH_TOKEN|OPENAI_API_KEY|ANTHROPIC_API_KEY/iu), 'runtime image workflow has no credentials');
require(!imageWorkflow.match(/(?:uses:|run:)[^\n]*(?:codex|hidden[- ]oracle|provider credential)/iu), 'runtime image workflow has no Codex/oracle/provider execution');

const result = { schemaVersion: 1, benchmarkId: 'GS-OSS-2026-08-02-V7', status: errors.length ? 'FAIL' : 'PASS', checks: errors.length ? errors : ['V7 inherited evidence hashes', 'V7 workflow boundary', 'runtime image contract', 'offline negative boundary'], errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
