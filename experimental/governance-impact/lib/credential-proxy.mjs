import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { createServer as createNodeServer } from 'node:http';
import path from 'node:path';

export const CREDENTIAL_PROXY_PATH = '/v1/responses';
export const CREDENTIAL_PROXY_PROVIDER = 'OpenAI';
export const CREDENTIAL_PROXY_ENDPOINT = 'https://api.openai.com/v1/responses';
export const CREDENTIAL_PROXY_MODEL = 'gpt-5.6-luna';
export const CREDENTIAL_PROXY_REQUEST_LIMIT = 1;
export const CREDENTIAL_PROXY_TIMEOUT_MS = 30_000;
export const CREDENTIAL_PROXY_TOKEN_CEILING = 8_192;

const CREDENTIAL_PROXY_METHOD = 'POST';
const REQUEST_FIELDS = Object.freeze([
  'model',
  'input',
  'max_output_tokens',
  'text',
  'metadata',
]);
const REQUEST_METADATA_FIELDS = Object.freeze([
  'benchmark_id',
  'run_id',
  'task_id',
]);
const RESPONSE_FIELDS = Object.freeze(['id', 'model', 'output', 'usage']);
const RESPONSE_USAGE_FIELDS = Object.freeze([
  'input_tokens',
  'output_tokens',
  'total_tokens',
]);
const FIXED_TEXT_FORMAT = Object.freeze({
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
const POLICY_KEYS = new Set([
  'attemptId',
  'benchmarkId',
  'runId',
  'taskId',
  'provider',
  'model',
  'upstream',
  'maxRequestBytes',
  'maxResponseBytes',
  'requestLimit',
  'timeoutMs',
  'tokenCeiling',
]);

const STATUS_BY_CODE = Object.freeze({
  PROXY_AUTH_REJECTED: 401,
  PROXY_ATTEMPT_REJECTED: 403,
  PROXY_METHOD_REJECTED: 405,
  PROXY_PATH_REJECTED: 404,
  PROXY_CONTENT_TYPE_REJECTED: 415,
  PROXY_HEADER_REJECTED: 400,
  PROXY_REQUEST_TOO_LARGE: 413,
  PROXY_BODY_INVALID: 400,
  PROXY_BODY_MISMATCH: 400,
  PROXY_REQUEST_QUOTA_EXCEEDED: 429,
  PROXY_DEADLINE_EXCEEDED: 408,
  PROXY_CONCURRENCY_EXCEEDED: 429,
  PROXY_UPSTREAM_FAILED: 502,
  PROXY_RESPONSE_INVALID: 502,
  PROXY_RESPONSE_TOO_LARGE: 502,
  PROXY_RECEIPT_FAILED: 502,
  PROXY_CLOSED: 503,
});

const defaultFs = Object.freeze({
  chmod: (value, mode) => fs.promises.chmod(value, mode),
  lstat: (value) => fs.promises.lstat(value),
  unlink: (value) => fs.promises.unlink(value),
});

const defaultClock = Object.freeze({
  now: () => Date.now(),
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: (timer) => clearTimeout(timer),
});

export class CredentialProxyError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CredentialProxyError';
    this.code = code;
  }
}

function fail(code) {
  throw new CredentialProxyError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requireClosedToken(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 8_192
    || value.includes('\0')
    || /[\r\n]/u.test(value)
  ) {
    fail('PROXY_POLICY_INVALID');
  }
  return value;
}

function requirePositiveInteger(value) {
  if (!Number.isSafeInteger(value) || value <= 0) fail('PROXY_POLICY_INVALID');
  return value;
}

function normalizeUpstream(value) {
  requireClosedToken(value);
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    fail('PROXY_POLICY_INVALID');
  }
  if (
    parsed.protocol !== 'https:'
    || parsed.hostname !== 'api.openai.com'
    || parsed.port !== ''
    || parsed.username !== ''
    || parsed.password !== ''
    || parsed.search !== ''
    || parsed.hash !== ''
    || parsed.pathname !== CREDENTIAL_PROXY_PATH
  ) {
    fail('PROXY_POLICY_INVALID');
  }
  return parsed.href;
}

