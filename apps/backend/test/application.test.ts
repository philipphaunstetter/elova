import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ElovaApplication, type ApplicationRequest } from '../src/application.js'
import type {
  DashboardMetrics,
  ElovaRepository,
  Owner,
  ProviderSecret,
  ProviderSummary,
  SessionOwner,
  StoredExecution,
  StoredWorkflow,
} from '../src/repository.js'
import { ProviderSyncAlreadyRunningError } from '../src/repository.js'
import { encryptCredential, hashPassword } from '../src/security.js'

const SECRET = Buffer.alloc(32, 9).toString('base64')

class MemoryRepository implements ElovaRepository {
  owner?: Owner
  session: { id: string; ownerId: string; digest: string; expiresAt: Date } | undefined
  providers: ProviderSecret[] = []
  workflows: StoredWorkflow[] = []
  executions: StoredExecution[] = []
  cursors: Array<string | null> = []
  syncLocks = new Set<string>()
  failedSyncs = 0

  async createInitialOwner(input: { email: string; displayName: string; passwordHash: string }): Promise<Owner> {
    this.owner = { id: '11111111-1111-4111-8111-111111111111', ...input }
    return this.owner
  }
  async findOwnerByEmail(email: string) { return this.owner?.email === email ? this.owner : undefined }
  async createSession(sessionId: string, ownerId: string, digest: string, expiresAt: Date) {
    this.session = { id: sessionId, ownerId, digest, expiresAt }
  }
  async resolveSession(sessionId: string, digest: string, now: Date): Promise<SessionOwner | undefined> {
    if (!this.owner || this.session?.id !== sessionId || this.session.digest !== digest || this.session.expiresAt <= now) return undefined
    return { id: this.owner.id, email: this.owner.email, displayName: this.owner.displayName }
  }
  async revokeSession() { this.session = undefined }
  async listProviders(): Promise<ProviderSummary[]> { return this.providers }
  async createProvider(input: { ownerId: string; name: string; baseUrl: string; encryptedApiKey: string }) {
    const provider: ProviderSecret = {
      id: '22222222-2222-4222-8222-222222222222', ownerId: input.ownerId, name: input.name,
      baseUrl: input.baseUrl, encryptedApiKey: input.encryptedApiKey, status: 'unverified',
      createdAt: new Date().toISOString(), lastSyncedAt: null,
    }
    this.providers.push(provider)
    return provider
  }
  async getProviderSecret(_ownerId: string, providerId: string) { return this.providers.find((item) => item.id === providerId) }
  async withProviderSyncLock<T>(providerId: string, operation: () => Promise<T>): Promise<T> {
    if (this.syncLocks.has(providerId)) throw new ProviderSyncAlreadyRunningError('Provider synchronization already in progress')
    this.syncLocks.add(providerId)
    try {
      return await operation()
    } finally {
      this.syncLocks.delete(providerId)
    }
  }
  async storeWorkflow(_providerId: string, workflow: StoredWorkflow) { this.workflows.push(workflow) }
  async storeExecution(_providerId: string, execution: StoredExecution) { this.executions.push(execution) }
  async getSyncCursor() { return null }
  async finishSync(_providerId: string, _kind: string, cursor: string | null) { this.cursors.push(cursor) }
  async failSync() { this.failedSyncs += 1 }
  async listWorkflows() { return this.workflows }
  async listExecutions() { return this.executions }
  async dashboardMetrics(): Promise<DashboardMetrics> {
    return { totalExecutions: 0, successfulExecutions: 0, failedExecutions: 0, successRate: null, averageDurationMs: null }
  }
}

function request(method: string, pathname: string, body?: unknown, cookie?: string): ApplicationRequest {
  return { method, pathname, searchParams: new URLSearchParams(), headers: { cookie }, body }
}

async function loggedIn(): Promise<{ application: ElovaApplication; repository: MemoryRepository; cookie: string }> {
  const repository = new MemoryRepository()
  repository.owner = {
    id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', displayName: 'Owner',
    passwordHash: await hashPassword('correct horse battery staple'),
  }
  const application = new ElovaApplication(repository, SECRET, SECRET)
  const response = await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner.email, password: 'correct horse battery staple',
  }))
  assert.equal(response?.status, 200)
  const cookie = String(response?.headers?.['set-cookie']).split(';')[0]!
  return { application, repository, cookie }
}

test('operator-created owner can log in and signed session authorizes API access', async () => {
  const { application, cookie } = await loggedIn()
  const session = await application.handle(request('GET', '/v1/auth/session', undefined, cookie))
  const metrics = await application.handle(request('GET', '/v1/dashboard/metrics', undefined, cookie))
  assert.equal(session?.status, 200)
  assert.equal(metrics?.status, 200)
})

test('wrong password and forged unsigned session are rejected', async () => {
  const { application, repository } = await loggedIn()
  const login = await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner!.email, password: 'incorrect password value',
  }))
  const forged = Buffer.from(JSON.stringify({ ownerId: repository.owner!.id })).toString('base64')
  const session = await application.handle(request('GET', '/v1/auth/session', undefined, `elova_session=${forged}`))
  assert.equal(login?.status, 401)
  assert.equal(session?.status, 401)
})

