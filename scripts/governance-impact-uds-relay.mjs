#!/usr/bin/env node

import http from 'node:http';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';

const REQUEST_PATH = '/v1/responses';
const MAX_REQUEST_BYTES = 1_048_576;
const MAX_RESPONSE_BYTES = 4_194_304;
const MAX_CONFIGURATION_BYTES = 16_384;
const SHUTDOWN_GRACE_MS = 250;

const STATUS_BY_CODE = Object.freeze({
  PROXY_AUTH_REJECTED: 401,
  PROXY_METHOD_REJECTED: 405,
  PROXY_PATH_REJECTED: 404,
  PROXY_CONTENT_TYPE_REJECTED: 415,
  PROXY_REQUEST_TOO_LARGE: 413,
  PROXY_BODY_INVALID: 400,
  PROXY_UPSTREAM_FAILED: 502,
  PROXY_RESPONSE_TOO_LARGE: 502,
});

function closedToken(value, maximum = 8_192) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximum
    && !/[\0\r\n]/u.test(value);
}

function loadConfiguration(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.keys(value).sort().join(',')
      !== 'attemptId,bearer,port,socketPath'
  ) {
    return null;
  }
  const {
    socketPath,
    bearer,
    attemptId,
    port,
  } = value;
  if (
    !closedToken(socketPath)
    || !path.isAbsolute(socketPath)
    || !closedToken(bearer)
    || !closedToken(attemptId)
    || !Number.isSafeInteger(port)
    || port < 1
    || port > 65_535
  ) {
    return null;
  }
  return Object.freeze({ socketPath, bearer, attemptId, port });
}

function readConfiguration(input) {
  return new Promise((resolve) => {
    let bytes = Buffer.alloc(0);
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('error', onEnd);
      input.pause();
      resolve(value);
    };
    const onData = (chunk) => {
      const incoming = Buffer.from(chunk);
      if (bytes.length + incoming.length > MAX_CONFIGURATION_BYTES) {
        finish(null);
        return;
      }
      bytes = Buffer.concat([bytes, incoming], bytes.length + incoming.length);
      const newline = bytes.indexOf(0x0a);
      if (newline < 0) return;
      if (newline !== bytes.length - 1) {
        finish(null);
        return;
      }
      let parsed;
      try {
        parsed = JSON.parse(bytes.subarray(0, newline).toString('utf8'));
      } catch {
        finish(null);
        return;
      }
      finish(loadConfiguration(parsed));
    };
    const onEnd = () => finish(null);
    input.on('data', onData);
    input.once('end', onEnd);
    input.once('error', onEnd);
    input.resume();
  });
}

function singleHeader(request, name) {
  const values = [];
  for (let index = 0; index < request.rawHeaders.length; index += 2) {
    if (String(request.rawHeaders[index]).toLowerCase() === name) {
      values.push(request.rawHeaders[index + 1]);
    }
  }
  return values.length === 1 && typeof values[0] === 'string'
    ? values[0]
    : null;
}

function secretMatches(actual, expected) {
  if (typeof actual !== 'string') return false;
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(expected);
  return actualBytes.length === expectedBytes.length
    && timingSafeEqual(actualBytes, expectedBytes);
}

function sendError(response, code) {
  if (response.destroyed || response.writableEnded) return;
  const body = Buffer.from(JSON.stringify({ error: { code } }));
  response.writeHead(STATUS_BY_CODE[code] ?? 500, {
    'content-type': 'application/json',
    'content-length': body.length,
    'cache-control': 'no-store',
    connection: 'close',
  });
  response.end(body);
}

async function boundedBody(stream, maximum, tooLargeCode) {
  const chunks = [];
  let size = 0;
  for await (const chunk of stream) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > maximum) {
      const error = new Error(tooLargeCode);
      error.code = tooLargeCode;
      throw error;
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function responseContentType(value) {
  const normalized = typeof value === 'string' ? value.toLowerCase() : '';
  if (normalized.startsWith('application/json')) return 'application/json';
  if (normalized.startsWith('text/event-stream')) return 'text/event-stream';
  return 'application/octet-stream';
}

function writeWithBackpressure(response, bytes) {
  if (response.write(bytes)) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      response.off('drain', onDrain);
      response.off('close', onClose);
      response.off('error', onError);
    };
    const onDrain = () => {
      cleanup();
      resolve();
    };
    const onClose = () => {
      cleanup();
      reject(new Error('PROXY_UPSTREAM_FAILED'));
    };
    const onError = () => {
      cleanup();
      reject(new Error('PROXY_UPSTREAM_FAILED'));
    };
    response.once('drain', onDrain);
    response.once('close', onClose);
    response.once('error', onError);
  });
}

