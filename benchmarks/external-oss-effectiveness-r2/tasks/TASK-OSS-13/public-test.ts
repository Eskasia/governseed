import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const root = process.cwd()
const { resolveConfig } = await import(
  pathToFileURL(resolve(root, 'packages/vite/dist/node/index.js')).href
)

const userLib: { formats: string[]; entry?: string } = { formats: ['es'] }
const config = await resolveConfig(
  { configFile: false, input: 'src/main.ts', build: { lib: userLib } },
  'build',
)
const resolved = config.environments.client.build

assert.notEqual(resolved.lib, false)
assert.equal(resolved.lib.entry, 'src/main.ts')
assert.equal(userLib.entry, undefined)
