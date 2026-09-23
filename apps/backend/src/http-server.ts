import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { DatabaseGateway, ReadinessChecks } from './database.js'

const API_VERSION = '1'
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/

interface ErrorEnvelope {
  error: {
    code: 'NOT_FOUND' | 'METHOD_NOT_ALLOWED'
    message: string
  }
}

function requestId(request: IncomingMessage): string {
  const supplied = request.headers['x-request-id']
  return typeof supplied === 'string' && REQUEST_ID.test(supplied) ? supplied : randomUUID()
}

function writeJson(response: ServerResponse, status: number, body: unknown, correlationId: string): void {
  const payload = JSON.stringify(body)
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(payload),
    'content-type': 'application/json; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-elova-api-version': API_VERSION,
    'x-request-id': correlationId,
  })
  response.end(payload)
}

function readinessBody(checks: ReadinessChecks) {
  const ready = checks.database === 'ready' && checks.migrations === 'ready'
  return {
    status: ready ? 'ready' as const : 'not_ready' as const,
    checks,
  }
}

export function createBackendServer(database: DatabaseGateway): Server {
  const server = createServer(async (request, response) => {
    const correlationId = requestId(request)
    const pathname = new URL(request.url ?? '/', 'http://elova.invalid').pathname

    if (request.method !== 'GET') {
      const body: ErrorEnvelope = {
        error: { code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' },
      }
      writeJson(response, 405, body, correlationId)
      return
    }

    if (pathname === '/v1/health/live') {
      writeJson(response, 200, { status: 'live' }, correlationId)
      return
    }

    if (pathname === '/v1/health/ready') {
      let checks: ReadinessChecks
      try {
        checks = await database.readiness()
      } catch {
        checks = { database: 'not_ready', migrations: 'not_ready' }
      }
      const body = readinessBody(checks)
      writeJson(response, body.status === 'ready' ? 200 : 503, body, correlationId)
      return
    }

    const body: ErrorEnvelope = {
      error: { code: 'NOT_FOUND', message: 'Not found' },
    }
    writeJson(response, 404, body, correlationId)
  })

  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000
  server.maxRequestsPerSocket = 1_000
  return server
}
