import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PROVIDER_RESPONSE_MODEL,
  validateProviderResponse,
} from '../lib/provider-response-validation.mjs';

const CANARY_TEXT = '{"runtime_canary":"PASS"}';

function providerResponse(overrides = {}) {
  return {
    id: 'resp_synthetic',
    object: 'response',
    created_at: 1_754_121_600,
    status: 'completed',
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: 8_192,
    model: PROVIDER_RESPONSE_MODEL,
    output: [{
      id: 'msg_synthetic',
      type: 'message',
      status: 'completed',
      role: 'assistant',
      content: [{
        type: 'output_text',
        annotations: [],
        logprobs: null,
        text: CANARY_TEXT,
      }],
    }],
    previous_response_id: null,
    reasoning: { effort: null, summary: null },
    store: false,
    text: { format: { type: 'json_schema' }, verbosity: 'medium' },
    tools: [],
    tool_choice: 'auto',
    top_p: 1,
    truncation: 'disabled',
    metadata: {},
    usage: {
      input_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens: 1,
      output_tokens_details: { reasoning_tokens: 0 },
      total_tokens: 2,
    },
    ...overrides,
  };
}

function responseBytes(value) {
  return Buffer.from(JSON.stringify(value));
}

test('official-style completed Responses object with documented extra fields normalizes safely', () => {
  const normalized = validateProviderResponse({
    statusCode: 200,
    body: responseBytes(providerResponse()),
  });

  assert.deepEqual(normalized, {
    model: PROVIDER_RESPONSE_MODEL,
    output_text: CANARY_TEXT,
    usage: {
      input_tokens: 1,
      output_tokens: 1,
      total_tokens: 2,
    },
  });
});

test('provider response rejects non-completed, errored, incomplete, mismatched, and missing contracts', () => {
  const cases = [
    { status: 'in_progress' },
    { error: { code: 'server_error' } },
    { incomplete_details: { reason: 'max_output_tokens' } },
    { model: 'other-model' },
    { object: undefined },
    { output: undefined },
    { usage: undefined },
  ];
  for (const change of cases) {
    assert.throws(
      () => validateProviderResponse({
        statusCode: 200,
        body: responseBytes(providerResponse(change)),
      }),
      (error) => error.code === 'PROXY_RESPONSE_INVALID',
    );
  }
});

test('provider usage details are allowed while unsafe token counts are rejected', () => {
  const normalized = validateProviderResponse({
    statusCode: 200,
    body: responseBytes(providerResponse({
      usage: {
        input_tokens: 0,
        input_tokens_details: { cached_tokens: 0 },
        output_tokens: 8_192,
        output_tokens_details: { reasoning_tokens: 0 },
        total_tokens: 8_192,
      },
    })),
  });
  assert.equal(normalized.usage.total_tokens, 8_192);

  for (const usage of [
    { input_tokens: -1, output_tokens: 1, total_tokens: 0 },
    { input_tokens: 1, output_tokens: 1, total_tokens: 8_193 },
    { input_tokens: 1, output_tokens: 1, total_tokens: 2.5 },
  ]) {
    assert.throws(
      () => validateProviderResponse({
        statusCode: 200,
        body: responseBytes(providerResponse({ usage })),
      }),
      (error) => error.code === 'PROXY_RESPONSE_INVALID',
    );
  }
});

test('non-2xx provider status is rejected before body normalization', () => {
  assert.throws(
    () => validateProviderResponse({
      statusCode: 429,
      body: responseBytes(providerResponse()),
    }),
    (error) => error.code === 'PROXY_UPSTREAM_FAILED',
  );
});
