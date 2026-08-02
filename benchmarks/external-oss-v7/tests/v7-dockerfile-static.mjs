import { readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../..');
const dockerfile = readFileSync(path.join(repoRoot, 'benchmarks/external-oss-v7/runtime-image/Dockerfile'), 'utf8');
const errors = [];
const require = (condition, message) => { if (!condition) errors.push(message); };
require(dockerfile.startsWith('ARG BASE_IMAGE\nFROM ${BASE_IMAGE}'), 'Dockerfile uses caller-supplied digest-locked base');
require((dockerfile.match(/apt-get install/gu) ?? []).length === 1, 'exactly one package-install operation');
require(dockerfile.includes('libmagic1 libmagic-mgc'), 'confirmed libmagic runtime and database packages');
require(dockerfile.includes('rm -rf /var/lib/apt/lists/*'), 'apt lists removed');
require(!dockerfile.includes('libmagic-dev'), 'development libmagic package forbidden');
require(!dockerfile.match(/curl|wget|git|npm|pip|uv/iu), 'network/download/dependency tooling forbidden in image');
require(dockerfile.includes('USER 65532:65532'), 'non-root image identity');
const result = { schemaVersion: 1, status: errors.length ? 'FAIL' : 'PASS', errors };
console.log(JSON.stringify(result));
if (errors.length) process.exitCode = 1;
