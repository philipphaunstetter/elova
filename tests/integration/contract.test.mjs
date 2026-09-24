import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const contractRoot = new URL('../../packages/api-contract/', import.meta.url)

async function fixture(name) {
  return JSON.parse(
    await readFile(new URL(`fixtures/${name}`, contractRoot), 'utf8'),
  )
}

const openapi = await readFile(new URL('openapi.yaml', contractRoot), 'utf8')
const packageMetadata = JSON.parse(
  await readFile(new URL('package.json', contractRoot), 'utf8'),
)

test('the canonical package and private API seam remain fixed', () => {
  assert.equal(packageMetadata.name, '@elova/api-contract')
  assert.match(openapi, /^openapi: 3\.1\.0$/m)
  assert.match(openapi, /^  - url: \/v1$/m)
  assert.match(openapi, /^  \/health\/live:$/m)
  assert.match(openapi, /^  \/health\/ready:$/m)
  assert.match(openapi, /^        const: "1"$/m)

  const declaredPaths = [...openapi.matchAll(/^  (\/[^:]+):$/gm)].map(
    (match) => match[1],
  )
  assert.deepEqual(declaredPaths, ['/health/live', '/health/ready'])
})

test('health fixtures match the frozen success envelopes', async () => {
  assert.deepEqual(await fixture('liveness.json'), { status: 'live' })
  assert.deepEqual(await fixture('readiness-ready.json'), {
    status: 'ready',
    checks: { database: 'ready', migrations: 'ready' },
  })
  assert.deepEqual(await fixture('readiness-not-ready.json'), {
    status: 'not_ready',
    checks: { database: 'not_ready', migrations: 'not_ready' },
  })
})

test('BFF failure fixtures are stable, generic, and contain no private details', async () => {
  const failures = [
    [
      'bff-unavailable.json',
      'BACKEND_UNAVAILABLE',
      'Service temporarily unavailable',
    ],
    ['bff-timeout.json', 'BACKEND_TIMEOUT', 'Service timed out'],
  ]

  for (const [name, code, message] of failures) {
    const value = await fixture(name)
    assert.deepEqual(value, { error: { code, message } })
    assert.doesNotMatch(
      JSON.stringify(value),
      /database|postgres|origin|hostname|tailnet|gx10|stack/i,
    )
    assert.match(openapi, new RegExp(`\\b${code}\\b`))
    assert.match(openapi, new RegExp(message))
  }
})
