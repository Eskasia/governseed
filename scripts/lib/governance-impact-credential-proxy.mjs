import { createHash, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import { createServer as createNodeServer } from 'node:http';
import path from 'node:path';

export const CREDENTIAL_PROXY_PATH = '/v1/responses';
export const CREDENTIAL_PROXY_ATTEMPT_HEADER = 'x-governance-attempt-id';

const CREDENTIAL_PROXY_METHOD = 'POST';
const CLIENT_EXECUTED_TOOL_TYPES = new Set([
  'function',
  'custom',
  'local_shell',
  'apply_patch',
  'tool_search',
]);
const SERVER_STATE_FIELDS = Object.freeze([
  'previous_response_id',
  'conversation',
  'prompt',
]);
const CLIENT_IDENTIFIER_FIELDS = Object.freeze([
  'client_metadata',
  'metadata',
  'prompt_cache_key',
  'prompt_cache_retention',
  'safety_identifier',
  'user',
]);
const POLICY_KEYS = new Set([
  'attemptId',
  'model',
  'upstream',
  'maxRequestBytes',
  'maxResponseBytes',
  'maxRequests',
  'deadlineMs',
]);

const STATUS_BY_CODE = Object.freeze({
  PROXY_AUTH_REJECTED: 401,
  PROXY_ATTEMPT_REJECTED: 403,
  PROXY_METHOD_REJECTED: 405,
  PROXY_PATH_REJECTED: 404,
  PROXY_CONTENT_TYPE_REJECTED: 415,
  PROXY_REQUEST_TOO_LARGE: 413,
  PROXY_BODY_INVALID: 400,
  PROXY_BODY_MISMATCH: 400,
  PROXY_REQUEST_QUOTA_EXCEEDED: 429,
  PROXY_DEADLINE_EXCEEDED: 408,
  PROXY_CONCURRENCY_EXCEEDED: 429,
  PROXY_UPSTREAM_FAILED: 502,
  PROXY_RESPONSE_TOO_LARGE: 502,
  PROXY_CLOSED: 503,
});

const defaultFs = Object.freeze({
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
      model: requireClosedToken(value.model),
      upstream: normalizeUpstream(value.upstream),
      maxRequestBytes: requirePositiveInteger(value.maxRequestBytes),
      maxResponseBytes: requirePositiveInteger(value.maxResponseBytes),
      maxRequests: requirePositiveInteger(value.maxRequests),
      deadlineMs: requirePositiveInteger(value.deadlineMs),
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
    schemaVersion: 2,
    method: CREDENTIAL_PROXY_METHOD,
    path: CREDENTIAL_PROXY_PATH,
    model: policy.model,
    upstream: policy.upstream,
    maxRequestBytes: policy.maxRequestBytes,
    maxResponseBytes: policy.maxResponseBytes,
    maxRequests: policy.maxRequests,
    deadlineMs: policy.deadlineMs,
    maxConcurrency: 1,
    request: Object.freeze({
      store: false,
      stream: true,
      background: false,
      continuationMode: 'client-replay',
      serverStateFields: Object.freeze([]),
      allowedToolTypes: Object.freeze(
        [...CLIENT_EXECUTED_TOOL_TYPES].sort(),
      ),
      strippedIdentifierFields: Object.freeze([...CLIENT_IDENTIFIER_FIELDS]),
    }),
  });
}

export function describeCredentialProxyPolicy(value) {
  return durablePolicyDescriptor(normalizePolicy(value));
}

