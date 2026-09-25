import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import SwaggerParser from '@apidevtools/swagger-parser'
import { load } from 'js-yaml'

const contractRoot = new URL('../../packages/api-contract/', import.meta.url)
const openapiUrl = new URL('openapi.yaml', contractRoot)
const openapi = load(await readFile(openapiUrl, 'utf8'))
const packageMetadata = JSON.parse(
  await readFile(new URL('package.json', contractRoot), 'utf8'),
)

async function fixture(name) {
  return JSON.parse(
    await readFile(new URL(`fixtures/${name}`, contractRoot), 'utf8'),
  )
}

test('the canonical private API is valid and owns PostgreSQL-backed product operations', async () => {
  await SwaggerParser.validate(fileURLToPath(openapiUrl))

  assert.equal(packageMetadata.name, '@elova/api-contract')
  assert.equal(openapi.openapi, '3.1.0')
  assert.deepEqual(openapi.servers.map((server) => server.url), ['/v1'])
  assert.deepEqual(Object.keys(openapi.paths), [
    '/health/live', '/health/ready', '/auth/login', '/auth/logout', '/auth/session',
    '/workspaces', '/workspaces/select', '/providers', '/providers/{providerId}/sync',
    '/workflows', '/executions', '/dashboard/metrics',
  ])
  assert.equal(openapi.paths['/health/live'].get.operationId, 'getLiveness')
  assert.equal(openapi.paths['/health/ready'].get.operationId, 'getReadiness')
  assert.equal(openapi.paths['/auth/login'].post.operationId, 'login')
  assert.equal(openapi.paths['/providers'].post.operationId, 'createProvider')
  assert.equal(openapi.paths['/providers/{providerId}/sync'].post.operationId, 'synchronizeProvider')

  for (const [path, statuses] of [
    ['/health/live', ['200']],
    ['/health/ready', ['200', '503']],
  ]) {
    const responses = openapi.paths[path].get.responses
    assert.deepEqual(Object.keys(responses), statuses)
    for (const response of Object.values(responses)) {
      assert.match(response.$ref, /^#\/components\/responses\/(?:Liveness|Readiness)Response$/)
    }
  }

  assert.deepEqual(openapi.components.headers.ApiVersion.schema, {
    type: 'string',
    const: '1',
  })
  assert.equal(openapi.components.securitySchemes.ownerSession.name, 'elova_session')
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

test('BFF failure fixtures match the declared generic failure schema', async () => {
  const failureSchema = openapi.components.schemas.BffFailure
  const codes = failureSchema.properties.error.properties.code.enum
  const messages = failureSchema.properties.error.properties.message.enum
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
    assert.equal(codes.includes(code), true)
    assert.equal(messages.includes(message), true)
    assert.doesNotMatch(
      JSON.stringify(value),
      /database|postgres|origin|hostname|tailnet|gx10|stack/i,
    )
  }
})
