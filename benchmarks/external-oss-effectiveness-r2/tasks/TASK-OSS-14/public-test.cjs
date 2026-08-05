const assert = require('node:assert/strict');
const { join } = require('node:path');
const { Linter } = require(join(process.cwd(), 'lib/api.js'));

const linter = new Linter({ configType: 'flat' });
const messages = linter.verify('import.meta;', [
  {
    languageOptions: { ecmaVersion: 2022, sourceType: 'module' },
    rules: { 'id-denylist': ['error', 'import', 'meta'] },
  },
]);
assert.deepEqual(messages, []);