function normalizePolicy(value) {
  if (!isPlainObject(value)) fail('PROXY_POLICY_INVALID');
  let keys;
  try {
    keys = Object.keys(value);
  } catch {
    fail('PROXY_POLICY_INVALID');
  }
  if (keys.some((key) => !POLICY_KEYS.has(key)) || keys.length !== POLICY_KEYS.size) {
    fail('PROXY_POLICY_INVALID');
  }
  try {
    return Object.freeze({
      attemptId: requireClosedToken(value.attemptId),
      benchmarkId: requireClosedToken(value.benchmarkId),
      runId: requireClosedToken(value.runId),
      taskId: requireClosedToken(value.taskId),
      provider: value.provider === CREDENTIAL_PROXY_PROVIDER
        ? CREDENTIAL_PROXY_PROVIDER
        : fail('PROXY_POLICY_INVALID'),
      model: (() => {
        const normalized = requireClosedToken(value.model);
        if (normalized !== CREDENTIAL_PROXY_MODEL) {
          fail('PROXY_POLICY_INVALID');
        }
        return normalized;
      })(),
      upstream: normalizeUpstream(value.upstream),
      maxRequestBytes: requirePositiveInteger(value.maxRequestBytes),
      maxResponseBytes: requirePositiveInteger(value.maxResponseBytes),
      requestLimit: value.requestLimit === CREDENTIAL_PROXY_REQUEST_LIMIT
        ? CREDENTIAL_PROXY_REQUEST_LIMIT
        : fail('PROXY_POLICY_INVALID'),
      timeoutMs: value.timeoutMs === CREDENTIAL_PROXY_TIMEOUT_MS
        ? CREDENTIAL_PROXY_TIMEOUT_MS
        : fail('PROXY_POLICY_INVALID'),
      tokenCeiling: value.tokenCeiling === CREDENTIAL_PROXY_TOKEN_CEILING
        ? CREDENTIAL_PROXY_TOKEN_CEILING
        : fail('PROXY_POLICY_INVALID'),
    });
  } catch (error) {
    if (error instanceof CredentialProxyError) throw error;
    fail('PROXY_POLICY_INVALID');
  }
}

