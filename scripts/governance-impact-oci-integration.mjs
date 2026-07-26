#!/usr/bin/env node

import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import nodeFs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BLOCKED_EXIT_CODE = 4;
export const FIXTURE_CODEX_VERSION = 'governance-impact-oci-fixture 1.0.0';

const DIGEST_REFERENCE = /^[^\s/@\0]+(?:\/[^\s/@\0]+)+@sha256:([a-f0-9]{64})$/u;
const SHA256_DIGEST = /^sha256:([a-f0-9]{64})$/u;
const FIXTURE_REPOSITORY = 'local.invalid/openai/governance-impact-oci-fixture';
const MAX_COMMAND_OUTPUT = 4 * 1024 * 1024;

function emitBlocked(stderr, code) {
  stderr.write(`${JSON.stringify({
    schemaVersion: 2,
    error: true,
    executionStatus: 'BLOCKED',
    claimDisposition: 'NOT_EVALUATED',
    phase: 'integration-preflight',
    code,
    exitCode: BLOCKED_EXIT_CODE,
  })}\n`);
  return BLOCKED_EXIT_CODE;
}

function emitCleanupFailClosed(stderr) {
  stderr.write(`${JSON.stringify({
    schemaVersion: 2,
    error: true,
    executionStatus: 'FAIL-CLOSED',
    claimDisposition: 'NOT_EVALUATED',
    phase: 'integration-cleanup',
    code: 'OCI_INTEGRATION_CLEANUP_UNCERTAIN',
    exitCode: 1,
  })}\n`);
  return 1;
}

function safeChildEnvironment(env, dockerConfig, tempRoot) {
  return {
    PATH: typeof env.PATH === 'string' && env.PATH.length > 0
      ? env.PATH
      : '/usr/local/bin:/usr/bin:/bin',
    LANG: 'C.UTF-8',
    LC_ALL: 'C.UTF-8',
    HOME: tempRoot,
    TMPDIR: tempRoot,
    DOCKER_CONFIG: dockerConfig,
  };
}

