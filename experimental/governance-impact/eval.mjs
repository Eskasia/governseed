#!/usr/bin/env node

// Live paired governance evaluator: the run and preflight subcommands.
// This entry is not part of the Core release unit. It imports the Core
// evaluator engine; Core never imports anything under experimental/.

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  sha256Canonical,
} from '../../scripts/lib/governance-impact-core.mjs';
import {
  buildCodexRuntimeCommand,
  resolveRuntimeExecutable,
  runtimeCapabilities,
} from '../../scripts/lib/governance-impact-adapters.mjs';
import {
  DEFAULT_RUN_TIMEOUT_MS,
  ensureSafeDirectoryChain,
  fail,
  isPlainObject,
  loadScenario,
  main as coreMain,
  normalizeAndVerifyManifest,
  persistJsonAtomically,
  readExactJson,
  readTrackedCommittedJson,
  REPOSITORY_ROOT,
  resolveRepositoryPath,
  runPairedScenario,
  verifyScenarioHashes,
  verifyTrackedScenario,
} from '../../scripts/governance-impact-eval.mjs';
import {
  createLinuxCodexOciSupervisor,
  OCI_RUNTIME_PATH,
} from './lib/oci-supervisor.mjs';
import {
  createOciCredentialProxyFacade,
} from './lib/oci-proxy-facade.mjs';
import {
  CREDENTIAL_PROXY_TIMEOUT_MS,
} from './lib/credential-proxy.mjs';

const HEX_64 = /^[a-f0-9]{64}$/;
const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
const OCI_RESPONSE_SCHEMA_PATH = '/run/governance/response.schema.json';

const PREFLIGHT_EVIDENCE_KEYS = Object.freeze([
  'observedImageDigest',
  'codexVersion',
  'codexBinarySha256',
  'containmentPolicyHash',
  'networkPolicyHash',
  'proxyPolicyHash',
  'hardening',
  'pidNamespaceStopped',
  'cgroupEmpty',
  'cleanupComplete',
]);
const PREFLIGHT_HARDENING_KEYS = Object.freeze([
  'nonRootUser',
  'readOnlyRootFilesystem',
  'capDropAll',
  'noNewPrivileges',
  'privatePidNamespace',
  'privateCgroupNamespace',
  'pidLimit',
  'cpuLimit',
  'memoryLimit',
  'dockerSocketAbsent',
  'devicesAbsent',
  'cgroupMountAbsent',
]);

function exactKeys(value, expected) {
  return isPlainObject(value)
    && Object.keys(value).length === expected.length
    && expected.every((key) => Object.hasOwn(value, key));
}

function createPreflightReceipt(options, result) {
  try {
    if (!exactKeys(result, ['executionBoundaryId', 'boundaryEvidence'])) {
      fail('OCI_PREFLIGHT_RECEIPT_INVALID');
    }
    const evidence = result.boundaryEvidence;
    const hardening = evidence?.hardening;
    const expectedDigest = options['runtime-image'].slice(
      options['runtime-image'].lastIndexOf(':') + 1,
    );
    if (
      !HEX_64.test(result.executionBoundaryId)
      || !exactKeys(evidence, PREFLIGHT_EVIDENCE_KEYS)
      || evidence.observedImageDigest !== expectedDigest
      || evidence.codexVersion !== options['codex-version']
      || evidence.codexBinarySha256 !== options['codex-binary-sha256']
      || !HEX_64.test(evidence.containmentPolicyHash)
      || !HEX_64.test(evidence.networkPolicyHash)
      || !HEX_64.test(evidence.proxyPolicyHash)
      || !exactKeys(hardening, PREFLIGHT_HARDENING_KEYS)
      || PREFLIGHT_HARDENING_KEYS.some((key) => hardening[key] !== true)
      || evidence.pidNamespaceStopped !== true
      || evidence.cgroupEmpty !== true
      || evidence.cleanupComplete !== true
    ) {
      fail('OCI_PREFLIGHT_RECEIPT_INVALID');
    }
    return {
      schemaVersion: 1,
      kind: 'governance-impact-oci-preflight',
      preflightStatus: 'READY',
      claimDisposition: 'NOT_EVALUATED',
      runtime: 'codex',
      model: options.model,
      timeoutMs: options['timeout-ms'],
      provenance: {
        imageReference: options['runtime-image'],
        expectedCodexVersion: options['codex-version'],
        expectedCodexBinarySha256: options['codex-binary-sha256'],
      },
      executionBoundaryId: result.executionBoundaryId,
      boundaryEvidence: {
        observedImageDigest: evidence.observedImageDigest,
        codexVersion: evidence.codexVersion,
        codexBinarySha256: evidence.codexBinarySha256,
        containmentPolicyHash: evidence.containmentPolicyHash,
        networkPolicyHash: evidence.networkPolicyHash,
        proxyPolicyHash: evidence.proxyPolicyHash,
        hardening: Object.fromEntries(
          PREFLIGHT_HARDENING_KEYS.map((key) => [key, true]),
        ),
        pidNamespaceStopped: true,
        cgroupEmpty: true,
        cleanupComplete: true,
      },
    };
  } catch (error) {
    if (error?.code === 'OCI_PREFLIGHT_RECEIPT_INVALID') throw error;
    fail('OCI_PREFLIGHT_RECEIPT_INVALID');
  }
}

