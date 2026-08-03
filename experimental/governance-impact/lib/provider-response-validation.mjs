export const PROVIDER_RESPONSE_MODEL = 'gpt-5.6-luna';
export const PROVIDER_RESPONSE_TOKEN_CEILING = 8_192;

export class ProviderResponseValidationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProviderResponseValidationError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProviderResponseValidationError(code);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function parseJsonBody(body) {
  if (Buffer.isBuffer(body) || body instanceof Uint8Array) {
    try {
      return JSON.parse(Buffer.from(body).toString('utf8'));
    } catch {
      fail('PROXY_RESPONSE_INVALID');
    }
  }
  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      fail('PROXY_RESPONSE_INVALID');
    }
  }
  return body;
}

function outputTextFromResponse(body) {
  const candidates = [];
  if (typeof body.output_text === 'string') candidates.push(body.output_text);
  for (const item of body.output) {
    if (!isPlainObject(item)) continue;
    if (typeof item.output_text === 'string') candidates.push(item.output_text);
    if (!Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isPlainObject(content)) continue;
      if (content.type === 'output_text' && typeof content.text === 'string') {
        candidates.push(content.text);
      }
    }
  }
  if (candidates.length === 0) fail('PROXY_RESPONSE_INVALID');
  const outputText = candidates.join('');
  if (outputText.length === 0) fail('PROXY_RESPONSE_INVALID');
  return outputText;
}

function requireNonNegativeInteger(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail('PROXY_RESPONSE_INVALID');
  return value;
}

export function validateProviderResponse(
  { statusCode, body },
  { model = PROVIDER_RESPONSE_MODEL, tokenCeiling = PROVIDER_RESPONSE_TOKEN_CEILING } = {},
) {
  if (
    !Number.isInteger(statusCode)
    || statusCode < 200
    || statusCode > 299
  ) {
    fail('PROXY_UPSTREAM_FAILED');
  }

  const parsed = parseJsonBody(body);
  if (!isPlainObject(parsed)) fail('PROXY_RESPONSE_INVALID');
  if (
    typeof parsed.id !== 'string'
    || parsed.id.length === 0
    || parsed.id.length > 256
    || parsed.object !== 'response'
    || parsed.status !== 'completed'
    || parsed.model !== model
    || parsed.error !== null
    || parsed.incomplete_details !== null
    || !Array.isArray(parsed.output)
    || !isPlainObject(parsed.usage)
  ) {
    fail('PROXY_RESPONSE_INVALID');
  }

  const inputTokens = requireNonNegativeInteger(parsed.usage.input_tokens);
  const outputTokens = requireNonNegativeInteger(parsed.usage.output_tokens);
  const totalTokens = requireNonNegativeInteger(parsed.usage.total_tokens);
  if (totalTokens > tokenCeiling) fail('PROXY_RESPONSE_INVALID');

  return Object.freeze({
    model,
    output_text: outputTextFromResponse(parsed),
    usage: Object.freeze({
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
    }),
  });
}