function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  )).join(',')}}`;
}

function durablePolicyDescriptor(policy) {
  return Object.freeze({
    schemaVersion: 3,
    provider: CREDENTIAL_PROXY_PROVIDER,
    method: CREDENTIAL_PROXY_METHOD,
    path: CREDENTIAL_PROXY_PATH,
    model: policy.model,
    upstream: policy.upstream,
    maxRequestBytes: policy.maxRequestBytes,
    maxResponseBytes: policy.maxResponseBytes,
    requestLimit: CREDENTIAL_PROXY_REQUEST_LIMIT,
    timeoutMs: CREDENTIAL_PROXY_TIMEOUT_MS,
    tokenCeiling: CREDENTIAL_PROXY_TOKEN_CEILING,
    maxConcurrency: 1,
    request: Object.freeze({
      allowedFields: Object.freeze([...REQUEST_FIELDS]),
      metadataFields: Object.freeze([...REQUEST_METADATA_FIELDS]),
      fixedTextFormat: FIXED_TEXT_FORMAT,
      forwardedHeaders: Object.freeze([
        'accept',
        'authorization',
        'content-type',
      ]),
      rejectedClientHeaders: Object.freeze([
        'authorization',
        'openai-organization',
        'openai-project',
        'host',
        'content-length',
        'x-*',
      ]),
    }),
    identityBinding: Object.freeze({
      benchmarkId: true,
      runId: true,
      taskId: true,
      singleUse: true,
    }),
    response: Object.freeze({
      allowedFields: Object.freeze([...RESPONSE_FIELDS]),
      usageFields: Object.freeze([...RESPONSE_USAGE_FIELDS]),
      contentType: 'application/json',
      successStatus: '2xx',
    }),
  });
}

export function describeCredentialProxyPolicy(value) {
  return durablePolicyDescriptor(normalizePolicy(value));
}

function hashNormalizedPolicy(policy) {
  return createHash('sha256')
    .update('governance-impact-credential-proxy-policy-v3\0')
    .update(canonicalJson(durablePolicyDescriptor(policy)))
    .digest('hex');
}

export function hashCredentialProxyPolicy(value) {
  return hashNormalizedPolicy(normalizePolicy(value));
}

function requireSecret(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > 8_192
    || value.includes('\0')
    || /[\r\n]/u.test(value)
  ) {
    fail('PROXY_SECRET_INVALID');
  }
  return value;
}

function normalizeSocketPath(value) {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.includes('\0')
    || !path.isAbsolute(value)
  ) {
    fail('PROXY_SOCKET_PATH_INVALID');
  }
  return value;
}

function requireFunction(value) {
  if (typeof value !== 'function') fail('PROXY_DEPENDENCY_INVALID');
  return value;
}

function normalizeDependencies(value = {}) {
  if (!isPlainObject(value)) fail('PROXY_DEPENDENCY_INVALID');
  const fsApi = value.fs ?? defaultFs;
  const clock = value.clock ?? defaultClock;
  return Object.freeze({
    createServer: requireFunction(value.createServer ?? createNodeServer),
    fs: Object.freeze({
      chmod: requireFunction(fsApi?.chmod),
      lstat: requireFunction(fsApi?.lstat),
      unlink: requireFunction(fsApi?.unlink),
    }),
    clock: Object.freeze({
      now: requireFunction(clock?.now),
      setTimeout: requireFunction(clock?.setTimeout),
      clearTimeout: requireFunction(clock?.clearTimeout),
    }),
    upstreamTransport: requireFunction(value.upstreamTransport ?? defaultUpstreamTransport),
  });
}

async function defaultUpstreamTransport(request) {
  const response = await fetch(request.url, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    signal: request.signal,
    redirect: 'error',
  });
  return {
    statusCode: response.status,
    headers: response.headers,
    body: response.body,
  };
}

function singleHeader(request, name) {
  const matches = [];
  if (Array.isArray(request.rawHeaders)) {
    for (let index = 0; index < request.rawHeaders.length; index += 2) {
      if (String(request.rawHeaders[index]).toLowerCase() === name) {
        matches.push(request.rawHeaders[index + 1]);
      }
    }
  }
  if (matches.length === 0 && request.headers?.[name] !== undefined) {
    const fallback = request.headers[name];
    if (Array.isArray(fallback)) matches.push(...fallback);
    else matches.push(fallback);
  }
  return matches.length === 1 && typeof matches[0] === 'string' ? matches[0] : null;
}

function assertRequestHeaders(request, policy) {
  if (request.method !== CREDENTIAL_PROXY_METHOD) fail('PROXY_METHOD_REJECTED');
  if (request.url !== CREDENTIAL_PROXY_PATH) fail('PROXY_PATH_REJECTED');

  const rawHeaders = Array.isArray(request.rawHeaders)
    ? request.rawHeaders
    : Object.entries(request.headers ?? {}).flat();
  for (let index = 0; index < rawHeaders.length; index += 2) {
    const name = String(rawHeaders[index]).toLowerCase();
    if (
      name === 'authorization'
      || name === 'openai-organization'
      || name === 'openai-project'
      || name.startsWith('x-')
      || !new Set(['content-type', 'host', 'content-length', 'connection']).has(name)
    ) {
      fail('PROXY_HEADER_REJECTED');
    }
  }
  const contentType = singleHeader(request, 'content-type');
  if (contentType?.toLowerCase() !== 'application/json') {
    fail('PROXY_CONTENT_TYPE_REJECTED');
  }

  const contentLength = singleHeader(request, 'content-length');
  if (contentLength !== null) {
    if (!/^(?:0|[1-9][0-9]*)$/u.test(contentLength)) fail('PROXY_BODY_INVALID');
    const parsedLength = Number(contentLength);
    if (!Number.isSafeInteger(parsedLength)) fail('PROXY_BODY_INVALID');
    if (parsedLength > policy.maxRequestBytes) fail('PROXY_REQUEST_TOO_LARGE');
  }
}

async function readRequestBody(request, limit, signal) {
  const chunks = [];
  let total = 0;
  let tooLarge = false;
  const onAbort = () => {
    try {
      request.destroy?.();
    } catch {
      // The request is already unusable; the controller owns the error code.
    }
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  try {
    for await (const chunk of request) {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > limit) {
        tooLarge = true;
        chunks.length = 0;
      } else if (!tooLarge) {
        chunks.push(bytes);
      }
    }
  } catch {
    if (!signal?.aborted) fail('PROXY_BODY_INVALID');
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
  if (tooLarge) fail('PROXY_REQUEST_TOO_LARGE');
  return Buffer.concat(chunks, total);
}

function validateInput(value) {
  const pending = [value];
  while (pending.length > 0) {
    const current = pending.pop();
    if (Array.isArray(current)) {
      pending.push(...current);
      continue;
    }
    if (!isPlainObject(current)) {
      if (typeof current === 'string' && /^https?:\/\//iu.test(current)) {
        fail('PROXY_BODY_MISMATCH');
      }
      continue;
    }
    for (const [key, nested] of Object.entries(current)) {
      if (
        (key === 'url' || key.endsWith('_url') || key.endsWith('_uri'))
        && typeof nested === 'string'
      ) {
        fail('PROXY_BODY_MISMATCH');
      }
      if (nested !== null && typeof nested === 'object') pending.push(nested);
      if (typeof nested === 'string' && /^https?:\/\//iu.test(nested)) {
        fail('PROXY_BODY_MISMATCH');
      }
    }
  }
}

function validateBody(bytes, policy) {
  let body;
  try {
    body = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('PROXY_BODY_INVALID');
  }
  if (!isPlainObject(body)) fail('PROXY_BODY_INVALID');
  if (Object.keys(body).sort().join(',') !== REQUEST_FIELDS.slice().sort().join(',')) {
    fail('PROXY_BODY_MISMATCH');
  }
  if (body.model !== policy.model) fail('PROXY_BODY_MISMATCH');
  if (body.max_output_tokens !== policy.tokenCeiling) {
    fail('PROXY_BODY_MISMATCH');
  }
  if (
    !isPlainObject(body.text)
    || Object.keys(body.text).sort().join(',') !== 'format'
    || canonicalJson(body.text.format) !== canonicalJson(FIXED_TEXT_FORMAT)
  ) {
    fail('PROXY_BODY_MISMATCH');
  }
  if (!isPlainObject(body.metadata)) fail('PROXY_BODY_MISMATCH');
  if (
    Object.keys(body.metadata).sort().join(',')
      !== REQUEST_METADATA_FIELDS.slice().sort().join(',')
    || body.metadata.benchmark_id !== policy.benchmarkId
    || body.metadata.run_id !== policy.runId
    || body.metadata.task_id !== policy.taskId
  ) {
    fail('PROXY_BODY_MISMATCH');
  }
  if (
    typeof body.input !== 'string'
    && !Array.isArray(body.input)
  ) {
    fail('PROXY_BODY_MISMATCH');
  }
  validateInput(body.input);
  return Buffer.from(JSON.stringify(body));
}

async function readResponseBody(value, limit) {
  if (value === null || value === undefined) return Buffer.alloc(0);
  if (
    typeof value === 'string'
    || Buffer.isBuffer(value)
    || value instanceof Uint8Array
  ) {
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
    if (bytes.length > limit) fail('PROXY_RESPONSE_TOO_LARGE');
    return bytes;
  }
  if (typeof value[Symbol.asyncIterator] !== 'function') fail('PROXY_UPSTREAM_FAILED');

  const chunks = [];
  let total = 0;
  for await (const chunk of value) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > limit) fail('PROXY_RESPONSE_TOO_LARGE');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, total);
}

function responseContentType(headers) {
  let value = null;
  if (headers && typeof headers.get === 'function') {
    value = headers.get('content-type');
  } else if (headers && typeof headers === 'object') {
    value = headers['content-type'] ?? headers['Content-Type'];
  }
  if (typeof value !== 'string') return 'application/octet-stream';
  const normalized = value.toLowerCase();
  if (normalized.startsWith('application/json')) return 'application/json';
  return 'application/octet-stream';
}

function sendError(response, code) {
  if (response.writableEnded || response.destroyed) return;
  if (response.headersSent) {
    try {
      response.destroy();
    } catch {
      // A partial streaming response cannot be replaced with an error body.
    }
    return;
  }
  const bytes = Buffer.from(JSON.stringify({ error: { code } }));
  try {
    response.writeHead(STATUS_BY_CODE[code] ?? 500, {
      'content-type': 'application/json',
      'content-length': bytes.length,
      'cache-control': 'no-store',
    });
    response.end(bytes);
  } catch {
    try {
      response.destroy();
    } catch {
      // The connection is already unusable; no sensitive value is retained.
    }
  }
}

function sendUpstreamResponse(response, upstreamResponse) {
  if (response.writableEnded || response.destroyed) return;
  response.writeHead(upstreamResponse.statusCode, {
    'content-type': upstreamResponse.contentType,
    'content-length': upstreamResponse.body.length,
    'cache-control': 'no-store',
  });
  response.end(upstreamResponse.body);
}

function listen(server, socketPath) {
  return new Promise((resolve, reject) => {
    const onListening = () => {
      server.off('error', onError);
      resolve();
    };
    const onError = () => {
      server.off('listening', onListening);
      reject(new CredentialProxyError('PROXY_START_FAILED'));
    };
    server.once('listening', onListening);
    server.once('error', onError);
    try {
      server.listen(socketPath);
    } catch {
      server.off('listening', onListening);
      server.off('error', onError);
      reject(new CredentialProxyError('PROXY_START_FAILED'));
    }
  });
}

function closeServer(server) {
  if (!server) return Promise.resolve(true);
  return new Promise((resolve) => {
    try {
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
      server.close((error) => resolve(
        error === undefined || error?.code === 'ERR_SERVER_NOT_RUNNING',
      ));
    } catch {
      resolve(false);
    }
  });
}

async function pathState(fsApi, socketPath) {
  try {
    const entry = await fsApi.lstat(socketPath);
    return entry?.isSocket?.() === true ? 'socket' : 'other';
  } catch (error) {
    return error?.code === 'ENOENT' ? 'absent' : 'unknown';
  }
}

async function removeOwnedSocket(fsApi, socketPath) {
  let unlinkFailed = false;
  try {
    await fsApi.unlink(socketPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') unlinkFailed = true;
  }
  const absent = await pathState(fsApi, socketPath) === 'absent';
  return absent && !unlinkFailed;
}

function hashBytes(value) {
  return createHash('sha256').update(value).digest('hex');
}

function responseHeader(headers, name) {
  if (headers && typeof headers.get === 'function') return headers.get(name);
  if (!headers || typeof headers !== 'object') return null;
  return headers[name] ?? headers[name.toLowerCase()] ?? null;
}

function validateResponseBody(bytes, policy) {
  let body;
  try {
    body = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('PROXY_RESPONSE_INVALID');
  }
  if (!isPlainObject(body)) fail('PROXY_RESPONSE_INVALID');
  if (Object.keys(body).sort().join(',') !== RESPONSE_FIELDS.slice().sort().join(',')) {
    fail('PROXY_RESPONSE_INVALID');
  }
  if (
    typeof body.id !== 'string'
    || body.id.length === 0
    || body.id.length > 256
    || body.model !== policy.model
    || !Array.isArray(body.output)
    || body.output.length > 256
    || !isPlainObject(body.usage)
    || Object.keys(body.usage).sort().join(',')
      !== RESPONSE_USAGE_FIELDS.slice().sort().join(',')
  ) {
    fail('PROXY_RESPONSE_INVALID');
  }
  for (const field of RESPONSE_USAGE_FIELDS) {
    if (!Number.isSafeInteger(body.usage[field]) || body.usage[field] < 0) {
      fail('PROXY_RESPONSE_INVALID');
    }
  }
  if (
    body.usage.total_tokens !== body.usage.input_tokens + body.usage.output_tokens
    || body.usage.total_tokens > policy.tokenCeiling
  ) {
    fail('PROXY_RESPONSE_INVALID');
  }
  return Object.freeze({
    id: body.id,
    model: body.model,
    inputTokens: body.usage.input_tokens,
    outputTokens: body.usage.output_tokens,
    totalTokens: body.usage.total_tokens,
  });
}

function validateUpstreamResponse(response) {
  if (
    !response
    || !Number.isInteger(response.statusCode)
    || response.statusCode < 200
    || response.statusCode > 299
  ) {
    fail('PROXY_UPSTREAM_FAILED');
  }
}

export function createHostCredentialProxy(options) {
  if (!isPlainObject(options)) fail('PROXY_POLICY_INVALID');
  const policy = normalizePolicy(options.policy);
  const socketPath = normalizeSocketPath(options.socketPath);
  const upstreamKey = requireSecret(options.upstreamKey);
  const dependencies = normalizeDependencies(options.dependencies);
  const logger = options.logger === undefined ? () => {} : requireFunction(options.logger);
  const receiptSink = options.receiptSink === undefined
    ? () => {}
    : requireFunction(options.receiptSink);
  const socketOwnerUid = options.socketOwnerUid
    ?? (typeof process.getuid === 'function' ? process.getuid() : 0);
  const socketOwnerGid = options.socketOwnerGid
    ?? (typeof process.getgid === 'function' ? process.getgid() : 0);
  const socketMode = options.socketMode ?? 0o600;
  if (
    !Number.isSafeInteger(socketOwnerUid)
    || socketOwnerUid < 0
    || !Number.isSafeInteger(socketOwnerGid)
    || socketOwnerGid < 0
    || socketMode !== 0o600
  ) {
    fail('PROXY_POLICY_INVALID');
  }
  const policyHash = hashNormalizedPolicy(policy);

  let server = null;
  let state = 'created';
  let ownsSocket = false;
  let deadlineAt = null;
  let requestCount = 0;
  let activeRequest = false;
  let closeInFlight = null;
  let closeProof = null;
  let attemptUnsafe = false;
  let closeProxy = null;
  const activeControllers = new Set();

  const safeLog = (event, code) => {
    const entry = code === undefined
      ? Object.freeze({ event })
      : Object.freeze({ event, code });
    try {
      logger(entry);
    } catch {
      // Logging is intentionally best-effort and receives sanitized fields only.
    }
  };

  const recordReceipt = (value) => {
    try {
      receiptSink(Object.freeze(value));
    } catch {
      fail('PROXY_RECEIPT_FAILED');
    }
  };

  const withDeadline = async (work) => {
    const remaining = deadlineAt - dependencies.clock.now();
    if (!Number.isFinite(remaining) || remaining <= 0) {
      fail('PROXY_DEADLINE_EXCEEDED');
    }

    const controller = new AbortController();
    let abortCode = 'PROXY_CLOSED';
    let timer;
    const abortPromise = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => {
        reject(new CredentialProxyError(abortCode));
      }, { once: true });
    });
    const controllerEntry = Object.freeze({
      abortForClose() {
        abortCode = 'PROXY_CLOSED';
        controller.abort();
      },
      abortForClient() {
        abortCode = 'PROXY_CLOSED';
        controller.abort();
      },
    });
    activeControllers.add(controllerEntry);
    try {
      timer = dependencies.clock.setTimeout(() => {
        abortCode = 'PROXY_DEADLINE_EXCEEDED';
        controller.abort();
      }, remaining);
      const workPromise = Promise.resolve().then(() => work(controller.signal));
      return await Promise.race([workPromise, abortPromise]);
    } catch (error) {
      if (error instanceof CredentialProxyError) throw error;
      fail('PROXY_UPSTREAM_FAILED');
    } finally {
      activeControllers.delete(controllerEntry);
      if (timer !== undefined) dependencies.clock.clearTimeout(timer);
    }
  };

  const callUpstream = async (body, signal) => {
    const upstreamResponse = await dependencies.upstreamTransport({
      url: CREDENTIAL_PROXY_ENDPOINT,
      method: CREDENTIAL_PROXY_METHOD,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${upstreamKey}`,
        'content-type': 'application/json',
      },
      body,
      signal,
    });
    validateUpstreamResponse(upstreamResponse);
    if (responseContentType(upstreamResponse.headers) !== 'application/json') {
      fail('PROXY_RESPONSE_INVALID');
    }
    const responseBody = await readResponseBody(
      upstreamResponse.body,
      policy.maxResponseBytes,
    );
    const responseShape = validateResponseBody(responseBody, policy);
    return {
      statusCode: upstreamResponse.statusCode,
      contentType: 'application/json',
      body: responseBody,
      responseShape,
      providerRequestIdHash: (() => {
        const requestId = responseHeader(upstreamResponse.headers, 'x-request-id')
          ?? responseHeader(upstreamResponse.headers, 'request-id');
        return typeof requestId === 'string' && requestId.length > 0
          ? hashBytes(Buffer.from(requestId))
          : null;
      })(),
    };
  };

  const abortForClient = (request, response) => {
    if (response.writableEnded) return;
    attemptUnsafe = true;
    for (const entry of activeControllers) entry.abortForClient();
    try {
      request.destroy?.();
    } catch {
      // The connection is already closing.
    }
    if (typeof closeProxy === 'function') {
      void closeProxy().catch(() => {});
    }
  };

  const handleRequest = async (request, response) => {
    const onRequestAborted = () => abortForClient(request, response);
    const onRequestClose = () => {
      if (request.aborted === true || request.complete !== true) {
        abortForClient(request, response);
      }
    };
    const onResponseClose = () => {
      if (!response.writableEnded && !response.writableFinished) {
        abortForClient(request, response);
      }
    };
    request.once?.('aborted', onRequestAborted);
    request.once?.('close', onRequestClose);
    response.once?.('close', onResponseClose);
    try {
      if (state !== 'started') fail('PROXY_CLOSED');
      assertRequestHeaders(request, policy);
      if (dependencies.clock.now() >= deadlineAt) fail('PROXY_DEADLINE_EXCEEDED');
      if (activeRequest) fail('PROXY_CONCURRENCY_EXCEEDED');
      if (requestCount >= policy.requestLimit) fail('PROXY_REQUEST_QUOTA_EXCEEDED');

      requestCount += 1;
      activeRequest = true;
      const requestStartedAt = dependencies.clock.now();
      try {
        const upstreamResponse = await withDeadline(async (signal) => {
          const body = await readRequestBody(
            request,
            policy.maxRequestBytes,
            signal,
          );
          if (signal.aborted) fail('PROXY_DEADLINE_EXCEEDED');
          const sanitizedBody = validateBody(body, policy);
          return {
            rawRequestBody: sanitizedBody,
            upstream: await callUpstream(sanitizedBody, signal),
          };
        });
        const { rawRequestBody, upstream } = upstreamResponse;
        recordReceipt({
          schemaVersion: 1,
          requestSha256: hashBytes(rawRequestBody),
          responseSha256: hashBytes(upstream.body),
          requestBytes: rawRequestBody.length,
          responseBytes: upstream.body.length,
          modelId: upstream.responseShape.model,
          statusCode: upstream.statusCode,
          latencyMs: Math.max(0, dependencies.clock.now() - requestStartedAt),
          tokenCounts: {
            input: upstream.responseShape.inputTokens,
            output: upstream.responseShape.outputTokens,
            total: upstream.responseShape.totalTokens,
          },
          providerRequestIdHash: upstream.providerRequestIdHash,
        });
        sendUpstreamResponse(response, upstream);
        safeLog('PROXY_REQUEST_COMPLETED');
      } finally {
        activeRequest = false;
      }
    } catch (error) {
      const code = error instanceof CredentialProxyError
        ? error.code
        : 'PROXY_UPSTREAM_FAILED';
      attemptUnsafe = true;
      safeLog('PROXY_REQUEST_REJECTED', code);
      sendError(response, code);
      if (typeof closeProxy === 'function') {
        void closeProxy().catch(() => {});
      }
    } finally {
      request.off?.('aborted', onRequestAborted);
      request.off?.('close', onRequestClose);
      response.off?.('close', onResponseClose);
    }
  };

  const start = async () => {
    if (state !== 'created') fail('PROXY_LIFECYCLE_INVALID');
    state = 'starting';
    if (await pathState(dependencies.fs, socketPath) !== 'absent') {
      state = 'failed';
      fail('PROXY_SOCKET_OCCUPIED');
    }

    try {
      server = dependencies.createServer((request, response) => {
        void handleRequest(request, response);
      });
      if (
        !server
        || typeof server.on !== 'function'
        || typeof server.once !== 'function'
        || typeof server.off !== 'function'
        || typeof server.listen !== 'function'
        || typeof server.close !== 'function'
      ) {
        fail('PROXY_DEPENDENCY_INVALID');
      }
      server.on('error', () => {
        attemptUnsafe = true;
        safeLog('PROXY_SERVER_ERROR', 'PROXY_SERVER_FAILED');
        if (typeof closeProxy === 'function') void closeProxy().catch(() => {});
      });
      server.on('clientError', () => {
        attemptUnsafe = true;
        safeLog('PROXY_REQUEST_REJECTED', 'PROXY_BODY_INVALID');
        if (typeof closeProxy === 'function') void closeProxy().catch(() => {});
      });
      await listen(server, socketPath);
      ownsSocket = true;
      await dependencies.fs.chmod(socketPath, socketMode);
      const entry = await dependencies.fs.lstat(socketPath);
      if (
        entry?.isSocket?.() !== true
        || (entry.mode & 0o777) !== socketMode
        || entry.uid !== socketOwnerUid
        || entry.gid !== socketOwnerGid
      ) {
        fail('PROXY_SOCKET_IDENTITY_INVALID');
      }
      deadlineAt = dependencies.clock.now() + policy.timeoutMs;
      if (!Number.isSafeInteger(deadlineAt)) fail('PROXY_POLICY_INVALID');
      state = 'started';
      safeLog('PROXY_STARTED');
      return Object.freeze({
        socketPath,
        policyHash,
        socketOwnerUid,
        socketOwnerGid,
        socketMode: '0600',
      });
    } catch (error) {
      const serverClosed = await closeServer(server);
      const socketRemoved = ownsSocket
        ? await removeOwnedSocket(dependencies.fs, socketPath)
        : await pathState(dependencies.fs, socketPath) === 'absent';
      ownsSocket = false;
      state = 'failed';
      safeLog('PROXY_START_REJECTED');
      if (!serverClosed || !socketRemoved) fail('PROXY_CLEANUP_UNPROVEN');
      if (error instanceof CredentialProxyError) throw error;
      fail('PROXY_START_FAILED');
    }
  };

  const close = async () => {
    if (closeProof) return closeProof;
    if (closeInFlight) return closeInFlight;
    closeInFlight = (async () => {
      state = 'closing';
      for (const entry of activeControllers) entry.abortForClose();
      const serverClosed = await closeServer(server);
      const socketRemoved = ownsSocket
        ? await removeOwnedSocket(dependencies.fs, socketPath)
        : await pathState(dependencies.fs, socketPath) === 'absent';
      if (!serverClosed || !socketRemoved) {
        state = 'failed';
        safeLog('PROXY_CLOSE_REJECTED', 'PROXY_CLEANUP_UNPROVEN');
        fail('PROXY_CLEANUP_UNPROVEN');
      }
      ownsSocket = false;
      state = 'closed';
      closeProof = Object.freeze({ socketRemoved: true, requestCount });
      safeLog('PROXY_CLOSED');
      return closeProof;
    })();
    try {
      return await closeInFlight;
    } finally {
      closeInFlight = null;
    }
  };
  closeProxy = close;

  const proveSafe = async () => {
    if (!closeProof || state !== 'closed') fail('PROXY_LIFECYCLE_INVALID');
    if (attemptUnsafe) fail('PROXY_ATTEMPT_UNSAFE');
    return Object.freeze({ attemptSafe: true });
  };

  return Object.freeze({
    policyHash,
    start,
    close,
    proveSafe,
  });
}
