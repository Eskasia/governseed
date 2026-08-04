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
export const CANARY_ENVIRONMENT_NAMES = Object.freeze([
  'GOVERNSEED_BENCHMARK_ID',
  'GOVERNSEED_PROXY_SOCKET',
  'GOVERNSEED_RUN_ID',
  'GOVERNSEED_TASK_ID',
]);

export const CANARY_FAILURE_STAGES = Object.freeze([
  'container-environment-validation',
  'uds-connect',
  'proxy-request-validation',
  'provider-response-validation',
  'canary-output-validation',
]);

export const CANARY_FAILURE_CODES = Object.freeze([
  'CANARY_CONTAINER_START_FAILED',
  'CANARY_CONTAINER_EXIT_NONZERO',
  'CANARY_ENVIRONMENT_INVALID',
  'CANARY_CONTEXT_INVALID',
  'CANARY_SOCKET_CONNECT_FAILED',
  'CANARY_SOCKET_PERMISSION_DENIED',
  'CANARY_PROXY_RESPONSE_NON_2XX',
  'CANARY_PROXY_RESPONSE_INVALID',
  'CANARY_UPSTREAM_ATTEMPTED_NO_RESPONSE',
  'CANARY_UPSTREAM_NON_2XX',
  'CANARY_PROVIDER_RESPONSE_INVALID',
  'CANARY_MODEL_ID_MISMATCH',
  'CANARY_OUTPUT_INVALID',
  'CANARY_TIMEOUT',
  'CANARY_UNEXPECTED_RUNTIME_ERROR',
]);

