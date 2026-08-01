import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const workflowPath = path.join(repoRoot, '.github/workflows/external-oss-v5-dependency-cache.yml');
const workflow = readFileSync(workflowPath, 'utf8');
const taskIds = ['TASK-OSS-01', 'TASK-OSS-03', 'TASK-OSS-09'];

const section = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = end ? source.indexOf(end, startIndex + start.length) : source.length;
  return startIndex === -1 ? '' : source.slice(startIndex, endIndex === -1 ? source.length : endIndex);
};

const validateWorkflow = (source) => {
  const errors = [];
  const require = (condition, message) => {
    if (!condition) errors.push(message);
  };
  const seed = section(source, '  qualify-seed-identity:', '  prepare-dependency-cache:');
  const prepare = section(source, '  prepare-dependency-cache:', '  verify-dependency-cache-offline:');
  const offline = section(source, '  verify-dependency-cache-offline:', '  aggregate-dependency-cache-qualification:');
  const aggregate = section(source, '  aggregate-dependency-cache-qualification:');

  require(source.includes('name: External OSS V5 dependency cache'), 'V5 workflow name');
  require(source.includes('workflow_dispatch:'), 'manual dispatch only');
  require(source.includes('GS-OSS-2026-08-01-V5'), 'V5 benchmark id');
  require(seed && prepare && offline && aggregate, 'all four qualification layers exist');
  require(source.includes('task-seed-identity.json'), 'workflow reads task seed contract');
  require(source.includes('upstreamBaseCommit'), 'workflow reads upstream base commit');
  require(source.includes('git -C "$source_root" fetch --depth=1 --filter=blob:none --no-tags origin "$upstream_base"'), 'workflow fetches exact upstream base only');
  require(source.includes('git -C "$source_root" remote set-url --push origin no_push://disabled'), 'workflow disables push remote');
  require(source.includes('git -C "$source_root" cat-file -e "$upstream_base^{commit}"'), 'workflow verifies fetched base object');
  require(source.includes('git -C "$source_root" archive "$upstream_base"'), 'workflow reconstructs from base tree');
  require(source.includes('seed-tree-hash.mjs'), 'workflow checks canonical tree hash');
  require(source.includes('git -C "$sealed_root" add --all --force'), 'workflow retains ignored upstream seed files');
  require(source.includes('if test "$overlay_path" != "-"; then'), 'workflow preserves empty overlay field identity');
  require(!source.includes('sealedSeedCommit'), 'workflow does not fetch sealed commit');
  require(!/fetch[^\n]*seed_commit/iu.test(source), 'workflow has no seed commit fetch');
  require(!source.includes('origin/main'), 'workflow has no default-branch fallback');
  require(!source.match(/git\s+pull\b/iu), 'workflow has no git pull fallback');
  require(!source.match(/git\s+push\b/iu), 'workflow has no upstream push');
  require(!source.includes('secrets.'), 'workflow has no credential reference');
  require(!source.match(/codex|hidden-oracle|oracle/iu), 'workflow has no agent or hidden source execution');
  require(!source.includes('external-oss-v4'), 'workflow is not a V4 workflow');

  for (const [name, job] of [['seed', seed], ['prepare', prepare], ['offline', offline]]) {
    const found = [...job.matchAll(/^\s+- task_id:\s+(TASK-OSS-\d+)\s*$/gmu)].map((match) => match[1]);
    require(found.length === 3 && found.every((taskId, index) => taskId === taskIds[index]), `${name} matrix is exactly the fixed three-task set`);
  }

  require(prepare.includes('docker pull "$runtime_reference"'), 'preparation resolves a public runtime image');
  require(prepare.includes('git clone --no-checkout --filter=blob:none --no-tags'), 'preparation reconstructs from public source');
  require(prepare.includes('preparationNetworkUsed: true'), 'preparation records public network use');
  require(prepare.includes('measuredNetworkUsed: false'), 'preparation records measured network disabled');
  require(prepare.includes('cache-manifest.json'), 'preparation writes cache manifest');
  require(prepare.includes('manifestSha256: null'), 'manifest defines canonical manifest hash field');
  require(prepare.includes('manifest.manifestSha256 = createHash'), 'manifest records canonical manifest hash');
  require(prepare.includes('cache-files.sha256'), 'preparation writes cache file inventory');
  require(prepare.includes('cache.tgz'), 'preparation creates tar gzip cache archive');
  require(prepare.includes('runtime-image.tgz'), 'preparation captures runtime image');
  require(prepare.includes('lockfileModified: false'), 'preparation records lockfile immutability');
  require(prepare.includes('credentialIncluded: false'), 'preparation records credential exclusion');
  require(prepare.includes("[taskKey]: false"), 'preparation records hidden source exclusion');
  require(prepare.includes('fallbackDownload: false'), 'preparation disables fallback download');
  require(prepare.includes('pnpm install --frozen-lockfile --ignore-scripts'), 'Immich uses frozen pnpm install');
  require(/\(\s*cd "\$sealed_root"\s+pnpm install --frozen-lockfile --ignore-scripts\s+pnpm --filter @immich\/sdk run build\s+\)/s.test(prepare), 'Immich preparation install and build run inside sealed_root');
  require(prepare.includes('npm ci --no-audit --no-fund'), 'Uptime Kuma uses npm ci');
  require(/\(\s*cd "\$sealed_root"\s+npm ci --no-audit --no-fund\s+\)/s.test(prepare), 'Uptime Kuma preparation install runs inside sealed_root');
  require(prepare.includes('uv sync --group testing'), 'Paperless uses uv sync testing group');
  require(/\(\s*cd "\$sealed_root"\s+uv sync --group testing\s+\)/s.test(prepare), 'Paperless preparation install runs inside sealed_root');
  require(prepare.includes('PAPERLESS_SECRET_KEY=synthetic-test-only-value'), 'Paperless preparation uses synthetic value');
  require(prepare.includes('test "$(git -C "$sealed_root" status --porcelain -- pnpm-lock.yaml)" = ""'), 'Immich lockfile is checked');
  require(prepare.includes('test "$(git -C "$sealed_root" status --porcelain -- package-lock.json)" = ""'), 'Uptime lockfile is checked');
  require(prepare.includes('test "$(git -C "$sealed_root" status --porcelain -- uv.lock)" = ""'), 'Paperless lockfile is checked');
  const task09 = section(prepare, '            TASK-OSS-09)', '            *)');
  require(task09.includes('phase_mark "before-task-oss-09-runtime-version-checks"'), 'TASK-OSS-09 runtime phase marker present');
  require(task09.includes('phase_mark "before-task-oss-09-uv-sync"'), 'TASK-OSS-09 uv sync phase marker present');
  require(task09.includes('phase_mark "before-task-oss-09-uv-lock-immutability-check"'), 'TASK-OSS-09 lockfile phase marker present');
  require(task09.includes('phase_mark "before-task-oss-09-pytest"'), 'TASK-OSS-09 pytest phase marker present');
  require(task09.includes('"$sealed_root/.venv/bin/python" -m pytest -q src/paperless/tests/test_parser_utils.py'), 'TASK-OSS-09 preparation uses the sealed-root venv interpreter');
  require(!/(?:^|\s)python -m pytest -q src\/paperless\/tests\/test_parser_utils\.py/mu.test(task09), 'TASK-OSS-09 preparation rejects the global python interpreter');
  require(task09.includes('task-oss-09-diagnostics.txt'), 'TASK-OSS-09 diagnostics artifact present');
  require(task09.includes('uv_version=$(uv --version)'), 'TASK-OSS-09 captures full uv version output');
  require(task09.includes("awk '{print $1, $2}'"), 'TASK-OSS-09 checks uv version fields tolerantly');
  require(!task09.includes('test "$(uv --version)" = "uv 0.11.8"'), 'TASK-OSS-09 rejects brittle full-string uv version check');
  require(task09.includes('libmagic'), 'TASK-OSS-09 libmagic diagnostic present');
  require(prepare.includes('trap \'rc=$?; trap - ERR;'), 'preparation failure trap records phase and exit code');
  require(!task09.match(/(?:printenv|\benv\s*>|OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|GH_TOKEN|NPM_TOKEN|PYPI_TOKEN|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY)/u), 'TASK-OSS-09 diagnostics do not dump sensitive environment values');
  require(!prepare.match(/secrets\.|OPENAI_API_KEY\s*:\s*\$\{\{/u), 'preparation does not inject credentials');

  require(offline.includes('--network none'), 'offline container uses network none');
  require(offline.includes('--read-only'), 'offline container uses read-only root');
  require(offline.includes('--cap-drop=ALL'), 'offline container drops all capabilities');
  require(offline.includes('--security-opt no-new-privileges:true'), 'offline container uses no-new-privileges');
  require(offline.includes('--user 65532:65532'), 'offline container uses non-root UID');
  require(offline.includes('--pids-limit 256'), 'offline container sets PID limit');
  require(offline.includes('--cpus 4'), 'offline container sets CPU limit');
  require(offline.includes('--memory 15g'), 'offline container sets memory limit');
  require((offline.match(/--mount "type=bind,src=\$workspace,dst=\/workspace"/gu) ?? []).length === 2, 'workspace bind mount has default writable mode');
  require(!offline.includes('dst=/workspace,rw'), 'workspace does not use bare rw mount syntax');
  require(!offline.includes('dst=/workspace,readonly'), 'workspace is not read-only');
  const readonlyCacheMounts = [
    ...(offline.match(/--mount "type=bind,src=\$cache,dst=\/cache,readonly"/gu) ?? []),
    ...(offline.match(/--mount "type=bind,src=\$negative_cache,dst=\/cache,readonly"/gu) ?? []),
  ];
  require(readonlyCacheMounts.length === 2, 'cache bind mount uses readonly');
  require((offline.match(/--mount "type=bind,src=\$harness,dst=\/harness,readonly"/gu) ?? []).length === 2, 'harness bind mount uses readonly');
  require(offline.includes('docker inspect "$container_id" > "$artifact_root/container-security.json"'), 'offline security configuration is observed');
  require(offline.includes("HostConfig.NetworkMode"), 'effective network mode is inspected');
  require(offline.includes('container_id=$(tail -n 1'), 'created container ID is captured');
  require(offline.includes('cleanup_current'), 'container cleanup is explicit and fail-closed');
  require(offline.includes('grep -Fq DEPENDENCY_CACHE_INCOMPLETE'), 'negative cache test requires incomplete marker');
  require(offline.includes('test "$negative_rc" -eq 42'), 'negative cache test requires exit 42');
  require(offline.includes('cache-receipt.json'), 'offline job writes receipt');
  require(offline.includes('/cache/.venv/bin/python -m pytest -q src/paperless/tests/test_parser_utils.py'), 'offline TASK-OSS-09 uses the mounted cache venv interpreter');
  require(!/(?:^|\s)python -m pytest -q src\/paperless\/tests\/test_parser_utils\.py/mu.test(offline), 'offline TASK-OSS-09 rejects the global python interpreter');
  require(!offline.match(/(?:npm|pnpm|uv)\s+(?:install|ci|sync)\b/iu), 'offline job cannot install or update dependencies');
  require(!offline.match(/\b(?:curl|wget)\b/iu), 'offline job cannot download with fallback tools');
  require(!offline.includes('secrets.'), 'offline job has no credential reference');
  require(!offline.match(/codex|hidden-oracle|oracle/iu), 'offline job has no agent or hidden source execution');

  require(aggregate.includes('external-oss-v5-dependency-cache-receipt-TASK-OSS-*'), 'aggregate downloads receipt artifacts');
  for (const taskId of taskIds) require(aggregate.includes(`'${taskId}'`), `aggregate requires ${taskId}`);
  require(aggregate.includes('receipts.length !== 3'), 'aggregate requires exactly three receipts');
  require(aggregate.includes("status !== 'READY'"), 'aggregate requires every receipt READY');
  require(aggregate.includes("dependencyCacheQualification: 'READY'"), 'aggregate emits READY only after all receipts');
  require(aggregate.includes('path: ${{ runner.temp }}/dependency-cache-qualification.json'), 'aggregate artifact is runner temporary evidence');
  require(!source.match(/path:\s+benchmarks\/external-oss-v5[^\n]*cache/iu), 'cache archives are not uploaded from Git paths');

  return errors;
};

const errors = validateWorkflow(workflow);
const checks = [
  ['bare rw is rejected', workflow.replace('--mount "type=bind,src=$workspace,dst=/workspace"', '--mount "type=bind,src=$workspace,dst=/workspace,rw"')],
  ['workspace default mode is accepted', workflow],
  ['cache readonly is accepted', workflow],
  ['harness readonly is accepted', workflow],
];
const mutationErrors = [];
const expectRejected = (label, mutated) => {
  if (validateWorkflow(mutated).length === 0) mutationErrors.push(label);
};
expectRejected('bare rw mutation', checks[0][1]);
expectRejected('cache readonly mutation', workflow.replace('--mount "type=bind,src=$cache,dst=/cache,readonly"', '--mount "type=bind,src=$cache,dst=/cache,rw"'));
expectRejected('missing negative marker mutation', workflow.replace('grep -Fq DEPENDENCY_CACHE_INCOMPLETE', 'grep -Fq MISSING_DEPENDENCY_CACHE_MARKER'));
expectRejected('missing task matrix entry mutation', workflow.replace('          - task_id: TASK-OSS-09\n', ''));
expectRejected('offline install mutation', workflow.replace('          node --input-type=module - "$input_root" "$artifact_root/cache-receipt.json" <<\'NODE\'', '          pnpm install\n          node --input-type=module - "$input_root" "$artifact_root/cache-receipt.json" <<\'NODE\''));
expectRejected('Immich preparation install outside sealed_root', workflow.replace('(\n                cd "$sealed_root"\n                pnpm install --frozen-lockfile --ignore-scripts\n                pnpm --filter @immich/sdk run build\n              )', 'pnpm install --frozen-lockfile --ignore-scripts\n              pnpm --filter @immich/sdk run build'));
expectRejected('Uptime Kuma preparation install outside sealed_root', workflow.replace('(\n                cd "$sealed_root"\n                npm ci --no-audit --no-fund\n              )', 'npm ci --no-audit --no-fund'));
expectRejected('Paperless preparation install outside sealed_root', workflow.replace('(\n                cd "$sealed_root"\n                uv sync --group testing\n              )', 'uv sync --group testing'));
expectRejected('Paperless preparation pytest uses global python', workflow.replace('"$sealed_root/.venv/bin/python" -m pytest -q src/paperless/tests/test_parser_utils.py', 'python -m pytest -q src/paperless/tests/test_parser_utils.py'));
expectRejected('Paperless offline pytest uses global python', workflow.replace('/cache/.venv/bin/python -m pytest -q src/paperless/tests/test_parser_utils.py', 'python -m pytest -q src/paperless/tests/test_parser_utils.py'));
expectRejected('missing TASK-OSS-09 runtime phase marker', workflow.replace('phase_mark "before-task-oss-09-runtime-version-checks"', 'phase_mark "missing-runtime-phase-marker"'));
expectRejected('brittle TASK-OSS-09 uv version check', workflow.replace("              test \"$(printf '%s\\n' \"$uv_version\" | awk '{print $1, $2}')\" = \"uv 0.11.8\"", '              test "$(uv --version)" = "uv 0.11.8"'));
expectRejected('missing preparation failure trap', workflow.replace("trap 'rc=$?; trap - ERR;", "trap 'rc=$?;"));

const allChecks = [
  ...checks.map(([label]) => label),
  'negative mutation tests',
];
const allErrors = [...errors, ...mutationErrors];
const result = { status: allErrors.length === 0 ? 'PASS' : 'FAIL', checks: allChecks.length, errors: allErrors };
console.log(JSON.stringify(result));
if (allErrors.length) process.exitCode = 1;