test('login preserves the exact operator password including surrounding spaces', async () => {
  const repository = new MemoryRepository()
  repository.owner = {
    id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.test', displayName: 'Owner',
    passwordHash: await hashPassword('  correct horse battery staple  '),
  }
  const application = new ElovaApplication(repository, SECRET, SECRET)
  const login = await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner.email, password: '  correct horse battery staple  ',
  }))
  assert.equal(login?.status, 200)
  assert.equal((await application.handle(request('GET', '/v1/auth/session', undefined,
    String(login?.headers?.['set-cookie']).split(';')[0])))?.status, 200)
  assert.equal((await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner.email, password: 'correct horse battery staple',
  })))?.status, 401)
})

test('unknown login emails do not accumulate failed-login buckets or lock the owner', async () => {
  const { application, repository } = await loggedIn()
  for (let index = 0; index < 7; index += 1) {
    assert.equal((await application.handle(request('POST', '/v1/auth/login', {
      email: 'unknown@example.test', password: 'incorrect password value',
    })))?.status, 401)
  }
  assert.equal((await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner!.email, password: 'correct horse battery staple',
  })))?.status, 200)
  for (let index = 0; index < 5; index += 1) {
    assert.equal((await application.handle(request('POST', '/v1/auth/login', {
      email: repository.owner!.email, password: 'incorrect password value',
    })))?.status, 401)
  }
  assert.equal((await application.handle(request('POST', '/v1/auth/login', {
    email: repository.owner!.email, password: 'correct horse battery staple',
  })))?.status, 429)
})

test('overlapping provider syncs cannot overwrite fresher execution outcomes', async () => {
  const { repository, cookie } = await loggedIn()
  repository.providers.push({
    id: '22222222-2222-4222-8222-222222222222', ownerId: repository.owner!.id,
    name: 'n8n', baseUrl: 'http://100.100.10.20:5678', encryptedApiKey: encryptCredential('test-api-key', SECRET),
    status: 'unverified', createdAt: new Date().toISOString(), lastSyncedAt: null,
  })
  let signalFirstFetch!: () => void
  let releaseFirstFetch!: () => void
  const firstFetchStarted = new Promise<void>((resolve) => { signalFirstFetch = resolve })
  const waitForRelease = new Promise<void>((resolve) => { releaseFirstFetch = resolve })
  let executionFetches = 0
  const fetchImplementation: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname
    if (path.endsWith('/workflows')) return Response.json({ data: [] })
    executionFetches += 1
    if (executionFetches === 1) {
      signalFirstFetch()
      await waitForRelease
    }
    return Response.json({ data: [{ id: 'ex-1', status: executionFetches === 1 ? 'running' : 'success' }] })
  }
  const firstApplication = new ElovaApplication(repository, SECRET, SECRET, fetchImplementation)
  const secondApplication = new ElovaApplication(repository, SECRET, SECRET, fetchImplementation)
  const path = '/v1/providers/22222222-2222-4222-8222-222222222222/sync'
  const first = firstApplication.handle(request('POST', path, undefined, cookie))
  await firstFetchStarted
  const overlapping = await secondApplication.handle(request('POST', path, undefined, cookie))
  assert.equal(overlapping?.status, 409)
  assert.equal(executionFetches, 1)
  assert.equal(repository.failedSyncs, 0)
  releaseFirstFetch()
  assert.equal((await first)?.status, 200)
  assert.equal((await secondApplication.handle(request('POST', path, undefined, cookie)))?.status, 200)
  assert.equal(repository.executions.at(-1)?.status, 'success')
})

test('provider synchronization stores only sanitized workflow and execution representations', async () => {
  const { application, repository, cookie } = await loggedIn()
  const created = await application.handle(request('POST', '/v1/providers', {
    name: 'Client automation', baseUrl: 'http://100.100.10.20:5678', apiKey: 'private-api-key',
  }, cookie))
  assert.equal(created?.status, 201)

  const fetchImplementation: typeof fetch = async (input) => {
    const path = new URL(String(input)).pathname
    const data = path.endsWith('/workflows')
      ? [{ id: 'wf-1', name: 'Jane Doe intake', active: true, nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'jane@example.test', type: 'jane@example.test', authorization: 'secret' } }] }]
      : [{ id: 'ex-1', workflowId: 'wf-1', status: 'success', data: { json: { 'jane@example.test': 'secret', type: 'jane@example.test' } } }]
    return new Response(JSON.stringify({ data, nextCursor: 'sensitive-provider-cursor' }), { status: 200, headers: { 'content-type': 'application/json' } })
  }
  const syncApplication = new ElovaApplication(repository, SECRET, SECRET, fetchImplementation)
  const response = await syncApplication.handle(request(
    'POST', '/v1/providers/22222222-2222-4222-8222-222222222222/sync', undefined, cookie,
  ))
  assert.equal(response?.status, 200)
  const stored = JSON.stringify({ workflows: repository.workflows, executions: repository.executions, cursors: repository.cursors })
  assert.doesNotMatch(stored, /Jane Doe|jane@example\.test|private-api-key|sensitive-provider-cursor/)
  assert.match(stored, /sanitized_only/)
})