function hashNormalizedPolicy(policy) {
  return createHash('sha256')
    .update('governance-impact-credential-proxy-policy-v2\0')
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

function secretMatches(actual, expected) {
  if (typeof actual !== 'string') return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function assertRequestHeaders(request, policy, attemptBearer) {
  const authorization = singleHeader(request, 'authorization');
  if (!secretMatches(authorization, `Bearer ${attemptBearer}`)) {
    fail('PROXY_AUTH_REJECTED');
  }
  if (!secretMatches(singleHeader(request, CREDENTIAL_PROXY_ATTEMPT_HEADER), policy.attemptId)) {
    fail('PROXY_ATTEMPT_REJECTED');
  }
  if (request.method !== CREDENTIAL_PROXY_METHOD) fail('PROXY_METHOD_REJECTED');
  if (request.url !== CREDENTIAL_PROXY_PATH) fail('PROXY_PATH_REJECTED');
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

async function readRequestBody(request, limit) {
  const chunks = [];
  let total = 0;
  let tooLarge = false;
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
    fail('PROXY_BODY_INVALID');
  }
  if (tooLarge) fail('PROXY_REQUEST_TOO_LARGE');
  return Buffer.concat(chunks, total);
}

function validateBody(bytes, model) {
  let body;
  try {
    body = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('PROXY_BODY_INVALID');
  }
  if (!isPlainObject(body)) fail('PROXY_BODY_INVALID');
  if (
    body.model !== model
    || body.store !== false
    || body.stream !== true
    || body.background === true
    || SERVER_STATE_FIELDS.some((field) => Object.hasOwn(body, field))
  ) {
    fail('PROXY_BODY_MISMATCH');
  }
  if (body.tools !== undefined) {
    if (
      !Array.isArray(body.tools)
      || body.tools.some((tool) => (
        !isPlainObject(tool)
        || typeof tool.type !== 'string'
        || !CLIENT_EXECUTED_TOOL_TYPES.has(tool.type)
      ))
    ) {
      fail('PROXY_BODY_MISMATCH');
    }
  }
  for (const field of CLIENT_IDENTIFIER_FIELDS) delete body[field];
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
  if (normalized.startsWith('text/event-stream')) return 'text/event-stream';
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

function waitForDrain(response, signal) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      signal.removeEventListener('abort', onAbort);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new CredentialProxyError('PROXY_UPSTREAM_FAILED'));
    };
    const onAbort = () => {
      cleanup();
      reject(new CredentialProxyError('PROXY_DEADLINE_EXCEEDED'));
    };
    response.once('drain', onDrain);
    response.once('close', onClose);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function streamUpstreamResponse(response, upstreamResponse, limit, signal) {
  const body = upstreamResponse.body;
  const staticBody = (
    typeof body === 'string'
    || Buffer.isBuffer(body)
    || body instanceof Uint8Array
  );
  if (
    body !== null
    && body !== undefined
    && !staticBody
    && typeof body[Symbol.asyncIterator] !== 'function'
  ) {
    fail('PROXY_UPSTREAM_FAILED');
  }

  try {
    response.writeHead(upstreamResponse.statusCode, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
    });
    let total = 0;
    const chunks = staticBody
      ? [body]
      : (body ?? []);
    for await (const chunk of chunks) {
      if (signal.aborted) fail('PROXY_DEADLINE_EXCEEDED');
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > limit) fail('PROXY_RESPONSE_TOO_LARGE');
      if (!response.write(bytes)) await waitForDrain(response, signal);
    }
    if (signal.aborted) fail('PROXY_DEADLINE_EXCEEDED');
    response.end();
  } catch (error) {
    try {
      if (!response.writableEnded && !response.destroyed) response.destroy();
    } catch {
      // The response is already unusable.
    }
    if (error instanceof CredentialProxyError) throw error;
    fail('PROXY_UPSTREAM_FAILED');
  }
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
      server.close((error) => resolve(error === undefined));
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

function validateUpstreamResponse(response) {
  if (
    !response
    || !Number.isInteger(response.statusCode)
    || response.statusCode < 200
    || response.statusCode > 599
  ) {
    fail('PROXY_UPSTREAM_FAILED');
  }
}

export function createHostCredentialProxy(options) {
  if (!isPlainObject(options)) fail('PROXY_POLICY_INVALID');
  const policy = normalizePolicy(options.policy);
  const socketPath = normalizeSocketPath(options.socketPath);
  const attemptBearer = requireSecret(options.attemptBearer);
  const upstreamKey = requireSecret(options.upstreamKey);
  const dependencies = normalizeDependencies(options.dependencies);
  const logger = options.logger === undefined ? () => {} : requireFunction(options.logger);
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

  const callUpstream = async (body, signal, response) => {
    const upstreamResponse = await dependencies.upstreamTransport({
      url: policy.upstream,
      method: CREDENTIAL_PROXY_METHOD,
      headers: {
        accept: 'application/json, text/event-stream',
        authorization: `Bearer ${upstreamKey}`,
        'content-type': 'application/json',
      },
      body,
      signal,
    });
    validateUpstreamResponse(upstreamResponse);
    const contentType = responseContentType(upstreamResponse.headers);
    if (contentType === 'text/event-stream') {
      await streamUpstreamResponse(
        response,
        upstreamResponse,
        policy.maxResponseBytes,
        signal,
      );
      return { streamed: true };
    }
    return {
      statusCode: upstreamResponse.statusCode,
      contentType,
      body: await readResponseBody(upstreamResponse.body, policy.maxResponseBytes),
      streamed: false,
    };
  };

  const handleRequest = async (request, response) => {
    try {
      if (state !== 'started') fail('PROXY_CLOSED');
      assertRequestHeaders(request, policy, attemptBearer);
      if (dependencies.clock.now() >= deadlineAt) fail('PROXY_DEADLINE_EXCEEDED');
      if (activeRequest) fail('PROXY_CONCURRENCY_EXCEEDED');
      if (requestCount >= policy.maxRequests) fail('PROXY_REQUEST_QUOTA_EXCEEDED');

      requestCount += 1;
      activeRequest = true;
      try {
        const upstreamResponse = await withDeadline(async (signal) => {
          const body = await readRequestBody(request, policy.maxRequestBytes);
          if (signal.aborted) fail('PROXY_DEADLINE_EXCEEDED');
          const sanitizedBody = validateBody(body, policy.model);
          return callUpstream(sanitizedBody, signal, response);
        });
        if (!upstreamResponse.streamed) {
          sendUpstreamResponse(response, upstreamResponse);
        }
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
        if (state === 'started') {
          state = 'failed';
          for (const entry of activeControllers) entry.abortForClose();
        }
      });
      server.on('clientError', () => {
        attemptUnsafe = true;
        safeLog('PROXY_REQUEST_REJECTED', 'PROXY_BODY_INVALID');
      });
      await listen(server, socketPath);
      ownsSocket = true;
      if (await pathState(dependencies.fs, socketPath) !== 'socket') {
        fail('PROXY_START_FAILED');
      }
      deadlineAt = dependencies.clock.now() + policy.deadlineMs;
      if (!Number.isSafeInteger(deadlineAt)) fail('PROXY_POLICY_INVALID');
      state = 'started';
      safeLog('PROXY_STARTED');
      return Object.freeze({ socketPath, policyHash });
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