function validateReviewedPreflightReceipt(receipt, expected) {
  let normalized;
  try {
    normalized = createPreflightReceipt({
      model: receipt?.model,
      'timeout-ms': receipt?.timeoutMs,
      'runtime-image': receipt?.provenance?.imageReference,
      'codex-version': receipt?.provenance?.expectedCodexVersion,
      'codex-binary-sha256':
        receipt?.provenance?.expectedCodexBinarySha256,
    }, {
      executionBoundaryId: receipt?.executionBoundaryId,
      boundaryEvidence: receipt?.boundaryEvidence,
    });
  } catch {
    fail('OCI_PREFLIGHT_RECEIPT_INVALID');
  }
  if (sha256Canonical(normalized) !== sha256Canonical(receipt)) {
    fail('OCI_PREFLIGHT_RECEIPT_INVALID');
  }
  if (
    receipt.model !== expected.model
    || receipt.timeoutMs !== expected.timeoutMs
    || receipt.provenance.imageReference !== expected.imageReference
    || receipt.provenance.expectedCodexVersion !== expected.codexVersion
    || receipt.provenance.expectedCodexBinarySha256
      !== expected.codexBinarySha256
    || receipt.executionBoundaryId !== expected.executionBoundaryId
  ) {
    fail('OCI_PREFLIGHT_RECEIPT_MISMATCH');
  }
  return normalized;
}

async function handlePreflight(options, deps) {
  const repositoryRoot = deps.repositoryRoot ?? REPOSITORY_ROOT;
  const outputPath = resolveRepositoryPath(options.output, repositoryRoot);
  ensureSafeDirectoryChain(
    repositoryRoot,
    path.dirname(outputPath),
    deps.fs ?? fs,
    'PATH_POLICY_BLOCKED',
  );
  const platform = deps.platform ?? process.platform;
  if (platform !== 'linux') fail('OCI_PLATFORM_UNSUPPORTED');
  const createProxy =
    deps.createOciProxyFacade ?? createOciCredentialProxyFacade;
  if (typeof createProxy !== 'function') fail('OCI_PROXY_UNAVAILABLE');
  const proxy = createProxy({
    model: options.model,
    timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
    benchmarkId: BENCHMARK_ID,
    runId: 'preflight',
    taskId: 'preflight',
  });
  const createSupervisor =
    deps.createOciSupervisor ?? createLinuxCodexOciSupervisor;
  const supervisor = createSupervisor({ platform, proxy });
  if (
    !supervisor
    || typeof supervisor.preflightAndReconcile !== 'function'
  ) {
    fail('SESSION_SAFETY_UNAVAILABLE');
  }
  const provenance = {
    imageReference: options['runtime-image'],
    expectedCodexVersion: options['codex-version'],
    expectedCodexBinarySha256: options['codex-binary-sha256'],
  };
  const result = await supervisor.preflightAndReconcile(provenance);
  const receipt = createPreflightReceipt(options, result);
  const persisted = await (deps.persistJsonAtomically ?? persistJsonAtomically)(
    outputPath,
    receipt,
    { repositoryRoot, fs: deps.fs },
  );
  return {
    artifact: {
      path: options.output,
      sha256: persisted.sha256,
    },
    summary: {
      preflightStatus: receipt.preflightStatus,
      claimDisposition: receipt.claimDisposition,
      executionBoundaryId: receipt.executionBoundaryId,
    },
  };
}

