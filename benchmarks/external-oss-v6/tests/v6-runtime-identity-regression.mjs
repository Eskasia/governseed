import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const workflow = readFileSync(path.join(repoRoot, '.github/workflows/external-oss-v6-dependency-cache.yml'), 'utf8');
const errors = [];
const check = (condition, message) => { if (!condition) errors.push(message); };

const prepareStart = workflow.indexOf('  prepare-dependency-cache:');
const prepareEnd = workflow.indexOf('  diagnose-offline-permissions:', prepareStart);
const prepare = workflow.slice(prepareStart, prepareEnd);
const paperlessStart = prepare.indexOf('            TASK-OSS-09)');
const paperlessEnd = prepare.indexOf('            *) exit 2', paperlessStart);
const paperless = prepare.slice(paperlessStart, paperlessEnd);

check(prepare.includes('docker pull "$runtime_reference"'), 'runtime image is pulled before cache preparation');
check(prepare.includes('runtime_tag="governseed-v6-runtime:$TASK_ID"'), 'runtime image tag is defined before task branches');
check(paperless.includes('uv_binary=$(command -v uv)'), 'preparation resolves the public uv binary explicitly');
check(paperless.includes('--mount "type=bind,src=$sealed_root,dst=/workspace"'), 'sealed source is mounted into the preparation container');
check(paperless.includes('--mount "type=bind,src=$uv_binary,dst=/usr/local/bin/uv,readonly"'), 'uv preparation tool is readonly');
check(paperless.includes('--network bridge'), 'preparation network is explicit and separate from offline verification');
check(paperless.includes('/usr/local/bin/uv sync --group testing --directory /workspace'), 'uv sync runs inside the public runtime image');
check(paperless.includes('/workspace/.venv/bin/python -m pytest'), 'preparation smoke runs with the portable runtime path');
check(!paperless.includes('uv sync --group testing --directory "$sealed_root"'), 'host-created virtualenv is forbidden');
check(workflow.includes('/cache/.venv/bin/python -m pytest'), 'offline smoke uses the cache path only');

const result = {
  schemaVersion: 1,
  status: errors.length ? 'FAIL' : 'PASS',
  regression: 'python-runtime-image-identity',
  errors,
};
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
