import { createHostCredentialProxy } from '../../../../../experimental/governance-impact/lib/credential-proxy.mjs';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MODEL_ID = 'gpt-5.6-luna';
export const BENCHMARK_ID = 'GS-OSS-2026-08-02-V8';
export const ENDPOINT = 'https://api.openai.com/v1/responses';
export const REQUEST_LIMIT = 1;
export const TIMEOUT_MS = 30_000;

const HASH_64 = /^[a-f0-9]{64}$/u;

export function sanitizeProxyReceipt(receipt) {
  if (
    !receipt
    || !HASH_64.test(receipt.requestSha256)
    || !HASH_64.test(receipt.responseSha256)
    || !Number.isSafeInteger(receipt.requestBytes)
    || !Number.isSafeInteger(receipt.responseBytes)
    || receipt.modelId !== MODEL_ID
    || !Number.isSafeInteger(receipt.statusCode)
    || receipt.statusCode < 200
    || receipt.statusCode > 299
    || !Number.isSafeInteger(receipt.latencyMs)
    || !receipt.tokenCounts
    || !Number.isSafeInteger(receipt.tokenCounts.input)
    || !Number.isSafeInteger(receipt.tokenCounts.output)
    || !Number.isSafeInteger(receipt.tokenCounts.total)
    || (receipt.providerRequestIdHash !== null && !HASH_64.test(receipt.providerRequestIdHash))
  ) {
    throw new Error('PROXY_RECEIPT_INVALID');
  }
  return {
    requestSha256: receipt.requestSha256,
    responseSha256: receipt.responseSha256,
    requestBytes: receipt.requestBytes,
    responseBytes: receipt.responseBytes,
    modelId: receipt.modelId,
    statusCode: receipt.statusCode,
    latencyMs: receipt.latencyMs,
    tokenCounts: {
      input: receipt.tokenCounts.input,
      output: receipt.tokenCounts.output,
      total: receipt.tokenCounts.total,
    },
    providerRequestIdHash: receipt.providerRequestIdHash,
  };
}

function requiredEnv(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/u.test(value)) {
    throw new Error('PROXY_CONTEXT_INVALID');
  }
  return value;
}

function outputRecord(outputPath, record) {
  writeFileSync(outputPath, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
}

export function createProxyRecordPersistence({
  proxy,
  receipts,
  outputPath,
  pollIntervalMs = 25,
  onComplete = () => {},
}) {
  let finalization = null;
  let watcher = null;

  const finalize = (requestedExitCode, closeProxy) => {
    if (finalization) return finalization;
    finalization = (async () => {
      if (watcher !== null) clearInterval(watcher);
      let exitCode = requestedExitCode;
      if (closeProxy) {
        try {
          await proxy.close();
        } catch {
          exitCode = 1;
        }
      }
      let summary;
      try {
        summary = proxy.getSummary();
      } catch {
        summary = {};
        exitCode = 1;
      }
      const providerRequestAttempt = summary.upstreamAttemptCount === 0
        ? 'NO'
        : summary.upstreamAttemptCount === 1
          ? 'YES'
          : 'INDETERMINATE';
      const record = {
        ...summary,
        providerRequestAttempt,
        receipt: receipts.length === 1 ? receipts[0] : null,
      };
      if (record.proxyCleanupObserved !== true) exitCode = 1;
      try {
        outputRecord(outputPath, record);
      } catch {
        exitCode = 1;
      }
      onComplete(exitCode);
      return exitCode;
    })();
    return finalization;
  };

  watcher = setInterval(() => {
    try {
      if (proxy.getSummary().proxyCleanupObserved === true) {
        void finalize(1, false);
      }
    } catch {
      // The explicit shutdown path remains responsible for fail-closed persistence.
    }
  }, pollIntervalMs);

  return Object.freeze({
    shutdown(exitCode) {
      return finalize(exitCode, true);
    },
  });
}

async function main() {
  const secret = requiredEnv('OPENAI_API_KEY');
  const socketPath = requiredEnv('PROXY_SOCKET');
  const outputPath = requiredEnv('PROXY_OUTPUT');
  const benchmarkId = requiredEnv('BENCHMARK_ID');
  const runId = requiredEnv('RUN_ID');
  const taskId = requiredEnv('TASK_ID');
  if (
    benchmarkId !== BENCHMARK_ID
    || !path.isAbsolute(socketPath)
    || !path.isAbsolute(outputPath)
  ) throw new Error('PROXY_CONTEXT_INVALID');

  const receipts = [];
  const proxy = createHostCredentialProxy({
    policy: {
      attemptId: `runtime-identity-${runId}`,
      benchmarkId,
      runId,
      taskId,
      provider: 'OpenAI',
      model: MODEL_ID,
      upstream: ENDPOINT,
      maxRequestBytes: 1_048_576,
      maxResponseBytes: 4_194_304,
      requestLimit: REQUEST_LIMIT,
      timeoutMs: TIMEOUT_MS,
      tokenCeiling: 8_192,
    },
    socketPath,
    socketOwnerUid: typeof process.getuid === 'function' ? process.getuid() : 0,
    socketOwnerGid: typeof process.getgid === 'function' ? process.getgid() : 0,
    socketMode: 0o600,
    upstreamKey: secret,
    receiptSink: (receipt) => receipts.push(sanitizeProxyReceipt(receipt)),
  });
  await proxy.start();

  const persistence = createProxyRecordPersistence({
    proxy,
    receipts,
    outputPath,
    onComplete(exitCode) {
      process.exitCode = exitCode;
    },
  });

  process.once('SIGTERM', () => { void persistence.shutdown(0); });
  process.once('SIGINT', () => { void persistence.shutdown(0); });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  try {
    await main();
  } catch {
    process.exitCode = 1;
  }
}