async function handleRun(options, deps) {
  const loaded = await loadScenario(options, deps);
  if (loaded.scenario.dataClassification !== 'synthetic') fail('DATA_CLASSIFICATION_BLOCKED');
  const trackedVerifier = deps.verifyTrackedScenario ?? verifyTrackedScenario;
  const trackingOptions = {
    repositoryRoot: loaded.repositoryRoot,
    gitRunner: deps.gitRunner,
    fs: deps.fs,
  };
  trackedVerifier(
    loaded.scenarioRoot,
    loaded.scenario,
    trackingOptions,
  );
  await verifyScenarioHashes(loaded.scenarioRoot, loaded.scenario, deps);
  trackedVerifier(loaded.scenarioRoot, loaded.scenario, trackingOptions);
  const reader = deps.readExactJson ?? readExactJson;
  const manifestPath = resolveRepositoryPath(
    options.manifest,
    loaded.repositoryRoot,
  );
  const policyPath = resolveRepositoryPath(
    options.policy,
    loaded.repositoryRoot,
  );
  let manifest = reader(manifestPath, {
    root: loaded.repositoryRoot,
  });
  let policy = reader(policyPath, {
    root: loaded.repositoryRoot,
  });
  let normalized = normalizeAndVerifyManifest(manifest, policy, {
    requirePolicyPin: true,
  });
  let attempt = normalized.manifest.attempts.find(
    (entry) => entry.attemptId === options['attempt-id'],
  );
  if (!attempt || attempt.scenarioHash !== loaded.scenarioHash) fail('MANIFEST_MISMATCH');
  const outputPath = resolveRepositoryPath(options.output, loaded.repositoryRoot);
  ensureSafeDirectoryChain(
    loaded.repositoryRoot,
    path.dirname(outputPath),
    deps.fs ?? fs,
    'PATH_POLICY_BLOCKED',
  );
  let runtime = normalized.manifest.cohort.runtime;
  const platform = deps.platform ?? process.platform;
  const sourceEnv = deps.env ?? process.env;
  const timeoutMs = options['timeout-ms'] ?? DEFAULT_RUN_TIMEOUT_MS;
  let executable;
  let codexHome;
  let runnerDeps = deps.runnerDeps ?? {};
  if (normalized.manifest.schemaVersion === 2) {
    if (runtime !== 'codex' || platform !== 'linux') fail('SESSION_SAFETY_UNAVAILABLE');
    if (
      !options['runtime-image'] ||
      !options['codex-version'] ||
      !options['codex-binary-sha256'] ||
      !options['preflight-receipt']
    ) {
      fail('MISSING_OPTION');
    }
    const receiptPath = resolveRepositoryPath(
      options['preflight-receipt'],
      loaded.repositoryRoot,
    );
    const readTrackedCommitted =
      deps.readTrackedCommittedJson ?? readTrackedCommittedJson;
    manifest = readTrackedCommitted(manifestPath, trackingOptions);
    policy = readTrackedCommitted(policyPath, trackingOptions);
    normalized = normalizeAndVerifyManifest(manifest, policy, {
      requirePolicyPin: true,
    });
    runtime = normalized.manifest.cohort.runtime;
    attempt = normalized.manifest.attempts.find(
      (entry) => entry.attemptId === options['attempt-id'],
    );
    if (!attempt || attempt.scenarioHash !== loaded.scenarioHash) fail('MANIFEST_MISMATCH');
    const reviewedReceipt = validateReviewedPreflightReceipt(
      readTrackedCommitted(receiptPath, trackingOptions),
      {
        model: normalized.manifest.cohort.model,
        timeoutMs,
        imageReference: options['runtime-image'],
        codexVersion: options['codex-version'],
        codexBinarySha256: options['codex-binary-sha256'],
        executionBoundaryId:
          normalized.manifest.cohort.executionBoundaryId,
      },
    );
    let credentialRead = false;
    let upstreamKey;
    const getUpstreamKey = () => {
      if (!credentialRead) {
        credentialRead = true;
        upstreamKey = sourceEnv.OPENAI_API_KEY;
      }
      return upstreamKey;
    };
    const proxy = (
      deps.createOciProxyFacade ?? createOciCredentialProxyFacade
    )({
      attemptId: attempt.attemptId,
      model: normalized.manifest.cohort.model,
      timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
      benchmarkId: BENCHMARK_ID,
      runId: attempt.attemptId,
      taskId: loaded.scenario.id,
      getUpstreamKey,
    });
    const supervisor = (
      deps.createOciSupervisor ?? createLinuxCodexOciSupervisor
    )({
      platform,
      proxy,
    });
    if (
      !supervisor ||
      typeof supervisor.preflightAndReconcile !== 'function' ||
      typeof supervisor.openArm !== 'function'
    ) {
      fail('SESSION_SAFETY_UNAVAILABLE');
    }
    const provenance = {
      imageReference: options['runtime-image'],
      expectedCodexVersion: options['codex-version'],
      expectedCodexBinarySha256: options['codex-binary-sha256'],
    };
    const preflight = await supervisor.preflightAndReconcile(provenance);
    if (
      preflight?.executionBoundaryId !==
      normalized.manifest.cohort.executionBoundaryId
      || !isPlainObject(preflight?.boundaryEvidence)
      || sha256Canonical(preflight?.boundaryEvidence)
        !== sha256Canonical(reviewedReceipt.boundaryEvidence)
    ) {
      fail('EXECUTION_BOUNDARY_MISMATCH');
    }
    const reviewedCredential = getUpstreamKey();
    if (
      typeof reviewedCredential !== 'string'
      || reviewedCredential.length === 0
      || reviewedCredential.includes('\0')
      || /[\r\n]/u.test(reviewedCredential)
    ) {
      fail('RUNTIME_CREDENTIAL_UNAVAILABLE');
    }
    runnerDeps = {
      ...runnerDeps,
      async openArmSession(context) {
        const command = buildCodexRuntimeCommand(
          '/workspace',
          context.taskFile,
          {
            executable: OCI_RUNTIME_PATH,
            model: context.cohort.model,
            responseSchema: OCI_RESPONSE_SCHEMA_PATH,
          },
        );
        return supervisor.openArm({
          arm: context.arm,
          attemptId: attempt.attemptId,
          benchmarkId: BENCHMARK_ID,
          runId: attempt.attemptId,
          taskId: loaded.scenario.id,
          command: {
            args: command.args,
            stdin: command.stdin,
          },
          responseSchema: context.responseSchema,
          timeoutMs: context.timeoutMs,
          workspace: context.armPaths.workspace,
        });
      },
    };
  } else {
    executable = (deps.resolveRuntimeExecutable ?? resolveRuntimeExecutable)(
      runtime,
      sourceEnv,
      platform,
      deps.fs ?? fs,
    );
    if (!executable) fail('RUNTIME_MISSING');
    const capabilities = (deps.runtimeCapabilities ?? runtimeCapabilities)(
      runtime,
      platform,
    );
    if (
      !capabilities.noSessionPersistence ||
      !capabilities.workspaceOnly ||
      !capabilities.processTree
    ) {
      fail('SESSION_SAFETY_UNAVAILABLE');
    }
    codexHome = runtime === 'codex' ? sourceEnv.CODEX_HOME : undefined;
    if (runtime === 'codex') {
      const sourceHome = sourceEnv.HOME;
      if (
        !path.isAbsolute(codexHome ?? '') ||
        (sourceHome && path.resolve(codexHome) === path.resolve(sourceHome, '.codex'))
      ) {
        fail('SESSION_SAFETY_UNAVAILABLE');
      }
      try {
        const state = (deps.fs ?? fs).lstatSync(codexHome);
        if (!state.isDirectory() || state.isSymbolicLink()) {
          fail('SESSION_SAFETY_UNAVAILABLE');
        }
      } catch {
        fail('SESSION_SAFETY_UNAVAILABLE');
      }
    }
  }
  const response = await (deps.runPairedScenario ?? runPairedScenario)({
    scenario: loaded.scenario,
    scenarioRoot: loaded.scenarioRoot,
    manifest: normalized.manifest,
    policy,
    attemptId: attempt.attemptId,
    outputPath,
    executable,
    codexHome,
    timeoutMs,
    sourceEnv,
    platform,
    repositoryRoot: loaded.repositoryRoot,
    deps: runnerDeps,
  });
  const serialized = JSON.stringify(response.rawRun) + '\n';
  return {
    artifact: {
      path: options.output,
      sha256: createHash('sha256').update(serialized).digest('hex'),
    },
    summary: {
      attemptId: response.scored.attemptId,
      scenarioHash: response.scored.scenarioHash,
      armOrder: response.armOrder,
      deliveryPass:
        response.scored.arms.baseline.deliveryPass &&
        response.scored.arms.governed.deliveryPass,
      winner: response.scored.comparison.winner,
    },
  };
}

export async function main(argv = process.argv.slice(2), io = {}, deps = {}) {
  return coreMain(argv, io, {
    ...deps,
    commandHandlers: {
      preflight: handlePreflight,
      run: handleRun,
      ...(deps.commandHandlers ?? {}),
    },
  });
}

const isEntrypoint =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;
if (isEntrypoint) {
  process.exitCode = await main();
}
