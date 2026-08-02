import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const CANARY_INPUT = 'Return exactly the JSON object {"runtime_canary":"PASS"}.';
export const CANARY_OUTPUT = Object.freeze({ runtime_canary: 'PASS' });
export const MODEL_ID = 'gpt-5.6-luna';
export const REQUEST_PATH = '/v1/responses';
export const REQUEST_LIMIT = 1;
export const TIMEOUT_MS = 30_000;
export const MAX_RESPONSE_BYTES = 4_194_304;

const FIXED_RESPONSE_FORMAT = Object.freeze({
  type: 'json_schema',
  json_schema: Object.freeze({
    name: 'governseed_response',
    strict: true,
    schema: Object.freeze({
      type: 'object',
      additionalProperties: false,
      required: ['id', 'model', 'output', 'usage'],
      properties: Object.freeze({
        id: Object.freeze({ type: 'string' }),
        model: Object.freeze({ const: MODEL_ID }),
        output: Object.freeze({ type: 'array' }),
        usage: Object.freeze({ type: 'object' }),
      }),
    }),
  }),
});

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function isExactCanary(value) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 1
    && value.runtime_canary === 'PASS';
}

function textCandidates(response) {
  const candidates = [];
  if (typeof response?.output_text === 'string') candidates.push(response.output_text);
  for (const item of Array.isArray(response?.output) ? response.output : []) {
    if (typeof item?.text === 'string') candidates.push(item.text);
    if (typeof item?.output_text === 'string') candidates.push(item.output_text);
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (typeof content?.text === 'string') candidates.push(content.text);
      if (typeof content?.output_text === 'string') candidates.push(content.output_text);
    }
  }
  return candidates;
}

export function buildCanaryRequest({ benchmarkId, runId, taskId }) {
  for (const value of [benchmarkId, runId, taskId]) {
    if (typeof value !== 'string' || value.length === 0 || /[\0\r\n]/u.test(value)) {
      throw new Error('CANARY_CONTEXT_INVALID');
    }
  }
  return {
    model: MODEL_ID,
    input: CANARY_INPUT,
    max_output_tokens: 8192,
    response_format: FIXED_RESPONSE_FORMAT,
    metadata: {
      benchmark_id: benchmarkId,
      run_id: runId,
      task_id: taskId,
    },
  };
}

export function parseCanaryResponse(response) {
  for (const candidate of textCandidates(response)) {
    try {
      const parsed = JSON.parse(candidate);
      if (isExactCanary(parsed)) return { ...CANARY_OUTPUT };
    } catch {
      // A non-JSON response is rejected without retaining or printing it.
    }
  }
  return null;
}

export function sanitizeResponseMetadata({ statusCode, body, canaryAccepted }) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body ?? '');
  return {
    responseSha256: sha256(bytes),
    responseBytes: bytes.length,
    statusCode: Number.isInteger(statusCode) ? statusCode : null,
    canaryAccepted: canaryAccepted === true,
  };
}

function readBody(response) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    response.on('data', (chunk) => {
      const bytes = Buffer.from(chunk);
      size += bytes.length;
      if (size > MAX_RESPONSE_BYTES) {
        response.destroy();
        reject(new Error('CANARY_RESPONSE_TOO_LARGE'));
        return;
      }
      chunks.push(bytes);
    });
    response.once('end', () => resolve(Buffer.concat(chunks, size)));
    response.once('error', () => reject(new Error('CANARY_RESPONSE_INVALID')));
  });
}

function requestOnce(socketPath, body) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      socketPath,
      method: 'POST',
      path: REQUEST_PATH,
      agent: false,
      headers: {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
        connection: 'close',
      },
    }, async (response) => {
      try {
        const bytes = await readBody(response);
        let parsed = null;
        try {
          parsed = JSON.parse(bytes.toString('utf8'));
        } catch {
          parsed = null;
        }
        resolve({
          statusCode: response.statusCode ?? null,
          bytes,
          parsed,
        });
      } catch (error) {
        reject(error);
      }
    });
    request.setTimeout(TIMEOUT_MS, () => {
      request.destroy(new Error('CANARY_TIMEOUT'));
    });
    request.once('error', reject);
    request.end(body);
  });
}

export async function runCanary({ socketPath, benchmarkId, runId, taskId }) {
  if (typeof socketPath !== 'string' || !path.isAbsolute(socketPath)) {
    throw new Error('CANARY_SOCKET_INVALID');
  }
  const request = buildCanaryRequest({ benchmarkId, runId, taskId });
  const body = Buffer.from(JSON.stringify(request));
  const requestMetadata = {
    requestSha256: sha256(body),
    requestBytes: body.length,
  };
  const response = await requestOnce(socketPath, body);
  const canary = response.statusCode >= 200 && response.statusCode <= 299
    ? parseCanaryResponse(response.parsed)
    : null;
  return {
    ...requestMetadata,
    ...sanitizeResponseMetadata({
      statusCode: response.statusCode,
      body: response.bytes,
      canaryAccepted: canary !== null,
    }),
  };
}

async function main() {
  const required = ['GOVERNSEED_PROXY_SOCKET', 'GOVERNSEED_BENCHMARK_ID', 'GOVERNSEED_RUN_ID', 'GOVERNSEED_TASK_ID'];
  if (required.some((name) => typeof process.env[name] !== 'string' || process.env[name].length === 0)) {
    process.stdout.write(JSON.stringify({ canaryAccepted: false, errorCode: 'CANARY_CONTEXT_INVALID' }) + '\n');
    process.exitCode = 64;
    return;
  }
  try {
    const result = await runCanary({
      socketPath: process.env.GOVERNSEED_PROXY_SOCKET,
      benchmarkId: process.env.GOVERNSEED_BENCHMARK_ID,
      runId: process.env.GOVERNSEED_RUN_ID,
      taskId: process.env.GOVERNSEED_TASK_ID,
    });
    process.stdout.write(JSON.stringify(result) + '\n');
    process.exitCode = result.canaryAccepted === true ? 0 : 1;
  } catch {
    process.stdout.write(JSON.stringify({ canaryAccepted: false, errorCode: 'CANARY_TRANSPORT_FAILED' }) + '\n');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  await main();
}
