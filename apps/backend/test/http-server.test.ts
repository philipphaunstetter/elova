import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, test } from 'node:test'
import type { AddressInfo } from 'node:net'
import type { DatabaseGateway, ReadinessChecks } from '../src/database.js'
import { createBackendServer } from '../src/http-server.js'

const servers: ReturnType<typeof createBackendServer>[] = []

afterEach(async () => {
  await Promise.all(servers.splice(0).map(async (server) => {
    server.close()
    await once(server, 'close')
  }))
})

function gateway(checks: ReadinessChecks): DatabaseGateway {
  return {
    readiness: async () => checks,
    close: async () => undefined,
  }
}

async function start(checks: ReadinessChecks, database = gateway(checks)): Promise<string> {
  const server = createBackendServer(database)
  servers.push(server)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${address.port}`
}

async function fixture(name: string): Promise<unknown> {
  const path = resolve(process.cwd(), '../../packages/api-contract/fixtures', name)
  return JSON.parse(await readFile(path, 'utf8'))
}

test('liveness conforms to the frozen fixture and headers', async () => {
  const origin = await start({ database: 'not_ready', migrations: 'not_ready' })
  const response = await fetch(`${origin}/v1/health/live`, {
    headers: { 'x-request-id': 'test-request-1' },
  })

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('x-elova-api-version'), '1')
  assert.equal(response.headers.get('x-request-id'), 'test-request-1')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), await fixture('liveness.json'))
})

test('readiness is 200 only when database and migrations are ready', async () => {
  const origin = await start({ database: 'ready', migrations: 'ready' })
  const response = await fetch(`${origin}/v1/health/ready`)

  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), await fixture('readiness-ready.json'))
})

test('readiness fails closed without exposing dependency details', async () => {
  const origin = await start({ database: 'not_ready', migrations: 'not_ready' })
  const response = await fetch(`${origin}/v1/health/ready`)
  const text = await response.text()

  assert.equal(response.status, 503)
  assert.deepEqual(JSON.parse(text), await fixture('readiness-not-ready.json'))
  assert.doesNotMatch(text, /postgres|database_url|tailnet|gx10/i)
})

test('unexpected readiness errors fail closed', async () => {
  const database: DatabaseGateway = {
    readiness: async () => { throw new Error('postgres://secret@gx10.private/elova') },
    close: async () => undefined,
  }
  const origin = await start({ database: 'ready', migrations: 'ready' }, database)
  const response = await fetch(`${origin}/v1/health/ready`)
  const text = await response.text()

  assert.equal(response.status, 503)
  assert.deepEqual(JSON.parse(text), await fixture('readiness-not-ready.json'))
  assert.doesNotMatch(text, /secret|gx10|postgres/i)
})

test('unknown paths and methods return stable, non-reflective errors', async () => {
  const origin = await start({ database: 'ready', migrations: 'ready' })
  const privateMarker = 'gx10.private.invalid'
  const missing = await fetch(`${origin}/v1/${privateMarker}`)
  const method = await fetch(`${origin}/v1/health/live`, { method: 'POST' })

  assert.equal(missing.status, 404)
  assert.doesNotMatch(await missing.text(), new RegExp(privateMarker))
  assert.equal(method.status, 405)
  assert.deepEqual(await method.json(), {
    error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
  })
})