const configuration = await readConfiguration(process.stdin);
if (!configuration) {
  process.exitCode = 64;
} else {
  const sockets = new Set();
  const activeUpstream = new Set();
  let listenerReady = false;
  let shuttingDown = false;
  let shutdownCode = 0;
  let shutdownTimer = null;

  const server = http.createServer();

  const finishShutdown = () => {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    process.exit(shutdownCode);
  };

  const shutdown = (exitCode = 0) => {
    if (exitCode !== 0) shutdownCode = exitCode;
    if (shuttingDown) return;
    shuttingDown = true;
    process.exitCode = shutdownCode;
    for (const request of activeUpstream) request.destroy();
    const forceClose = () => {
      for (const socket of sockets) socket.destroy();
      finishShutdown();
    };
    shutdownTimer = setTimeout(forceClose, SHUTDOWN_GRACE_MS);
    shutdownTimer.unref?.();
    if (!listenerReady) {
      forceClose();
      return;
    }
    try {
      server.close(finishShutdown);
    } catch {
      forceClose();
    }
  };

  const rejectPolicy = (response, code) => {
    response.once('finish', () => shutdown(70));
    sendError(response, code);
  };

  server.on('connection', (socket) => {
    sockets.add(socket);
    socket.once('close', () => sockets.delete(socket));
  });

  server.on('request', async (request, response) => {
    try {
      if (shuttingDown) {
        rejectPolicy(response, 'PROXY_UPSTREAM_FAILED');
        return;
      }
      if (request.method !== 'POST') {
        rejectPolicy(response, 'PROXY_METHOD_REJECTED');
        return;
      }
      if (request.url !== REQUEST_PATH) {
        rejectPolicy(response, 'PROXY_PATH_REJECTED');
        return;
      }
      if (!secretMatches(
        singleHeader(request, 'authorization'),
        `Bearer ${configuration.bearer}`,
      )) {
        rejectPolicy(response, 'PROXY_AUTH_REJECTED');
        return;
      }
      const contentType = singleHeader(request, 'content-type');
      if (contentType?.toLowerCase() !== 'application/json') {
        rejectPolicy(response, 'PROXY_CONTENT_TYPE_REJECTED');
        return;
      }
      const contentLength = singleHeader(request, 'content-length');
      if (
        contentLength !== null
        && (
          !/^(?:0|[1-9][0-9]*)$/u.test(contentLength)
          || Number(contentLength) > MAX_REQUEST_BYTES
        )
      ) {
        rejectPolicy(
          response,
          Number(contentLength) > MAX_REQUEST_BYTES
            ? 'PROXY_REQUEST_TOO_LARGE'
            : 'PROXY_BODY_INVALID',
        );
        return;
      }

      let requestBody;
      try {
        requestBody = await boundedBody(
          request,
          MAX_REQUEST_BYTES,
          'PROXY_REQUEST_TOO_LARGE',
        );
      } catch (error) {
        rejectPolicy(
          response,
          error?.code === 'PROXY_REQUEST_TOO_LARGE'
            ? 'PROXY_REQUEST_TOO_LARGE'
            : 'PROXY_BODY_INVALID',
        );
        return;
      }

      await new Promise((resolve) => {
        let settled = false;
        const failUpstream = (code = 'PROXY_UPSTREAM_FAILED') => {
          if (settled) return;
          settled = true;
          rejectPolicy(response, code);
          resolve();
        };
        const upstream = http.request({
          socketPath: configuration.socketPath,
          method: 'POST',
          path: REQUEST_PATH,
          agent: false,
          setHost: false,
          headers: {
            accept: 'application/json, text/event-stream',
            authorization: `Bearer ${configuration.bearer}`,
            'content-type': 'application/json',
            'content-length': requestBody.length,
            host: 'localhost',
            'x-governance-attempt-id': configuration.attemptId,
          },
        }, async (upstreamResponse) => {
          try {
            const contentType = responseContentType(
              upstreamResponse.headers['content-type'],
            );
            if (
              !Number.isInteger(upstreamResponse.statusCode)
              || upstreamResponse.statusCode < 200
              || upstreamResponse.statusCode > 599
            ) {
              failUpstream();
              return;
            }
            if (contentType === 'text/event-stream') {
              if (settled || response.destroyed || response.writableEnded) return;
              settled = true;
              response.writeHead(upstreamResponse.statusCode, {
                'content-type': contentType,
                'cache-control': 'no-store',
                connection: 'close',
              });
              let size = 0;
              try {
                for await (const chunk of upstreamResponse) {
                  const bytes = Buffer.isBuffer(chunk)
                    ? chunk
                    : Buffer.from(chunk);
                  size += bytes.length;
                  if (size > MAX_RESPONSE_BYTES) {
                    const error = new Error('PROXY_RESPONSE_TOO_LARGE');
                    error.code = 'PROXY_RESPONSE_TOO_LARGE';
                    throw error;
                  }
                  await writeWithBackpressure(response, bytes);
                }
                response.end();
              } catch {
                upstreamResponse.destroy();
                response.destroy();
                shutdown(70);
              }
              resolve();
              return;
            }
            const body = await boundedBody(
              upstreamResponse,
              MAX_RESPONSE_BYTES,
              'PROXY_RESPONSE_TOO_LARGE',
            );
            if (settled || response.destroyed || response.writableEnded) return;
            settled = true;
            response.writeHead(upstreamResponse.statusCode, {
              'content-type': contentType,
              'content-length': body.length,
              'cache-control': 'no-store',
              connection: 'close',
            });
            response.end(body);
            resolve();
          } catch (error) {
            upstreamResponse.destroy();
            failUpstream(
              error?.code === 'PROXY_RESPONSE_TOO_LARGE'
                ? 'PROXY_RESPONSE_TOO_LARGE'
                : 'PROXY_UPSTREAM_FAILED',
            );
          }
        });
        activeUpstream.add(upstream);
        upstream.once('close', () => activeUpstream.delete(upstream));
        upstream.once('error', () => failUpstream());
        upstream.end(requestBody);
      });
    } catch {
      rejectPolicy(response, 'PROXY_UPSTREAM_FAILED');
    }
  });

  server.once('error', () => {
    shutdown(listenerReady ? 70 : 69);
  });

  process.stdin.resume();
  process.stdin.once('end', () => shutdown(0));
  process.stdin.once('error', () => shutdown(70));
  process.once('SIGTERM', () => shutdown(0));
  process.once('SIGINT', () => shutdown(0));

  server.listen(configuration.port, '127.0.0.1', () => {
    listenerReady = true;
    process.stdout.write('READY\n');
  });
}
