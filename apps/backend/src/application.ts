import { randomUUID } from 'node:crypto'
import type { ElovaRepository, SessionOwner } from './repository.js'
import { ProviderOriginAlreadyExistsError, ProviderSyncAlreadyRunningError, ProviderSyncCapacityError } from './repository.js'
import { N8nSynchronizer } from './n8n-sync.js'
import { normalizeProviderOrigin } from './provider-url.js'
import {
  encryptCredential,
  issueSession,
  SESSION_MAX_AGE_SECONDS,
  sessionTokenDigest,
  verifyPassword,
  verifySession,
} from './security.js'

export interface ApplicationRequest {
  method: string
  pathname: string
  searchParams: URLSearchParams
  headers: Record<string, string | undefined>
  body?: unknown
}

export interface ApplicationResponse {
  status: number
  body?: unknown
  headers?: Record<string, string | string[]>
}

function error(status: number, code: string, message: string): ApplicationResponse {
  return { status, body: { error: { code, message } } }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function stringField(value: unknown, maximum: number): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 && normalized.length <= maximum ? normalized : undefined
}

const RESOURCE_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i

function cookieValue(cookie: string | undefined, name: string): string | undefined {
  return cookie?.split(';')
    .map((part) => part.trim().split('='))
    .find(([key]) => key === name)?.slice(1).join('=')
}

export class ElovaApplication {
  private readonly synchronizer: N8nSynchronizer
  private readonly loginFailures = new Map<string, { count: number; windowStartedAt: number }>()

  constructor(
    private readonly repository: ElovaRepository,
    private readonly sessionSecret: string,
    private readonly credentialKey: string,
    fetchImplementation: typeof fetch = fetch,
  ) {
    this.synchronizer = new N8nSynchronizer(repository, credentialKey, fetchImplementation)
  }

  private async owner(request: ApplicationRequest): Promise<SessionOwner | undefined> {
    const token = cookieValue(request.headers.cookie, 'elova_session')
    if (!token) return undefined
    const claims = verifySession(token, this.sessionSecret)
    if (!claims) return undefined
    return this.repository.resolveSession(
      claims.sessionId,
      sessionTokenDigest(token),
      new Date(),
    )
  }

  private async requireOwner(request: ApplicationRequest): Promise<SessionOwner | ApplicationResponse> {
    const owner = await this.owner(request)
    return owner ?? error(401, 'UNAUTHORIZED', 'Authentication required')
  }

  private async requireWorkspace(request: ApplicationRequest): Promise<(SessionOwner & { workspaceId: string }) | ApplicationResponse> {
    const owner = await this.requireOwner(request)
    if ('status' in owner) return owner
    const workspaceId = request.headers['x-elova-workspace-id']
    if (!workspaceId || !RESOURCE_UUID.test(workspaceId))
      return error(400, 'BAD_REQUEST', 'Valid workspace ID is required')
    if (!owner.workspaceId) return error(409, 'NO_WORKSPACE', 'Create or select a workspace first')
    return owner.workspaceId === workspaceId ? owner as SessionOwner & { workspaceId: string }
      : error(409, 'WORKSPACE_CHANGED', 'Refresh the workspace before retrying')
  }