function command(spawnSync, executable, args, env) {
  try {
    return spawnSync(executable, args, {
      encoding: 'utf8',
      env,
      maxBuffer: MAX_COMMAND_OUTPUT,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch {
    return { status: null, stdout: '', stderr: '' };
  }
}

function runTestCommand(spawnSync, executable, args, env) {
  try {
    return spawnSync(executable, args, {
      env,
      shell: false,
      stdio: 'inherit',
    });
  } catch {
    return { status: null };
  }
}

function parseSingleInspect(result) {
  if (result?.status !== 0 || typeof result.stdout !== 'string') return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed) && parsed.length === 1 ? parsed[0] : null;
  } catch {
    return null;
  }
}

function nativeCgroupV2(fs) {
  try {
    if (!fs.existsSync('/sys/fs/cgroup/cgroup.controllers')) return false;
    const own = fs.readFileSync('/proc/self/cgroup', 'utf8');
    return String(own).split(/\r?\n/u).some((line) => line.startsWith('0::/'));
  } catch {
    return false;
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function requiredFixtureFiles(fs, fixtureRoot) {
  const dockerfile = path.join(fixtureRoot, 'Dockerfile');
  const codex = path.join(fixtureRoot, 'codex');
  if (!fs.existsSync(dockerfile) || !fs.existsSync(codex)) return null;
  try {
    return {
      codex,
      codexBytes: fs.readFileSync(codex),
      dockerfile,
    };
  } catch {
    return null;
  }
}

function validatedBuildMetadata(fs, metadataPath) {
  try {
    const value = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const image = SHA256_DIGEST.exec(value?.['containerimage.digest']);
    const config = SHA256_DIGEST.exec(value?.['containerimage.config.digest']);
    if (!image || !config) return null;
    return {
      configDigest: config[0],
      imageDigest: image[0],
    };
  } catch {
    return null;
  }
}

/**
 * Runs the explicit OCI integration wrapper and returns the process exit code.
 * Dependencies are injectable so preflight behavior is testable without Docker.
 */
export function runOciIntegration(options = {}) {
  const env = options.env ?? process.env;
  const fs = options.fs ?? nodeFs;
  const platform = options.platform ?? process.platform;
  const spawnSync = options.spawnSync ?? nodeSpawnSync;
  const stderr = options.stderr ?? process.stderr;
  const nodeExecutable = options.nodeExecutable ?? process.execPath;
  const repoRoot = options.repoRoot
    ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const dockerExecutable = options.dockerExecutable ?? 'docker';

  if (env.GOVERNANCE_IMPACT_OCI_INTEGRATION !== '1') {
    return emitBlocked(stderr, 'OCI_INTEGRATION_OPT_IN_REQUIRED');
  }
  if (platform !== 'linux') {
    return emitBlocked(stderr, 'OCI_INTEGRATION_PLATFORM_UNSUPPORTED');
  }
  if (!nativeCgroupV2(fs)) {
    return emitBlocked(stderr, 'OCI_INTEGRATION_CGROUP_V2_UNAVAILABLE');
  }

  const localTag = `${FIXTURE_REPOSITORY}:integration-${process.pid}`;
  let tempRoot;
  let dockerConfig;
  let metadataPath;
  let safeEnv;
  let built = false;
  let liveStatus = null;

  try {
    tempRoot = fs.mkdtempSync(
      path.join(options.tempRoot ?? os.tmpdir(), 'governance-impact-oci-integration-'),
    );
    dockerConfig = path.join(tempRoot, 'docker-config');
    metadataPath = path.join(tempRoot, 'build-metadata.json');
    safeEnv = safeChildEnvironment(env, dockerConfig, tempRoot);
    fs.mkdirSync?.(dockerConfig, { mode: 0o700, recursive: true });
    fs.writeFileSync(path.join(dockerConfig, 'config.json'), '{}\n', { mode: 0o600 });

    const dockerPrefix = ['--config', dockerConfig];
    const version = command(
      spawnSync,
      dockerExecutable,
      [...dockerPrefix, 'version', '--format', '{{.Server.Version}}'],
      safeEnv,
    );
    if (version.status !== 0) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_DOCKER_UNAVAILABLE');
    }

    const baseImage = env.GOVERNANCE_IMPACT_OCI_BASE_IMAGE;
    const baseMatch = DIGEST_REFERENCE.exec(baseImage ?? '');
    if (!baseMatch) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_BASE_PROVENANCE_REQUIRED');
    }

    const baseInspect = parseSingleInspect(command(
      spawnSync,
      dockerExecutable,
      [...dockerPrefix, 'image', 'inspect', baseImage],
      safeEnv,
    ));
    if (
      !baseInspect
      || !Array.isArray(baseInspect.RepoDigests)
      || !baseInspect.RepoDigests.includes(baseImage)
    ) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_BASE_IMAGE_UNAVAILABLE');
    }

    const fixtureRoot = path.join(
      repoRoot,
      'tests',
      'governance-impact',
      'fixtures',
      'oci',
    );
    const fixture = requiredFixtureFiles(fs, fixtureRoot);
    if (!fixture) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_FIXTURE_INVALID');
    }

    const build = command(
      spawnSync,
      dockerExecutable,
      [
        ...dockerPrefix,
        'buildx',
        'build',
        '--load',
        '--pull=false',
        '--network',
        'none',
        '--provenance=false',
        '--metadata-file',
        metadataPath,
        '--tag',
        localTag,
        '--build-arg',
        `BASE_IMAGE=${baseImage}`,
        fixtureRoot,
      ],
      safeEnv,
    );
    if (build.status !== 0) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_FIXTURE_BUILD_FAILED');
    }
    built = true;

    const metadata = validatedBuildMetadata(fs, metadataPath);
    if (!metadata) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_FIXTURE_PROVENANCE_UNAVAILABLE');
    }
    const imageReference = `${FIXTURE_REPOSITORY}@${metadata.imageDigest}`;
    const fixtureInspect = parseSingleInspect(command(
      spawnSync,
      dockerExecutable,
      [...dockerPrefix, 'image', 'inspect', metadata.configDigest],
      safeEnv,
    ));
    const labels = fixtureInspect?.Config?.Labels;
    if (
      !fixtureInspect
      || fixtureInspect.Id !== metadata.configDigest
      || !Array.isArray(fixtureInspect.RepoDigests)
      || !fixtureInspect.RepoDigests.includes(imageReference)
      || labels?.['org.openai.governance-impact.fixture'] !== 'true'
      || labels?.['org.openai.governance-impact.fixture.base'] !== baseImage
    ) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_FIXTURE_PROVENANCE_UNAVAILABLE');
    }

    const integrationTest = path.join(
      repoRoot,
      'tests',
      'governance-impact',
      'oci-integration.test.mjs',
    );
    const testResult = runTestCommand(
      spawnSync,
      nodeExecutable,
      ['--test', integrationTest],
      {
        ...safeEnv,
        GOVERNANCE_IMPACT_OCI_INTEGRATION_CHILD: '1',
        GOVERNANCE_IMPACT_OCI_IMAGE_REFERENCE: imageReference,
        GOVERNANCE_IMPACT_OCI_CODEX_VERSION: FIXTURE_CODEX_VERSION,
        GOVERNANCE_IMPACT_OCI_CODEX_BINARY_SHA256: sha256(fixture.codexBytes),
      },
    );
    if (!Number.isInteger(testResult.status)) {
      return emitBlocked(stderr, 'OCI_INTEGRATION_TEST_SPAWN_FAILED');
    }
    liveStatus = testResult.status;
    return testResult.status;
  } catch {
    return emitBlocked(stderr, 'OCI_INTEGRATION_PREFLIGHT_UNCERTAIN');
  } finally {
    let cleanupCertain = true;
    if (built) {
      const removed = command(
        spawnSync,
        dockerExecutable,
        ['--config', dockerConfig, 'image', 'rm', localTag],
        safeEnv,
      );
      if (removed.status !== 0) cleanupCertain = false;
      const remaining = command(
        spawnSync,
        dockerExecutable,
        [
          '--config',
          dockerConfig,
          'image',
          'ls',
          '--quiet',
          '--filter',
          `reference=${localTag}`,
        ],
        safeEnv,
      );
      if (remaining.status !== 0 || String(remaining.stdout ?? '').trim() !== '') {
        cleanupCertain = false;
      }
    }
    if (tempRoot) {
      try {
        fs.rmSync(tempRoot, { force: true, recursive: true });
        if (fs.existsSync(tempRoot)) cleanupCertain = false;
      } catch {
        cleanupCertain = false;
      }
    }
    if (liveStatus === 0 && !cleanupCertain) {
      return emitCleanupFailClosed(stderr);
    }
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = runOciIntegration();
}