export const CANARY_TEXT_FORMAT = Object.freeze({
  type: 'json_schema',
  name: 'governseed_runtime_canary',
  strict: true,
  schema: Object.freeze({
    type: 'object',
    additionalProperties: false,
    required: ['runtime_canary'],
    properties: Object.freeze({
      runtime_canary: Object.freeze({ type: 'string', enum: ['PASS'] }),
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

function isExactObject(value, fields) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === fields.slice().sort().join(',');
}

export function validateNormalizedProxyResponse(response) {
  if (!isExactObject(response, ['model', 'output_text', 'usage'])) return false;
  if (
    response.model !== MODEL_ID
    || typeof response.output_text !== 'string'
    || response.output_text.length === 0
    || !isExactObject(response.usage, ['input_tokens', 'output_tokens', 'total_tokens'])
  ) return false;
  const usageValues = [
    response.usage.input_tokens,
    response.usage.output_tokens,
    response.usage.total_tokens,
  ];
  if (usageValues.some((value) => !Number.isSafeInteger(value) || value < 0)) return false;
  return response.usage.total_tokens <= 8_192;
}

export const validateResponseEnvelope = validateNormalizedProxyResponse;

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
    text: {
      format: CANARY_TEXT_FORMAT,
    },
    metadata: {
      benchmark_id: benchmarkId,
      run_id: runId,
      task_id: taskId,
    },
  };
}

export function parseCanaryResponse(response) {
  if (!validateNormalizedProxyResponse(response)) return null;
  try {
    const parsed = JSON.parse(response.output_text);
    if (isExactCanary(parsed)) return { ...CANARY_OUTPUT };
  } catch {
    // A non-JSON response is rejected without retaining or printing it.
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

export function scrubbedEnvironmentNames(environment = process.env) {
  const names = Object.keys(environment).sort();
  const expected = CANARY_ENVIRONMENT_NAMES.slice().sort();
  if (names.join(',') !== expected.join(',')) {
    throw new Error('CANARY_ENVIRONMENT_INVALID');
  }
  return CANARY_ENVIRONMENT_NAMES.slice();
}

function canaryResult({
  canaryAccepted = false,
  failureStage = null,
  errorCode = null,
  requestConstructed = false,
  proxyResponseObserved = false,
  statusCode = null,
  responseModelId = null,
  responseEnvelopeValid = false,
  normalizedResponseValid = false,
  udsConnection = 'NOT_OBSERVED',
  environmentVariableNames = CANARY_ENVIRONMENT_NAMES,
}) {
  return {
    schemaVersion: 1,
    canaryAccepted: canaryAccepted === true,
    failureStage,
    errorCode,
    environmentVariableNames: [...environmentVariableNames],
    requestConstructed: requestConstructed === true,
    proxyResponseObserved: proxyResponseObserved === true,
    statusCode: Number.isInteger(statusCode) ? statusCode : null,
    responseModelId: typeof responseModelId === 'string' ? responseModelId : null,
    responseEnvelopeValid: responseEnvelopeValid === true,
    normalizedResponseValid: normalizedResponseValid === true,
    udsConnection,
  };
}

function safeErrorCode(error) {
  if (error?.code === 'EACCES' || error?.errno === -13) {
    return 'CANARY_SOCKET_PERMISSION_DENIED';
  }
  if (
    error?.code === 'ENOENT'
    || error?.code === 'ECONNREFUSED'
    || error?.code === 'ECONNRESET'
    || error?.errno === -2
    || error?.errno === -111
    || error?.errno === -104
  ) {
    return 'CANARY_SOCKET_CONNECT_FAILED';
  }
  if (error?.message === 'CANARY_TIMEOUT' || error?.code === 'CANARY_TIMEOUT') {
    return 'CANARY_TIMEOUT';
  }
  if (error?.message === 'CANARY_RESPONSE_TOO_LARGE') return 'CANARY_PROXY_RESPONSE_INVALID';
  if (error?.message === 'CANARY_RESPONSE_INVALID') return 'CANARY_PROXY_RESPONSE_INVALID';
  return 'CANARY_UNEXPECTED_RUNTIME_ERROR';
}

export const classifyCanaryTransportError = safeErrorCode;

function normalizedShape(response) {
  if (!isExactObject(response, ['model', 'output_text', 'usage'])) return false;
  if (
    typeof response.model !== 'string'
    || typeof response.output_text !== 'string'
    || response.output_text.length === 0
    || !isExactObject(response.usage, ['input_tokens', 'output_tokens', 'total_tokens'])
  ) return false;
  return [
    response.usage.input_tokens,
    response.usage.output_tokens,
    response.usage.total_tokens,
  ].every((value) => Number.isSafeInteger(value) && value >= 0);
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
    return canaryResult({
      failureStage: 'uds-connect',
      errorCode: 'CANARY_SOCKET_CONNECT_FAILED',
      requestConstructed: false,
      udsConnection: 'FAIL',
    });
  }
  let request;
  try {
    request = buildCanaryRequest({ benchmarkId, runId, taskId });
  } catch {
    return canaryResult({
      failureStage: 'container-environment-validation',
      errorCode: 'CANARY_CONTEXT_INVALID',
    });
  }
  const body = Buffer.from(JSON.stringify(request));
  const requestMetadata = {
    requestSha256: sha256(body),
    requestBytes: body.length,
  };
  let response;
  try {
    response = await requestOnce(socketPath, body);
  } catch (error) {
    const errorCode = safeErrorCode(error);
    return canaryResult({
      failureStage: 'uds-connect',
      errorCode,
      requestConstructed: true,
      udsConnection: 'FAIL',
    });
  }

  const statusCode = Number.isInteger(response.statusCode) ? response.statusCode : null;
  const proxyResponseObserved = true;
  if (statusCode === null || statusCode < 200 || statusCode > 299) {
    const proxyCode = response.parsed?.error?.code;
    const errorCode = proxyCode === 'PROXY_RESPONSE_INVALID'
      || proxyCode === 'PROXY_RESPONSE_TOO_LARGE'
      || proxyCode === 'PROXY_RECEIPT_FAILED'
      ? 'CANARY_PROVIDER_RESPONSE_INVALID'
      : proxyCode === 'PROXY_UPSTREAM_FAILED'
        ? 'CANARY_UPSTREAM_NON_2XX'
      : 'CANARY_PROXY_RESPONSE_NON_2XX';
    return canaryResult({
      failureStage: errorCode === 'CANARY_PROVIDER_RESPONSE_INVALID'
        ? 'provider-response-validation'
        : errorCode === 'CANARY_UPSTREAM_NON_2XX'
          ? 'upstream-request'
          : 'proxy-request-validation',
      errorCode,
      requestConstructed: true,
      proxyResponseObserved,
      statusCode,
      udsConnection: 'PASS',
    });
  }

  const envelopeValid = normalizedShape(response.parsed);
  const responseModelId = typeof response.parsed?.model === 'string'
    ? response.parsed.model
    : null;
  if (!envelopeValid) {
    return canaryResult({
      failureStage: 'provider-response-validation',
      errorCode: 'CANARY_PROVIDER_RESPONSE_INVALID',
      requestConstructed: true,
      proxyResponseObserved,
      statusCode,
      responseModelId,
      udsConnection: 'PASS',
    });
  }

  const normalizedResponseValid = validateNormalizedProxyResponse(response.parsed);
  if (response.parsed.model !== MODEL_ID) {
    return canaryResult({
      failureStage: 'provider-response-validation',
      errorCode: 'CANARY_MODEL_ID_MISMATCH',
      requestConstructed: true,
      proxyResponseObserved,
      statusCode,
      responseModelId,
      responseEnvelopeValid: true,
      udsConnection: 'PASS',
    });
  }
  if (!normalizedResponseValid) {
    return canaryResult({
      failureStage: 'provider-response-validation',
      errorCode: 'CANARY_PROXY_RESPONSE_INVALID',
      requestConstructed: true,
      proxyResponseObserved,
      statusCode,
      responseModelId,
      responseEnvelopeValid: true,
      udsConnection: 'PASS',
    });
  }

  const canary = parseCanaryResponse(response.parsed);
  const result = canaryResult({
    canaryAccepted: canary !== null,
    failureStage: canary === null ? 'canary-output-validation' : null,
    errorCode: canary === null ? 'CANARY_OUTPUT_INVALID' : null,
    requestConstructed: true,
    proxyResponseObserved,
    statusCode,
    responseModelId,
    responseEnvelopeValid: true,
    normalizedResponseValid: true,
    udsConnection: 'PASS',
  });
  if (canary === null) return result;
  return {
    ...result,
    ...requestMetadata,
    ...sanitizeResponseMetadata({
      statusCode: response.statusCode,
      body: response.bytes,
      canaryAccepted: true,
    }),
  };
}

async function main() {
  let environmentVariableNames;
  try {
    environmentVariableNames = scrubbedEnvironmentNames();
  } catch {
    process.stdout.write(JSON.stringify(canaryResult({
      failureStage: 'container-environment-validation',
      errorCode: 'CANARY_ENVIRONMENT_INVALID',
    })) + '\n');
    process.exitCode = 64;
    return;
  }
  const required = CANARY_ENVIRONMENT_NAMES;
  if (required.some((name) => typeof process.env[name] !== 'string' || process.env[name].length === 0)) {
    process.stdout.write(JSON.stringify(canaryResult({
      failureStage: 'container-environment-validation',
      errorCode: 'CANARY_CONTEXT_INVALID',
      environmentVariableNames,
    })) + '\n');
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
    process.stdout.write(JSON.stringify({ ...result, environmentVariableNames }) + '\n');
    process.exitCode = result.canaryAccepted === true ? 0 : 1;
  } catch {
    process.stdout.write(JSON.stringify(canaryResult({
      failureStage: 'uds-connect',
      errorCode: 'CANARY_UNEXPECTED_RUNTIME_ERROR',
      requestConstructed: true,
      udsConnection: 'FAIL',
      environmentVariableNames,
    })) + '\n');
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  await main();
}
