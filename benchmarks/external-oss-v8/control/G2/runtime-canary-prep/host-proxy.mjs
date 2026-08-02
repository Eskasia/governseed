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

  let shuttingDown = false;
  const shutdown = async (exitCode) => {
    if (shuttingDown) return;
    shuttingDown = true;
    let cleanupObserved = false;
    try {
      await proxy.close();
      await proxy.proveSafe();
      cleanupObserved = true;
    } catch {
      cleanupObserved = false;
    }
    const record = {
      schemaVersion: 1,
      providerRequestCount: receipts.length,
      receipt: receipts.length === 1 ? receipts[0] : null,
      proxyCleanupObserved: cleanupObserved,
    };
    try {
      outputRecord(outputPath, record);
    } catch {
      exitCode = 1;
    }
    process.exitCode = exitCode;
  };

  process.once('SIGTERM', () => { void shutdown(0); });
  process.once('SIGINT', () => { void shutdown(0); });
  setInterval(() => {}, 60_000).unref?.();
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  try {
    await main();
  } catch {
    process.exitCode = 1;
  }
}
