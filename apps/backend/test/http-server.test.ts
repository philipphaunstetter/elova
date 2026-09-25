import assert from 'node:assert/strict'
import { once } from 'node:events'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, test } from 'node:test'
import { connect, type AddressInfo } from 'node:net'
import type { ElovaApplication, ApplicationRequest } from '../src/application.js'
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

async function start(checks: ReadinessChecks, database = gateway(checks), application?: ElovaApplication): Promise<string> {
  const server = createBackendServer(database, application)
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

async function rawRequest(origin: string, target: string): Promise<string> {
  const { port } = new URL(origin)
  const socket = connect(Number(port), '127.0.0.1')
  socket.setEncoding('utf8')
  let response = ''
  socket.on('data', (chunk) => { response += chunk })
  await once(socket, 'connect')
  socket.end(`GET ${target} HTTP/1.1\r\nHost: elova.invalid\r\nConnection: close\r\n\r\n`)
  await once(socket, 'end')
  return response
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

test('malformed request targets return a stable error without terminating the server', async () => {
  const origin = await start({ database: 'ready', migrations: 'ready' })
  const response = await rawRequest(origin, '//%')
  const [, payload] = response.split('\r\n\r\n', 2)

  assert.match(response, /^HTTP\/1\.1 400 Bad Request\r\n/)
  assert.ok(payload)
  assert.deepEqual(JSON.parse(payload), {
    error: { code: 'BAD_REQUEST', message: 'Bad request' },
  })

  const live = await fetch(`${origin}/v1/health/live`)
  assert.equal(live.status, 200)
})

test('workspace header reaches the application without substituting session selection', async () => {
  let received: ApplicationRequest | undefined
  const application = { async handle(request: ApplicationRequest) {
    received = request
    return { status: 200, body: { workspaceId: request.headers['x-elova-workspace-id'] ?? null } }
  } } as ElovaApplication
  const origin = await start({ database: 'ready', migrations: 'ready' }, undefined, application)
  const workspaceId = '33333333-3333-4333-8333-333333333333'
  const response = await fetch(`${origin}/v1/providers`, { headers: { 'x-elova-workspace-id': workspaceId } })
  assert.equal(response.status, 200)
  assert.equal(received?.headers['x-elova-workspace-id'], workspaceId)
  assert.deepEqual(await response.json(), { workspaceId })
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