  async handle(request: ApplicationRequest): Promise<ApplicationResponse | undefined> {
    if (request.method === 'POST' && request.pathname === '/v1/auth/login') {
      const body = record(request.body)
      const email = stringField(body.email, 320)?.toLowerCase()
      const password = body.password
      if (!email || typeof password !== 'string' || password.length < 1 || password.length > 256) {
        return error(400, 'BAD_REQUEST', 'Email and password are required')
      }
      const now = Date.now()
      for (const [trackedEmail, failure] of this.loginFailures) {
        if (now - failure.windowStartedAt >= 15 * 60_000) this.loginFailures.delete(trackedEmail)
      }
      const currentFailures = this.loginFailures.get(email)
      if (currentFailures && currentFailures.count >= 5) return error(429, 'RATE_LIMITED', 'Try again later')
      const owner = await this.repository.findOwnerByEmail(email)
      if (!owner) return error(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
      if (!(await verifyPassword(password, owner.passwordHash))) {
        if (!currentFailures && this.loginFailures.size >= 1_024) return error(429, 'RATE_LIMITED', 'Try again later')
        this.loginFailures.set(email, {
          count: (currentFailures?.count ?? 0) + 1,
          windowStartedAt: currentFailures?.windowStartedAt ?? now,
        })
        return error(401, 'INVALID_CREDENTIALS', 'Invalid email or password')
      }
      this.loginFailures.delete(email)
      const sessionId = randomUUID()
      const issued = issueSession({ sessionId, ownerId: owner.id, email: owner.email }, this.sessionSecret)
      await this.repository.createSession(
        sessionId,
        owner.id,
        sessionTokenDigest(issued.token),
        new Date(issued.claims.expiresAt * 1_000),
      )
      const firstWorkspace = (await this.repository.listWorkspaces(owner.id))[0]
      if (firstWorkspace) await this.repository.selectWorkspace(sessionId, owner.id, firstWorkspace.id)
      return {
        status: 200,
        headers: {
          'set-cookie': `elova_session=${issued.token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
        },
        body: { user: { id: owner.id, email: owner.email, displayName: owner.displayName,
          role: owner.role ?? 'user', workspaceId: firstWorkspace?.id ?? null } },
      }
    }

    if (request.method === 'POST' && request.pathname === '/v1/auth/logout') {
      const token = cookieValue(request.headers.cookie, 'elova_session')
      const claims = token ? verifySession(token, this.sessionSecret) : undefined
      if (claims) await this.repository.revokeSession(claims.sessionId)
      return {
        status: 204,
        headers: { 'set-cookie': 'elova_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' },
      }
    }

    if (request.method === 'GET' && request.pathname === '/v1/auth/session') {
      const owner = await this.owner(request)
      return owner
        ? { status: 200, body: { user: { id: owner.id, email: owner.email,
          displayName: owner.displayName, role: owner.role, workspaceId: owner.workspaceId } } }
        : error(401, 'UNAUTHORIZED', 'Authentication required')
    }

    if (request.pathname === '/v1/workspaces' && request.method === 'GET') {
      const owner = await this.requireOwner(request)
      if ('status' in owner) return owner
      return { status: 200, body: { workspaces: await this.repository.listWorkspaces(owner.id),
        activeWorkspaceId: owner.workspaceId } }
    }

    if (request.pathname === '/v1/workspaces' && request.method === 'POST') {
      const owner = await this.requireOwner(request)
      if ('status' in owner) return owner
      const name = stringField(record(request.body).name, 120)
      if (!name) return error(400, 'BAD_REQUEST', 'Workspace name is required')
      const workspace = await this.repository.createWorkspace(owner.sessionId, owner.id, name)
      return workspace ? { status: 201, body: { workspace } }
        : error(401, 'UNAUTHORIZED', 'Authentication required')
    }

    if (request.pathname === '/v1/workspaces/select' && request.method === 'POST') {
      const owner = await this.requireOwner(request)
      if ('status' in owner) return owner
      const id = record(request.body).workspaceId
      if (typeof id !== 'string' || !RESOURCE_UUID.test(id))
        return error(400, 'BAD_REQUEST', 'Valid workspace ID is required')
      const selected = await this.repository.selectWorkspace(owner.sessionId, owner.id, id)
      if (selected) return { status: 200, body: { activeWorkspaceId: id } }
      return await this.owner(request) ? error(404, 'NOT_FOUND', 'Workspace not found')
        : error(401, 'UNAUTHORIZED', 'Authentication required')
    }

    if (request.pathname === '/v1/providers' && request.method === 'GET') {
      const owner = await this.requireWorkspace(request)
      if ('status' in owner) return owner
      return { status: 200, body: { providers: await this.repository.listProviders(owner.id, owner.workspaceId) } }
    }

    if (request.pathname === '/v1/providers' && request.method === 'POST') {
      const owner = await this.requireWorkspace(request)
      if ('status' in owner) return owner
      const body = record(request.body)
      const name = stringField(body.name, 120)
      const apiKey = stringField(body.apiKey, 4_096)
      const rawBaseUrl = stringField(body.baseUrl, 2_048)
      if (!name || !apiKey || !rawBaseUrl) return error(400, 'BAD_REQUEST', 'Name, URL, and API key are required')
      let baseUrl: string
      try {
        baseUrl = normalizeProviderOrigin(rawBaseUrl)
      } catch {
        return error(422, 'INVALID_PROVIDER_URL', 'Provider URL must be a supported private origin')
      }
      try {
        const provider = await this.repository.createProvider({
          ownerId: owner.id,
          workspaceId: owner.workspaceId,
          name,
          baseUrl,
          encryptedApiKey: encryptCredential(apiKey, this.credentialKey),
        })
        return { status: 201, body: { provider } }
      } catch (caught) {
        if (caught instanceof ProviderOriginAlreadyExistsError) {
          return error(409, 'PROVIDER_ORIGIN_IMMUTABLE', 'Use a new connection for a different n8n origin')
        }
        throw caught
      }
    }

    const syncMatch = request.pathname.match(/^\/v1\/providers\/([0-9a-f-]+)\/sync$/i)
    if (syncMatch && request.method === 'POST') {
      const owner = await this.requireWorkspace(request)
      if ('status' in owner) return owner
      if (!RESOURCE_UUID.test(syncMatch[1]!)) return error(404, 'NOT_FOUND', 'Provider not found')
      const provider = await this.repository.getProviderSecret(owner.id, owner.workspaceId, syncMatch[1]!)
      if (!provider) return error(404, 'NOT_FOUND', 'Provider not found')
      try {
        const result = await this.synchronizer.synchronize(provider)
        return { status: 200, body: result }
      } catch (caught) {
        if (caught instanceof ProviderSyncAlreadyRunningError) {
          return error(409, 'PROVIDER_SYNC_IN_PROGRESS', 'Provider synchronization already in progress')
        }
        if (caught instanceof ProviderSyncCapacityError) {
          return error(429, 'PROVIDER_SYNC_BUSY', 'Synchronization capacity reached; try again later')
        }
        return error(502, 'PROVIDER_SYNC_FAILED', 'Provider synchronization failed')
      }
    }

    if (request.method === 'GET' && request.pathname === '/v1/workflows') {
      const owner = await this.requireWorkspace(request)
      if ('status' in owner) return owner
      return { status: 200, body: { workflows: await this.repository.listWorkflows(owner.id, owner.workspaceId, 500) } }
    }

    if (request.method === 'GET' && request.pathname === '/v1/executions') {
      const owner = await this.requireWorkspace(request)
      if ('status' in owner) return owner
      const requested = Number(request.searchParams.get('limit') ?? '200')
      const limit = Number.isInteger(requested) ? Math.min(Math.max(requested, 1), 1_000) : 200
      return { status: 200, body: { executions: await this.repository.listExecutions(owner.id, owner.workspaceId, limit) } }
    }

    if (request.method === 'GET' && request.pathname === '/v1/dashboard/metrics') {
      const owner = await this.requireWorkspace(request)
      if ('status' in owner) return owner
      return { status: 200, body: await this.repository.dashboardMetrics(owner.id, owner.workspaceId) }
    }

    return undefined
  }
}
