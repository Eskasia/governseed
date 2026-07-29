#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const responsePath = process.argv[2];
const schemaPath = process.argv[3] || path.resolve('tests/runtime/claude/first-response.schema.json');

if (!responsePath) {
  console.error('Usage: node scripts/assert-claude-first-response.mjs <response-json> [schema-json]');
  process.exit(1);
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${filePath} is not valid JSON: ${error.message}`);
  }
}

function fail(message) {
  console.error(`Claude first-response assertion failed: ${message}`);
  process.exit(1);
}

let response;
let schema;
try {
  response = readJson(responsePath);
  schema = readJson(schemaPath);
} catch (error) {
  fail(error.message);
}

for (const key of schema.required || []) {
  if (!Object.hasOwn(response, key)) fail(`missing key ${key}`);
  if (!Array.isArray(response[key])) fail(`${key} must be an array`);
}

if ((response.files_read || []).length < 2) {
  fail('files_read must include at least START_HERE.md and a runtime entrypoint');
}

for (const requiredFile of ['START_HERE.md', 'AGENTS.md']) {
  if (!response.files_read.includes(requiredFile)) {
    fail(`files_read must include ${requiredFile}`);
  }
}

console.log('Claude first-response assertion passed.');
