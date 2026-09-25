import { randomUUID } from 'node:crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { ElovaApplication, ApplicationResponse } from './application.js'
import type { DatabaseGateway, ReadinessChecks } from './database.js'

const API_VERSION = '1'
const REQUEST_ID = /^[A-Za-z0-9._:-]{1,128}$/
const MAX_REQUEST_BYTES = 1024 * 1024

function requestId(request: IncomingMessage): string {
  const supplied = request.headers['x-request-id']
  return typeof supplied === 'string' && REQUEST_ID.test(supplied) ? supplied : randomUUID()
}

function writeResponse(
  response: ServerResponse,
  result: ApplicationResponse,
  correlationId: string,
): void {
  const payload = result.body === undefined ? undefined : JSON.stringify(result.body)
  const headers: Record<string, string | string[]> = {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-elova-api-version': API_VERSION,
    'x-request-id': correlationId,
    ...result.headers,
  }
  if (payload !== undefined) {
    headers['content-length'] = String(Buffer.byteLength(payload))
    headers['content-type'] = 'application/json; charset=utf-8'
  }
  response.writeHead(result.status, headers)
  response.end(payload)
}

function error(status: number, code: string, message: string): ApplicationResponse {
  return { status, body: { error: { code, message } } }
}

function readinessBody(checks: ReadinessChecks) {
  const ready = checks.database === 'ready' && checks.migrations === 'ready'
  return { status: ready ? 'ready' as const : 'not_ready' as const, checks }
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const declared = request.headers['content-length']
  if (declared !== undefined && (!/^\d+$/.test(declared) || Number(declared) > MAX_REQUEST_BYTES)) {
    throw new RangeError('Request body too large')
  }
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunkValue of request) {
    const chunk = Buffer.isBuffer(chunkValue) ? chunkValue : Buffer.from(chunkValue)
    total += chunk.length
    if (total > MAX_REQUEST_BYTES) throw new RangeError('Request body too large')
    chunks.push(chunk)
  }
  if (total === 0) return undefined
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

export function createBackendServer(database: DatabaseGateway, application?: ElovaApplication): Server {
  const server = createServer((request, response) => {
    const correlationId = requestId(request)
    void (async () => {
      let requestUrl: URL
      try {
        requestUrl = new URL(request.url ?? '/', 'http://elova.invalid')
      } catch {
        writeResponse(response, error(400, 'BAD_REQUEST', 'Bad request'), correlationId)
        return
      }

      if (
        (requestUrl.pathname === '/v1/health/live' || requestUrl.pathname === '/v1/health/ready') &&
        request.method !== 'GET'
      ) {
        writeResponse(response, error(405, 'METHOD_NOT_ALLOWED', 'Method not allowed'), correlationId)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/v1/health/live') {
        writeResponse(response, { status: 200, body: { status: 'live' } }, correlationId)
        return
      }

      if (request.method === 'GET' && requestUrl.pathname === '/v1/health/ready') {
        let checks: ReadinessChecks
        try {
          checks = await database.readiness()
        } catch {
          checks = { database: 'not_ready', migrations: 'not_ready' }
        }
        const body = readinessBody(checks)
        writeResponse(response, { status: body.status === 'ready' ? 200 : 503, body }, correlationId)
        return
      }

      if (!application) {
        writeResponse(response, error(404, 'NOT_FOUND', 'Not found'), correlationId)
        return
      }

      let body: unknown
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        try {
          body = await readJson(request)
        } catch (caught) {
          writeResponse(
            response,
            caught instanceof RangeError
              ? error(413, 'REQUEST_TOO_LARGE', 'Request is too large')
              : error(400, 'BAD_REQUEST', 'Bad request'),
            correlationId,
          )
          return
        }
      }

      const result = await application.handle({
        method: request.method ?? 'GET',
        pathname: requestUrl.pathname,
        searchParams: requestUrl.searchParams,
        headers: {
          cookie: request.headers.cookie,
          authorization: request.headers.authorization,
          'x-csrf-token': typeof request.headers['x-csrf-token'] === 'string'
            ? request.headers['x-csrf-token']
            : undefined,
          'x-elova-workspace-id': typeof request.headers['x-elova-workspace-id'] === 'string'
            ? request.headers['x-elova-workspace-id']
            : undefined,
        },
        body,
      })
      writeResponse(response, result ?? error(404, 'NOT_FOUND', 'Not found'), correlationId)
    })().catch(() => {
      if (!response.headersSent) {
        writeResponse(response, error(500, 'INTERNAL_ERROR', 'Request failed'), correlationId)
      } else {
        response.destroy()
      }
    })
  })

  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  server.keepAliveTimeout = 5_000
  server.maxRequestsPerSocket = 1_000
  return server
}
